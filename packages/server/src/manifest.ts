/**
 * The in-memory view of a deck the server keeps: each slide's revision, layout
 * and title, plus the last spec it sent, so a change goes out as a patch.
 */
import { diffToPatches } from "@json-render/core";
import { plainText, slideRoot, type SlideSpec } from "@folio/core";
import type { DeckStore, SlideRecord } from "./deckstore.js";

export interface ManifestEntry {
  id: string;
  rev: string;
  layout: string | null;
  title: string;
  error: string | null;
}

export interface SlideChange {
  id: string;
  rev: string;
  baseRev: string | null;
  patch: unknown[] | null;
  removed: boolean;
}

/**
 * Summarise one slide for the manifest.
 *
 * @param record - the slide as read from disk.
 * @returns id, revision, layout, a plain-text title and any read error.
 */
export function manifestEntry(record: SlideRecord): ManifestEntry {
  const root = record.spec ? slideRoot(record.spec) : null;
  const title = typeof root?.props.title === "string" ? plainText(root.props.title) : "";
  return { id: record.id, rev: record.rev, layout: root?.layout ?? null, title, error: record.error };
}

export class DeckManifest {
  private readonly specs = new Map<string, SlideSpec | null>();
  private readonly entries = new Map<string, ManifestEntry>();

  constructor(private readonly store: DeckStore) {
    for (const id of store.slideIds()) this.refresh(id);
  }

  /**
   * The manifest in presentation order.
   *
   * @returns one entry per slide file present.
   */
  list(): ManifestEntry[] {
    return this.store.slideIds().flatMap((id) => {
      const entry = this.entries.get(id) ?? this.refresh(id)?.entry;
      return entry ? [entry] : [];
    });
  }

  /**
   * Re-read a slide and report what changed since the last read.
   *
   * @param id - the slide id.
   * @returns the change, or null when the revision did not move. A removed
   *   file is a change with `removed: true`.
   */
  refresh(id: string): { change: SlideChange; entry: ManifestEntry | null } | null {
    const record = this.store.readSlide(id);
    const before = this.entries.get(id);
    if (!record) {
      if (!before) return null;
      this.entries.delete(id);
      this.specs.delete(id);
      return { change: { id, rev: "", baseRev: before.rev, patch: null, removed: true }, entry: null };
    }
    if (before?.rev === record.rev) return null;
    const oldSpec = this.specs.get(id);
    const patch = oldSpec && record.spec ? diffToPatches(oldSpec as never, record.spec as never) : null;
    const entry = manifestEntry(record);
    this.entries.set(id, entry);
    this.specs.set(id, record.spec);
    return { change: { id, rev: record.rev, baseRev: before?.rev ?? null, patch, removed: false }, entry };
  }

  /** Revision currently known for a slide, if any. */
  revOf(id: string): string | undefined {
    return this.entries.get(id)?.rev;
  }
}
