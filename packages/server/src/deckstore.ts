/**
 * One deck folder on disk: `deck.json`, `slides/<id>.json`, and `.folio/` for
 * locks and the per-date write log. Every write is atomic and revision-checked.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  applySlidePatch, deckSchema, deckToken, insertSlides, makeSlideSpec, moveSlide, moveSlides, nextSlideId, revisionOf, slideOrder, slideRoot, slideSpecSchema,
  type Deck, type PatchOp, type SlideSpec,
} from "@folio/core";
import { appendJsonl, archive, atomicWrite, dayOf, formatJson, readJson, withLock } from "./fsutil.js";

export interface SlideRecord {
  id: string;
  rev: string;
  spec: SlideSpec | null;
  error: string | null;
}

export type WriteResult = { ok: true; rev: string; spec: SlideSpec } | { ok: false; status: 404 | 409 | 422; reason: string; current?: SlideRecord };

export class DeckStore {
  readonly dir: string;
  deck: Deck;
  readonly token: string;

  /**
   * Open a deck folder.
   *
   * @param dir - the folder holding `deck.json`.
   */
  constructor(dir: string) {
    this.dir = dir;
    this.deck = deckSchema.parse(readJson(join(dir, "deck.json"), null));
    this.token = deckToken(this.deck.id);
  }

  /**
   * Create a new deck folder with a fresh random id.
   *
   * @param dir - the folder to create.
   * @param title - the deck title.
   * @param template - the pack reference, e.g. `lectern@1`.
   * @returns the opened store.
   */
  static create(dir: string, title: string, template: string): DeckStore {
    if (existsSync(join(dir, "deck.json"))) throw new Error(`${dir} already holds a deck`);
    atomicWrite(join(dir, "deck.json"), formatJson({ id: randomBytes(8).toString("hex"), title, template, order: [] }));
    return new DeckStore(dir);
  }

  get slidesDir(): string {
    return join(this.dir, "slides");
  }

  get stateDir(): string {
    return join(this.dir, ".folio");
  }

  /** Re-read `deck.json` from disk, for changes made by another process. */
  reloadDeck(): void {
    this.deck = deckSchema.parse(readJson(join(this.dir, "deck.json"), null));
  }

  /**
   * Ids of the slide files present, in presentation order.
   *
   * @returns `deck.order` first, then any unlisted slide file.
   */
  slideIds(): string[] {
    const files = existsSync(this.slidesDir) ? readdirSync(this.slidesDir) : [];
    return slideOrder(this.deck, files.filter((f) => /^[^.].*\.json$/.test(f)).map((f) => f.slice(0, -5)));
  }

  /**
   * When the deck was last edited.
   *
   * @returns the newest modification time of `deck.json` and `slides/*.json`, as ISO 8601.
   */
  editedAt(): string {
    const slides = existsSync(this.slidesDir) ? readdirSync(this.slidesDir).filter((f) => /^[^.].*\.json$/.test(f)).map((f) => join(this.slidesDir, f)) : [];
    const newest = Math.max(...[join(this.dir, "deck.json"), ...slides].map((f) => statSync(f, { throwIfNoEntry: false })?.mtimeMs ?? 0));
    return new Date(newest).toISOString();
  }

  /**
   * Read one slide with its revision.
   *
   * @param id - the slide id.
   * @returns the record; `spec` is null and `error` set when the file is not a
   *   valid slide, and null when the file does not exist.
   */
  readSlide(id: string): SlideRecord | null {
    const path = join(this.slidesDir, `${id}.json`);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    const rev = revisionOf(raw);
    try {
      const parsed = slideSpecSchema.safeParse(JSON.parse(raw));
      return parsed.success ? { id, rev, spec: parsed.data, error: null } : { id, rev, spec: null, error: parsed.error.issues[0]?.message ?? "not a slide spec" };
    } catch (error) {
      return { id, rev, spec: null, error: (error as Error).message };
    }
  }

  /**
   * Apply a JSON Patch to a slide if its revision still matches.
   *
   * @param id - the slide id.
   * @param ops - RFC 6902 operations.
   * @param ifRev - the revision the patch was made against; null skips the check.
   * @param worker - who writes, for the log.
   * @param refuse - optional: the reason the patched slide must not be written
   *   (the schema problems it adds, `slideWriteGuard`), or null to write it.
   * @returns the new revision, or 404/409/422 with the reason and current record.
   */
  async patchSlide(id: string, ops: PatchOp[], ifRev: string | null, worker: string, refuse?: (before: SlideSpec, after: SlideSpec) => string | null): Promise<WriteResult> {
    return withLock(join(this.stateDir, "locks", id), () => {
      const current = this.readSlide(id);
      if (!current) return { ok: false, status: 404, reason: `slide ${id} does not exist` };
      if (ifRev && current.rev !== ifRev) return { ok: false, status: 409, reason: `slide ${id} is at ${current.rev}, not ${ifRev}`, current };
      if (!current.spec) return { ok: false, status: 422, reason: `slide ${id} is not a valid slide: ${current.error}`, current };
      const patched = applySlidePatch(current.spec, ops);
      if (!patched.ok) return { ok: false, status: 422, reason: patched.reason, current };
      const refused = refuse?.(current.spec, patched.spec);
      if (refused) return { ok: false, status: 422, reason: refused, current };
      return this.writeSlideUnlocked(id, patched.spec, worker, { op: "patch", ops, from: current.rev });
    });
  }

  /**
   * Write a whole slide (used by `new`, duplicate and the editor's full saves).
   *
   * @returns the new revision and spec.
   */
  private writeSlideUnlocked(id: string, spec: SlideSpec, worker: string, detail: Record<string, unknown>): WriteResult {
    const text = formatJson(spec);
    atomicWrite(join(this.slidesDir, `${id}.json`), text);
    const rev = revisionOf(text);
    this.log({ worker, slide: id, rev, ...detail });
    return { ok: true, rev, spec };
  }

  /**
   * Create a slide with the next free id, appended to the deck order.
   *
   * @param layout - the layout name.
   * @param props - initial slot contents.
   * @param worker - who creates it.
   * @param after - insert after this slide id; at the end when null.
   * @returns the new id and revision.
   */
  async newSlide(layout: string, props: Record<string, unknown>, worker: string, after: string | null = null): Promise<{ id: string; rev: string }> {
    return withLock(join(this.stateDir, "locks", "deck"), () => {
      this.reloadDeck();
      const id = nextSlideId(this.usedIds());
      const result = this.writeSlideUnlocked(id, makeSlideSpec(layout, props), worker, { op: "new", layout });
      const order = this.slideIds().filter((x) => x !== id);
      const at = after ? order.indexOf(after) + 1 : order.length;
      this.writeOrder([...order.slice(0, at), id, ...order.slice(at)], worker);
      return { id, rev: result.ok ? result.rev : "" };
    });
  }

  /** Ids taken by live and archived slides, which a new slide must not reuse. */
  private usedIds(): string[] {
    const archived = existsSync(join(this.slidesDir, ".archive")) ? readdirSync(join(this.slidesDir, ".archive"), { recursive: true }).map(String) : [];
    return [...this.slideIds(), ...archived.map((p) => p.split(/[\\/]/).pop()!.replace(/\.json$/, ""))];
  }

  /**
   * Write copies of slides as new slides with fresh ids, right after another
   * slide, under the deck lock and with one write of the order.
   *
   * @param specs - the slides to copy, in the order they are inserted.
   * @param after - the slide they follow; at the end when null or gone.
   * @returns the new ids, in order.
   */
  async pasteSlides(specs: SlideSpec[], after: string | null, worker: string): Promise<string[]> {
    return withLock(join(this.stateDir, "locks", "deck"), () => {
      this.reloadDeck();
      const used = this.usedIds();
      const ids = specs.map((spec) => {
        const id = nextSlideId(used);
        used.push(id);
        this.writeSlideUnlocked(id, spec, worker, { op: "paste" });
        return id;
      });
      this.writeOrder(insertSlides(this.slideIds(), ids, after), worker);
      return ids;
    });
  }

  /**
   * Duplicate a slide right after itself.
   *
   * @returns the new id and revision, or null when the source is unreadable.
   */
  async duplicateSlide(id: string, worker: string): Promise<{ id: string; rev: string } | null> {
    const source = this.readSlide(id);
    const root = source?.spec ? slideRoot(source.spec) : null;
    return root ? this.newSlide(root.layout, structuredClone(root.props), worker, id) : null;
  }

  /**
   * Move a slide to a new position in the order.
   *
   * @param id - the slide.
   * @param index - the target position.
   */
  async reorder(id: string, index: number, worker: string): Promise<string[]> {
    return withLock(join(this.stateDir, "locks", "deck"), () => {
      this.reloadDeck();
      const order = moveSlide(this.slideIds(), id, index);
      this.writeOrder(order, worker);
      return order;
    });
  }

  /**
   * Move several slides together in front of another slide, under the deck
   * lock and against the order on disk at that moment.
   *
   * @param ids - the slides to move; they keep their order in the deck.
   * @param before - the slide they land in front of; null for the end.
   * @returns the new order, or null when `before` is gone or is moving.
   */
  async moveSlides(ids: string[], before: string | null, worker: string): Promise<string[] | null> {
    return withLock(join(this.stateDir, "locks", "deck"), () => {
      this.reloadDeck();
      const order = moveSlides(this.slideIds(), ids, before);
      if (order) this.writeOrder(order, worker);
      return order;
    });
  }

  /**
   * Archive several slides under one deck lock, with one write of the order.
   *
   * @returns the ids that were archived; missing ones are skipped.
   */
  async archiveSlides(ids: string[], worker: string): Promise<string[]> {
    return withLock(join(this.stateDir, "locks", "deck"), () => {
      this.reloadDeck();
      const before = this.slideIds();
      const done = ids.filter((id) => {
        const path = join(this.slidesDir, `${id}.json`);
        if (!existsSync(path)) return false;
        const moved = archive(path, join(this.slidesDir, ".archive"));
        atomicWrite(moved.replace(/\.json$/, ".order.json"), formatJson({ previous: before[before.indexOf(id) - 1] ?? null }));
        this.log({ worker, slide: id, op: "archive", to: moved });
        return true;
      });
      this.reloadDeck();
      this.writeOrder(this.slideIds(), worker);
      return done;
    });
  }

  /**
   * Archive a slide: move its file to `slides/.archive/<date>/`.
   *
   * @returns the archive path, or null when the slide does not exist.
   */
  async archiveSlide(id: string, worker: string): Promise<string | null> {
    return withLock(join(this.stateDir, "locks", "deck"), () => {
      const path = join(this.slidesDir, `${id}.json`);
      if (!existsSync(path)) return null;
      this.reloadDeck();
      const before = this.slideIds();
      const moved = archive(path, join(this.slidesDir, ".archive"));
      atomicWrite(moved.replace(/\.json$/, ".order.json"), formatJson({ previous: before[before.indexOf(id) - 1] ?? null }));
      this.reloadDeck();
      this.writeOrder(this.slideIds(), worker);
      this.log({ worker, slide: id, op: "archive", to: moved });
      return moved;
    });
  }

  /**
   * Archive or unarchive the whole deck: `archived` and `archivedAt` in
   * `deck.json`. Nothing moves and nothing is deleted.
   *
   * @param archived - true to archive, false to bring it back.
   * @returns the deck as written.
   */
  async setArchived(archived: boolean, worker: string): Promise<Deck> {
    return withLock(join(this.stateDir, "locks", "deck"), () => {
      this.reloadDeck();
      const { archived: _was, archivedAt: _at, ...rest } = this.deck;
      this.deck = archived ? { ...rest, archived: true, archivedAt: new Date().toISOString() } : rest;
      atomicWrite(join(this.dir, "deck.json"), formatJson(this.deck));
      this.log({ worker, op: archived ? "archive-deck" : "unarchive-deck" });
      return this.deck;
    });
  }

  private writeOrder(order: string[], worker: string): void {
    this.deck = { ...this.deck, order };
    atomicWrite(join(this.dir, "deck.json"), formatJson(this.deck));
    this.log({ worker, op: "order", order });
  }

  /**
   * Append a record to today's write log.
   *
   * @param record - what was written and by whom; the time is added.
   */
  log(record: Record<string, unknown>): void {
    appendJsonl(join(this.stateDir, "log", `${dayOf()}.jsonl`), { at: new Date().toISOString(), ...record });
  }
}
