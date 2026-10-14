/**
 * Overrides addressed by dotted path (`slots.note.box`, `slots.table:a.table.headerFill`):
 * list them, set and clear them, and turn the result into one slide patch.
 * Validation stays in `overrides.ts`; these only move values.
 */
import { formatOverrideProblem, resolveOverrides } from "./overrides.js";
import type { Pack } from "./pack.js";
import { pointerToken, type PatchOp } from "./patch.js";
import { slideRoot, type SlideSpec } from "./schema.js";

type Tree = Record<string, unknown>;

/** One override as the editor and `folio override` list it. */
export interface OverrideEntry {
  path: string;
  value: unknown;
}

/** What an agent asks for: values to set by path, paths to clear, or everything cleared. */
export interface OverrideEdit {
  set?: Record<string, unknown>;
  clear?: string[];
  clearAll?: boolean;
}

const isTree = (v: unknown): v is Tree => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Every override as a leaf path and its value.
 *
 * @param overrides - a slide's `overrides` prop.
 * @returns one entry per value that is not an object (arrays, scalars and null
 *   are leaves), in key order: `slots.note.box = [25, 120, 420, 380]`.
 */
export function overrideEntries(overrides: unknown, prefix: string[] = []): OverrideEntry[] {
  if (!isTree(overrides)) return prefix.length ? [{ path: prefix.join("."), value: overrides }] : [];
  return Object.entries(overrides).flatMap(([key, value]) => overrideEntries(value, [...prefix, key]));
}

/**
 * Set one value by dotted path.
 *
 * @returns a new tree; missing objects on the way are created, the input is unchanged.
 */
export function setOverride(overrides: unknown, path: string, value: unknown): Tree {
  const [head, ...rest] = path.split(".");
  const tree = isTree(overrides) ? { ...overrides } : {};
  tree[head!] = rest.length ? setOverride(tree[head!], rest.join("."), value) : value;
  return tree;
}

/**
 * Clear one value, or a whole branch, by dotted path.
 *
 * @returns a new tree without it, with objects left empty removed; the input is unchanged.
 */
export function clearOverride(overrides: unknown, path: string): Tree {
  if (!isTree(overrides)) return {};
  const [head, ...rest] = path.split(".");
  const tree = { ...overrides };
  if (!(head! in tree)) return tree;
  if (rest.length) tree[head!] = clearOverride(tree[head!], rest.join("."));
  if (!rest.length || (isTree(tree[head!]) && !Object.keys(tree[head!] as Tree).length)) delete tree[head!];
  return tree;
}

/**
 * Apply an agent's edit to a slide's overrides.
 *
 * @returns the new overrides: cleared first (`clearAll`, then each `clear`), then each `set`.
 */
export function editOverrides(current: unknown, edit: OverrideEdit): Tree {
  let next: Tree = edit.clearAll || !isTree(current) ? {} : current;
  for (const path of edit.clear ?? []) next = clearOverride(next, path);
  for (const [path, value] of Object.entries(edit.set ?? {})) next = setOverride(next, path, value);
  return next;
}

/**
 * The patch that stores a slide's overrides.
 *
 * @param spec - the slide.
 * @param overrides - the new overrides; empty removes the prop.
 * @returns zero or one operation.
 */
export function overridesPatch(spec: SlideSpec, overrides: Tree): PatchOp[] {
  const path = `/elements/${pointerToken(spec.root)}/props/overrides`;
  const had = slideRoot(spec)?.props.overrides !== undefined;
  if (!Object.keys(overrides).length) return had ? [{ op: "remove", path }] : [];
  return [{ op: "add", path, value: overrides }];
}

/**
 * Why a write that changes a slide's overrides must be refused.
 *
 * @param pack - the deck's pack.
 * @param before - the slide as stored.
 * @param after - the slide as it would be written.
 * @returns null when the overrides are unchanged or valid; else every problem,
 *   one per line, each naming its path (`overrides.slots.note.box.2: ...`).
 */
export function overrideWriteProblem(pack: Pack, before: SlideSpec, after: SlideSpec): string | null {
  const root = slideRoot(after);
  const next = root?.props.overrides;
  if (!root || JSON.stringify(next) === JSON.stringify(slideRoot(before)?.props.overrides)) return null;
  const { problems } = resolveOverrides(pack, root.layout, next);
  return problems.length ? problems.map(formatOverrideProblem).join("\n") : null;
}
