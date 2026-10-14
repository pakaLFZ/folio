/**
 * Deck and slide commands for workers: `init-deck`, `deck archive | unarchive`,
 * `new`, `patch`, `show`, `prompt`. They write files directly, with the same locks and revision checks
 * the server uses, so they work whether or not a server is running; a running
 * server sees the change through its file watcher.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { relative } from "@folio/server";
import { parseArgs } from "node:util";
import { createDeck, DEFAULT_PACK, DeckStore, findWorkspace, loadConfig, slideWriteGuard, Workspace } from "@folio/server";
import { makeSlideSpec, type PatchOp } from "@folio/core";
import { skillHint } from "./skillcmd.js";
import { vocabularyPrompt } from "./vocabcmds.js";

/**
 * Open the workspace around a deck argument and find the deck.
 *
 * @param ref - a deck folder path, a folder name under decks/, or a token.
 * @returns the workspace and the deck. Throws naming what was looked for.
 */
export function openDeck(ref: string): { workspace: Workspace; store: DeckStore } {
  const workspace = new Workspace(loadConfig(findWorkspace(ref)));
  const store = workspace.findDeck(resolve(ref)) ?? workspace.findDeck(ref);
  if (!store) throw new Error(`no deck at ${ref}; decks live under ${workspace.config.decksDir}`);
  return { workspace, store };
}

/**
 * Split `deck/slide` into its parts.
 *
 * @param ref - e.g. `decks/example/s003`.
 * @returns the deck reference and slide id.
 */
export function splitSlideRef(ref: string): { deck: string; slide: string } {
  const at = ref.replace(/\/+$/, "").lastIndexOf("/");
  if (at < 0) throw new Error(`expected <deck>/<slide>, got ${ref}`);
  return { deck: ref.slice(0, at), slide: ref.slice(at + 1) };
}

/** The workspace a new deck folder belongs to: the nearest folio.toml above it, else the current folder. */
function workspaceOfNewDeck(dir: string): string {
  const found = findWorkspace(dir);
  return existsSync(join(found, "folio.toml")) ? found : process.cwd();
}

/** `folio init-deck <dir> [--template PACK@V] [--title T]`; without a template, the built-in `plain` pack. */
export async function initDeckCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { template: { type: "string" }, title: { type: "string" } } });
  if (!positionals[0]) throw new Error(`usage: folio init-deck <dir> [--template PACK@VERSION] [--title TITLE]; without --template the deck uses the built-in pack ${DEFAULT_PACK}`);
  const dir = resolve(positionals[0]);
  const template = values.template ?? DEFAULT_PACK;
  const config = loadConfig(workspaceOfNewDeck(dir));
  const { store, installed } = createDeck(config, dir, values.title ?? positionals[0], template);
  if (!values.template) process.stdout.write(`no --template given: using the built-in pack ${DEFAULT_PACK}${installed ? ` (installed into ${relative(process.cwd(), installed) || "."})` : ""}\n`);
  else if (installed) process.stdout.write(`installed the built-in pack ${template} into ${relative(process.cwd(), installed)}\n`);
  process.stdout.write(`created ${store.dir}, served at /${store.token}/\nlayouts and how to fill them: folio prompt ${positionals[0]}\n`);
  const hint = skillHint(config.root);
  if (hint) process.stdout.write(`${hint}\n`);
  return 0;
}

/**
 * `folio deck archive <deck>` / `folio deck unarchive <deck>`: hide the deck
 * from the landing page or bring it back; nothing is moved or deleted.
 *
 * @param args - the deck reference.
 * @param archived - true to archive.
 */
export async function archiveDeckCommand(args: string[], archived: boolean): Promise<number> {
  if (!args[0]) throw new Error(`usage: folio deck ${archived ? "archive" : "unarchive"} <deck>`);
  const { workspace, store } = openDeck(args[0]);
  const deck = await store.setArchived(archived, "cli");
  process.stdout.write(`${relative(workspace.config.root, store.dir)} ${archived ? `archived at ${deck.archivedAt}; folio deck unarchive ${args[0]} brings it back` : "unarchived"}\n`);
  return 0;
}

const NEW_USAGE = "usage: folio new <deck> --template LAYOUT [--props FILE|-] [--after ID] [--worker NAME]";
const PROPS_SHAPE = 'write a JSON object {"<slot>": <content>, ...}, e.g. {"title": "One clear claim"}';

/**
 * The props of `folio new --props`: a file, `-` for stdin, or the JSON itself.
 *
 * @param value - the option's value; a value starting with `{` is the JSON.
 * @returns the props object. Throws naming what was wrong and the shape to write.
 */
