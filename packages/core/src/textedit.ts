/**
 * Adding a text box as one slide patch: an added text slot `text:<x>` in the
 * slide's overrides (box, text style fields, box style) and its words in the
 * slide's props, written together. Validation is the write check's.
 */
import type { BoxStyle } from "./boxstyle.js";
import { clearOverride, overridesPatch, setOverride } from "./overridepaths.js";
import { slideLayout } from "./overrides.js";
import { isTextRole, TEXT_ROLES, type Box, type Pack, type TextStyle } from "./pack.js";
import { pointerToken } from "./patch.js";
import { slideRoot, type SlideSpec } from "./schema.js";
import type { ShapeEdit } from "./shapeedit.js";

/** What an agent asks for: a box, the words, and the box's own text style and box style. */
export interface TextBoxRequest {
  box: number[];
  text?: string;
  style?: Partial<TextStyle>;
  boxStyle?: Partial<BoxStyle>;
}

/** The first `text:<x>` not taken: `text:a` ... `text:z`, then `text:a1` ... */
export function nextTextName(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let round = 0; ; round += 1) {
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      const name = `text:${letter}${round ? round : ""}`;
      if (!used.has(name)) return name;
    }
  }
}

/** The role a text box takes: `body`, else the pack's first text role. */
export function textBoxRole(pack: Pack): string {
  return pack.roles.body ? "body" : (TEXT_ROLES.find((r) => pack.roles[r]) ?? "body");
}

const given = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** The added slot of a text box: its role, box, and only the text style and box style fields given. */
export function textBoxSlot(pack: Pack, box: Box, style: Partial<TextStyle> = {}, boxStyle: Partial<BoxStyle> = {}): Record<string, unknown> {
  const text = given(style);
  return { role: textBoxRole(pack), box, ...(Object.keys(text).length ? { text } : {}), ...given(boxStyle) };
}

/**
 * The patch that adds a text box as the slide's next free `text:<x>` slot.
 *
 * @returns the slot name and the patch, or why the request cannot be placed.
 */
export function textAdd(spec: SlideSpec, pack: Pack, req: TextBoxRequest): ShapeEdit {
  const root = slideRoot(spec);
  const layout = root && pack.layouts[root.layout] ? slideLayout(pack, root.layout, root.props) : undefined;
  if (!root || !layout) return { ok: false, reason: "the slide has no layout of its pack" };
  if (req.box.length !== 4 || req.box.some((n) => !Number.isFinite(n))) return { ok: false, reason: "--box is x,y,w,h in pt, e.g. 100,120,300,60" };
  const overrides = root.props.overrides as { slots?: Record<string, unknown> } | undefined;
  const name = nextTextName([...Object.keys(layout.slots), ...Object.keys(overrides?.slots ?? {}), ...Object.keys(root.props)]);
  const ops = overridesPatch(spec, setOverride(overrides, `slots.${name}`, textBoxSlot(pack, req.box as Box, req.style, req.boxStyle)));
  if (req.text) ops.push({ op: "add", path: `/elements/${pointerToken(spec.root)}/props/${pointerToken(name)}`, value: req.text });
  return { ok: true, name, ops };
}

/** Whether a slot of a layout is an added text box the editor may move and remove. */
export function isTextBox(name: string, role: string): boolean {
  return /^text:[a-z0-9]+$/.test(name) && isTextRole(role as never);
}

/**
 * The patch that removes an added text box: its slot and its words.
 *
 * @returns the patch, or why there is no such text box.
 */
export function textRemove(spec: SlideSpec, pack: Pack, name: string): ShapeEdit {
  const root = slideRoot(spec);
  if (!root || !pack.layouts[root.layout]) return { ok: false, reason: "the slide has no layout of its pack" };
  const added = (root.props.overrides as { slots?: Record<string, { role?: string }> } | undefined)?.slots ?? {};
  const boxes = Object.entries(added).filter(([n, s]) => isTextBox(n, String(s?.role))).map(([n]) => n);
  if (!boxes.includes(name)) return { ok: false, reason: `"${name}" is not a text box of this slide (text boxes: ${boxes.join(", ") || "none"})` };
  const ops = overridesPatch(spec, clearOverride(root.props.overrides, `slots.${name}`));
  if (name in root.props) ops.push({ op: "remove", path: `/elements/${pointerToken(spec.root)}/props/${pointerToken(name)}` });
  return { ok: true, name, ops };
}
