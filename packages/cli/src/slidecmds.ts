/**
 * `folio slide rm|move|dup|list`: the editor rail's own actions (archive, reorder,
 * duplicate) from the CLI, through the same `DeckStore` methods the server routes
 * call, so a running server and open browsers see the change live.
 */
import { parseArgs } from "node:util";
import { loadConfig, manifestEntry, FolioApp, findWorkspace, type DeckStore } from "@folio/server";
import { openDeck } from "./deckcmds.js";

/** The slide right after `after` in the current order, or null when `after` is last or missing. */
function landingAfter(store: DeckStore, after: string, moving: string[]): string | null {
  const rest = store.slideIds().filter((id) => !moving.includes(id));
  const at = rest.indexOf(after);
  if (at < 0) throw new Error(`no such slide ${after}`);
  return at + 1 < rest.length ? rest[at + 1]! : null;
}

const RM_USAGE = "usage: folio slide rm <deck> <id>[,<id>...] [--worker NAME] [--json]";

/** `folio slide rm <deck> <id>[,<id>...]`: archive the slides (never delete). */
export async function slideRmCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { worker: { type: "string" }, json: { type: "boolean" } } });
  if (!positionals[0] || !positionals[1]) throw new Error(RM_USAGE);
  const { store } = openDeck(positionals[0]);
  const ids = positionals[1].split(",");
  const archived = await store.archiveSlides(ids, values.worker ?? "cli");
  const missing = ids.filter((id) => !archived.includes(id));
  if (values.json) process.stdout.write(`${JSON.stringify({ archived, missing })}\n`);
  else {
    process.stdout.write(`archived ${archived.join(", ") || "none"}\n`);
    if (missing.length) process.stderr.write(`not found: ${missing.join(", ")}\n`);
  }
  return missing.length ? 2 : 0;
}

const MOVE_USAGE = "usage: folio slide move <deck> <id> (--to N | --after ID | --before ID) [--worker NAME] [--json]";

/** `folio slide move <deck> <id> --to N | --after ID | --before ID`. */
export async function slideMoveCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { to: { type: "string" }, after: { type: "string" }, before: { type: "string" }, worker: { type: "string" }, json: { type: "boolean" } } });
  const [deckRef, id] = positionals;
  if (!deckRef || !id) throw new Error(MOVE_USAGE);
  if ([values.to, values.after, values.before].filter((v) => v !== undefined).length !== 1) throw new Error(MOVE_USAGE);
  const { store } = openDeck(deckRef);
  if (!store.slideIds().includes(id)) throw new Error(`no such slide ${id}`);
  const worker = values.worker ?? "cli";
  const order = values.to !== undefined
    ? await store.reorder(id, Number(values.to), worker)
    : await store.moveSlides([id], values.before !== undefined ? values.before : landingAfter(store, values.after!, [id]), worker);
  if (!order) {
    process.stderr.write(`409 the landing slide is gone or is the slide being moved\n`);
    return 3;
  }
  process.stdout.write(values.json ? `${JSON.stringify({ order })}\n` : `${id} moved; order: ${order.join(", ")}\n`);
  return 0;
}

const DUP_USAGE = "usage: folio slide dup <deck> <id> [--after ID] [--worker NAME] [--json]";

/** `folio slide dup <deck> <id> [--after ID]`: duplicate right after itself, then optionally move. */
export async function slideDupCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { after: { type: "string" }, worker: { type: "string" }, json: { type: "boolean" } } });
  const [deckRef, id] = positionals;
  if (!deckRef || !id) throw new Error(DUP_USAGE);
  const { store } = openDeck(deckRef);
  const worker = values.worker ?? "cli";
  const made = await store.duplicateSlide(id, worker);
  if (!made) throw new Error(`no valid slide ${id} in ${deckRef}`);
  if (values.after !== undefined && values.after !== id) await store.moveSlides([made.id], landingAfter(store, values.after, [made.id]), worker);
  process.stdout.write(values.json ? `${JSON.stringify(made)}\n` : `${made.id} rev ${made.rev}\n`);
  return 0;
}

const LIST_USAGE = "usage: folio slide list <deck> [--json]";

/** `folio slide list <deck>`: id, layout, title text and active warning count, in presentation order. */
export async function slideListCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  if (!positionals[0]) throw new Error(LIST_USAGE);
  const app = new FolioApp(loadConfig(findWorkspace(positionals[0])));
  try {
    const store = app.workspace.findDeck(positionals[0]);
    if (!store) throw new Error(`no deck at ${positionals[0]}; decks live under ${app.config.decksDir}`);
    const active = app.warnings.deckWarnings(store).filter((w) => w.state !== "absent");
    const rows = store.slideIds().map((id) => {
      const entry = manifestEntry(store.readSlide(id)!);
      return { id, layout: entry.layout, title: entry.title, warnings: active.filter((w) => w.location.slide === id).length };
    });
    if (values.json) process.stdout.write(`${JSON.stringify(rows)}\n`);
    else for (const r of rows) process.stdout.write(`${r.id}  ${r.layout ?? "(unreadable)"}  ${JSON.stringify(r.title)}  ${r.warnings} warning${r.warnings === 1 ? "" : "s"}\n`);
    return 0;
  } finally {
    await app.close();
  }
}
