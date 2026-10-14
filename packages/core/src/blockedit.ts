/**
 * Adding and removing a block as one slide patch: the added `block:<x>` slot
 * in the slide's overrides and its content in the slide's props, written
 * together. Validation of the result is the write check's (`slideWriteRefusal`).
 */
import { refinedBlockStyle, type CodeLanguage } from "./blockstyle.js";
import { codeValue } from "./blocks.js";
import { clearOverride, overridesPatch, setOverride } from "./overridepaths.js";
import { slideLayout } from "./overrides.js";
import type { Box, Pack } from "./pack.js";
import { pointerToken, type PatchOp } from "./patch.js";
import { slideRoot, type SlideSpec } from "./schema.js";

/** What an agent or the editor asks for: a style, a box, and the text or code it holds. */
export interface BlockRequest {
  style: string;
  box: number[];
  text?: string;
  code?: string;
  language?: CodeLanguage;
  columns?: number;
}

export type BlockEdit = { ok: true; name: string; ops: PatchOp[] } | { ok: false; reason: string };

/**
 * The next free slot name with a prefix.
 *
 * @param taken - the names in use: the layout's slots, the slide's overrides and props.
 * @returns `block:a`, ... `block:z`, then `block:a1`, ...
 */
export function nextSlotName(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let round = 0; ; round += 1) {
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      const name = `${prefix}:${letter}${round ? round : ""}`;
      if (!used.has(name)) return name;
    }
  }
}

/** The stored value of a request: its text, its code (with a language other than the style's), or nothing. */
function requestValue(pack: Pack, req: BlockRequest): unknown {
  if (req.code !== undefined) return codeValue(req.code, req.language, refinedBlockStyle(pack, { style: req.style }).style.language);
  return req.text;
}

/**
 * The patch that adds a block as the slide's next free `block:<letter>` slot.
 *
 * @param spec - the slide as stored.
 * @param pack - the deck's pack.
 * @returns the slot name and the patch (overrides and content in one write),
 *   or why the request cannot be placed. A style the pack lacks, or content
 *   of the wrong kind, is refused by the write check by path.
 */
export function blockAdd(spec: SlideSpec, pack: Pack, req: BlockRequest): BlockEdit {
  const root = slideRoot(spec);
  const layout = root && pack.layouts[root.layout] ? slideLayout(pack, root.layout, root.props) : undefined;
  if (!root || !layout) return { ok: false, reason: "the slide has no layout of its pack" };
  if (req.box.length !== 4 || req.box.some((n) => !Number.isFinite(n)) || req.box[2]! <= 0 || req.box[3]! <= 0) return { ok: false, reason: "--box is x,y,w,h in pt with a positive width and height, e.g. 60,120,840,200" };
  if (req.text !== undefined && req.code !== undefined) return { ok: false, reason: "a block holds text or code, not both: give --text or --code-file" };
  const overrides = root.props.overrides as { slots?: Record<string, unknown> } | undefined;
  const name = nextSlotName("block", [...Object.keys(layout.slots), ...Object.keys(overrides?.slots ?? {}), ...Object.keys(root.props)]);
  const slot = { role: "block", box: req.box as Box, style: req.style, ...(req.columns !== undefined ? { block: { columns: req.columns } } : {}) };
  const ops = overridesPatch(spec, setOverride(overrides, `slots.${name}`, slot));
  const value = requestValue(pack, req);
  if (value !== undefined) ops.push({ op: "add", path: `/elements/${pointerToken(spec.root)}/props/${pointerToken(name)}`, value });
  return { ok: true, name, ops };
}

/**
 * The patch that removes a block: its added slot and its content; a block
 * slot of the layout keeps its slot and loses its content.
 *
 * @returns the patch, or why there is no such block.
 */
export function blockRemove(spec: SlideSpec, pack: Pack, name: string): BlockEdit {
  const root = slideRoot(spec);
  const base = root && pack.layouts[root.layout];
  if (!root || !base) return { ok: false, reason: "the slide has no layout of its pack" };
  const layout = slideLayout(pack, root.layout, root.props)!;
  const blocks = Object.entries(layout.slots).filter(([, s]) => s.role === "block").map(([n]) => n);
  if (!blocks.includes(name)) return { ok: false, reason: `"${name}" is not a block slot of this slide (blocks: ${blocks.join(", ") || "none"})` };
  const ops = base.slots[name] ? [] : overridesPatch(spec, clearOverride(root.props.overrides, `slots.${name}`));
  if (name in root.props) ops.push({ op: "remove", path: `/elements/${pointerToken(spec.root)}/props/${pointerToken(name)}` });
  return ops.length ? { ok: true, name, ops } : { ok: false, reason: `${name} is a block slot of the layout and already empty` };
}
