/**
 * `folio ask` and `folio answers`: an agent asks the user with a questionnaire,
 * a message in a comment conversation (`--comment`, else a new one), and
 * reads the answers. Both go through the running server when there is
 * one, so the editor shows the questionnaire at once; without a server the
 * file is written here. `--wait` follows the server's event stream, or polls
 * the file once a second when no server runs.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Questionnaire } from "@folio/core";
import { findWorkspace, FolioApp, loadConfig, QuestionError, readQuestion, type DeckStore } from "@folio/server";
import { openDeck } from "./deckcmds.js";
import { findServer } from "./queuecmds.js";
import { attachServices } from "./services.js";

const EXIT_TIMEOUT = 4;
const EXIT_WITHDRAWN = 5;

/** The app around a deck reference, and that deck in it. */
function appOf(ref: string): { app: FolioApp; store: DeckStore } {
  const { store } = openDeck(ref);
  const app = new FolioApp(loadConfig(findWorkspace(store.dir)));
  return { app, store: app.workspace.findDeck(store.dir)! };
}

/** The deck that holds a questionnaire, searching every deck of the workspace. */
function deckOfQuestion(app: FolioApp, id: string): DeckStore {
  for (const store of app.workspace.decks.values()) if (readQuestion(store, id)) return store;
  throw new Error(`no questionnaire ${id} in any deck of ${app.config.root}`);
}

/**
 * Send one request to the running server.
 *
 * @returns the reply body; throws a QuestionError carrying the server's problems.
 */
async function send(base: string, path: string, worker: string, body: unknown): Promise<Questionnaire> {
  const res = await fetch(`${base}/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-folio-worker": worker }, body: JSON.stringify(body) });
  const reply = (await res.json()) as Questionnaire & { problems?: string[]; detail?: string };
  if (!res.ok) throw new QuestionError(res.status, reply.problems ?? [String(reply.detail ?? res.status)]);
  return reply;
}

/** Run an action, printing a refusal's lines instead of a stack. */
async function refusing(run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof QuestionError)) throw error;
    for (const line of error.problems) process.stderr.write(`folio ask: ${line}\n`);
    return 2;
  }
}

/** `folio ask <deck> [--comment C] [--file F] [--worker W] [--json]` and `folio ask --withdraw <id>` */
export async function askCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { file: { type: "string" }, comment: { type: "string" }, worker: { type: "string" }, withdraw: { type: "string" }, json: { type: "boolean" } } });
  const worker = values.worker ?? "agent";
  if (values.withdraw) return refusing(() => withdraw(values.withdraw!, worker));
  if (!positionals[0]) throw new Error("usage: folio ask <deck> [--comment <cid>] [--file q.json] [--worker NAME] [--json]   (the questionnaire on stdin without --file; without --comment it starts a new comment conversation) | folio ask --withdraw <id>");
  const text = readFileSync(!values.file || values.file === "-" ? 0 : values.file, "utf8");
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    throw new Error(`the questionnaire is not JSON: ${(error as Error).message}`);
  }
  if (values.comment && typeof input === "object" && input !== null && !Array.isArray(input)) input = { ...input, comment: values.comment };
  const { app, store } = appOf(positionals[0]);
  return refusing(async () => {
    try {
      const base = await findServer(app);
      const q = base ? await send(base, `${store.token}/questions`, worker, input) : attachServices(app, false).questions.ask(store, input, worker);
      process.stdout.write(values.json ? `${JSON.stringify(q)}\n` : `${q.id}\n`);
      return 0;
    } finally {
      await app.close();
    }
  });
}

/** Withdraw a questionnaire, wherever it is. */
async function withdraw(id: string, worker: string): Promise<number> {
  const app = new FolioApp(loadConfig(findWorkspace(".")));
  try {
    const store = deckOfQuestion(app, id);
    const base = await findServer(app);
    const q = base ? await send(base, `${store.token}/questions/${id}/withdraw`, worker, {}) : attachServices(app, false).questions.withdraw(store, id);
    process.stdout.write(`${q.id} ${q.status}\n`);
    return 0;
  } finally {
    await app.close();
  }
}

/** What `folio answers` prints: one JSON line. */
function printAnswers(q: Questionnaire): void {
  process.stdout.write(`${JSON.stringify({ id: q.id, status: q.status, title: q.title, comment: q.comment, answers: q.answers, questions: q.questions })}\n`);
}

/** `folio answers [<deck>] <id> [--wait] [--timeout S]` */
export async function answersCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { wait: { type: "boolean" }, timeout: { type: "string" } } });
  const id = positionals.at(-1);
  if (!id) throw new Error("usage: folio answers [<deck>] <id> [--wait] [--timeout SECONDS]");
  const { app, store } = positionals.length > 1 ? appOf(positionals[0]!) : (() => {
    const a = new FolioApp(loadConfig(findWorkspace(".")));
    return { app: a, store: deckOfQuestion(a, id) };
  })();
  try {
    const now = readQuestion(store, id);
    if (!now) throw new Error(`no questionnaire ${id} in ${store.deck.title}`);
    if (!values.wait) return (printAnswers(now), 0);
    const base = await findServer(app);
    const timeoutMs = Number(values.timeout ?? 0) * 1000;
    const final = base ? await waitStream(base, store.token, id, timeoutMs) : await waitFiles(store, id, timeoutMs);
    if (!final) return (process.stderr.write("folio answers: --timeout reached before the user answered\n"), EXIT_TIMEOUT);
    printAnswers(final);
    if (final.status === "withdrawn") return (process.stderr.write(`folio answers: ${id} was withdrawn\n`), EXIT_WITHDRAWN);
    return 0;
  } finally {
    await app.close();
  }
}

/** Whether waiting is over: the user answered, or the asker withdrew it. */
const settled = (q: Questionnaire | null) => q && q.status !== "open";

/**
 * Wait on the deck's event stream. The record is read once the stream is open,
 * so an answer that lands in between is not missed.
 *
 * @returns the answered or withdrawn record, or null at the timeout.
 */
async function waitStream(base: string, token: string, id: string, timeoutMs: number): Promise<Questionnaire | null> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const fetchNow = async () => (await (await fetch(`${base}/${token}/questions/${id}`)).json()) as Questionnaire;
  try {
    const res = await fetch(`${base}/${token}/events`, { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body!) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const msg = frameMessage(frame);
        if (!msg) continue;
        const q = msg.type === "hello" || msg.type === "resync" ? await fetchNow() : (msg.data as { question?: Questionnaire })?.question;
        if (q?.id === id && settled(q)) return q;
      }
    }
    return null;
  } catch (error) {
    if ((error as Error).name === "AbortError") return null;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One SSE frame as `{type, data}`: the `hello` greeting or a stream message. */
export function frameMessage(frame: string): { type: string; data: unknown } | null {
  const lines = frame.split("\n");
  const data = lines.find((l) => l.startsWith("data: "))?.slice(6);
  if (lines.some((l) => l === "event: hello")) return { type: "hello", data: null };
  return data ? (JSON.parse(data) as { type: string; data: unknown }) : null;
}

/**
 * Poll the file once a second.
 *
 * @returns the answered or withdrawn record, or null at the timeout.
 */
async function waitFiles(store: DeckStore, id: string, timeoutMs: number): Promise<Questionnaire | null> {
  const until = timeoutMs ? Date.now() + timeoutMs : Infinity;
  while (Date.now() < until) {
    const q = readQuestion(store, id);
    if (settled(q)) return q;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