export function readProps(value: string | undefined): Record<string, unknown> {
  if (value === undefined) return {};
  const inline = value.trimStart().startsWith("{");
  if (!inline && value !== "-" && !existsSync(value)) throw new Error(`--props ${value}: no such file; ${PROPS_SHAPE} into it, or pass - and pipe it on stdin`);
  const text = inline ? value : readFileSync(value === "-" ? 0 : value, "utf8");
  let props: unknown;
  try {
    props = JSON.parse(text);
  } catch (error) {
    throw new Error(`--props ${inline ? "" : `${value} `}is not JSON (${(error as Error).message}); ${PROPS_SHAPE}`);
  }
  if (typeof props !== "object" || props === null || Array.isArray(props)) throw new Error(`--props must be a JSON object, not ${Array.isArray(props) ? "an array" : JSON.stringify(props)}; ${PROPS_SHAPE}`);
  return props as Record<string, unknown>;
}

/** `folio new <deck> --template LAYOUT [--props FILE|-] [--after ID] [--worker W]`: a slide, filled in one write. */
export async function newCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { template: { type: "string" }, worker: { type: "string" }, after: { type: "string" }, props: { type: "string" }, json: { type: "boolean" } } });
  if (!positionals[0] || !values.template) throw new Error(NEW_USAGE);
  const { workspace, store } = openDeck(positionals[0]);
  const pack = workspace.packOf(store);
  if (!pack?.pack.layouts[values.template]) throw new Error(`layout ${values.template} is not in pack ${store.deck.template}; layouts: ${Object.keys(pack?.pack.layouts ?? {}).join(", ")} (folio layouts ${positionals[0]} shows their slots)`);
  if (values.after !== undefined && !store.slideIds().includes(values.after)) throw new Error(`--after ${values.after}: no such slide in ${positionals[0]}; its slides: ${store.slideIds().join(", ") || "none"} (folio slide list ${positionals[0]})`);
  const props = readProps(values.props);
  const refused = slideWriteGuard(pack)?.(null, makeSlideSpec(values.template, props));
  if (refused) return refusal(refused, "no slide was made");
  const made = await store.newSlide(values.template, props, values.worker ?? "cli", values.after ?? null);
  process.stdout.write(values.json ? `${JSON.stringify(made)}\n` : `${made.id} rev ${made.rev}\n`);
  return 0;
}

/** `folio patch <deck>/<id> <patch.json|-> [--rev R] [--worker W]` */
export async function patchCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { rev: { type: "string" }, worker: { type: "string" }, json: { type: "boolean" } } });
  if (positionals.length < 2) throw new Error("usage: folio patch <deck>/<slide> <patch.json|-> [--rev REV] [--worker NAME]");
  const { deck, slide } = splitSlideRef(positionals[0]!);
  const { workspace, store } = openDeck(deck);
  const ops = JSON.parse(positionals[1] === "-" ? readFileSync(0, "utf8") : readFileSync(positionals[1]!, "utf8")) as PatchOp[];
  const result = await store.patchSlide(slide, ops, values.rev ?? null, values.worker ?? "cli", slideWriteGuard(workspace.packOf(store)));
  if (!result.ok && result.status === 422 && result.current) return refusal(result.reason, `${slide} stays at rev ${result.current.rev}`);
  if (!result.ok) {
    process.stderr.write(`${result.status} ${result.reason}${result.current ? ` (current rev ${result.current.rev})` : ""}\n`);
    return result.status === 409 ? 3 : 2;
  }
  process.stdout.write(values.json ? `${JSON.stringify({ id: slide, rev: result.rev })}\n` : `${slide} rev ${result.rev}\n`);
  return 0;
}

/**
 * Print a refused write: one problem per line, each by JSON path.
 *
 * @param reason - the problems, one per line.
 * @param kept - what stayed as it was.
 * @returns exit code 2.
 */
function refusal(reason: string, kept: string): number {
  process.stderr.write(`422 refused, nothing written; ${kept}:\n${reason.split("\n").map((l) => `  ${l}`).join("\n")}\n`);
  return 2;
}

/** `folio show <deck>/<id>`: print the slide with its revision. */
export async function showCommand(args: string[]): Promise<number> {
  const { deck, slide } = splitSlideRef(args[0] ?? "");
  const record = openDeck(deck).store.readSlide(slide);
  if (!record) throw new Error(`no slide ${slide}`);
  process.stdout.write(`${JSON.stringify({ id: record.id, rev: record.rev, spec: record.spec, error: record.error }, null, 2)}\n`);
  return 0;
}

/** `folio prompt <deck>`: the agent instructions generated from the deck's pack. */
export async function promptCommand(args: string[]): Promise<number> {
  const { workspace, store } = openDeck(args[0] ?? ".");
  const pack = workspace.packOf(store);
  if (!pack) throw new Error(`pack ${store.deck.template} is not installed`);
  process.stdout.write(pack.catalog.prompt() + vocabularyPrompt(workspace, store));
  return 0;
}
