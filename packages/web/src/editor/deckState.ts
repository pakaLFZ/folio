/**
 * The deck editor's state: manifest, loaded slides, live events applied as
 * patches, edits saved with the revision they were made on, and conflicts kept
 * with both versions so nothing typed is lost.
 */
import { useSyncExternalStore } from "react";
import { applySlidePatch, setSlotOp, type MeasuredSlot, type Pack, type PatchOp, type SlideSpec, type StreamMessage } from "@folio/core";
import { api, ApiError } from "../api";
import type { ManifestEntry, SlideRecord } from "../boot";
import type { RailSelection } from "./railSelection";
import type { ShapeContent } from "./shapeModel";
import type { BlockNext } from "./blockModel";
import type { TextLook } from "./textBoxModel";
import type { NoticeMessage, NoticeTone } from "../ui/notice";

export type EditorMode = "edit" | "view";

/** The mode a URL names; the retired `comment` (and anything unknown) is Edit. */
export function modeFromUrl(value: string | null): EditorMode {
  return value === "view" ? "view" : "edit";
}

export interface Conflict {
  slot: string;
  mine: unknown;
  theirs: SlideRecord;
}

export interface DeckState {
  token: string;
  title: string;
  manifest: ManifestEntry[];
  slides: Record<string, SlideRecord>;
  current: string | null;
  mode: EditorMode;
  selectedSlot: string | null;
  /** The slides selected in the rail; see railSelection.ts. */
  selection: RailSelection;
  overflow: Record<string, Record<string, MeasuredSlot>>;
  /** Why a slide failed to render, at the revision it failed on. */
  renderErrors?: Record<string, { rev: string; message: string }>;
  conflicts: Record<string, Conflict>;
  connected: boolean;
  notice: NoticeMessage | null;
  /** The deck's pack as last fetched after a pack change; absent until then (the boot pack holds). */
  pack?: Pack;
  /** Whether the Shape tool is on; a drag on the slide then draws `shapeNext`. */
  shapeTool?: boolean;
  /** The kind and options the next shape is drawn with. */
  shapeNext?: ShapeContent;
  /** Whether the Text tool is on; a drag on the slide then draws a text box with `textNext`. */
  textTool?: boolean;
  /** The look the next text box is drawn with. */
  textNext?: TextLook;
  /** The next shape or text box is drawn final rather than as a draft. */
  nextFinal?: boolean;
  /** The block style the Text tool draws with instead of a plain text box; absent or null for a text box. */
  blockNext?: BlockNext | null;
  /** The slide in view as a box being dragged or nudged would leave it, drawn until the write lands (boxPreview.ts). */
  preview?: { id: string; spec: SlideSpec } | null;
  /** The content version of each deck file that changed while open, so a figure or a table reads it again. */
  files?: Record<string, string>;
}

type Updater = (s: DeckState) => DeckState;

export class DeckStore {
  private state: DeckState;
  private readonly subs = new Set<() => void>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly editStart = new Map<string, { rev: string; value: unknown }>();
  private readonly commits = new Map<string, Promise<void>>();

  constructor(initial: DeckState) {
    this.state = initial;
  }

