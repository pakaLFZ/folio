/**
 * The warning service: every warning of a slide, from every source, diffed
 * against the slide's previous run and stored per slide so parallel writers
 * never share a file. Overflow comes from a renderer's measurement (the live
 * view or the headless page); everything else is read from files.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyAcks, diffWarnings, hasNumbers, makeWarning, readTableFile, renderWarnings, slideContentWarnings, slideLayout, slideVocabWarnings, slideOverflowWarnings, slideRoot, tableDataSchema,
  type FolioAck, type FolioWarning, type MeasuredSlot, type Pack, type SlideMeasurement, type SlideSpec,
} from "@folio/core";
import type { DeckStore } from "./deckstore.js";
import { atomicWrite, formatJson, readJson } from "./fsutil.js";
import { figureFileTrace, figureFileWarnings, hasFigureTrace } from "./hooks/figurefiles.js";
import { slideOutputs } from "./hooks/state.js";
import { slotBox } from "./slotbox.js";
import { deckBank } from "./vocab.js";
import type { Workspace } from "./workspace.js";

/** A source of warnings for one slide, plugged in by the hook and comment services. */
export type WarningProvider = (store: DeckStore, slideId: string, spec: SlideSpec | null, at: string) => FolioWarning[];

interface StoredSlideWarnings {
  rev: string;
  measured: MeasuredSlot[] | null;
  measuredRev: string | null;
  warnings: FolioWarning[];
}

/**
 * Whether a figure path leaves the deck folder: a POSIX or Windows absolute
 * path (a leading `/` or `\`, a drive letter, a UNC share), or a relative one
 * that climbs out with `..`. A figure slot only ever takes a path relative to
 * the deck, so this is checked before the file is looked up on disk.
 */
function pathOutsideDeck(path: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(path) || /^[\\/]/.test(path)) return true;
  const posix = path.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
  let depth = 0;
  for (const part of posix) {
    depth += part === ".." ? -1 : 1;
    if (depth < 0) return true;
  }
  return false;
}

/** A table file's JSON, or undefined when it cannot be parsed. */
function readTableJson(file: string): unknown {
  try {
    return readJson<unknown>(file, undefined);
  } catch {
    return undefined;
  }
}

/**
 * FOLIO-RND-001 from a fresh measurement; without one, the last run's render
 * warning stands, as overflow warnings do.
 */
function renderOf(where: { deck: string; slide: string }, spec: SlideSpec | null, pack: Pack | undefined, fresh: SlideMeasurement | null, previous: StoredSlideWarnings | null, at: string): FolioWarning[] {
  if (!fresh) return (previous?.warnings ?? []).filter((w) => w.source === "render" && w.state !== "absent");
  return spec && pack ? renderWarnings(where, spec, pack, fresh, at) : [];
}

export class WarningService {
  private readonly providers: WarningProvider[] = [];

  constructor(private readonly workspace: Workspace) {}

  /** Add a warning source (hooks, comments). */
  addProvider(provider: WarningProvider): void {
    this.providers.push(provider);
  }

  private file(store: DeckStore, id: string): string {
    return join(store.stateDir, "warnings", `${id}.json`);
  }

