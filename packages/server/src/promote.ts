/**
 * Turning a slide's overrides into a template: a new layout of the deck's pack,
 * or its own layout updated for every slide that uses it. The pack is written
 * through `packedit.ts`, the one pack writer (in place, under its lock,
 * validated, decks protected), and only inside the workspace's templates
 * folder. The pack keeps its version: a layout added or changed in place
 * removes nothing a slide names, so every `name@version` pin stays valid.
 */
import { resolve, sep } from "node:path";
import { relative } from "./posixpath.js";
import { applyPromoteEdits, promotedSlidePatch, promoteOverrides, slideRoot, type PromoteTarget } from "@folio/core";
import type { DeckStore } from "./deckstore.js";
import { writePack, type PackChange } from "./packedit.js";
import type { LoadedPack, Workspace } from "./workspace.js";

/** What the caller asks: a new layout `as`, or `intoLayout` confirmed by `allSlides`. */
export interface PromoteRequest {
  as?: string;
  description?: string;
  intoLayout?: boolean;
  allSlides?: boolean;
  keepSlide?: boolean;
}

export type PromoteOutcome =
  | { ok: true; pack: string; layout: string; created: boolean; slidesChanged: number; slide: { rev: string } | null }
  | { ok: false; status: 404 | 409 | 422; reason: string };

/**
 * Every slide in the workspace drawn with one layout of one pack.
 *
 * @returns `deck/slide` names, over every deck that uses the pack.
 */
export function layoutUsers(workspace: Workspace, pack: string, layout: string): string[] {
  const out: string[] = [];
  for (const store of workspace.decks.values()) {
    if (workspace.packOf(store)?.pack.name !== pack) continue;
    for (const id of store.slideIds()) if (slideRoot(store.readSlide(id)?.spec ?? { root: "", elements: {} })?.layout === layout) out.push(`${relative(workspace.config.decksDir, store.dir)}/${id}`);
  }
  return out;
}

/** The target named by a request, or why the request is incomplete. */
function targetOf(workspace: Workspace, loaded: LoadedPack, layout: string, req: PromoteRequest): PromoteTarget | string {
  if (req.intoLayout && req.as) return "give either a new layout name or intoLayout, not both";
  if (!req.intoLayout) return req.as ? { as: req.as, ...(req.description ? { description: req.description } : {}) } : 'name the new layout: {"as": "<kebab-case-name>"} (CLI --as NAME)';
  if (!req.allSlides) {
    const users = layoutUsers(workspace, loaded.pack.name, layout);
    return `applying to layout ${layout} changes every slide that uses it: ${users.length} slide${users.length === 1 ? "" : "s"} (${users.join(", ")}); confirm with "allSlides": true (CLI --all-slides)`;
  }
  return { into: true, ...(req.description ? { description: req.description } : {}) };
}

/** The promote edits as one change for the shared pack writer. */
function promoteChange(edits: Parameters<typeof applyPromoteEdits>[1], layout: string): PackChange {
  const set = (kind: string, entries: Record<string, unknown>): PackChange["edits"] => Object.entries(entries).map(([name, value]) => ({ op: "set", path: [kind, name], value }));
  return {
    edits: [...set("roles", edits.roles), ...set("tables", edits.tables), { op: "set", path: ["layouts", edits.layout.name], value: edits.layout.value }],
    lines: [`promoted the overrides of ${layout} into layout ${edits.layout.name}`],
  };
}

/**
 * Promote one slide's overrides into the deck's pack.
 *
 * @param workspace - the workspace, whose packs are reloaded after the write.
 * @param store - the slide's deck.
 * @param id - the slide.
 * @param req - the target and its confirmations.
 * @param worker - who writes, for the slide log.
 * @returns the layout written and the slide's new revision, or the refusal.
 */
export async function promoteSlide(workspace: Workspace, store: DeckStore, id: string, req: PromoteRequest, worker: string): Promise<PromoteOutcome> {
  const record = store.readSlide(id);
  const root = record?.spec ? slideRoot(record.spec) : null;
  const loaded = workspace.packOf(store);
  if (!record?.spec || !root || !loaded) return { ok: false, status: 404, reason: `no valid slide ${id} in a deck whose pack is installed` };
  const target = targetOf(workspace, loaded, root.layout, req);
  if (typeof target === "string") return { ok: false, status: 422, reason: target };
  const users = "into" in target ? layoutUsers(workspace, loaded.pack.name, root.layout).length : 1;
  if (!resolve(loaded.dir, "pack.json").startsWith(resolve(workspace.config.templatesDir) + sep)) return { ok: false, status: 422, reason: `pack ${loaded.pack.name} lives outside the workspace's templates folder; folio writes only inside it` };
  try {
    await writePack(loaded.dir, [...workspace.decks.values()], (handle) => {
      const built = promoteOverrides(handle.raw, handle.pack ?? loaded.pack, root.layout, root.props, target);
      if (!built.ok) throw new Error(built.problems.join("\n"));
      return promoteChange(built.edits, root.layout);
    });
  } catch (error) {
    return { ok: false, status: 422, reason: (error as Error).message };
  }
  workspace.reloadPacks();
  const layout = "as" in target ? target.as : root.layout;
  if ("as" in target && req.keepSlide) return { ok: true, pack: loaded.pack.name, layout, created: true, slidesChanged: 0, slide: null };
  const moved = await store.patchSlide(id, promotedSlidePatch(record.spec, "as" in target ? target.as : null), null, worker);
  if (!moved.ok) return { ok: false, status: moved.status, reason: `the pack was written, but slide ${id} was not moved: ${moved.reason}` };
  return { ok: true, pack: loaded.pack.name, layout, created: "as" in target, slidesChanged: users, slide: { rev: moved.rev } };
}
