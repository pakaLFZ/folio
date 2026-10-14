/**
 * Per-deck JSON API under `/<deck8>/`. Every write goes through the deck store
 * (atomic, revision-checked, logged) and is published at once.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { makeSlideSpec, packJsonSchema, slideRoot, slideSpecSchema, slideWriteRefusal, type MeasuredSlot, type PatchOp, type SlideSpec } from "@folio/core";
import type { FolioApp } from "./app.js";
import type { DeckStore } from "./deckstore.js";
import type { LoadedPack } from "./workspace.js";
import { readBody, sendFile, sendJson, sendProblem, type Router } from "./httpkit.js";
import { overrideRoutes } from "./routes-overrides.js";
import { fileVersion } from "./settle.js";
import { recordTableDrawn } from "./hooks/tablefiles.js";
import { recordUserEdits } from "./vocab.js";
import { vocabRoutes } from "./routes-vocab.js";
import { toPosix } from "./posixpath.js";

/**
 * Who is writing, from the request.
 *
 * @param req - the request.
 * @returns the `X-Folio-Worker` header, or `user` for the browser.
 */
export function workerOf(req: IncomingMessage): string {
  const header = req.headers["x-folio-worker"];
  return (Array.isArray(header) ? header[0] : header) || "user";
}

/**
 * The revision a write was made against.
 *
 * @param req - the request.
 * @returns the `If-Match` value without quotes, or null when absent.
 */
export function ifMatch(req: IncomingMessage): string | null {
  const value = req.headers["if-match"];
  return value ? value.replace(/^W\//, "").replace(/"/g, "") : null;
}

/**
 * What refuses a slide write: the schema problems it would add, against the
 * deck's pack and its hooks.
 *
 * @param loaded - the deck's pack; without one, nothing is refused.
 * @returns the check `DeckStore.patchSlide` takes (before is null for a new
 *   slide), or undefined.
 */
export function slideWriteGuard(loaded: LoadedPack | undefined): ((before: SlideSpec | null, after: SlideSpec) => string | null) | undefined {
  return loaded && ((before, after) => slideWriteRefusal(loaded.pack, loaded.hooks, before, after));
}

/**
 * Look up the deck named in the route, or answer 404.
 *
 * @returns the deck, or null after a 404 has been sent.
 */
export function deckOr404(app: FolioApp, res: ServerResponse, token: string): DeckStore | null {
  const store = app.workspace.decks.get(token);
  if (!store) sendProblem(res, 404, "No such deck", `No deck is mounted at /${token}/.`);
  return store ?? null;
}

/**
 * Register the deck routes.
 *
 * @param router - the router.
 * @param app - the server state.
 */
export function deckRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/:deck/manifest", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, { token: store.token, title: store.deck.title, template: store.deck.template, slides: app.freshManifest(store) });
  });
  router.on("GET", "/:deck/slides/:id", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const record = store.readSlide(p.id!);
    if (!record) return sendProblem(res, 404, "No such slide", `Slide ${p.id} does not exist.`);
    sendJson(res, 200, record, { etag: `"${record.rev}"` });
  });
  router.on("PATCH", "/:deck/slides/:id", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const ops = await readBody<PatchOp[]>(req);
    if (!Array.isArray(ops)) return sendProblem(res, 400, "Bad patch", "The body must be a JSON Patch array.");
    const before = store.readSlide(p.id!)?.spec ?? null;
    const result = await store.patchSlide(p.id!, ops, ifMatch(req), workerOf(req), slideWriteGuard(app.workspace.packOf(store)));
    if (!result.ok) return sendProblem(res, result.status, result.status === 409 ? "Revision conflict" : "Patch refused", result.reason, { current: result.current });
    if (before && workerOf(req) === "user") await recordUserEdits(app.workspace, store, p.id!, before, result.spec, result.rev);
    app.slideTouched(store, p.id!);
    sendJson(res, 200, { id: p.id, rev: result.rev, spec: result.spec }, { etag: `"${result.rev}"` });
  });
  router.on("POST", "/:deck/slides", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ layout: string; props?: Record<string, unknown>; after?: string | null }>(req);
    const pack = app.workspace.packOf(store);
    if (!body?.layout || !pack?.pack.layouts[body.layout]) return sendProblem(res, 422, "Unknown layout", `Layout ${body?.layout} is not in the deck's pack; layouts: ${Object.keys(pack?.pack.layouts ?? {}).join(", ")}.`);
    const refused = slideWriteGuard(pack)?.(null, makeSlideSpec(body.layout, body.props ?? {}));
    if (refused) return sendProblem(res, 422, "Slide refused", refused);
    const made = await store.newSlide(body.layout, body.props ?? {}, workerOf(req), body.after ?? null);
    app.slideTouched(store, made.id);
    app.deckTouched(store);
    sendJson(res, 201, made);
  });
  slideActionRoutes(router, app);
  overrideRoutes(router, app);
  vocabRoutes(router, app);
  warningRoutes(router, app);
  fileRoutes(router, app);
}

