/**
 * A slide's overrides of its template: read them, and set or clear them by
 * dotted path in one revision-checked write. A write whose overrides the
 * template's own types refuse is answered 422 naming every bad path.
 */
import { editOverrides, overrideEntries, overridesPatch, overrideWriteProblem, resolveOverrides, slideRoot, type OverrideEdit } from "@folio/core";
import type { FolioApp } from "./app.js";
import { readBody, sendJson, sendProblem, type Router } from "./httpkit.js";
import { layoutUsers, promoteSlide, type PromoteRequest } from "./promote.js";
import { deckOr404, ifMatch, workerOf } from "./routes-deck.js";

/**
 * Register `GET` and `POST /:deck/slides/:id/overrides`.
 *
 * GET gives `{overrides, entries: [{path, value}], problems}`; POST takes
 * `{"set": {path: value}, "clear": [path], "clearAll": bool}` and an optional
 * `If-Match`, and answers like a slide patch. `POST .../promote` turns the
 * overrides into a template (`promote.ts`).
 */
export function overrideRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/:deck/slides/:id/overrides", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    const root = store?.readSlide(p.id!)?.spec;
    const slide = root ? slideRoot(root) : null;
    const pack = store ? app.workspace.packOf(store)?.pack : undefined;
    if (!store) return;
    if (!slide || !pack) return sendProblem(res, 404, "No such slide", `Slide ${p.id} does not exist or is not a valid slide.`);
    const overrides = slide.props.overrides ?? {};
    const problems = resolveOverrides(pack, slide.layout, slide.props.overrides).problems.map((x) => ({ path: ["overrides", ...x.path].join("."), message: x.message }));
    const layoutSlides = layoutUsers(app.workspace, pack.name, slide.layout);
    sendJson(res, 200, { layout: slide.layout, overrides, entries: overrideEntries(overrides), problems, layoutSlides });
  });
  router.on("POST", "/:deck/slides/:id/overrides", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const edit = await readBody<OverrideEdit>(req);
    const current = store.readSlide(p.id!);
    const pack = app.workspace.packOf(store)?.pack;
    if (!current?.spec || !pack) return sendProblem(res, 404, "No such slide", `Slide ${p.id} does not exist or is not a valid slide.`);
    const next = editOverrides(slideRoot(current.spec)?.props.overrides, edit ?? {});
    const ops = overridesPatch(current.spec, next);
    const result = await store.patchSlide(p.id!, ops, ifMatch(req) ?? current.rev, workerOf(req), (before, after) => overrideWriteProblem(pack, before, after));
    if (!result.ok) return sendProblem(res, result.status, result.status === 409 ? "Revision conflict" : "Override refused", result.reason, { current: result.current });
    app.slideTouched(store, p.id!);
    sendJson(res, 200, { id: p.id, rev: result.rev, spec: result.spec, overrides: next, entries: overrideEntries(next) }, { etag: `"${result.rev}"` });
  });
  router.on("POST", "/:deck/slides/:id/promote", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const outcome = await promoteSlide(app.workspace, store, p.id!, (await readBody<PromoteRequest>(req)) ?? {}, workerOf(req));
    if (!outcome.ok) return sendProblem(res, outcome.status, "Template not written", outcome.reason);
    for (const deck of app.workspace.decks.values()) {
      const pack = app.workspace.packOf(deck)?.pack;
      if (pack?.name === outcome.pack) app.emit(deck.token, "pack", { pack: pack.name, version: pack.version });
    }
    if (outcome.slide) app.slideTouched(store, p.id!);
    sendJson(res, 200, outcome);
  });
}
