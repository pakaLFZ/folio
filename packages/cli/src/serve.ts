/**
 * `folio serve`: hold a port of the fixed band and run the app behind it. The
 * port holder never closes its listeners while it runs; `folio restart` swaps
 * the app behind them (`spec/live/server-and-addresses.md`).
 */
import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { join } from "node:path";
import { atomicWrite, findWorkspace, formatJson, holdPort, loadConfig, type PortHolder } from "@folio/server";
import { warnIfStale } from "./headless.js";
import { openAndSay, restartedLine } from "./opencmd.js";
import { serveApp, type AppMessage, type AppSpec, type HolderMessage } from "./serveapp.js";
import { skillHint } from "./skillcmd.js";

interface Launched {
  child: ChildProcess;
  port: number;
  lines: string[];
}

const STOP_MS = 10_000;

/** Start an app process for the holder; resolves once it is listening. */
function launchApp(spec: AppSpec): Promise<Launched> {
  const child = fork(process.argv[1]!, ["serve", "--app"], { env: { ...process.env, FOLIO_SERVE_APP: JSON.stringify(spec) } });
  return new Promise((resolve, reject) => {
    const exited = (code: number | null) => reject(new Error(`the new app exited (${code ?? "signal"}) before it was listening`));
    const ready = (message: AppMessage) => {
      if (message.type !== "ready") return;
      child.off("message", ready).off("exit", exited);
      resolve({ child, port: message.port, lines: message.lines });
    };
    child.on("message", ready).once("exit", exited);
  });
}

const tell = (launched: Launched, message: HolderMessage) => launched.child.connected && launched.child.send(message);

/** Retire the app (killed when it outstays STOP_MS), close the held port and exit. */
async function stopAll(launched: Launched, holder: PortHolder, code: number): Promise<never> {
  const { child } = launched;
  const exited = new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve(null) : child.once("exit", resolve)));
  tell(launched, { type: "retire" });
  const done = await Promise.race([exited.then(() => true), new Promise<boolean>((resolve) => setTimeout(resolve, STOP_MS, false))]);
  if (!done) child.kill("SIGKILL");
  await holder.close();
  process.exit(code);
}

/**
 * Keep an app behind the held port: swap it on request, stop with it.
 *
 * @param record - writes `.folio/server.json` for the app now serving.
 */
function supervise(holder: PortHolder, spec: AppSpec, first: Launched, record: (app: Launched) => void): void {
  let current = first;
  let restarting = false;
  let stopping = false;
  const watch = (launched: Launched) => {
    launched.child.on("message", (message: AppMessage) => {
      if (message.type === "restart") void restart();
      if (message.type === "forward-port") void forwardPort().then((port) => tell(launched, { type: "forward-port", port }));
    });
    launched.child.on("exit", (code) => {
      if (launched !== current || stopping) return;
      process.stderr.write(`folio: the app stopped (exit ${code ?? "on a signal"}); folio serve stops\n`);
      stop(code ?? 1);
    });
  };
  const forwardPort = () =>
    holder.freshForwardPort().catch((error: Error) => {
      process.stderr.write(`folio: could not bind a fresh VS Code forward port: ${error.message}\n`);
      return holder.port;
    });
  const restart = async () => {
    if (restarting) return;
    restarting = true;
    try {
      const next = await launchApp(spec);
      const old = current;
      current = next;
      watch(next);
      holder.setTarget(next.port);
      record(next);
      tell(old, { type: "retire", pid: next.child.pid, forwardPort: await forwardPort() });
      process.stdout.write(restartedLine(holder.port, old.child.pid, next.child.pid));
    } catch (error) {
      process.stderr.write(`folio: restart failed, the old app keeps serving: ${(error as Error).message}\n`);
      tell(current, { type: "restart-failed", error: (error as Error).message });
    } finally {
      restarting = false;
    }
  };
  const stop = (code: number) => {
    stopping = true;
    void stopAll(current, holder, code);
  };
  watch(first);
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
}

/**
 * Serve a workspace until interrupted.
 *
 * @param args - `[path] [--port N] [--host H] [--expose] [--open]`. `--expose` binds all
 *   interfaces and mounts the app behind a random path, printed once; `--open` asks VS Code
 *   to forward the port and open the page.
 * @returns never resolves while serving; 2 when no port is free.
 */
export async function serveCommand(args: string[]): Promise<number> {
  const options = { port: { type: "string" }, host: { type: "string" }, expose: { type: "boolean" }, open: { type: "boolean" }, app: { type: "boolean" } } as const;
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options });
  if (values.app) return serveApp(JSON.parse(process.env.FOLIO_SERVE_APP ?? "{}") as AppSpec);
  const config = loadConfig(findWorkspace(positionals[0] ?? "."));
  warnIfStale();
  if (values.port) config.port = Number(values.port);
  if (values.expose) config.host = values.host ?? "0.0.0.0";
  else if (values.host) config.host = values.host;
  const prefix = values.expose ? `/${randomBytes(18).toString("base64url")}` : "";
  const holder = await holdPort(config.host, config.port);
  const spec: AppSpec = { root: config.root, port: holder.port, prefix };
  const first = await launchApp(spec).catch(async (error: Error) => {
    await holder.close();
    throw error;
  });
  holder.setTarget(first.port);
  const record = (app: Launched) => atomicWrite(join(config.root, ".folio", "server.json"), formatJson({ port: holder.port, prefix, pid: process.pid, app: app.child.pid, host: config.host, hosts: holder.hosts, at: new Date().toISOString() }));
  record(first);
  supervise(holder, spec, first, record);
  const shown = config.host === "0.0.0.0" ? "<this-host>" : config.host === "127.0.0.1" ? "localhost" : config.host;
  process.stdout.write(`folio serving ${config.root} at http://${shown}:${holder.port}${prefix}/\n`);
  process.stdout.write(`  port ${holder.port} held on ${holder.hosts.join(" and ")}; folio restart reloads the app behind it\n`);
  for (const line of first.lines) process.stdout.write(`${line}\n`);
  const hint = skillHint(config.root);
  if (hint) process.stdout.write(`${hint}\n`);
  if (values.open) void openAndSay(`http://127.0.0.1:${holder.port}${prefix}/`);
  else process.stdout.write("  folio open <deck> asks VS Code to forward the port and open the deck\n");
  return new Promise(() => {});
}
