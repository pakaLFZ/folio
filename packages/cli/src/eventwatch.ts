/**
 * `folio watch`: one line per thing the user did that an agent should act on
 * (a comment, a message in a thread, a reopen or hold, submitted answers, and
 * with `--for viewing` a move to another slide), across the workspace. It
 * follows the server's `/inbox/events` stream when a server runs and reads the
 * files every few seconds when none does. Nothing else reaches stdout.
 * Exit codes: 0 after `--once` printed its line or on SIGINT/SIGTERM; 2 for a
 * usage error; 4 at `--timeout` with nothing printed.
 */
import { resolve } from "node:path";
import { relative } from "@folio/server";
import { parseArgs } from "node:util";
import {
  answersEvent, commentEvents, commentEventsSince, parseWatchTopics, viewingEvent, watchLine, watchTopicOf,
  type CommentSeen, type FolioComment, type Questionnaire, type ViewingTab, type WatchEvent, type WatchTopic,
} from "@folio/core";
import { findWorkspace, FolioApp, listComments, listQuestions, loadConfig, type DeckStore } from "@folio/server";
import { frameMessage } from "./askcmds.js";
import { findServer } from "./queuecmds.js";
import { fetchViewing } from "./viewingcmd.js";

const POLL_MS = 3000;
const EXIT_TIMEOUT = 4;

interface Watch {
  app: FolioApp;
  user: string;
  decks: Map<string, DeckStore>;
  topics: Set<WatchTopic>;
  json: boolean;
  once: boolean;
  comments: Map<string, CommentSeen>;
  questions: Map<string, string>;
  finish: (code: number) => void;
  done: AbortController;
}

const deckPath = (w: Watch, store: DeckStore) => relative(w.app.config.root, store.dir) || ".";

/** Print the events `--for` asks for; with `--once`, the first and then finish. */
function emit(w: Watch, events: WatchEvent[]): void {
  for (const e of [...events].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    if (w.done.signal.aborted || !w.topics.has(watchTopicOf(e.kind))) continue;
    process.stdout.write(`${watchLine(e, w.json)}\n`);
    if (w.once) return w.finish(0);
  }
}

/** What is new in one comment, and remember it as seen. */
function onComment(w: Watch, store: DeckStore, c: FolioComment): WatchEvent[] {
  const events = commentEvents(w.comments.get(c.id), c, deckPath(w, store), w.user);
  w.comments.set(c.id, { messages: c.thread.length, status: c.status });
  return events;
}

/** What is new in one questionnaire, and remember it as seen. */
function onQuestion(w: Watch, store: DeckStore, q: Questionnaire): WatchEvent[] {
  const event = answersEvent(w.questions.get(q.id), q, deckPath(w, store), w.user);
  w.questions.set(q.id, q.updatedAt);
  return event ? [event] : [];
}

/** Read every watched deck's comments and questionnaires; what changed since the last read. */
function scanFiles(w: Watch): WatchEvent[] {
  return [...w.decks.values()].flatMap((store) => [
    ...listComments(store, true).flatMap((c) => onComment(w, store, c)),
    ...listQuestions(store).flatMap((q) => onQuestion(w, store, q)),
  ]);
}

/** Everything the user did after `since` that the files still show. */
function backlog(w: Watch, since: string): WatchEvent[] {
  return [...w.decks.values()].flatMap((store) => [
    ...listComments(store, true).flatMap((c) => commentEventsSince(c, deckPath(w, store), w.user, since)),
    ...listQuestions(store).map((q) => (q.answers && q.answers.at > since ? answersEvent(undefined, q, deckPath(w, store), w.user) : null)).filter((e): e is WatchEvent => !!e),
  ]);
}

/** Handle one stream message. */
function onMessage(w: Watch, msg: { type: string; deck?: string; data: unknown }): void {
  if (msg.type === "hello" || msg.type === "resync") return emit(w, scanFiles(w));
  const store = msg.deck ? w.decks.get(msg.deck) : undefined;
  if (!store) return;
  const data = msg.data as { comment?: FolioComment; question?: Questionnaire };
  if (msg.type === "comment" && data.comment) emit(w, onComment(w, store, data.comment));
  if (msg.type.startsWith("question.") && data.question) emit(w, onQuestion(w, store, data.question));
}

