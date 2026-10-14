/**
 * `folio comment watch`: an agent listens to a comment's chat. Each new message
 * is printed as one JSON line as it arrives; `--until-reply` exits after the
 * first message from someone else, so an agent can ask and wait for the answer.
 * With a server running it follows the live stream; without one it polls files.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { FolioComment } from "@folio/core";
import { findWorkspace, FolioApp, listComments, loadConfig, readComment, shotsDir } from "@folio/server";
import { findServer } from "./queuecmds.js";

interface WatchOptions {
  cid: string | null;
  worker: string;
  untilReply: boolean;
  timeoutMs: number;
}

/**
 * Whether a comment is one the watch covers.
 *
 * @returns true for the named comment, or any comment the worker follows.
 */
function covered(c: FolioComment, o: WatchOptions): boolean {
  return o.cid ? c.id === o.cid : (c.followers ?? []).includes(o.worker);
}

/**
 * Print the messages of a comment that were not seen yet.
 *
 * @param seen - message counts already printed, per comment; updated here.
 * @returns true when one of them came from someone other than the worker.
 */
function emitNew(app: FolioApp, c: FolioComment, seen: Map<string, number>, o: WatchOptions): boolean {
  const from = seen.get(c.id) ?? c.thread.length;
  seen.set(c.id, c.thread.length);
  let replied = false;
  const store = app.workspace.decks.get(c.deck);
  for (const m of c.thread.slice(from)) {
    const files = (m.attachments ?? []).map((a) => (store ? join(shotsDir(store, c.id), a.file) : a.file));
    process.stdout.write(`${JSON.stringify({ comment: c.id, deck: c.deck, slide: c.slide, status: c.status, author: m.author, at: m.at, text: m.text, attachments: files })}\n`);
    if (m.author !== o.worker) replied = true;
  }
  return replied;
}

/**
 * Follow the server's stream until stopped.
 *
 * @returns the exit code.
 */
async function watchStream(app: FolioApp, base: string, seen: Map<string, number>, o: WatchOptions): Promise<number> {
  const controller = new AbortController();
  const timer = o.timeoutMs ? setTimeout(() => controller.abort(), o.timeoutMs) : null;
  try {
    const res = await fetch(`${base}/inbox/events`, { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body!) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.split("\n").find((l) => l.startsWith("data: "));
        const msg = data ? JSON.parse(data.slice(6)) : null;
        const c = msg?.type === "comment" ? (msg.data.comment as FolioComment) : null;
        if (c && covered(c, o) && emitNew(app, c, seen, o) && o.untilReply) return 0;
      }
    }
    return 0;
  } catch (error) {
    return (error as Error).name === "AbortError" ? 4 : 2;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Poll the comment files once a second until stopped.
 *
 * @returns the exit code.
 */
async function watchFiles(app: FolioApp, seen: Map<string, number>, o: WatchOptions): Promise<number> {
  const until = o.timeoutMs ? Date.now() + o.timeoutMs : Infinity;
  while (Date.now() < until) {
    for (const store of app.workspace.decks.values()) {
      const list = o.cid ? [readComment(store, o.cid)].filter((c): c is FolioComment => !!c) : listComments(store);
      for (const c of list) if (covered(c, o) && emitNew(app, c, seen, o) && o.untilReply) return 0;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return 4;
}

/** `folio comment watch <cid> | --following [--worker W] [--until-reply] [--timeout S]` */
export async function watchCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { worker: { type: "string" }, following: { type: "boolean" }, "until-reply": { type: "boolean" }, timeout: { type: "string" } } });
  const cid = positionals[0] ?? null;
  if (!cid && !values.following) throw new Error("usage: folio comment watch <cid> | --following [--worker W] [--until-reply] [--timeout SECONDS]");
  const o: WatchOptions = { cid, worker: values.worker ?? "agent", untilReply: !!values["until-reply"], timeoutMs: Number(values.timeout ?? 0) * 1000 };
  const app = new FolioApp(loadConfig(findWorkspace(".")));
  const seen = new Map<string, number>();
  for (const store of app.workspace.decks.values()) for (const c of listComments(store, true)) seen.set(c.id, c.thread.length);
  if (cid && !seen.has(cid)) throw new Error(`no comment ${cid}`);
  const base = await findServer(app);
  const code = base ? await watchStream(app, base, seen, o) : await watchFiles(app, seen, o);
  await app.close();
  if (code === 4) process.stderr.write("watch ended at --timeout with no reply\n");
  return code;
}
