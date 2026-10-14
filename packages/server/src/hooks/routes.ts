/**
 * HTTP routes of the hook service: slot states and cached figures for the
 * browser, presence for priorities, and the queue for `folio queue`.
 */
import type { FolioApp } from "../app.js";
import { readBody, sendFile, sendJson, sendProblem, type Router } from "../httpkit.js";
import { deckOr404 } from "../routes-deck.js";
import type { HookService } from "./service.js";
import { deckHookState, hooksDir, slotView, type SlotState } from "./state.js";
import { slotTrace } from "./slottrace.js";
import { slotBox } from "../slotbox.js";

/**
 * Register the hook routes.
 *
 * @param router - the router.
 * @param app - the server state.
 * @param hooks - the running hook service, or null when hooks only report.
 */
export function hookRoutes(router: Router, app: FolioApp, hooks: HookService | null): void {
  router.on("GET", "/:deck/hooks", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const view = (s: SlotState) => ({ ...slotView(store, s), message: s.record && s.record.status !== "ok" ? s.record.status : undefined });
    const slides = Object.fromEntries(Object.entries(deckHookState(store)).map(([slide, slots]) => [slide, Object.fromEntries(Object.entries(slots).map(([slot, s]) => [slot, view(s)]))]));
    sendJson(res, 200, { slides });
  });
  router.on("GET", "/:deck/hookfig/:file", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store && !(/^[0-9a-f]{16}\.(png|svg)$/.test(p.file!) && sendFile(res, hooksDir(store), p.file!, true))) sendProblem(res, 404, "No such figure", p.file!);
  });
  router.on("GET", "/:deck/trace/:slide/:slot", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const box = slotBox(app.workspace, store, p.slide!, p.slot!, app.warnings.lastMeasured(store, p.slide!));
    sendJson(res, 200, slotTrace(store, p.slide!, p.slot!, box.ok ? { w: box.w, h: box.h } : null));
  });
  router.on("POST", "/:deck/presence", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ slide: string }>(req);
    hooks?.presence.viewing(store.token, body.slide);
    hooks?.pump();
    sendJson(res, 202, { ok: true });
  });
  router.on("GET", "/api/queue", (_req, res) => sendJson(res, 200, hooks ? hooks.snapshot() : { running: [], queued: [], paused: [], failedRollouts: [], failed: [] }));
  router.on("POST", "/api/queue/resume", async (req, res) => {
    const body = await readBody<{ hook: string }>(req);
    if (!hooks) return sendProblem(res, 409, "No queue", "This process does not run hooks.");
    sendJson(res, 200, { resumed: hooks.resume(body.hook) });
  });
  router.on("POST", "/api/queue/wait", async (req, res) => {
    const body = await readBody<{ deck: string; timeoutMs: number }>(req);
    sendJson(res, 200, { pending: hooks ? await hooks.idle(body.deck, body.timeoutMs) : [] });
  });
}
