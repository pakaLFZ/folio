/**
 * `folio box <deck>/<slide> <slot>`: the slot's box as the slide lays it out
 * now, the size a figure drawn outside a hook is made at; and what
 * `folio trace` says of such a figure.
 */
import { parseArgs } from "node:util";
import { slotBox, WarningService, type FigureFileTrace, type SlotBox, type Workspace, type DeckStore } from "@folio/server";
import { openDeck, splitSlideRef } from "./deckcmds.js";

const inches = (pt: number) => Math.round((pt / 72) * 1000) / 1000;

/** The slot's box now, with a flowed slot's last measured height. */
export function boxOf(workspace: Workspace, store: DeckStore, slide: string, slot: string): SlotBox {
  return slotBox(workspace, store, slide, slot, new WarningService(workspace).lastMeasured(store, slide));
}

/** `folio box <deck>/<slide> <slot> [--json]` */
export async function boxCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  if (!positionals[0] || !positionals[1]) throw new Error("usage: folio box <deck>/<slide> <slot> [--json]");
  const { deck, slide } = splitSlideRef(positionals[0]);
  const { workspace, store } = openDeck(deck);
  const slot = positionals[1];
  const box = boxOf(workspace, store, slide, slot);
  if (!box.ok) throw new Error(box.reason);
  const size = [inches(box.w), inches(box.h)];
  if (values.json) process.stdout.write(`${JSON.stringify({ slide, slot, w: box.w, h: box.h, inches: size, flowed: box.flowed })}\n`);
  else process.stdout.write(`${slot} on ${slide}: ${box.w} x ${box.h} pt (${size[0]} x ${size[1]} in)${box.flowed ? ", its last measured height below the slot above" : ""}\n`);
  return 0;
}

/** What `folio trace` says of a figure a script saved with `folio_hook.save_traced`. */
export function figureLines(f: FigureFileTrace): string[] {
  const lines = [`file: ${f.path} (saved by a script with its trace file)`, `sha256: ${f.sha256 ?? "(missing)"}${f.matches ? ": the image save_traced wrote" : ""}`];
  if (f.problem) lines.push(`problem: ${f.problem}`);
  if (f.box) lines.push(`drawn at ${f.box.w} x ${f.box.h} pt, ${f.dpi} dpi${f.boxNow ? `; the slot's box is now ${f.boxNow.w} x ${f.boxNow.h} pt` : ""}`);
  if (f.source) {
    lines.push(`source: ${f.source.script}${f.source.at ? ` at ${f.source.at}` : ""}`);
    if (f.source.command) lines.push(`  command: ${f.source.command}`);
    for (const i of f.source.inputs ?? []) lines.push(`  input: ${i.path} sha256 ${i.sha256}`);
  }
  if (f.command) lines.push("", `regenerate: ${f.command}`);
  return lines;
}
