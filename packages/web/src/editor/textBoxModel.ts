/**
 * Text boxes as the editor reads and writes them: an added text slot
 * `text:<x>` in the slide's overrides, its look being its `text` style fields
 * and its box style (`fill`, `border`, `padding`), its words the slide prop of
 * the same name (spec/slides/drawing.md, "Text boxes in the editor").
 */
import { clearOverride, isTextBox, nextTextName, overridesPatch, setOverride, textBoxSlot, type Border, type Box, type Pack, type PatchOp, type SlideSpec, type TextStyle } from "@folio/core";
import { propsOf, type Shape } from "./shapeModel";

/** What the popover sets: text style fields and the box style. */
export interface TextLook {
  size?: number;
  font?: string | null;
  weight?: number;
  italic?: boolean;
  color?: string;
  align?: TextStyle["align"];
  fill?: string | null;
  border?: Border | null;
  padding?: number;
}

const STYLE_KEYS = ["size", "font", "weight", "italic", "color", "align"] as const;
const BOX_KEYS = ["fill", "border", "padding"] as const;
/** The padding a box gets when it is given a background or border and has none. */
export const FRAMED_PADDING = 4;

const tree = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const slotsOf = (props: Record<string, unknown>) => tree(tree(props.overrides).slots);

/** Every text box on a slide, read from its overrides: name and box, as the shape layer moves them. */
export function textBoxesOf(props: Record<string, unknown>): Shape[] {
  return Object.entries(slotsOf(props)).flatMap(([name, raw]) => {
    const slot = tree(raw);
    const box = slot.box;
    if (!isTextBox(name, String(slot.role)) || !Array.isArray(box) || box.length !== 4) return [];
    return [{ name, box: box as Box, content: { kind: "rect" as const }, text: true }];
  });
}

/** A text box's look as written in its override. */
export function lookOf(props: Record<string, unknown>, name: string): TextLook {
  const slot = tree(slotsOf(props)[name]);
  const style = tree(slot.text);
  const pick = (from: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));
  return { ...pick(style, STYLE_KEYS), ...pick(slot, BOX_KEYS) } as TextLook;
}

/** A look with a change laid over it; a background or border on an unpadded box brings FRAMED_PADDING. */
export function withChange(look: TextLook, change: Partial<TextLook>): TextLook {
  const next = { ...look, ...change };
  const framed = (change.fill !== undefined && change.fill !== null) || !!change.border;
  if (framed && !next.padding) next.padding = FRAMED_PADDING;
  return Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as TextLook;
}

/** Split a look into the slot's text style fields and its box style fields. */
function split(look: TextLook): { style: Partial<TextStyle>; box: Record<string, unknown> } {
  const style = Object.fromEntries(STYLE_KEYS.filter((k) => look[k] !== undefined).map((k) => [k, look[k]])) as Partial<TextStyle>;
  const box = Object.fromEntries(BOX_KEYS.filter((k) => look[k] !== undefined).map((k) => [k, look[k]]));
  return { style, box };
}

/** Insert a text box: its added slot (a draft unless `draft` is false), with the look, in one patch; no words yet. */
export function insertTextOps(spec: SlideSpec, pack: Pack, name: string, box: Box, look: TextLook, draft = true): PatchOp[] {
  const { style, box: boxStyle } = split(withChange({}, look));
  return overridesPatch(spec, setOverride(propsOf(spec).overrides, `slots.${name}`, { ...textBoxSlot(pack, box, style, boxStyle), ...(draft ? { draft: true } : {}) }));
}

/** The next free text box name on a slide. */
export function nextTextBoxName(spec: SlideSpec): string {
  const props = propsOf(spec);
  return nextTextName([...Object.keys(slotsOf(props)), ...Object.keys(props)]);
}

/** Store a text box's new look: each field set or cleared at its path, in one patch. */
export function lookOps(spec: SlideSpec, name: string, look: TextLook): PatchOp[] {
  let overrides: unknown = propsOf(spec).overrides;
  for (const key of STYLE_KEYS) overrides = look[key] === undefined ? clearOverride(overrides, `slots.${name}.text.${key}`) : setOverride(overrides, `slots.${name}.text.${key}`, look[key]);
  for (const key of BOX_KEYS) overrides = look[key] === undefined ? clearOverride(overrides, `slots.${name}.${key}`) : setOverride(overrides, `slots.${name}.${key}`, look[key]);
  return overridesPatch(spec, overrides as Record<string, unknown>);
}

/** The font families a text box may take: those the pack ships and those its roles name. */
export function fontFamilies(pack: Pack): string[] {
  return [...new Set([...pack.fonts.map((f) => f.family), ...Object.values(pack.roles).flatMap((r) => (r.font ? [r.font] : []))])];
}
