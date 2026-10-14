/**
 * `folio text add|rm`: a text box on a slide in one revision-checked write, its
 * added `text:<letter>` slot (box, text style, box style) and its words together;
 * `rm` removes both (drafts the user drew included).
 */
import { parseArgs } from "node:util";
import { textAdd, textRemove, type BoxStyle, type TextBoxRequest, type TextStyle } from "@folio/core";
import { writeShape } from "./shapecmd.js";

const USAGE = "usage: folio text add <deck>/<id> --box x,y,w,h [--text T] [--size PT] [--font F] [--color C] [--bold] [--italic] [--align left|center|right|justify] [--fill C] [--border C] [--border-width PT] [--border-dash solid|dash|dot] [--padding PT] [--rev R] [--worker W] [--json]";
const STRINGS = ["box", "text", "size", "font", "color", "align", "fill", "border", "border-width", "border-dash", "padding", "rev", "worker"];

const num = (v: string | undefined, flag: string): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${flag} takes a number in pt, got ${v}`);
  return n;
};

/** The box style the flags ask for; a background or border without --padding gets 4 pt. */
function boxStyleOf(v: Record<string, string | undefined>): Partial<BoxStyle> {
  const border = v.border === undefined ? undefined : { color: v.border, width: num(v["border-width"], "border-width") ?? 1, dash: (v["border-dash"] ?? "solid") as "solid" | "dash" | "dot" };
  const padding = num(v.padding, "padding") ?? (v.fill !== undefined || border ? 4 : undefined);
  return { fill: v.fill, border, padding };
}

/** The request the flags describe; fields not given are left to the role style. */
function textRequest(v: Record<string, string | boolean | undefined>): TextBoxRequest {
  const s = v as Record<string, string | undefined>;
  if (!s.box) throw new Error(`--box is required\n${USAGE}`);
  const box = s.box.split(",").map(Number);
  const style: Partial<TextStyle> = { size: num(s.size, "size"), font: s.font, color: s.color, align: s.align as TextStyle["align"] | undefined, weight: v.bold ? 700 : undefined, italic: v.italic ? true : undefined };
  return { box, text: s.text, style, boxStyle: boxStyleOf(s) };
}

const RM_USAGE = "usage: folio text rm <deck>/<id> text:a [--rev R] [--worker W]";

/** `folio text add|rm ...` */
export async function textCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === "rm") return textRmCommand(rest);
  if (sub !== "add") throw new Error(`${USAGE}\n${RM_USAGE}`);
  const options = Object.fromEntries(STRINGS.map((k) => [k, { type: "string" as const }]));
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { ...options, bold: { type: "boolean" }, italic: { type: "boolean" }, json: { type: "boolean" } } });
  if (positionals.length < 1) throw new Error(USAGE);
  const request = textRequest(values);
  return writeShape(positionals[0]!, values as { rev?: string; worker?: string; json?: boolean }, (spec, pack) => textAdd(spec, pack, request));
}

async function textRmCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { rev: { type: "string" }, worker: { type: "string" }, json: { type: "boolean" } } });
  if (positionals.length < 2) throw new Error(RM_USAGE);
  return writeShape(positionals[0]!, values, (spec, pack) => textRemove(spec, pack, positionals[1]!));
}
