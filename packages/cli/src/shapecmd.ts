/**
 * `folio shape add|rm`: a shape on a slide in one revision-checked write, its
 * added `shape:<letter>` slot and its content together.
 */
import { parseArgs } from "node:util";
import { shapeAdd, shapeRemove, slideRoot, type Point, type ShapeEdit, type ShapeRequest } from "@folio/core";
import { slideWriteGuard } from "@folio/server";
import { openDeck, splitSlideRef } from "./deckcmds.js";

const ADD_USAGE = "usage: folio shape add <deck>/<id> rect|ellipse|circle|arrow|line --box x,y,w,h [--from x,y --to x,y] [--fill C] [--stroke C] [--stroke-width PT] [--dash solid|dash|dot] [--heads end|start|both|none] [--radius PT] [--text T] [--style S] [--rev R] [--worker W] [--json]";
const RM_USAGE = "usage: folio shape rm <deck>/<id> shape:a [--rev R] [--worker W]";
const KINDS = ["rect", "ellipse", "circle", "arrow", "line"];

const numbers = (text: string, flag: string): number[] => {
  const out = text.split(",").map(Number);
  if (out.some((n) => !Number.isFinite(n))) throw new Error(`--${flag} takes numbers separated by commas, got ${text}`);
  return out;
};
const point = (text: string | undefined, flag: string): Point | undefined => {
  if (text === undefined) return undefined;
  const p = numbers(text, flag);
  if (p.length !== 2) throw new Error(`--${flag} is x,y in pt, got ${text}`);
  return p as Point;
};
const color = (text: string | undefined) => (text === undefined ? undefined : text === "none" || text === "null" ? null : text);

/** `folio shape add|rm ...` */
export async function shapeCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === "add") return shapeAddCommand(rest);
  if (sub === "rm") return shapeRmCommand(rest);
  throw new Error(`${ADD_USAGE}\n${RM_USAGE}`);
}

/** The request the flags of `folio shape add` describe; fields not given are left to the style. */
function shapeRequest(kind: string, v: Record<string, string | undefined>): ShapeRequest {
  if (!KINDS.includes(kind)) throw new Error(`"${kind}" is not a shape kind; kinds: ${KINDS.join(", ")}\n${ADD_USAGE}`);
  const fields = {
    style: v.style,
    fill: color(v.fill),
    stroke: color(v.stroke),
    strokeWidth: v["stroke-width"] === undefined ? undefined : Number(v["stroke-width"]),
    dash: v.dash,
    radius: v.radius === undefined ? undefined : Number(v.radius),
    heads: v.heads,
    text: v.text,
  };
  const given = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  return { kind: kind as ShapeRequest["kind"], box: v.box ? numbers(v.box, "box") : undefined, from: point(v.from, "from"), to: point(v.to, "to"), fields: given as ShapeRequest["fields"] };
}

async function shapeAddCommand(args: string[]): Promise<number> {
  const options = Object.fromEntries(["box", "from", "to", "fill", "stroke", "stroke-width", "dash", "heads", "radius", "text", "style", "rev", "worker"].map((k) => [k, { type: "string" as const }]));
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { ...options, json: { type: "boolean" } } });
  if (positionals.length < 2) throw new Error(ADD_USAGE);
  const request = shapeRequest(positionals[1]!, values as Record<string, string | undefined>);
  return writeShape(positionals[0]!, values, (spec, pack) => shapeAdd(spec, pack, request));
}

async function shapeRmCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { rev: { type: "string" }, worker: { type: "string" }, json: { type: "boolean" } } });
  if (positionals.length < 2) throw new Error(RM_USAGE);
  return writeShape(positionals[0]!, values, (spec, pack) => shapeRemove(spec, pack, positionals[1]!));
}

type Edit = Parameters<typeof shapeAdd>;

/** Make the edit against the stored slide and write it; a refusal prints each problem by path and writes nothing. */
export async function writeShape(ref: string, values: { rev?: string; worker?: string; json?: boolean }, make: (spec: Edit[0], pack: Edit[1]) => ShapeEdit): Promise<number> {
  const { deck, slide } = splitSlideRef(ref);
  const { workspace, store } = openDeck(deck);
  const loaded = workspace.packOf(store);
  const record = store.readSlide(slide);
  if (!record?.spec || !slideRoot(record.spec) || !loaded) throw new Error(`no valid slide ${slide} in ${deck}`);
  const edit = make(record.spec, loaded.pack);
  if (!edit.ok) return refuse(edit.reason, `${slide} stays at rev ${record.rev}`);
  const result = await store.patchSlide(slide, edit.ops, values.rev ?? record.rev, values.worker ?? "cli", slideWriteGuard(loaded));
  if (!result.ok && result.status === 422) return refuse(result.reason, `${slide} stays at rev ${result.current?.rev ?? record.rev}`);
  if (!result.ok) {
    process.stderr.write(`${result.status} ${result.reason}${result.current ? ` (current rev ${result.current.rev})` : ""}\n`);
    return result.status === 409 ? 3 : 2;
  }
  process.stdout.write(values.json ? `${JSON.stringify({ id: slide, slot: edit.name, rev: result.rev })}\n` : `${edit.name}\n`);
  return 0;
}

function refuse(reason: string, kept: string): number {
  process.stderr.write(`422 refused, nothing written; ${kept}:\n${reason.split("\n").map((l) => `  ${l}`).join("\n")}\n`);
  return 2;
}