  /**
   * Recompute one slide's warnings and store them.
   *
   * @param store - the deck.
   * @param id - the slide id.
   * @param measured - a fresh measurement with the revision it was taken on
   *   (and the reason the slide did not render, if it did not), or null to
   *   reuse the stored one when the revision still matches.
   * @returns the slide's warnings after the baseline diff and acks.
   */
  slideWarnings(store: DeckStore, id: string, measured: SlideMeasurement | null): FolioWarning[] {
    const at = new Date().toISOString();
    const record = store.readSlide(id);
    const previous = readJson<StoredSlideWarnings | null>(this.file(store, id), null);
    if (!record) return [];
    const where = { deck: store.token, slide: id };
    const current: FolioWarning[] = [];
    const pack = this.workspace.packOf(store);
    if (!store.deck.order.includes(id)) current.push(makeWarning("FOLIO-ORD-001", where, {}, { at }));
    if (!record.spec) current.push(makeWarning("FOLIO-SPEC-003", where, { reason: record.error ?? "unreadable" }, { at }));
    else if (pack) {
      current.push(...slideContentWarnings(where, record.spec, pack.pack, at, slideOutputs(store, id)), ...this.figureWarnings(store, id, record.spec, at));
      current.push(...slideVocabWarnings(where, record.spec, pack.pack, deckBank(this.workspace, store).resolved.entries, at));
    }
    const fresh = measured && measured.rev === record.rev ? measured : null;
    const slots = fresh?.slots ?? (previous?.measuredRev === record.rev ? previous.measured : null);
    if (slots && record.spec && pack) current.push(...this.overflowOf(store, id, record.spec, slots, at));
    else current.push(...(previous?.warnings ?? []).filter((w) => w.source === "overflow" && w.state !== "absent"));
    current.push(...renderOf(where, record.spec, pack?.pack, fresh, previous, at));
    for (const provider of this.providers) current.push(...provider(store, id, record.spec, at));
    const run = applyAcks(diffWarnings(previous?.warnings ?? [], current, at), this.acksFor(store, id), at).filter((w) => w.state !== "absent" || previous?.warnings.some((p) => p.id === w.id && p.state !== "absent"));
    atomicWrite(this.file(store, id), formatJson({ rev: record.rev, measured: slots, measuredRev: slots ? record.rev : null, warnings: run } satisfies StoredSlideWarnings));
    return run;
  }

  /**
   * A slide's stored line measurement, if it is for the current revision.
   *
   * @returns the measured slots, or null.
   */
  measuredOf(store: DeckStore, id: string): MeasuredSlot[] | null {
    const record = store.readSlide(id);
    const stored = readJson<StoredSlideWarnings | null>(this.file(store, id), null);
    return record && stored?.measuredRev === record.rev ? stored.measured : null;
  }

  /**
   * A slide's last stored measurement, of whatever revision: the best guess
   * of a flowed slot's height until the current revision is measured.
   *
   * @returns the measured slots, or null when the slide was never measured.
   */
  lastMeasured(store: DeckStore, id: string): MeasuredSlot[] | null {
    return readJson<StoredSlideWarnings | null>(this.file(store, id), null)?.measured ?? null;
  }

  /**
   * Whether a slide's stored measurement is for its current revision.
   *
   * @returns false when the slide must be rendered again to know its overflow.
   */
  measuredCurrent(store: DeckStore, id: string): boolean {
    const record = store.readSlide(id);
    const stored = readJson<StoredSlideWarnings | null>(this.file(store, id), null);
    return !!record && stored?.measuredRev === record.rev;
  }

  /**
   * The warnings of every slide of a deck, using stored measurements.
   *
   * @param store - the deck.
   * @returns all warnings, in slide order.
   */
  deckWarnings(store: DeckStore): FolioWarning[] {
    return store.slideIds().flatMap((id) => this.slideWarnings(store, id, null));
  }

  private overflowOf(store: DeckStore, id: string, spec: SlideSpec, slots: MeasuredSlot[], at: string): FolioWarning[] {
    const pack = this.workspace.packOf(store)!.pack;
    const root = slideRoot(spec);
    const layout = root ? slideLayout(pack, root.layout, root.props) : undefined;
    if (!layout) return [];
    return slideOverflowWarnings({ deck: store.token, slide: id }, pack, layout, slots, at, root!.props);
  }

  private figureWarnings(store: DeckStore, id: string, spec: SlideSpec, at: string): FolioWarning[] {
    const root = slideRoot(spec);
    if (!root) return [];
    const pictures = Object.entries(root.props).filter((e): e is [string, string] => e[0].startsWith("fig") && typeof e[1] === "string" && !!e[1]);
    const figures = pictures.flatMap(([slot, path]) => this.pictureWarnings(store, id, slot, path, at));
    return [...figures, ...this.tableFileWarnings(store, id, root.props, at), ...this.untracedTables(store, id, spec, at)];
  }

