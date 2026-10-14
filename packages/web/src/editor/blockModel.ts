/**
 * Blocks as the editor reads and writes them (spec/slides/blocks.md,
 * "Editor"): an added `block:<x>` slot in the slide's overrides, drawn with
 * the Text tool when its popover names a block style. The shape layer moves,
 * resizes and removes a block by its edge, as it does a text box; its text is
 * typed in place and its code edited in its text area.
 */
import { blockAdd, codeValue, nextSlotName, overridesPatch, refinedBlockStyle, setOverride, setSlotOp, type Box, type CodeLanguage, type Pack, type PatchOp, type SlideSpec } from "@folio/core";
import { propsOf, type Shape } from "./shapeModel";

/** The block style (and code language) the next box drawn with the Text tool takes; absent for a plain text box. */
export interface BlockNext {
  style: string;
  language?: CodeLanguage;
}

const tree = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const slotsOf = (props: Record<string, unknown>) => tree(tree(props.overrides).slots);

/** Every added block on a slide: name and box, moved by its edge like a text box. */
export function blocksOf(props: Record<string, unknown>): Shape[] {
  return Object.entries(slotsOf(props)).flatMap(([name, raw]) => {
    const slot = tree(raw);
    const box = slot.box;
    if (slot.role !== "block" || !/^block:[a-z0-9]+$/.test(name) || !Array.isArray(box) || box.length !== 4) return [];
    return [{ name, box: box as Box, content: { kind: "rect" as const }, text: true }];
  });
}

/** The style a block's override names, or null. */
export function blockStyleOf(props: Record<string, unknown>, name: string): string | null {
  const style = tree(slotsOf(props)[name]).style;
  return typeof style === "string" ? style : null;
}

/** The next free block name on a slide: the name `blockAdd` gives the next block. */
export function nextBlockName(spec: SlideSpec, pack: Pack): string {
  const props = propsOf(spec);
  const root = spec.elements[spec.root];
  const layout = root ? pack.layouts[root.type] : undefined;
  return nextSlotName("block", [...Object.keys(layout?.slots ?? {}), ...Object.keys(slotsOf(props)), ...Object.keys(props)]);
}

/**
 * Insert a block of a style: its added slot (a draft unless `draft` is
 * false, spec/slides/drafts.md), and for code in another language an empty
 * code value naming it, in one patch.
 */
export function insertBlockOps(spec: SlideSpec, pack: Pack, box: Box, next: BlockNext, draft = true): PatchOp[] {
  const { style } = refinedBlockStyle(pack, { style: next.style });
  const otherLanguage = style.kind === "code" && next.language && next.language !== style.language;
  const edit = blockAdd(spec, pack, { style: next.style, box, ...(otherLanguage ? { code: "", language: next.language } : {}) });
  if (!edit.ok) return [];
  return draft ? edit.ops.map((op) => (op.op === "add" && op.path.endsWith("/props/overrides") ? { ...op, value: setOverride(op.value, `slots.${edit.name}.draft`, true) } : op)) : edit.ops;
}

/**
 * Give a block another named style, in one patch. Code moved to a text style
 * keeps its source as the text, since a text block holds no language.
 */
export function blockStyleOps(spec: SlideSpec, pack: Pack, name: string, style: string): PatchOp[] {
  const ops = overridesPatch(spec, setOverride(propsOf(spec).overrides, `slots.${name}.style`, style));
  const value = tree(propsOf(spec)[name]);
  const toText = refinedBlockStyle(pack, { style }).style.kind === "text" && typeof value.code === "string";
  return toText ? [...ops, setSlotOp(spec, name, value.code || null)] : ops;
}

/** Give a code block another language, keeping its code. */
export function blockLanguageOps(spec: SlideSpec, pack: Pack, name: string, language: CodeLanguage): PatchOp[] {
  const props = propsOf(spec);
  const value = props[name];
  const code = typeof value === "string" ? value : typeof tree(value).code === "string" ? (tree(value).code as string) : "";
  const { style } = refinedBlockStyle(pack, { style: blockStyleOf(props, name) });
  return [setSlotOp(spec, name, codeValue(code, language, style.language))];
}