/** Follow the workspace stream until it ends or the watch is done. */
async function followStream(w: Watch, base: string): Promise<void> {
  const res = await fetch(`${base}/inbox/events`, { signal: w.done.signal });
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body!) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const msg = frameMessage(frame) as { type: string; deck?: string; data: unknown } | null;
      if (msg) onMessage(w, msg);
    }
  }
}

/** Report each move of the user's top tab to another deck or slide, until the stream ends. */
async function followViewing(w: Watch, base: string, ended: AbortSignal): Promise<void> {
  let state = await fetchViewing(base, null, 0);
  let top: ViewingTab | null = state.tabs[0] ?? null;
  while (!ended.aborted && !w.done.signal.aborted) {
    const next = await fetchViewing(base, state.version, 30, w.done.signal);
    if (next.version === state.version) continue;
    const event = viewingEvent(top, next.tabs[0] ?? null, w.user, new Date().toISOString());
    if (event && w.decks.has(next.tabs[0]!.token)) emit(w, [event]);
    state = next;
    top = next.tabs[0] ?? null;
  }
}

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((r) => {
  const t = setTimeout(r, ms);
  signal.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
});

/** Stream while a server runs, poll the files while none does, until done. */
async function run(w: Watch): Promise<void> {
  while (!w.done.signal.aborted) {
    const base = await findServer(w.app);
    if (!base) {
      emit(w, scanFiles(w));
      await pause(POLL_MS, w.done.signal);
      continue;
    }
    const ended = new AbortController();
    const viewing = w.topics.has("viewing") ? followViewing(w, base, ended.signal).catch(() => {}) : Promise.resolve();
    await followStream(w, base).catch(() => {});
    ended.abort();
    await viewing;
    await pause(500, w.done.signal);
  }
}

/** The decks `--deck` names, or every deck. */
function watchedDecks(app: FolioApp, ref: string | undefined): Map<string, DeckStore> {
  if (!ref) return new Map(app.workspace.decks);
  const store = app.workspace.findDeck(resolve(ref)) ?? app.workspace.findDeck(ref);
  if (!store) throw new Error(`no deck ${ref}; decks: ${[...app.workspace.decks.values()].map((s) => relative(app.config.root, s.dir)).join(", ")}`);
  return new Map([[store.token, store]]);
}

/** `--since`, as an ISO time; throws on anything else. */
function parseSince(value: string | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`--since ${value} is not a time; give the time at the start of a watch line, e.g. 2026-10-13T09:12:03.120Z`);
  return new Date(ms).toISOString();
}

/** `folio watch [path] [--deck D] [--for comments,answers,viewing] [--since TIME] [--once] [--timeout S] [--json]` */
export async function eventWatchCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { deck: { type: "string" }, for: { type: "string" }, since: { type: "string" }, once: { type: "boolean" }, timeout: { type: "string" }, json: { type: "boolean" } } });
  const topics = new Set(parseWatchTopics(values.for));
  const since = parseSince(values.since);
  const app = new FolioApp(loadConfig(findWorkspace(positionals[0] ?? ".")));
  let finish: (code: number) => void = () => {};
  const finished = new Promise<number>((r) => (finish = r));
  const w: Watch = { app, user: app.config.user, decks: new Map(), topics, json: !!values.json, once: !!values.once, comments: new Map(), questions: new Map(), finish: (code) => (w.done.abort(), finish(code)), done: new AbortController() };
  try {
    w.decks = watchedDecks(app, values.deck);
    scanFiles(w);
    if (since) emit(w, backlog(w, since));
    const timeoutMs = Number(values.timeout ?? 0) * 1000;
    const timer = timeoutMs ? setTimeout(() => w.finish(EXIT_TIMEOUT), timeoutMs) : null;
    for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => w.finish(0));
    if (!w.done.signal.aborted) void run(w);
    const code = await finished;
    if (timer) clearTimeout(timer);
    if (code === EXIT_TIMEOUT) process.stderr.write("folio watch: --timeout reached with nothing from the user\n");
    return code;
  } finally {
    await app.close();
  }
}