/** The deck's pack, its pictures, deck files and pack files. */
function fileRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/:deck/pack", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const loaded = app.workspace.packOf(store);
    if (!loaded) return sendProblem(res, 404, "Pack not installed", `Pack ${store.deck.template} is not installed in ${app.config.templatesDir}.`);
    const hooks = Object.fromEntries(Object.entries(loaded.hooks).map(([k, h]) => [k, { name: h.name, version: h.version, inputs: h.inputs, description: h.description }]));
    sendJson(res, 200, { pack: loaded.pack, hooks, prompt: loaded.catalog.prompt() });
  });
  router.on("GET", "/:deck/figures", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, { files: listFigures(store.dir) });
  });
  router.on("GET", "/:deck/files/*rest", (req, res, p, url) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const version = url.searchParams.get("v");
    if (!sendFile(res, store.dir, p.rest!, version !== null && fileVersion(join(store.dir, p.rest!)) === version)) return sendProblem(res, 404, "No such file", p.rest!);
    if (p.rest!.endsWith(".table.json")) recordTableDrawn(store, p.rest!);
  });
  router.on("GET", "/packs/:pack/*rest", (_req, res, p) => {
    const loaded = app.workspace.packs.get(p.pack!);
    if (!loaded || !sendFile(res, loaded.dir, p.rest!)) sendProblem(res, 404, "No such pack file", `${p.pack}/${p.rest}`);
  });
  router.on("GET", "/api/pack-schema", (_req, res) => sendJson(res, 200, packJsonSchema()));
}

/** Duplicate, archive and reorder. */
function slideActionRoutes(router: Router, app: FolioApp): void {
  router.on("POST", "/:deck/slides/:id/duplicate", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const made = await store.duplicateSlide(p.id!, workerOf(req));
    if (!made) return sendProblem(res, 404, "No such slide", `Slide ${p.id} cannot be read.`);
    app.slideTouched(store, made.id);
    app.deckTouched(store);
    sendJson(res, 201, made);
  });
  router.on("POST", "/:deck/slides/:id/archive", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const moved = await store.archiveSlide(p.id!, workerOf(req));
    if (!moved) return sendProblem(res, 404, "No such slide", `Slide ${p.id} does not exist.`);
    app.slideTouched(store, p.id!);
    app.deckTouched(store);
    sendJson(res, 200, { archived: moved });
  });
  router.on("POST", "/:deck/order", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ id?: string; index?: number; ids?: string[]; before?: string | null }>(req);
    const order = Array.isArray(body.ids) ? await store.moveSlides(body.ids, body.before ?? null, workerOf(req)) : await store.reorder(body.id!, body.index!, workerOf(req));
    if (!order) return sendProblem(res, 409, "Landing slide gone", `Slide ${body.before} is no longer in the deck or is one of the slides being moved.`);
    app.deckTouched(store);
    sendJson(res, 200, { order });
  });
  slideBatchRoutes(router, app);
}

