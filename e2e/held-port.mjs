// The held port (spec/live/server-and-addresses.md) and `folio open` (spec/live/vscode-open.md): requests loop on
// fresh and kept-alive connections while `folio restart` swaps the app behind the port, and none is refused or
// dropped; http://[::1]:N/ answers; `folio open` reaches a fake VS Code socket past a dead inherited one.
import { execFile } from "node:child_process";
import { linkSync, mkdtempSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { createServer, get } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bin, serve, sleep, until } from "./lib/server.mjs";

const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const server = await serve({ decks: ["example"] });
const record = () => JSON.parse(readFileSync(join(server.root, ".folio/server.json"), "utf8"));
const before = record();
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** GET a path on a fresh connection; resolves with the status and body, or the error code. */
const fresh = (host, path) => new Promise((resolve) => {
  get({ host, port: before.port, path, agent: false }, (res) => {
    let body = "";
    res.on("data", (c) => (body += c)).on("end", () => resolve({ status: res.statusCode, body }));
  }).on("error", (error) => resolve({ error: error.code ?? error.message }));
});
const kept = (path) => fetch(`${server.base}${path}`).then(async (r) => ({ status: r.status, body: await r.text() }), (error) => ({ error: error.cause?.code ?? error.message }));

let looping = true;
const seen = { fresh: [], kept: [] };
const loop = async (kind, request) => {
  while (looping) seen[kind].push(await request("/api/whoami"));
};
const loops = [loop("fresh", () => fresh("127.0.0.1", "/api/whoami")), loop("kept", kept)];
await until(() => seen.fresh.length > 20 && seen.kept.length > 20);
const folioRestart = (env) => new Promise((resolve) => {
  execFile("node", [bin, "restart"], { cwd: server.root, env: { ...process.env, ...env } }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, out: stdout + stderr }));
});
const noEditorEnv = { VSCODE_IPC_HOOK_CLI: "", XDG_RUNTIME_DIR: join(tmpdir(), `folio-no-editor-${process.pid}`) };
const restarted = await folioRestart(noEditorEnv);
const countAt = seen.fresh.length + seen.kept.length;
await until(() => seen.fresh.length + seen.kept.length > countAt + 40);
looping = false;
await Promise.all(loops);
const after = record();
check("folio restart says the port stayed open, then reports no VS Code", /restarted the app behind port \d+ \(pid \d+ -> \d+\); the port stayed open\nno VS Code window answered/.test(restarted.out), restarted.out.trim());
check("the holder and the port stay, the app is replaced", after.pid === before.pid && after.port === before.port && after.app !== before.app && !alive(before.app), `pid ${before.pid}->${after.pid} port ${before.port}->${after.port} app ${before.app}->${after.app}`);
for (const kind of ["fresh", "kept"]) {
  const failed = seen[kind].filter((r) => r.error || r.status !== 200);
  const epochs = new Set(seen[kind].filter((r) => r.status === 200).map((r) => JSON.parse(r.body).epoch));
  check(`no ${kind}-connection request refused or dropped across the restart`, failed.length === 0 && epochs.size === 2, `${seen[kind].length} requests, ${failed.length} failed ${JSON.stringify(failed.slice(0, 3))}, ${epochs.size} app epochs`);
}

const ipv6 = await new Promise((resolve) => {
  const probe = createNetServer().once("error", () => resolve(false));
  probe.listen(0, "::1", () => probe.close(() => resolve(true)));
});
if (!ipv6) console.log("SKIP  http://[::1]:N/ answers  this machine has no IPv6 loopback");
else {
  const six = await fresh("::1", "/");
  check("http://[::1]:N/ answers 200", six.status === 200 && after.hosts.includes("::1"), `status ${six.status ?? six.error}, hosts ${after.hosts}`);
}

/** A fake VS Code CLI socket keeping each JSON body it receives. */
const fakeEditor = (path) => new Promise((resolve) => {
  const bodies = [];
  const editor = createServer((req, res) => {
    let text = "";
    req.on("data", (c) => (text += c)).on("end", () => (bodies.push(JSON.parse(text)), res.writeHead(200).end("{}")));
  });
  editor.listen(path, () => resolve({ editor, bodies }));
});
const folioOpen = (env) => new Promise((resolve) => {
  execFile("node", [bin, "open", "decks/example"], { cwd: server.root, env: { ...process.env, ...env } }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, out: stdout + stderr }));
});
if (process.platform === "win32") console.log("SKIP  folio open through a fake VS Code socket  no unix sockets on Windows");
else {
  const dir = mkdtempSync(join(tmpdir(), "folio-held-port-"));
  const { editor, bodies } = await fakeEditor(join(dir, "vscode-ipc-live.sock"));
  const { editor: gone } = await fakeEditor(join(dir, "dead.sock"));
  linkSync(join(dir, "dead.sock"), join(dir, "vscode-ipc-dead.sock"));
  await new Promise((resolve) => gone.close(resolve));
  utimesSync(join(dir, "vscode-ipc-live.sock"), new Date(), new Date(Date.now() - 60_000));
  const url = `http://127.0.0.1:${before.port}/${server.token("example")}/`;
  const opened = await folioOpen({ VSCODE_IPC_HOOK_CLI: join(dir, "vscode-ipc-dead.sock"), XDG_RUNTIME_DIR: dir });
  check("folio open reaches the live socket past a dead inherited one", opened.code === 0 && opened.out.includes(`VS Code accepted the forward and open request for ${url}`) && JSON.stringify(bodies) === JSON.stringify([{ type: "openExternal", uris: [url] }]), `exit ${opened.code}: ${opened.out.trim()}; bodies ${JSON.stringify(bodies)}`);
  const none = await folioOpen({ VSCODE_IPC_HOOK_CLI: "", XDG_RUNTIME_DIR: join(dir, "missing") });
  check("with no VS Code, folio open names the manual step", none.code === 1 && none.out.includes(`open ${url} in a browser`) && none.out.includes("remove that forward and forward port"), `exit ${none.code}: ${none.out.trim()}`);
  const editorEnv = { VSCODE_IPC_HOOK_CLI: join(dir, "vscode-ipc-dead.sock"), XDG_RUNTIME_DIR: dir };
  for (let run = 1; run <= 2; run += 1) {
    const reply = await folioRestart(editorEnv);
    const requested = bodies.at(-1)?.uris?.[0];
    const freshPort = requested && Number(new URL(requested).port);
    const answer = requested && await fetch(requested).catch(() => null);
    check(`restart ${run} requests a fresh working VS Code port`, reply.code === 0 && reply.out.includes(`the port stayed open\nVS Code accepted the forward and open request for ${requested}`) && freshPort !== before.port && freshPort !== Number(new URL(bodies.at(-2)?.uris?.[0] ?? url).port) && answer?.status === 200, `exit ${reply.code}: ${reply.out.trim()}; request ${requested}; status ${answer?.status}`);
  }
  await new Promise((resolve) => editor.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}

const stream = await fetch(`${server.base}/${server.token("example")}/events`);
stream.body.getReader().read().catch(() => {});
const stopStart = Date.now();
await server.stop();
const stopMs = Date.now() - stopStart;
check("stopping with an event stream open takes no drain timeout", stopMs < 2000, `${stopMs} ms`);
const finalApp = record().app;
check("stopping the holder stops the app", await until(() => !alive(finalApp), 5000).then((gone) => !!gone), `app ${finalApp} ${alive(finalApp) ? "still running" : "gone"}`);
await sleep(0);
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
