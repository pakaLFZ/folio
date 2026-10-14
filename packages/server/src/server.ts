/**
 * The HTTP server: one port per workspace on a fixed band (4310 to 4313), every
 * deck under `/<deck8>/`, a page bootstrap that carries the base address and the
 * first slides, and Server-Sent Events multiplexed per browser.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { relative } from "./posixpath.js";
import { isToken, parseCursor } from "@folio/core";
import { deckRow, WORKSPACE_CHANNEL } from "./deckwatch.js";
import type { FolioApp } from "./app.js";
import { originAllowed, Router, sendFile, sendJson, sendProblem } from "./httpkit.js";
import { deckExportRoutes } from "./deckexport.js";
import { deckRoutes, workerOf } from "./routes-deck.js";
import { newDeckRoutes } from "./newdeck.js";
import { packRoutes } from "./routes-packs.js";
import { viewingRoutes } from "./routes-viewing.js";
import { WEB_DIST } from "./webbuild.js";
import { recordUndo, stepUndo } from "./undo.js";
import { finishRecording, newRecording, runRecording } from "./write-recording.js";

export const PORT_BAND = 4;
const FIRST_SLIDES = 6;

export interface ServeOptions {
  prefix: string;
  extraRoutes?: (router: Router, app: FolioApp) => void;
}

/**
 * The page HTML with the bootstrap written in.
 *
 * @param prefix - the mount prefix ("" on loopback, a random path off it).
 * @param boot - the bootstrap object the client reads as `window.__FOLIO__`.
 * @returns the HTML, or a plain notice when the web app is not built.
 */
function pageHtml(prefix: string, boot: Record<string, unknown>): string {
  const indexPath = join(WEB_DIST, "index.html");
  if (!existsSync(indexPath)) return `<!doctype html><p>The web app is not built. Run: pnpm build:web</p>`;
  const json = JSON.stringify({ ...boot, root: `${prefix}/` }).replace(/</g, "\\u003c");
  return readFileSync(indexPath, "utf8")
    .replace("<head>", `<head><base href="${prefix}/">`)
    .replace("</head>", `<script>window.__FOLIO__=${json}</script></head>`);
}

/**
 * The bootstrap of a deck page: manifest, pack, the first slides and the slide
 * the address opens on.
 *
 * @param app - the server state.
 * @param token - the deck token.
 * @param opening - the `?slide=` the page opens on, read with the first slides.
 * @returns the object, or null when no deck has that token.
 */
function deckBoot(app: FolioApp, token: string, opening: string | null): Record<string, unknown> | null {
  const store = app.workspace.decks.get(token);
  if (!store) return null;
  const cursor = app.hub.cursorOf([token]);
  const slides = app.freshManifest(store);
  const loaded = app.workspace.packOf(store);
  const ids = slides.slice(0, FIRST_SLIDES).map((s) => s.id);
  if (opening && !ids.includes(opening) && slides.some((s) => s.id === opening)) ids.push(opening);
  const first = ids.map((id) => store.readSlide(id));
  const hooks = loaded ? Object.fromEntries(Object.entries(loaded.hooks).map(([k, h]) => [k, { name: h.name, version: h.version, inputs: h.inputs }])) : {};
  const dir = relative(app.config.root, store.dir);
  return { view: "deck", cursor, deck: { token, title: store.deck.title, template: store.deck.template, slides, dir }, pack: loaded?.pack ?? null, hooks, slides: first.filter(Boolean), editor: { showDeckList: app.config.showDeckList } };
}

/**
 * The bootstrap of the inbox page: whether the deck list is shown (off is
 * single deck mode) and the workspace's deck when it has exactly one.
 *
 * @param app - the server state.
 * @returns the object.
 */
function inboxBoot(app: FolioApp): Record<string, unknown> {
  const tokens = [...app.workspace.decks.keys()];
  return { view: "inbox", editor: { showDeckList: app.config.showDeckList }, inbox: { onlyDeck: tokens.length === 1 ? tokens[0] : null } };
}

/**
 * Attach a Server-Sent Events stream.
 *
 * @param decks - deck tokens, or "all" for the inbox.
 * @param watch - for "all", the decks open in the browser's tabs.
 */
function stream(app: FolioApp, req: IncomingMessage, res: ServerResponse, decks: string[] | "all", url: URL, watch: string[] = []): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  res.flushHeaders();
  const detach = app.hub.subscribe(res, decks, parseCursor((req.headers["last-event-id"] as string | undefined) ?? url.searchParams.get("cursor")), watch);
  req.on("close", detach);
}

/**
 * Build the router with every route.
 *
 * @param app - the server state.
 * @param options - mount prefix and extra route registrations.
 * @returns the router.
 */
