/**
 * The app behind the held port: every route, the hook queue and the watchers,
 * on a private loopback port, started and retired by `folio serve`'s port
 * holder over the IPC channel (`spec/live/server-and-addresses.md`).
 */
import type { Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FolioApp, createFolioServer, findWorkspace, loadConfig, readBody, sendJson, sendProblem } from "@folio/server";
import { attachServices, type Services } from "./services.js";

/** What the holder tells the app to serve, passed in `FOLIO_SERVE_APP`. */
export interface AppSpec {
  root: string;
  port: number;
  prefix: string;
}

/** The app asking the holder about the port VS Code opens (`spec/live/vscode-open.md`). */
type OpenPortOp = { op: "fresh" } | { op: "wait"; port: number; after: number; ms: number };
export type OpenPortAsk = { type: "open-port"; id: number } & OpenPortOp;
/** Holder to app. */
export type HolderMessage = { type: "retire"; pid?: number } | { type: "restart-failed"; error: string } | { type: "open-port"; id: number; value: unknown };
/** App to holder. */
export type AppMessage = { type: "ready"; port: number; lines: string[] } | { type: "restart" } | OpenPortAsk;

const DRAIN_MS = 5000;

/** The lines `folio serve` prints under its address: each deck and each pack that did not load. */
function deckLines(app: FolioApp): string[] {
  const decks = [...app.workspace.decks.values()].map((store) => `  /${store.token}/  ${store.deck.title}  (${store.dir})`);
  const packs = [...app.workspace.packProblems].map(([name, problems]) => `  pack ${name} not loaded: ${problems.join("; ")}`);
  return [...decks, ...packs];
}

/** Stop serving: answer pending restarts, stop the queue and watchers, let open requests finish, exit. */
async function retire(app: FolioApp, services: Services, server: Server, pending: ServerResponse[], replacement?: number): Promise<never> {
  for (const res of pending.splice(0)) sendJson(res, 200, { pid: replacement, previous: process.pid });
  const drained = new Promise((resolve) => server.close(resolve));
  server.closeIdleConnections();
  await services.close();
  await app.close();
  server.closeIdleConnections();
  await Promise.race([drained, new Promise((resolve) => setTimeout(resolve, DRAIN_MS))]);
  server.closeAllConnections();
  process.exit(0);
}

/** Listen on a free loopback port. */
const listenPrivately = (server: Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));

/**
 * Run the app for a holder; reports `ready` with its private port, then serves until retired.
 *
 * @returns never resolves.
 */
export async function serveApp(spec: AppSpec): Promise<number> {
  const send = (message: AppMessage) => process.send!(message);
  const config = loadConfig(findWorkspace(spec.root));
  config.port = spec.port;
  const app = new FolioApp(config);
  app.watchPacks();
  app.watchDecks();
  const services = attachServices(app, true);
  const pending: ServerResponse[] = [];
  const asks = new Map<number, ServerResponse>();
  let nextAsk = 0;
  const askHolder = (res: ServerResponse, ask: OpenPortOp) => {
    const id = (nextAsk += 1);
    asks.set(id, res);
    send({ type: "open-port", id, ...ask });
  };
  const server = createFolioServer(app, {
    prefix: spec.prefix,
    extraRoutes: (router) => {
      services.routes(router);
      router.on("POST", "/api/restart", (_req, res) => {
        pending.push(res);
        send({ type: "restart" });
      });
      router.on("POST", "/api/open-port", (_req, res) => askHolder(res, { op: "fresh" }));
      router.on("POST", "/api/open-port/wait", async (req, res) => {
        const { port, after, ms } = await readBody<{ port: number; after: number; ms: number }>(req, 1024);
        askHolder(res, { op: "wait", port: Number(port), after: Number(after), ms: Math.min(Number(ms), 30_000) });
      });
    },
  });
  const port = await listenPrivately(server);
  services.setBase(`http://127.0.0.1:${port}${spec.prefix}`);
  let leaving = false;
  const leave = (replacement?: number) => void (leaving || ((leaving = true), retire(app, services, server, pending, replacement)));
  process.on("message", (message: HolderMessage) => {
    if (message.type === "retire") leave(message.pid);
    else if (message.type === "open-port") {
      const res = asks.get(message.id);
      asks.delete(message.id);
      if (res) sendJson(res, 200, message.value);
    } else for (const res of pending.splice(0)) sendProblem(res, 500, "Restart failed", message.error);
  });
  process.on("disconnect", () => leave());
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => leave());
  send({ type: "ready", port, lines: deckLines(app) });
  return new Promise(() => {});
}