  get = (): DeckState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };

  /** Replace the state through an updater and notify subscribers. */
  set(update: Updater): void {
    this.state = update(this.state);
    this.subs.forEach((fn) => fn());
  }

  /** Show a transient notice at the foot of the window; `ms` overrides how long it stays. */
  notify(text: string, tone: NoticeTone = "ok", ms?: number): void {
    this.set((s) => ({ ...s, notice: { text, at: Date.now(), tone, ...(ms ? { ms } : {}) } }));
  }

  /**
   * Make sure a slide's spec is loaded.
   *
   * @param id - the slide id.
   * @returns once the slide is loaded, joining a load already under way.
   */
  ensure(id: string): Promise<void> {
    const entry = this.state.manifest.find((m) => m.id === id);
    const have = this.state.slides[id];
    if (have && (!entry || have.rev === entry.rev)) return Promise.resolve();
    const pending = this.loading.get(id);
    if (pending) return pending;
    const load = api.slide(this.state.token, id)
      .then((record) => this.set((s) => ({ ...s, slides: { ...s.slides, [id]: record } })))
      .finally(() => this.loading.delete(id));
    this.loading.set(id, load);
    return load;
  }

  /** Re-read the manifest and every loaded slide whose revision moved. */
  async resync(): Promise<void> {
    const m = await api.manifest(this.state.token);
    this.set((s) => ({ ...s, manifest: m.slides, title: m.title }));
    await Promise.all(m.slides.filter((e) => this.state.slides[e.id] && this.state.slides[e.id]!.rev !== e.rev).map((e) => this.ensure(e.id)));
  }

  /** Fetch the deck's pack again, after a layout was added or changed. */
  async refreshPack(): Promise<void> {
    const { pack } = await api.deckPack(this.state.token);
    this.set((s) => ({ ...s, pack }));
  }

  /**
   * Apply one live message.
   *
   * @param message - a stream message for this deck.
   */
  apply(message: StreamMessage): void {
    const data = message.data as Record<string, unknown>;
    if (message.type === "pack") void this.refreshPack();
    if (message.type === "resync" || message.type === "pack") void this.resync();
    else if (message.type === "order") this.applyOrder(data.order as string[], data.title as string);
    else if (message.type === "slide") this.applySlide(data as never);
    else if (message.type === "file") this.applyFile(String(data.path), typeof data.v === "string" ? data.v : null);
  }

  /** A deck file changed: it takes its new content version; a gone one takes a version no cached copy has. */
  private applyFile(path: string, version: string | null): void {
    if (path.startsWith("comments/") || this.state.files?.[path] === version) return;
    this.set((s) => ({ ...s, files: { ...s.files, [path]: version ?? `gone-${Date.now().toString(36)}` } }));
  }

  private applyOrder(order: string[], title: string): void {
    const known = new Map(this.state.manifest.map((e) => [e.id, e]));
    if (order.some((id) => !known.has(id))) return void this.resync();
    this.set((s) => ({ ...s, title, manifest: order.map((id) => known.get(id)!) }));
  }

  private applySlide(change: { id: string; rev: string; baseRev: string | null; patch: PatchOp[] | null; removed: boolean; entry: ManifestEntry | null }): void {
    if (change.removed) {
      this.set((s) => {
        const at = s.manifest.findIndex((e) => e.id === change.id);
        const manifest = s.manifest.filter((e) => e.id !== change.id);
        const current = s.current === change.id ? (manifest[Math.min(at, manifest.length - 1)]?.id ?? null) : s.current;
        return { ...s, manifest, current };
      });
      return;
    }
    const entry = change.entry!;
    const exists = this.state.manifest.some((e) => e.id === change.id);
    this.set((s) => ({ ...s, manifest: exists ? s.manifest.map((e) => (e.id === change.id ? entry : e)) : [...s.manifest, entry] }));
    const local = this.state.slides[change.id];
    if (!local) return;
    if (local.rev === change.rev) return;
    if (local.spec && change.patch && local.rev === change.baseRev) {
      const next = applySlidePatch(local.spec, change.patch);
      if (next.ok) return void this.set((s) => ({ ...s, slides: { ...s.slides, [change.id]: { id: change.id, rev: change.rev, spec: next.spec, error: null } } }));
    }
    void this.ensure(change.id);
  }

  /**
   * Remember the revision and value a slot had when typing began.
   *
   * @param id - the slide id.
   * @param slot - the slot being edited.
   */
  beginEdit(id: string, slot: string): void {
    const record = this.state.slides[id];
    if (record?.spec) this.editStart.set(`${id}/${slot}`, { rev: record.rev, value: record.spec.elements[record.spec.root]?.props[slot] ?? null });
  }

  /**
   * Save one slot, against the revision the edit started from. If the slide
   * moved meanwhile but this slot did not, the edit is re-applied on the newer
   * revision; if this slot moved too, both versions are kept as a conflict.
   *
   * @param id - the slide id.
   * @param slot - the slot name.
   * @param value - the new markup (or a code block's value), or null to clear the slot.
   */
  async commit(id: string, slot: string, value: unknown): Promise<void> {
    const key = `${id}/${slot}`;
    const previous = this.commits.get(key) ?? Promise.resolve();
    const next = previous.then(() => this.commitNow(id, slot, value));
    this.commits.set(key, next);
    try { await next; } finally { if (this.commits.get(key) === next) this.commits.delete(key); }
  }

  private async commitNow(id: string, slot: string, value: unknown): Promise<void> {
    const record = this.state.slides[id];
    if (!record?.spec) return;
    const before = record.spec.elements[record.spec.root]?.props[slot] ?? null;
    if (JSON.stringify(before) === JSON.stringify(value ?? null)) return;
    const start = this.editStart.get(`${id}/${slot}`) ?? { rev: record.rev, value: record.spec.elements[record.spec.root]?.props[slot] ?? null };
    this.editStart.delete(`${id}/${slot}`);
    await this.patch(id, [setSlotOp(record.spec, slot, value)], start.rev, { slot, mine: value ?? "", base: start.value });
  }

  /** Apply the deck's shared server history. */
  async historyStep(direction: "undo" | "redo"): Promise<void> {
    try {
      await api.history(this.state.token, direction);
      await this.resync();
    } catch {
      // An empty or stale entry leaves the editor as it is.
    }
  }

  /** Text gives its uncommitted browser edits precedence, then uses deck history. */
  async historySlot(id: string, slot: string, direction: "undo" | "redo"): Promise<void> {
    await this.commits.get(`${id}/${slot}`);
    await this.historyStep(direction);
  }

  /**
   * Send a patch and record the result.
   *
   * @param conflictInfo - what to keep when the revision has moved.
   */
  async patch(id: string, ops: PatchOp[], rev: string, conflictInfo?: { slot: string; mine: unknown; base?: unknown }): Promise<void> {
    try {
      const saved = await api.patch(this.state.token, id, ops, rev);
      this.set((s) => ({ ...s, slides: { ...s.slides, [id]: { id, rev: saved.rev, spec: saved.spec, error: null } } }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && conflictInfo) {
        const theirs = error.problem.current as SlideRecord;
        const theirValue = theirs.spec?.elements[theirs.spec.root]?.props[conflictInfo.slot] ?? null;
        if (theirs.spec && JSON.stringify(theirValue) === JSON.stringify(conflictInfo.base ?? null)) return this.patch(id, ops, theirs.rev);
        this.set((s) => ({ ...s, conflicts: { ...s.conflicts, [id]: { ...conflictInfo, theirs } }, slides: { ...s.slides, [id]: theirs } }));
        this.notify(`Slide ${id} was changed by someone else while you typed; choose a version.`, "error");
      } else this.notify(`Save failed: ${(error as Error).message}`, "error");
    }
  }

  /**
   * Settle a conflict.
   *
   * @param id - the slide id.
   * @param keep - `mine` re-applies the user's text on the newer revision.
   */
  async resolveConflict(id: string, keep: "mine" | "theirs"): Promise<void> {
    const conflict = this.state.conflicts[id];
    if (!conflict) return;
    this.set((s) => {
      const { [id]: _gone, ...rest } = s.conflicts;
      return { ...s, conflicts: rest };
    });
    if (keep === "mine" && conflict.theirs.spec) await this.patch(id, [setSlotOp(conflict.theirs.spec, conflict.slot, conflict.mine)], conflict.theirs.rev);
  }

  /** Record that a slide threw while rendering, at a revision. */
  renderFailed(id: string, rev: string, message: string): void {
    const before = this.state.renderErrors?.[id];
    if (before?.rev === rev && before.message === message) return;
    this.set((s) => ({ ...s, renderErrors: { ...s.renderErrors, [id]: { rev, message } } }));
  }

  /** Record a live measurement of one slot of a slide. */
  measured(id: string, m: MeasuredSlot): void {
    const before = this.state.overflow[id]?.[m.slot];
    if (before && before.lines === m.lines && Math.abs(before.overPt - m.overPt) < 0.5 && Math.abs((before.boxPt ?? 0) - (m.boxPt ?? 0)) < 0.5 && JSON.stringify(before.table) === JSON.stringify(m.table) && JSON.stringify(before.lineTexts) === JSON.stringify(m.lineTexts)) return;
    this.set((s) => ({ ...s, overflow: { ...s.overflow, [id]: { ...s.overflow[id], [m.slot]: m } } }));
  }
}

/**
 * Subscribe a component to the store.
 *
 * @param store - the deck store.
 * @returns the current state.
 */
export function useDeck(store: DeckStore): DeckState {
  return useSyncExternalStore(store.subscribe, store.get);
}
