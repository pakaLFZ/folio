/**
 * One isolated folio server per check: a fresh workspace under scratch/e2e holding copies of the fixture
 * decks, served on a port the system picks. Nothing is ever written to the repository's decks. Workspaces
 * are left behind for inspection.
 */
import { execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = fileURLToPath(new URL("../..", import.meta.url));
/** The CLI: the one run-all built to JavaScript when FOLIO_E2E_BIN names it, else the TypeScript entry through tsx. */
export const bin = process.env.FOLIO_E2E_BIN || join(repo, "packages/cli/bin/folio.mjs");
const fixtures = join(repo, "e2e/fixtures/decks");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Python the checks draw with: `FOLIO_PYTHON`, else the first of python3, python and (Windows) py -3 on PATH. */
export const python = process.env.FOLIO_PYTHON ?? pythonOnPath();

function pythonOnPath() {
  const commands = [["python3"], ["python"], ...(process.platform === "win32" ? [["py", "-3"]] : [])];
  for (const [program, ...args] of commands) {
    const done = spawnSync(program, [...args, "-c", "import sys; print(sys.executable)"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (done.status === 0 && done.stdout.trim()) return done.stdout.trim();
  }
  console.error("no Python on PATH: checks that run hooks will fail; install Python 3 with matplotlib, or set FOLIO_PYTHON to its interpreter");
  return "no-python-on-path";
}

/**
 * Poll until a value is truthy.
 *
 * @returns the value, or null after the timeout.
 */
export async function until(fn, ms = 10000, every = 50) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v || null;
    await sleep(every);
  }
}

/**
 * Make a fresh workspace: the fixture decks named, the templates, folio.toml and the machine's folio.local.toml.
 *
 * @returns the workspace folder.
 */
export function workspace({ decks = ["example", "example-b"], from = repo, name = basename(process.argv[1] ?? "check", ".mjs") } = {}) {
  mkdirSync(join(repo, "scratch/e2e"), { recursive: true });
  const root = mkdtempSync(join(repo, "scratch/e2e", `${name}-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}-`));
  cpSync(join(from, "templates"), join(root, "templates"), { recursive: true });
  for (const deck of decks) cpSync(join(fixtures, deck), join(root, "decks", deck), { recursive: true });
  mkdirSync(join(root, "decks"), { recursive: true });
  writeFileSync(join(root, "folio.toml"), from === repo ? '[workspace]\ndecks = "decks"\ntemplates = "templates"\n' : readFileSync(join(from, "folio.toml"), "utf8"));
  if (existsSync(join(repo, "folio.local.toml"))) cpSync(join(repo, "folio.local.toml"), join(root, "folio.local.toml"));
  return root;
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Signal the server, wait for its exit and confirm its pid is gone; SIGKILL when it lingers. */
async function stopChild(child, signal = "SIGTERM") {
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  for (const sig of [signal, "SIGKILL"]) {
    if (exited()) break;
    child.kill(sig);
    await until(exited, 5000);
  }
  if (!exited() || alive(child.pid)) throw new Error(`server ${child.pid} did not stop`);
}

/** Read the port the server recorded for itself, once its pid matches. */
async function recordedPort(root, child) {
  const file = join(root, ".folio/server.json");
  const port = await until(() => {
    if (child.exitCode !== null) throw new Error(`folio serve exited ${child.exitCode}; see ${root}/serve.log`);
    const rec = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    return rec?.pid === child.pid && rec.port;
  }, 30000);
  if (!port) throw new Error(`folio serve did not start; see ${root}/serve.log`);
  return port;
}

/** Run the CLI in a workspace without blocking the event loop; resolves with its stdout. */
const cliAsync = (root, args, input) => new Promise((resolve, reject) => {
  const child = execFile("node", [bin, ...args], { cwd: root, encoding: "utf8" }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  child.stdin.end(input ?? "");
});

/**
 * Serve a workspace on a free port.
 *
 * @returns { base, root, pid, token(deck), deckDir(deck), cli(args, input), cliAsync(args, input), stop(signal) }.
 */
export async function start(root) {
  const log = openSync(join(root, "serve.log"), "a");
  const child = spawn("node", [bin, "serve", root, "--port", "0"], { stdio: ["ignore", log, log] });
  const onExit = () => alive(child.pid) && child.kill("SIGTERM");
  process.on("exit", onExit);
  const base = `http://127.0.0.1:${await recordedPort(root, child)}`;
  const decks = (await (await fetch(`${base}/api/decks`)).json()).decks;
  const deckDir = (deck) => join(root, "decks", deck);
  return {
    base,
    root,
    pid: child.pid,
    deckDir,
    token: (deck) => decks.find((d) => d.dir === deckDir(deck))?.token ?? null,
    cli: (args, input) => execFileSync("node", [bin, ...args], { cwd: root, input, encoding: "utf8" }),
    cliAsync: (args, input) => cliAsync(root, args, input),
    stop: (signal) => (process.off("exit", onExit), stopChild(child, signal)),
  };
}

/** A fresh workspace of the named fixture decks, served on a free port. */
export const serve = (options) => start(workspace(options));

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
