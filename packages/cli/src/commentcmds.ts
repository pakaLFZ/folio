/**
 * `folio comments`, `folio comment ...` and `folio inbox` for workers. Replies
 * go through the running server when there is one, so screenshots are taken
 * there and every browser sees them at once; without a server the files are
 * written here and the screenshots are rendered headless.
 */
import { readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { relative } from "@folio/server";
import { parseArgs } from "node:util";
import { commentLink, commentTurn, filterInbox, rankOf, type FolioComment, type InboxQuery } from "@folio/core";
import { findWorkspace, FolioApp, inboxRows, listComments, loadConfig, PlaywrightShots, readComment, shotsDir, stageLocalFile, type DeckStore } from "@folio/server";
import { openDeck } from "./deckcmds.js";
import { draftNotes } from "./draftnotes.js";
import { startHeadless } from "./headless.js";
import { findServer } from "./queuecmds.js";
import { reshootCommand } from "./reshootcmd.js";
import { searchCommand } from "./searchcmd.js";
import { attachServices } from "./services.js";
import { watchCommand } from "./watchcmd.js";

/**
 * Print comments as a table or JSON.
 *
 * @returns nothing; writes to stdout.
 */
function printComments(app: FolioApp, store: DeckStore, list: FolioComment[], json: boolean): void {
  const user = attachServices(app, false).comments.user;
  const rows = list.map((c) => ({
    attachments: c.thread.flatMap((m) => (m.attachments ?? []).map((a) => ({ ...a, path: join(shotsDir(store, c.id), a.file) }))),
    id: c.id, slide: c.slide, status: c.status, turn: commentTurn(c.thread, user) === "agent" ? "agent" : "user", assignee: c.assignee,
    components: c.components, last: c.thread[c.thread.length - 1], thread: c.thread, marks: c.marks.length,
    shots: c.shots ? { region: join(shotsDir(store, c.id), c.shots.region), slide: join(shotsDir(store, c.id), c.shots.slide) } : null,
    link: commentLink(`http://localhost:${app.config.port}/`, store.token, c.slide, c.id),
    drafts: draftNotes(app.workspace, store, c.slide),
  }));
  if (json) return void process.stdout.write(`${JSON.stringify({ deck: store.token, comments: rows })}\n`);
  if (!rows.length) return void process.stdout.write("no open comments\n");
  for (const r of rows) {
    process.stdout.write(`${r.id}  ${r.slide}  ${r.status}  ${r.turn}'s turn${r.assignee ? `  assigned ${r.assignee}` : ""}  [${r.components.map((k) => k.slot).join(", ") || "whole slide"}]${r.marks ? `  ${r.marks} sketch marks` : ""}\n`);
    for (const m of r.thread) {
      process.stdout.write(`    ${m.author}: ${m.text.replace(/\n/g, "\n      ")}\n`);
      for (const a of m.attachments ?? []) process.stdout.write(`      attached ${a.name} (${a.type}, ${a.bytes} bytes): ${relative(process.cwd(), join(shotsDir(store, r.id), a.file))}\n`);
    }
    for (const d of r.drafts) process.stdout.write(`    ${d}\n`);
    process.stdout.write(`    shots: ${r.shots ? `${relative(process.cwd(), r.shots.region)}  ${relative(process.cwd(), r.shots.slide)}` : "pending"}\n    ${r.link}\n`);
  }
}

/** `folio comments <deck> [--json] [--all]`: open comments, or all with --all. */
export async function commentsCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" }, all: { type: "boolean" } } });
  const { store } = openDeck(positionals[0] ?? ".");
  const app = new FolioApp(loadConfig(findWorkspace(store.dir)));
  const list = listComments(app.workspace.findDeck(store.dir)!, !!values.all)
    .filter((c) => values.all || c.status !== "resolved")
    .sort((a, b) => rankOf(a) - rankOf(b));
  printComments(app, store, list, !!values.json);
  await app.close();
  return 0;
}

/**
 * Find the deck that holds a comment id.
 *
 * @returns the deck, or throws naming the id.
 */