  /** FOLIO-FIG-005 for a path outside the deck, FIG-001 for a missing image, FIG-002 for an untraced one, FIG-003/004 for a script-drawn one. */
  private pictureWarnings(store: DeckStore, id: string, slot: string, path: string, at: string): FolioWarning[] {
    const where = { deck: store.token, slide: id, slot };
    if (pathOutsideDeck(path)) return [makeWarning("FOLIO-FIG-005", where, { path }, { at })];
    if (!existsSync(join(store.dir, path))) return [makeWarning("FOLIO-FIG-001", where, { path }, { at })];
    if (!hasFigureTrace(store, path)) return [makeWarning("FOLIO-FIG-002", where, { path }, { at })];
    const box = slotBox(this.workspace, store, id, slot, this.lastMeasured(store, id));
    return figureFileWarnings(figureFileTrace(store, path, box.ok ? { w: box.w, h: box.h } : null), where, at);
  }

  /** FOLIO-TAB-002 (a note) per inline table holding numbers whose slot runs no table hook. */
  private untracedTables(store: DeckStore, id: string, spec: SlideSpec, at: string): FolioWarning[] {
    const root = slideRoot(spec);
    const pack = this.workspace.packOf(store);
    const layout = root && pack ? slideLayout(pack.pack, root.layout, root.props) : undefined;
    return Object.entries(root?.props ?? {}).flatMap(([slot, v]) => {
      const table = slot.startsWith("table:") && !layout?.slots[slot]?.hook ? tableDataSchema.safeParse({ columns: (v as { columns?: unknown })?.columns, rows: (v as { rows?: unknown })?.rows }) : null;
      return table?.success && hasNumbers(table.data) ? [makeWarning("FOLIO-TAB-002", { deck: store.token, slide: id, slot }, { slot }, { at })] : [];
    });
  }

  /** FOLIO-TAB-001 per table slot whose `src` file is missing, unreadable or not `{columns, rows}`. */
  private tableFileWarnings(store: DeckStore, id: string, props: Record<string, unknown>, at: string): FolioWarning[] {
    const out: FolioWarning[] = [];
    for (const [slot, v] of Object.entries(props)) {
      const src = slot.startsWith("table:") && v && typeof v === "object" ? (v as { src?: unknown }).src : undefined;
      if (typeof src !== "string") continue;
      const file = join(store.dir, src);
      const json = existsSync(file) ? readTableJson(file) : undefined;
      const parsed = json === undefined ? null : readTableFile(json);
      const reason = !existsSync(file) ? "the file does not exist" : !parsed ? "it is not JSON" : parsed.ok ? null : parsed.reason;
      if (reason) out.push(makeWarning("FOLIO-TAB-001", { deck: store.token, slide: id, slot }, { path: src, reason }, { at }));
    }
    return out;
  }

  /**
   * Acknowledgements stored for one slide's warnings.
   *
   * @returns acks by warning id, read from `.folio/acks/<id>.json`.
   */
  acksFor(store: DeckStore, slideId: string): Record<string, FolioAck & { target?: FolioWarning["location"] }> {
    const dir = join(store.stateDir, "acks");
    if (!existsSync(dir)) return {};
    const out: Record<string, FolioAck & { target?: FolioWarning["location"] }> = {};
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const ack = readJson<(FolioAck & { target?: FolioWarning["location"] }) | null>(join(dir, f), null);
      if (ack && ack.target?.slide === slideId) out[f.slice(0, -5)] = ack;
    }
    return out;
  }

  /**
   * Record an acknowledgement.
   *
   * @param store - the deck.
   * @param warning - the warning being acknowledged.
   * @param ack - who, why, and until when.
   */
  acknowledge(store: DeckStore, warning: FolioWarning, ack: FolioAck): void {
    atomicWrite(join(store.stateDir, "acks", `${warning.id}.json`), formatJson({ ...ack, target: warning.location, code: warning.code }));
  }
}
