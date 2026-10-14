/**
 * `folio layouts <deck> [--json] [LAYOUT ...]`: every layout of the deck's
 * pack, one row per slot with its box in pt and what limits it.
 */
import { parseArgs } from "node:util";
import { layoutSheet, type LayoutRow, type LayoutSheet, type SlotRow } from "@folio/core";
import { toPosix } from "@folio/server";
import { openDeck } from "./deckcmds.js";

const USAGE = "usage: folio layouts <deck> [--json] [LAYOUT ...]";

/** `[25.7, 19.8, 908.7, 29.8]` */
const boxText = (box: readonly number[]) => `[${box.join(", ")}]`;

/** What limits one slot, in a few words: `24 pt, 1 line, 90 chars`. */
function limitText(slot: SlotRow): string {
  const parts: string[] = [];
  if (slot.takes) parts.push(slot.hook ? `${slot.takes} ${slot.hook}` : slot.takes);
  if (slot.size !== undefined) parts.push(`${slot.size} pt`);
  if (slot.lines !== undefined) parts.push(`${slot.lines} line${slot.lines === 1 ? "" : "s"}`);
  if (slot.chars !== undefined) parts.push(`${slot.chars} chars`);
  if (slot.rows !== undefined) parts.push(`${slot.rows} rows`);
  if (slot.style) parts.push(`style ${slot.style}`);
  if (slot.hook && !slot.takes) parts.push(`hook ${slot.hook}`);
  if (slot.below) parts.push(`below ${slot.below.slot} +${slot.below.gap}`);
  return parts.join(", ");
}

/** One layout's block: header, background, then aligned slot rows. */
export function layoutBlock(layout: LayoutRow): string[] {
  const nameW = Math.max(...layout.slots.map((s) => s.name.length), 4);
  const roleW = Math.max(...layout.slots.map((s) => s.role.length), 4);
  const boxW = Math.max(...layout.slots.map((s) => boxText(s.box).length), 3);
  const rows = layout.slots.map((s) => `  ${s.name.padEnd(nameW)}  ${s.role.padEnd(roleW)}  ${boxText(s.box).padEnd(boxW)}  ${limitText(s)}`.trimEnd());
  return [`${layout.name}: ${layout.description}`, `  background ${layout.background}`, ...(rows.length ? rows : ["  (no slots)"])];
}

/** The whole sheet as text: the slide size once, then one block per layout. */
export function sheetText(sheet: LayoutSheet): string {
  const pack = sheet.pack.replace(/@.*$/, "");
  const head = `${sheet.pack}: slide ${sheet.slide.w} x ${sheet.slide.h} pt; boxes are [x, y, w, h] in pt from the top left; a hook's inputs: folio hook show ${pack}/<hook>`;
  return [head, "", ...sheet.layouts.flatMap((l) => [...layoutBlock(l), ""])].join("\n");
}

/** `folio layouts <deck> [--json] [LAYOUT ...]` */
export async function layoutsCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  if (!positionals[0]) throw new Error(USAGE);
  const { workspace, store } = openDeck(positionals[0]);
  const pack = workspace.packOf(store);
  if (!pack) throw new Error(`pack ${store.deck.template} is not installed; folio pack import <dir> installs it, folio pack check <dir> names its problems`);
  const result = layoutSheet(pack.pack, positionals.slice(1));
  if (!result.ok) throw new Error(`${result.reason}; folio layouts ${toPosix(positionals[0]!)} lists them all`);
  process.stdout.write(values.json ? `${JSON.stringify(result.sheet)}\n` : sheetText(result.sheet));
  return 0;
}
