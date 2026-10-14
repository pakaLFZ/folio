import { stepUndo, restoreSlide } from "@folio/server";
import { openDeck } from "./deckcmds.js";

export async function undoCommand(args: string[], direction: "undo" | "redo"): Promise<number> {
  if (args.length !== 1) throw new Error(`usage: folio ${direction} <deck>`);
  const { store } = openDeck(args[0]!);
  const result = await stepUndo(store, direction);
  if (!result.ok) {
    process.stderr.write(`${direction} refused: ${result.reason}\n`);
    return 3;
  }
  process.stdout.write(`${direction === "undo" ? "undid" : "redid"} ${result.entry.ops.join(", ")}: ${result.entry.files.map((f) => f.path).join(", ")}\n`);
  return 0;
}

export async function restoreCommand(args: string[]): Promise<number> {
  if (args.length !== 2) throw new Error("usage: folio slide restore <deck> <slide>");
  const { store } = openDeck(args[0]!);
  const id = await restoreSlide(store, args[1]!);
  process.stdout.write(`restored ${id} at position ${store.slideIds().indexOf(id) + 1}\n`);
  return 0;
}