/**
 * Pasted slides from their JSON, and archiving several slides at once; each is
 * one deck-locked write of the order.
 */
function slideBatchRoutes(router: Router, app: FolioApp): void {
  router.on("POST", "/:deck/slides/paste", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ slides?: unknown[]; after?: string | null }>(req);
    const parsed = (Array.isArray(body?.slides) ? body.slides : []).map((s) => slideSpecSchema.safeParse(s));
    const layouts = app.workspace.packOf(store)?.pack.layouts ?? {};
    const specs = parsed.flatMap((r) => (r.success && layouts[slideRoot(r.data)?.layout ?? ""] ? [r.data] : []));
    if (!parsed.length || specs.length !== parsed.length) return sendProblem(res, 422, "Cannot paste", "Every pasted slide must be a valid slide whose layout is in the deck's pack.");
    const ids = await store.pasteSlides(specs, body.after ?? null, workerOf(req));
    ids.forEach((id) => app.slideTouched(store, id));
    app.deckTouched(store);
    sendJson(res, 201, { ids });
  });
  router.on("POST", "/:deck/slides/archive", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ ids?: string[] }>(req);
    if (!Array.isArray(body?.ids) || !body.ids.length) return sendProblem(res, 400, "Nothing to archive", 'The body must name the slides as {"ids": [...]}.');
    const archived = await store.archiveSlides(body.ids, workerOf(req));
    archived.forEach((id) => app.slideTouched(store, id));
    app.deckTouched(store);
    sendJson(res, 200, { archived });
  });
}

/**
 * Pictures in a deck folder that a figure slot may show.
 *
 * @param dir - the deck folder.
 * @returns deck-relative paths of png, jpg, svg, gif and webp files, skipping
 *   `.folio`, `slides`, `comments` and any archive.
 */
export function listFigures(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(png|jpe?g|svg|gif|webp)$/i.test(e.name))
    .map((e) => `${toPosix(e.parentPath.slice(dir.length + 1))}${e.parentPath.length > dir.length ? "/" : ""}${e.name}`)
    .filter((p) => !/(^|\/)(\.folio|\.archive|slides|comments)(\/|$)/.test(p))
    .sort();
}

/** Warnings: the list, live measurements from the browser, acknowledgements. */
function warningRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/:deck/warnings", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, { warnings: app.warnings.deckWarnings(store) });
  });
  router.on("POST", "/:deck/measure", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ slide: string; rev: string; slots: MeasuredSlot[]; renderError?: string }>(req);
    app.publishWarnings(store, body.slide, { rev: body.rev, slots: body.slots, ...(typeof body.renderError === "string" ? { renderError: body.renderError } : {}) });
    app.notify(store.token, "measured", { slide: body.slide });
    sendJson(res, 202, { ok: true });
  });
  router.on("POST", "/:deck/ack", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ id: string; slide: string; reason: string; until?: string | null }>(req);
    const warning = app.warnings.slideWarnings(store, body.slide, null).find((w) => w.id === body.id);
    if (!warning) return sendProblem(res, 404, "No such warning", `Warning ${body.id} is not active on slide ${body.slide}.`);
    if (!body.reason?.trim()) return sendProblem(res, 422, "Reason required", "An acknowledgement needs a reason.");
    if (warning.source === "comment") return sendProblem(res, 422, "Comments cannot be acknowledged", "A comment closes when its thread is answered and resolved.");
    app.warnings.acknowledge(store, warning, { by: workerOf(req), reason: body.reason.trim(), at: new Date().toISOString(), status: "accepted", ...(body.until ? { until: body.until } : {}) });
    app.publishWarnings(store, body.slide, null);
    sendJson(res, 200, { ok: true });
  });
}
