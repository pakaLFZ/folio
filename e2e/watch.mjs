// `folio watch` (spec/live/watch.md) against an isolated copy of decks/example: the user's comment posted over
// HTTP prints one line within 2 s, an agent's reply prints nothing, the user's follow-up prints one line, an
// answered questionnaire prints one line, `--once` exits 0 after one event, and with no server the watch still
// reports a comment that appears in the files.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bin, serve, sleep, until, workspace } from "./lib/server.mjs";

// Time a new watch is given to start before anything happens: start-up, not delivery. A watch reports what happens
// once it has read the workspace, and tsx's cold start of the CLI takes several seconds on Windows. The delivery
// bounds of the checks are unchanged. With a server, a watch is ready once its stream is open (`streamsOpen`), so
// only the watch with no server waits this long.
const STARTUP_MS = 6000;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));

/** Start `folio watch` in a workspace; collects its stdout lines. */
function watch(root, args) {
  const child = spawn("node", [bin, "watch", ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const lines = [];
  let buffer = "";
  let stderr = "";
  child.stdout.on("data", (d) => {
    buffer += d;
    const parts = buffer.split("\n");
    buffer = parts.pop();
    lines.push(...parts);
  });
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise((r) => child.on("exit", (code) => r(code)));
  return { child, lines, exited, stderr: () => stderr };
}

async function stopWatch(w) {
  if (w.child.exitCode === null) w.child.kill("SIGTERM");
  await w.exited;
}

const server = await serve({ decks: ["example"] });
const { base, root } = server;
const token = server.token("example");
const streams = async () => (await (await fetch(`${base}/api/streams`)).json()).streams;
/** Wait until `n` more streams are open than `from`: each server-side watch opens one once it has read the workspace. */
const streamsOpen = async (from, n) => (await until(async () => (await streams()) >= from + n, 30000)) ?? false;
const post = (path, body, worker) => fetch(`${base}/${path}`, { method: "POST", headers: worker ? { "x-folio-worker": worker } : {}, body: JSON.stringify(body) }).then((r) => r.json());

try {
  const open = await streams();
  const all = watch(root, ["--json", "--deck", "decks/example"]);
  const once = watch(root, ["--once"]);
  await streamsOpen(open, 2);
  const quiet = all.lines.length === 0 && once.lines.length === 0;

  const sent = Date.now();
  const c = await post(`${token}/comments`, { slide: "s002", region: [25, 110, 440, 100], marks: [], text: "make the arrow red" });
  const first = await until(() => all.lines[0], 2000, 20);
  const event = first ? JSON.parse(first) : null;
  check("the user's comment prints one line within 2 s", quiet && event?.kind === "comment" && event.id === c.id && event.deck === "decks/example" && event.slide === "s002" && event.read === `folio comment show ${c.id}`, `${Date.now() - sent} ms: ${first}`);
  const onceCode = await Promise.race([once.exited, sleep(3000).then(() => "running")]);
  check("--once exits 0 after one event", onceCode === 0 && once.lines.length === 1 && /^\S+Z comment /.test(once.lines[0]), `exit ${onceCode}: ${once.lines[0]}`);

  await post(`${token}/comments/${c.id}/reply`, { text: "done, it is red now", answered: true }, "w1");
  await sleep(1500);
  check("an agent's reply (and the screenshots after it) print nothing", all.lines.length === 1, `${all.lines.length} lines`);

  await post(`${token}/comments/${c.id}/reply`, { text: "and thicker please" });
  const second = await until(() => all.lines[1], 2000, 20);
  const follow = second ? JSON.parse(second) : null;
  check("the user's follow-up on the answered thread prints one line", follow?.kind === "message" && follow.id === c.id && follow.text === "and thicker please", second);

  const q = await post(`${token}/questions`, { title: "Which framing?", questions: [{ id: "f", prompt: "Lead with", kind: "single", options: ["A", "B"] }] }, "w1");
  await sleep(800);
  const beforeAnswer = all.lines.length;
  await post(`${token}/questions/${q.id}/answers`, { answers: { f: "B" } });
  const third = await until(() => all.lines[beforeAnswer], 2000, 20);
  const answered = third ? JSON.parse(third) : null;
  check("an agent's questionnaire prints nothing; the user's answers print one line", beforeAnswer === 2 && answered?.kind === "answers" && answered.id === q.id && /f=B/.test(answered.text), third);

  const openBefore = await streams();
  const viewer = watch(root, ["--json", "--for", "viewing"]);
  await streamsOpen(openBefore, 1);
  await sleep(300);
  const report = (slide, slot = null) => fetch(`${base}/api/viewing`, { method: "POST", body: JSON.stringify({ tab: "t1", token, slide, slot, mode: "edit", visible: true, focused: true }) });
  await report("s001");
  const moved = await until(() => viewer.lines[0], 3000, 20);
  await report("s001", "title");
  await report("s002");
  const next = await until(() => viewer.lines[1], 3000, 20);
  await sleep(500);
  const views = viewer.lines.map((l) => JSON.parse(l));
  check("--for viewing prints a move to another slide, not a selection, and no comment lines", moved && next && views.length === 2 && views[0].slide === "s001" && views[1].slide === "s002" && views.every((v) => v.kind === "viewing"), viewer.lines.join(" | "));
  await stopWatch(viewer);

  const since = event.at;
  const backlog = watch(root, ["--once", "--since", since]);
  const code = await Promise.race([backlog.exited, sleep(5000).then(() => "running")]);
  check("--since replays what came after that time", code === 0 && / message /.test(backlog.lines[0] ?? ""), backlog.lines[0]);
  await stopWatch(all);
  await stopWatch(backlog);
  check("nothing reaches stderr", !all.stderr(), all.stderr().trim() || "empty");

  const bare = workspace({ decks: ["example"] });
  const offline = watch(bare, ["--json"]);
  await sleep(STARTUP_MS);
  const commentsDir = join(server.deckDir("example"), "comments");
  const file = readdirSync(commentsDir).find((f) => f === `${c.id}.json`);
  mkdirSync(join(bare, "decks/example/comments"), { recursive: true });
  cpSync(join(commentsDir, file), join(bare, "decks/example/comments", file));
  const polled = await until(() => offline.lines[0], 8000, 50);
  const lines = polled ? offline.lines.map((l) => JSON.parse(l)) : [];
  check("with no server the watch polls the files and reports", lines.length === 2 && lines[0].kind === "comment" && lines[1].kind === "message", polled);
  await stopWatch(offline);
} finally {
  await server.stop();
}

const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
