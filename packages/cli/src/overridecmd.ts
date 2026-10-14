/**
 * `folio override <deck>/<slide> [PATH=VALUE ...] [--clear PATH]... [--clear-all] [--json]`:
 * read, set and clear a slide's overrides of its template. With no edit it
 * prints them; an edit is one revision-checked write, refused naming every bad
 * path when the template's own types do not accept the result.
 */
import { parseArgs } from "node:util";
import { editOverrides, overrideEntries, overridesPatch, overrideWriteProblem, resolveOverrides, slideRoot, formatOverrideProblem } from "@folio/core";
import { promoteSlide } from "@folio/server";
import { openDeck, splitSlideRef } from "./deckcmds.js";
import { slideDupCommand, slideListCommand, slideMoveCommand, slideRmCommand } from "./slidecmds.js";
import { restoreCommand } from "./undocmd.js";

const USAGE = "usage: folio override <deck>/<slide> [PATH=JSON ...] [--clear PATH]... [--clear-all] [--rev REV] [--worker NAME] [--json]";

/** `slots.note.box=[25,120,420,380]` as a path and a value; a value that is not JSON is a string. */
function parseAssignment(text: string): [string, unknown] {
  const at = text.indexOf("=");
  if (at <= 0) throw new Error(`expected PATH=VALUE, got ${text}\n${USAGE}`);
  const raw = text.slice(at + 1);
  try {
    return [text.slice(0, at), JSON.parse(raw)];
  } catch {
    return [text.slice(0, at), raw];
  }
}

/** Print overrides as `path = value` lines, or as JSON. */
function printOverrides(overrides: unknown, json: boolean | undefined, extra: Record<string, unknown> = {}): void {
  const entries = overrideEntries(overrides);
  if (json) return void process.stdout.write(`${JSON.stringify({ ...extra, overrides: overrides ?? {}, entries })}\n`);
  if (!entries.length) process.stdout.write("no overrides: the slide follows its template\n");
  for (const e of entries) process.stdout.write(`${e.path} = ${JSON.stringify(e.value)}\n`);
}

/** `folio override <deck>/<slide> ...` */
export async function overrideCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { clear: { type: "string", multiple: true }, "clear-all": { type: "boolean" }, rev: { type: "string" }, worker: { type: "string" }, json: { type: "boolean" } } });
  if (!positionals[0]) throw new Error(USAGE);
  const { deck, slide } = splitSlideRef(positionals[0]);
  const { workspace, store } = openDeck(deck);
  const record = store.readSlide(slide);
  const pack = workspace.packOf(store)?.pack;
  const root = record?.spec ? slideRoot(record.spec) : null;
  if (!record?.spec || !root || !pack) throw new Error(`no valid slide ${slide} in ${deck}`);
  const edit = { set: Object.fromEntries(positionals.slice(1).map(parseAssignment)), clear: values.clear ?? [], clearAll: values["clear-all"] ?? false };
  if (!Object.keys(edit.set).length && !edit.clear.length && !edit.clearAll) {
    printOverrides(root.props.overrides, values.json, { id: slide, rev: record.rev });
    for (const p of resolveOverrides(pack, root.layout, root.props.overrides).problems) process.stderr.write(`invalid, not applied: ${formatOverrideProblem(p)}\n`);
    return 0;
  }
  const next = editOverrides(root.props.overrides, edit);
  const result = await store.patchSlide(slide, overridesPatch(record.spec, next), values.rev ?? record.rev, values.worker ?? "cli", (before, after) => overrideWriteProblem(pack, before, after));
  if (!result.ok) {
    process.stderr.write(`${result.status} ${result.reason}${result.current ? ` (current rev ${result.current.rev})` : ""}\n`);
    return result.status === 409 ? 3 : 2;
  }
  if (values.json) printOverrides(next, true, { id: slide, rev: result.rev });
  else process.stdout.write(`${slide} rev ${result.rev}, ${overrideEntries(next).length} override${overrideEntries(next).length === 1 ? "" : "s"}\n`);
  return 0;
}

const PROMOTE_USAGE = "usage: folio slide promote <deck> <slide> (--as NAME [--description D] [--keep-slide] | --into-layout --all-slides) [--worker NAME] [--json]";
const SLIDE_USAGE = `usage: folio slide rm <deck> <id>[,<id>...]\n       folio slide move <deck> <id> (--to N | --after ID | --before ID)\n       folio slide dup <deck> <id> [--after ID]\n       folio slide list <deck>\n       ${PROMOTE_USAGE}`;

/** `folio slide rm|move|dup|list|promote ...`: the rail's own actions, and a slide's overrides becoming a layout. */
export async function slideCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === "rm") return slideRmCommand(rest);
  if (sub === "move") return slideMoveCommand(rest);
  if (sub === "dup") return slideDupCommand(rest);
  if (sub === "list") return slideListCommand(rest);
  if (sub === "restore") return restoreCommand(rest);
  if (sub !== "promote") throw new Error(SLIDE_USAGE);
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { as: { type: "string" }, description: { type: "string" }, "keep-slide": { type: "boolean" }, "into-layout": { type: "boolean" }, "all-slides": { type: "boolean" }, worker: { type: "string" }, json: { type: "boolean" } } });
  const ref = positionals.length >= 2 ? { deck: positionals[0]!, slide: positionals[1]! } : positionals[0] ? splitSlideRef(positionals[0]) : null;
  if (!ref) throw new Error(PROMOTE_USAGE);
  const { workspace, store } = openDeck(ref.deck);
  const outcome = await promoteSlide(workspace, store, ref.slide, { as: values.as, description: values.description, keepSlide: values["keep-slide"], intoLayout: values["into-layout"], allSlides: values["all-slides"] }, values.worker ?? "cli");
  if (!outcome.ok) {
    process.stderr.write(`${outcome.status} ${outcome.reason}\n`);
    return 2;
  }
  if (values.json) process.stdout.write(`${JSON.stringify(outcome)}\n`);
  else if (outcome.created) process.stdout.write(`layout ${outcome.layout} added to pack ${outcome.pack}${outcome.slide ? `; ${ref.slide} now uses it, rev ${outcome.slide.rev}` : ""}\n`);
  else process.stdout.write(`layout ${outcome.layout} of pack ${outcome.pack} updated; ${outcome.slidesChanged} slide${outcome.slidesChanged === 1 ? "" : "s"} use it; ${ref.slide} rev ${outcome.slide?.rev}\n`);
  return 0;
}
