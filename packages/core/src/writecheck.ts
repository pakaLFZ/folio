/**
 * The schema problems of a slide, worded for the agent that wrote it: each one
 * names its JSON Pointer and what is allowed there. A write may not add one
 * (the CLI and the HTTP API refuse it with 422); `folio check` reports the same
 * problems of a hand-edited file as FOLIO-SPEC-001.
 */
import { layoutPropsSchema } from "./catalog.js";
import { listProblems, markupProblems } from "./markup.js";
import { refinedBlockStyle } from "./blockstyle.js";
import { contentKind, slotKind, type HookDef } from "./hookdef.js";
import { validateHookInputs } from "./hookinputs.js";
import { resolveOverrides, slideLayout, type ResolvedLayout } from "./overrides.js";
import type { Pack } from "./pack.js";
import { pointerToken } from "./patch.js";
import { resolveAliases, slideRoot, type SlideSpec } from "./schema.js";

/** One problem: where in the slide file, and what is expected there. */
export interface SlideProblem {
  jsonPath: string;
  reason: string;
}

/** The hooks a write is checked against: what each takes and makes. */
export type HookInputs = Record<string, Pick<HookDef, "name" | "inputs" | "output">>;

const SHAPES: Record<string, { shape: string; example: string }> = {
  text: { shape: "text or null", example: '"Results"' },
  figure: { shape: 'a file path relative to the deck, a hook call {"hook": "<name>", "inputs": {...}}, or null', example: '"figures/plot.png"' },
  table: { shape: '{"columns": [...], "rows": [[...]]} with one string per cell, or {"src": "<subject>.table.json"}', example: '{"columns": ["Run", "E / eV"], "rows": [["a", "0.12"]]}' },
  shape: { shape: '{"kind": "rect"|"ellipse"|"arrow"|"line", ...} or null', example: '{"kind": "rect", "fill": "#f5f5f5", "text": "Step 1"}' },
  block: { shape: 'text with markup for a text block; a string of code or {"code": "...", "language": "python"} for a code block; or null', example: '"**Point**: one line"' },
};

/**
 * A slide's props against its layout, after the slide's own overrides are
 * laid over it, so a slot an override adds is a valid prop.
 *
 * @param spec - the slide.
 * @param pack - the deck's pack.
 * @returns one problem per unknown prop (listing the layout's slots), wrong
 *   value (naming the slot's expected shape with an example) and override
 *   problem; empty when the root or its layout is missing (see `slideWriteProblems`).
 */
export function slidePropProblems(spec: SlideSpec, pack: Pack): SlideProblem[] {
  const root = slideRoot(spec);
  const base = root && pack.layouts[root.layout];
  if (!root || !base) return [];
  const props = resolveAliases(root.props, base.aliases);
  const layout = slideLayout(pack, root.layout, props)!;
  const at = (path: PropertyKey[]) => `/elements/${pointerToken(spec.root)}/props${path.map((p) => `/${pointerToken(String(p))}`).join("")}`;
  const out: SlideProblem[] = [];
  const parsed = layoutPropsSchema(pack, layout).safeParse(props);
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    if (issue.path[0] === "overrides") continue;
    if (issue.code === "unrecognized_keys" && !issue.path.length) for (const key of issue.keys) out.push({ jsonPath: at([key]), reason: unknownPropReason(key, root.layout, layout) });
    else out.push({ jsonPath: at(issue.path), reason: issue.path.length === 1 ? slotValueReason(pack, layout, String(issue.path[0]), issue.message) : issue.message });
  }
  for (const problem of resolveOverrides(pack, root.layout, props.overrides).problems) out.push({ jsonPath: at(["overrides", ...problem.path]), reason: problem.message });
  for (const [name, slot] of Object.entries(layout.slots)) {
    const value = props[name];
    if (typeof value !== "string" || ["figure", "table", "shape"].includes(slot.role)) continue;
    if (slot.role === "block" && refinedBlockStyle(pack, slot).style.kind === "code") continue;
    for (const reason of markupProblems(value, Object.keys(pack.colors), [...new Set(pack.fonts.map((f) => f.family))])) out.push({ jsonPath: at([name]), reason });
    const lists = listProblems(value);
    for (const reason of lists) out.push({ jsonPath: at([name]), reason });
    if (slot.role === "title" && /^(?:  )*(?:- |\d+\. )/m.test(value)) out.push({ jsonPath: at([name]), reason: "lists are not allowed in title slots; remove the list marker" });
  }
  return out;
}

