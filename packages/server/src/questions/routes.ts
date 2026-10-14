/**
 * Questionnaire routes: agents post (into a comment conversation) and
 * withdraw, the user answers, anyone reads. A refusal is RFC 9457 with `problems`, one line per field and fix.
 */
import type { AnswerValue } from "@folio/core";
import type { ServerResponse } from "node:http";
import type { FolioApp } from "../app.js";
import { readBody, sendJson, sendProblem, type Router } from "../httpkit.js";
import { deckOr404, workerOf } from "../routes-deck.js";
import { QuestionError, type QuestionService } from "./service.js";

/** Send a service result, or its refusal. */
function reply(res: ServerResponse, status: number, run: () => unknown): void {
  try {
    sendJson(res, status, run());
  } catch (error) {
    if (!(error instanceof QuestionError)) throw error;
    sendProblem(res, error.status, "Questionnaire refused", error.problems.join("\n"), { problems: error.problems });
  }
}

/**
 * Register the routes.
 *
 * @param router - the router.
 * @param app - the server state.
 * @param questions - the questionnaire service.
 */
export function questionRoutes(router: Router, app: FolioApp, questions: QuestionService): void {
  router.on("GET", "/:deck/questions", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, { questions: questions.list(store) });
  });
  router.on("GET", "/:deck/questions/:id", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    const q = store ? questions.get(store, p.id!) : null;
    if (store && !q) return sendProblem(res, 404, "No such questionnaire", p.id!);
    if (q) sendJson(res, 200, q);
  });
  router.on("POST", "/:deck/questions", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<unknown>(req).catch((error: Error) => new QuestionError(422, [`(root): the body is not JSON (${error.message})`]));
    reply(res, 201, () => {
      if (body instanceof QuestionError) throw body;
      return questions.ask(store, body, workerOf(req));
    });
  });
  router.on("POST", "/:deck/questions/:id/answers", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ answers?: Record<string, AnswerValue> } | null>(req);
    reply(res, 200, () => questions.answer(store, p.id!, body?.answers as Record<string, AnswerValue>, workerOf(req)));
  });
  router.on("POST", "/:deck/questions/:id/withdraw", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) reply(res, 200, () => questions.withdraw(store, p.id!));
  });
}