export function deckOfComment(app: FolioApp, cid: string): DeckStore {
  for (const store of app.workspace.decks.values()) if (readComment(store, cid)) return store;
  throw new Error(`no comment ${cid} in any deck of ${app.config.root}`);
}

/**
 * Send one comment action, through the server when it runs.
 *
 * @param path - the deck-relative route, e.g. `comments/<cid>/reply`.
 * @param body - the JSON body.
 * @param local - the same action done here when no server runs.
 */
async function commentAction(app: FolioApp, store: DeckStore, worker: string, path: string, body: unknown, local: () => Promise<unknown> | unknown): Promise<unknown> {
  const base = await findServer(app);
  if (!base) return local();
  const res = await fetch(`${base}/${store.token}/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-folio-worker": worker }, body: JSON.stringify(body) });
  const reply = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(reply.detail ?? res.status));
  return reply;
}

/** `folio comment reply|answered|assign <cid> ...` */
export async function commentCommand(args: string[]): Promise<number> {
  if (args[0] === "watch") return watchCommand(args.slice(1));
  if (args[0] === "search") return searchCommand(args.slice(1));
  if (args[0] === "show") return showCommentCommand(args.slice(1));
  if (args[0] === "reshoot") return reshootCommand(args.slice(1));
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { worker: { type: "string" }, answered: { type: "boolean" }, attach: { type: "string", multiple: true } } });
  const [verb, cid, ...rest] = positionals;
  if (verb === "next") return claimNextCommand(values.worker ?? "agent");
  if (!verb || !cid) throw new Error('usage: folio comment next [--worker W] | search "QUERY" | show <cid> | reshoot <cid>|--all [--force] | reply <cid> "text" [--answered] [--attach F] | answered <cid> | assign <cid> <worker>');
  const app = new FolioApp(loadConfig(findWorkspace(".")));
  const store = deckOfComment(app, cid);
  const worker = values.worker ?? "agent";
  const { comments } = attachServices(app, false);
  let result: unknown;
  if (verb === "reply") {
    const text = rest.join(" ").trim();
    const files = values.attach ?? [];
    if (!text && !files.length) throw new Error("a reply needs text or an --attach file");
    const base = await findServer(app);
    const uploads = base ? await Promise.all(files.map((f) => uploadFile(base, store, f))) : files;
    result = await commentAction(app, store, worker, `comments/${cid}/reply`, { text, answered: !!values.answered, uploads }, () => replyLocally(app, store, cid, worker, text, !!values.answered, files));
  } else if (verb === "answered") result = await commentAction(app, store, worker, `comments/${cid}/status`, { status: "answered" }, () => comments.setStatus(store, cid, "answered", worker));
  else if (verb === "follow" || verb === "unfollow") result = await commentAction(app, store, worker, `comments/${cid}/follow`, { follow: verb === "follow" }, () => comments.follow(store, cid, worker, verb === "follow"));
  else if (verb === "assign") result = await commentAction(app, store, worker, `comments/${cid}/assign`, { assignee: rest[0] ?? null }, () => comments.assign(store, cid, rest[0] ?? null));
  else throw new Error(`unknown comment action ${verb}; use next, reply, answered, assign, follow, unfollow, watch, search, show or reshoot`);
  const c = result as FolioComment;
  process.stdout.write(`${c.id} ${c.status}, ${c.thread.length} messages${c.assignee ? `, assigned ${c.assignee}` : ""}, followed by ${(c.followers ?? []).join(", ") || "nobody"}\n`);
  await app.close();
  return 0;
}

/** `folio comment show <cid> [--json]`: the whole chat of one comment, archived or not. */
async function showCommentCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  if (!positionals[0]) throw new Error("usage: folio comment show <cid> [--json]");
  const app = new FolioApp(loadConfig(findWorkspace(".")));
  try {
    const store = deckOfComment(app, positionals[0]);
    printComments(app, store, [readComment(store, positionals[0])!], !!values.json);
  } finally {
    await app.close();
  }
  return 0;
}

/**
 * Claim the top card of the queue and print it.
 *
 * @returns 0, also when the queue is empty (it says so).
 */
async function claimNextCommand(worker: string): Promise<number> {
  const app = new FolioApp(loadConfig(findWorkspace(".")));
  const base = await findServer(app);
  let deckToken: string | null = null;
  let comment: FolioComment | null = null;
  if (base) {
    const r = (await (await fetch(`${base}/api/inbox/claim`, { method: "POST", headers: { "x-folio-worker": worker }, body: "{}" })).json()) as { deck: string | null; comment: FolioComment | null };
    deckToken = r.deck;
    comment = r.comment;
  } else {
    const claimed = attachServices(app, false).comments.claimNext([...app.workspace.decks.values()], worker);
    deckToken = claimed?.store.token ?? null;
    comment = claimed?.comment ?? null;
  }
  if (!comment || !deckToken) process.stdout.write("queue empty: no unclaimed comment awaits an agent\n");
  else printComments(app, app.workspace.decks.get(deckToken)!, [comment], false);
  await app.close();
  return 0;
}

/** Reply without a server: write the files, then render screenshots headless. */
async function replyLocally(app: FolioApp, store: DeckStore, cid: string, worker: string, text: string, answered: boolean, files: string[]): Promise<FolioComment> {
  const headless = await startHeadless(app.config.root, (a) => attachServices(a, false).routes);
  try {
    const comments = attachServices(headless.app, false).comments;
    const local = headless.app.workspace.findDeck(store.dir)!;
    const shots = new PlaywrightShots(() => headless.base);
    comments.shots = shots;
    const before = readComment(local, cid)!.thread.length;
    const uploads = files.map((f) => stageLocalFile(local, resolve(f), mediaType(f)).id);
    const result = comments.reply(local, cid, worker, text, answered, uploads);
    await comments.attachShots(local, cid, before);
    await shots.close();
    return readComment(local, cid) ?? result;
  } finally {
    await headless.close();
  }
}

/**
 * The media type of a file, from its extension.
 *
 * @returns a MIME type; unknown extensions are `application/octet-stream`.
 */
export function mediaType(path: string): string {
  const ext = extname(path).toLowerCase();
  const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".csv": "text/csv", ".txt": "text/plain", ".json": "application/json", ".md": "text/markdown" };
  return types[ext] ?? "application/octet-stream";
}

/**
 * Upload one file to a running server's staging area.
 *
 * @returns the upload id to send with the message.
 */
async function uploadFile(base: string, store: DeckStore, path: string): Promise<string> {
  const res = await fetch(`${base}/${store.token}/uploads`, { method: "POST", headers: { "content-type": mediaType(path), "x-file-name": encodeURIComponent(basename(path)) }, body: readFileSync(path) });
  const body = (await res.json()) as { id?: string; detail?: string };
  if (!res.ok || !body.id) throw new Error(`upload of ${path} refused: ${body.detail ?? res.status}`);
  return body.id;
}

/** `folio inbox [path] [--deck D] [--status open|queue|progress|review|held|done|all] [--json]` */
export async function inboxCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { deck: { type: "string" }, status: { type: "string" }, search: { type: "string" }, json: { type: "boolean" } } });
  const app = new FolioApp(loadConfig(findWorkspace(positionals[0] ?? ".")));
  const { comments } = attachServices(app, false);
  const deck = values.deck ? (app.workspace.findDeck(values.deck)?.token ?? values.deck) : undefined;
  const q: InboxQuery = { view: (values.status as InboxQuery["view"]) ?? "open", ...(deck ? { deck } : {}), ...(values.search ? { search: values.search } : {}) };
  const rows = filterInbox(inboxRows(app, comments).filter((r) => r.view !== "drafts"), q);
  if (values.json) process.stdout.write(`${JSON.stringify({ rows })}\n`);
  else if (!rows.length) process.stdout.write("inbox empty for that filter\n");
  else for (const r of rows) process.stdout.write(`${r.view.padEnd(9)} ${r.id}  ${r.deckTitle} ${r.slide}  [${r.slots.join(", ")}]  ${r.lastAuthor}: ${r.lastMessage.replace(/\s+/g, " ").slice(0, 100)}${r.unread ? `  (${r.unread} unread)` : ""}${r.orphaned ? `  orphaned: ${r.orphaned}` : ""}\n`);
  await app.close();
  return 0;
}