export function buildRouter(app: FolioApp, options: ServeOptions): Router {
  const router = new Router();
  const page = (res: ServerResponse, boot: Record<string, unknown>) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(pageHtml(options.prefix, boot));
  };
  router.on("GET", "/", (_req, res) => page(res, { view: "landing" }));
  router.on("GET", "/inbox", (_req, res) => page(res, inboxBoot(app)));
  router.on("GET", "/inbox/boot", (_req, res) => sendJson(res, 200, { ...inboxBoot(app), root: `${options.prefix}/` }));
  streamRoutes(router, app);
  router.on("GET", "/assets/*rest", (_req, res, p) => {
    if (!sendFile(res, join(WEB_DIST, "assets"), p.rest!, true)) sendProblem(res, 404, "No such asset", p.rest!);
  });
  router.on("GET", "/:deck", (_req, res, p) => {
    res.writeHead(301, { location: `${options.prefix}/${p.deck}/` });
    res.end();
  });
  router.on("GET", "/:deck/", (_req, res, p, url) => {
    const boot = isToken(p.deck!) ? deckBoot(app, p.deck!, url.searchParams.get("slide")) : null;
    if (boot) page(res, boot);
    else sendProblem(res, 404, "No such deck", `No deck is mounted at /${p.deck}/; open / for the list.`);
  });
  router.on("GET", "/:deck/boot", (_req, res, p, url) => {
    const boot = isToken(p.deck!) ? deckBoot(app, p.deck!, url.searchParams.get("slide")) : null;
    if (boot) sendJson(res, 200, { ...boot, root: `${options.prefix}/` });
    else sendProblem(res, 404, "No such deck", `No deck is mounted at /${p.deck}/.`);
  });
  apiRoutes(router, app);
  newDeckRoutes(router, app);
  packRoutes(router, app);
  viewingRoutes(router, app);
  deckRoutes(router, app);
  deckExportRoutes(router, app);
  options.extraRoutes?.(router, app);
  for (const direction of ["undo", "redo"] as const) router.on("POST", `/:deck/${direction}`, async (_req, res, p) => {
    const store = app.workspace.decks.get(p.deck!);
    if (!store) return sendProblem(res, 404, "No such deck", p.deck!);
    const result = await stepUndo(store, direction);
    if (!result.ok) return sendProblem(res, 409, "History refused", result.reason);
    app.deckTouched(store);
    for (const item of result.entry.files) {
      const id = /^slides\/([^/]+)\.json$/.exec(item.path)?.[1];
      if (id) app.slideTouched(store, id);
      if (item.path.startsWith("comments/")) app.emit(store.token, "file", { path: item.path, v: Date.now() });
    }
    app.emit(store.token, "resync", {});
    sendJson(res, 200, { ops: result.entry.ops, files: result.entry.files.map((item) => item.path) });
  });
  return router;
}

/** The event streams: per browser, for the inbox, and per deck. */
function streamRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/events", (req, res, _p, url) => {
    const decks = url.searchParams.get("decks") ?? "";
    stream(app, req, res, decks === "*" ? "all" : decks.split(",").filter((d) => isToken(d) || d === WORKSPACE_CHANNEL), url);
  });
  router.on("GET", "/inbox/events", (req, res, _p, url) => stream(app, req, res, "all", url, (url.searchParams.get("watch") ?? "").split(",").filter(isToken)));
  router.on("GET", "/:deck/events", (req, res, p, url) => stream(app, req, res, [p.deck!], url));
}

/** Workspace-level API: who serves, open streams, every deck. */
function apiRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/api/whoami", (_req, res) => sendJson(res, 200, { root: app.config.root, epoch: app.hub.epoch }));
  router.on("GET", "/api/streams", (_req, res) => sendJson(res, 200, app.hub.stats()));
  router.on("GET", "/api/decks", (_req, res, _p, url) => {
    const withArchived = url.searchParams.get("archived") === "1";
    const stores = [...app.workspace.decks.values()].filter((store) => (store.reloadDeck(), withArchived || !store.deck.archived));
    const decks = stores.map((store) => ({
      ...deckRow(store),
      slides: app.freshManifest(store).length,
      ...app.deckSummary(store),
    }));
    sendJson(res, 200, { decks, cursor: app.hub.cursorOf([WORKSPACE_CHANNEL]) });
  });
}

/**
 * Create the HTTP server.
 *
 * @param app - the server state.
 * @param options - mount prefix and extra routes.
 * @returns a node:http server, not yet listening.
 */
export function createFolioServer(app: FolioApp, options: ServeOptions): Server {
  const router = buildRouter(app, options);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (options.prefix && !url.pathname.startsWith(options.prefix)) return sendProblem(res, 404, "Not found", "");
    const path = url.pathname.slice(options.prefix.length) || "/";
    if (req.method !== "GET" && req.method !== "HEAD" && !originAllowed(req)) return sendProblem(res, 403, "Origin refused", `Origin ${req.headers.origin} may not write.`);
    const token = path.split("/")[1];
    const store = token ? app.workspace.decks.get(token) : undefined;
    const writable = req.method !== "GET" && req.method !== "HEAD" && workerOf(req) === "user" && !/\/(undo|redo)$/.test(path);
    const stores = !writable ? [] : store ? [store] : /^\/api\/inbox\/(move|claim|bulk|clear)$/.test(path) ? [...app.workspace.decks.values()] : [];
    const recording = stores.length ? newRecording(stores.map((deck) => deck.dir)) : null;
    if (recording) {
      const end = res.end.bind(res);
      res.end = ((...args: Parameters<typeof res.end>) => {
        finishRecording(recording);
        if (res.statusCode < 400) for (const deck of stores) recordUndo(deck, recording, [`${req.method} ${path}`]);
        return end(...args);
      }) as typeof res.end;
    }
    try {
      const handled = await (recording ? runRecording(recording, () => router.handle(req, res, url, path)) : router.handle(req, res, url, path));
      if (!handled) sendProblem(res, 404, "Not found", path);
    } catch (error) {
      if (!res.headersSent) sendProblem(res, 500, "Server error", (error as Error).message);
      else res.end();
    }
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  return server;
}

export { sendJson };