/** `"foo" is not a slot of layout title; its slots: title, author; also background, overrides`. */
function unknownPropReason(key: string, name: string, layout: ResolvedLayout): string {
  const slots = Object.keys(layout.slots);
  return `"${key}" is not a slot of layout ${name}; its slots: ${slots.join(", ") || "none"}; also background, overrides`;
}

/** A wrong slot value: zod's words, then the slot's shape and an example. */
function slotValueReason(pack: Pack, layout: ResolvedLayout, slotName: string, message: string): string {
  const slot = layout.slots[slotName];
  if (!slot) return message;
  const kind = contentKind(slot.role);
  const { shape, example } = SHAPES[kind]!;
  const hook = kind === "figure" && slot.hook ? `; folio hook show ${pack.name}/${slot.hook} prints an example of its hook's inputs` : "";
  return `${message}; ${slotName} is a ${slot.role} slot: ${shape}, e.g. ${example}${hook}`;
}

/**
 * Each figure slot's hook call against the hook it names.
 *
 * @param spec - the slide.
 * @param pack - the deck's pack.
 * @param hooks - the pack's hooks.
 * @returns a problem for a hook the pack lacks or that makes no figure
 *   (listing the figure hooks), and one per input that fails the hook's
 *   schema, each naming `folio hook show <pack>/<hook>`.
 */
export function slideHookProblems(spec: SlideSpec, pack: Pack, hooks: HookInputs): SlideProblem[] {
  const root = slideRoot(spec);
  const base = root && pack.layouts[root.layout];
  if (!root || !base) return [];
  const props = resolveAliases(root.props, base.aliases);
  const layout = slideLayout(pack, root.layout, props)!;
  const figureHooks = Object.values(hooks).filter((h) => h.output === "figure").map((h) => h.name);
  const out: SlideProblem[] = [];
  for (const [name, slot] of Object.entries(layout.slots)) {
    const call = props[name] as { hook?: unknown; inputs?: unknown } | null | undefined;
    if (slotKind(slot.role) !== "figure" || !call || typeof call !== "object" || typeof call.hook !== "string") continue;
    const at = `/elements/${pointerToken(spec.root)}/props/${pointerToken(name)}`;
    const hook = hooks[call.hook];
    if (!hook || hook.output !== "figure") {
      const why = hook ? `makes ${hook.output}, not a figure` : `is not in pack ${pack.name}`;
      out.push({ jsonPath: `${at}/hook`, reason: `hook "${call.hook}" ${why}; figure hooks: ${figureHooks.join(", ") || "none"} (folio hook list)` });
      continue;
    }
    const show = `folio hook show ${pack.name}/${hook.name} prints an example`;
    for (const issue of validateHookInputs(hook.inputs, call.inputs ?? {})) out.push({ jsonPath: `${at}/inputs${issue.jsonPath === "/" ? "" : issue.jsonPath}`, reason: `${issue.reason}; ${show}` });
  }
  return out;
}

/**
 * Every schema problem of a slide: its root, its layout, its props and its
 * hook calls.
 *
 * @returns empty when the slide matches its layout and every hook's inputs.
 */
export function slideWriteProblems(spec: SlideSpec, pack: Pack, hooks: HookInputs): SlideProblem[] {
  const root = slideRoot(spec);
  if (!root) return [{ jsonPath: "/root", reason: `"${spec.root}" names no element; root must be a key of elements` }];
  if (!pack.layouts[root.layout]) {
    return [{ jsonPath: `/elements/${pointerToken(spec.root)}/type`, reason: `layout "${root.layout}" is not in pack ${pack.name}; layouts: ${Object.keys(pack.layouts).join(", ")}` }];
  }
  return [...slidePropProblems(spec, pack), ...slideHookProblems(spec, pack, hooks)];
}

/**
 * Why a write must be refused: the schema problems it adds.
 *
 * @param pack - the deck's pack.
 * @param hooks - the pack's hooks.
 * @param before - the slide as stored; null for a new slide.
 * @param after - the slide as it would be written.
 * @returns null when the write adds no problem (a slide already broken by a
 *   hand edit still takes a write that does not break it further); else every
 *   added problem, one per line, as `<JSON Pointer>: <what is allowed>`.
 */
export function slideWriteRefusal(pack: Pack, hooks: HookInputs, before: SlideSpec | null, after: SlideSpec): string | null {
  const line = (p: SlideProblem) => `${p.jsonPath}: ${p.reason}`;
  const had = new Set(before ? slideWriteProblems(before, pack, hooks).map(line) : []);
  const added = slideWriteProblems(after, pack, hooks).map(line).filter((l) => !had.has(l));
  return added.length ? added.join("\n") : null;
}
