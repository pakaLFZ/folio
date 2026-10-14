/**
 * Promoting a slide's overrides into its pack: as a new layout ("Save as new
 * template"), or into the slide's own layout ("Apply to template", which
 * changes every slide of that layout). The result is a set of edits to
 * `pack.json`, built from the raw file so the pack keeps its own shape:
 * a `text` override becomes a new named role style, a `table` override a new
 * named table style, and the slot names them, so every look stays defined once
 * in the pack.
 */
import { deepMerge, resolveOverrides, formatOverrideProblem, type SlideOverrides } from "./overrides.js";
import type { Pack, TableStyle, TextStyle } from "./pack.js";
import { pointerToken, type PatchOp } from "./patch.js";
import { slideRoot, type SlideSpec } from "./schema.js";

type Tree = Record<string, unknown>;

/** Where the overrides go: a new layout named `as`, or the slide's own layout. */
export type PromoteTarget = { as: string; description?: string } | { into: true; description?: string };

/** What to write into `pack.json`: new role and table styles, and one layout added or replaced. */
export interface PromoteEdits {
  roles: Record<string, TextStyle>;
  tables: Record<string, TableStyle>;
  layout: { name: string; value: Tree; replaces: boolean };
}

export type PromoteResult = { ok: true; edits: PromoteEdits } | { ok: false; problems: string[] };

const LAYOUT_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Why a name cannot be a new layout of the pack.
 *
 * @returns null when it is free and kebab-case; else the refusal, naming the clash.
 */
export function newLayoutNameProblem(pack: Pack, name: string): string | null {
  if (!LAYOUT_NAME.test(name)) return `"${name}" is not a layout name: use kebab-case, lower-case letters, digits and hyphens, starting with a letter or digit (like "note-figure-wide")`;
  if (pack.layouts[name]) return `layout "${name}" already exists in pack ${pack.name} (layouts: ${Object.keys(pack.layouts).join(", ")}); choose another name`;
  return null;
}

/** `note-figure-table-a`, or with `-2`, `-3` until it names nothing yet. */
function freshName(base: string, taken: Record<string, unknown>): string {
  const clean = base.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  let name = clean;
  for (let n = 2; taken[name]; n++) name = `${clean}-${n}`;
  return name;
}

/** Problems that stop a promotion before any edit is built. */
function promoteProblems(pack: Pack, layoutName: string, props: Tree, target: PromoteTarget): string[] {
  const resolved = resolveOverrides(pack, layoutName, props.overrides);
  if (!pack.layouts[layoutName]) return [`layout ${layoutName} is not in pack ${pack.name}`];
  if (resolved.problems.length) return resolved.problems.map(formatOverrideProblem);
  const drafts = Object.entries(resolved.layout?.slots ?? {}).filter(([, s]) => s.draft).map(([n]) => n);
  if (drafts.length) return [`the slide has drafts (${drafts.join(", ")}): a template holds no sketches; draw them for real or remove them first`];
  if ("as" in target) {
    const clash = newLayoutNameProblem(pack, target.as);
    return clash ? [clash] : [];
  }
  if (!props.overrides || !Object.keys(props.overrides as Tree).length) return ["the slide has no overrides: there is nothing to apply to its layout"];
  const picked = Object.entries((props.overrides as SlideOverrides).slots ?? {}).filter(([slot, o]) => o.table && (props[slot] as { tableStyle?: unknown } | null)?.tableStyle);
  return picked.map(([slot]) => `overrides.slots.${slot}.table: the slide's value of ${slot} picks its own tableStyle; remove that pick or the table override first`);
}

/**
 * Build the pack edits that turn a slide's overrides into a template.
 *
 * @param rawPack - `pack.json` as parsed from the file (no defaults filled).
 * @param pack - the same pack, loaded.
 * @param layoutName - the slide's layout.
 * @param props - the slide's props, with its `overrides`.
 * @param target - a new layout name, or the slide's own layout.
 * @returns the edits, or the problems naming why not (an invalid override, a
 *   bad or taken name, nothing to apply).
 */
export function promoteOverrides(rawPack: unknown, pack: Pack, layoutName: string, props: Tree, target: PromoteTarget): PromoteResult {
  const problems = promoteProblems(pack, layoutName, props, target);
  if (problems.length) return { ok: false, problems };
  const overrides = (props.overrides ?? {}) as SlideOverrides;
  const merged = resolveOverrides(pack, layoutName, overrides).layout!;
  const name = "as" in target ? target.as : layoutName;
  const raw = structuredClone((rawPack as { layouts: Record<string, Tree> }).layouts[layoutName]!);
  const value: Tree = deepMerge(raw, { background: overrides.background, decorations: overrides.decorations });
  const edits: PromoteEdits = { roles: {}, tables: {}, layout: { name, value, replaces: !("as" in target) } };
  const slots = value.slots as Record<string, Tree>;
  const addsSlots = Object.keys(overrides.slots ?? {}).some((slot) => !slots[slot]);
  if ("as" in target && addsSlots) delete value.usage;
  for (const [slot, over] of Object.entries(overrides.slots ?? {})) {
    const { text, table, ...fields } = over;
    slots[slot] = deepMerge(slots[slot]!, fields);
    const resolved = merged.slots[slot]!;
    if (text) {
      const style = freshName(`${name}-${slot}`, { ...pack.roles, ...edits.roles });
      edits.roles[style] = { ...pack.roles[resolved.style ?? resolved.role]!, ...text };
      slots[slot]!.style = style;
    }
    if (table) {
      const style = freshName(`${name}-${slot}`, { ...pack.tables, ...edits.tables });
      edits.tables[style] = deepMerge(pack.tables[resolved.tableStyle ?? ""]!, table);
      slots[slot]!.tableStyle = style;
    }
  }
  if (target.description) value.description = target.description;
  else if ("as" in target) value.description = `${String(raw.description ?? layoutName)} Made from a slide's overrides of ${layoutName}.`;
  return { ok: true, edits };
}

/**
 * The edits laid onto the raw pack, as an object.
 *
 * @returns a new raw pack; used to validate the result before it is written.
 */
export function applyPromoteEdits(rawPack: unknown, edits: PromoteEdits): Tree {
  const pack = structuredClone(rawPack) as Tree;
  pack.roles = { ...(pack.roles as Tree), ...edits.roles };
  if (Object.keys(edits.tables).length) pack.tables = { ...((pack.tables as Tree) ?? {}), ...edits.tables };
  pack.layouts = { ...(pack.layouts as Tree), [edits.layout.name]: edits.layout.value };
  return pack;
}

/**
 * The patch that moves a slide onto its promoted template.
 *
 * @param spec - the slide.
 * @param layout - the new layout's name, or null to keep the slide's layout.
 * @returns the slide's overrides removed, its `background` prop removed when an
 *   override background was promoted (the prop would otherwise win over it), and
 *   its type changed to the new layout; so the slide renders as it did.
 */
export function promotedSlidePatch(spec: SlideSpec, layout: string | null): PatchOp[] {
  const root = slideRoot(spec);
  if (!root) return [];
  const at = `/elements/${pointerToken(spec.root)}`;
  const overrides = root.props.overrides as SlideOverrides | undefined;
  const ops: PatchOp[] = [];
  if (overrides !== undefined) ops.push({ op: "remove", path: `${at}/props/overrides` });
  if (overrides?.background !== undefined && root.props.background !== undefined) ops.push({ op: "remove", path: `${at}/props/background` });
  if (layout && layout !== root.layout) ops.push({ op: "replace", path: `${at}/type`, value: layout });
  return ops;
}
