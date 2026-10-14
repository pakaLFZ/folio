/**
 * The deck's vocabulary bank over HTTP: `GET /<deck8>/vocabulary` the
 * resolved bank with each entry's origin, `POST` one change to the deck's own
 * bank against the revision the editor saw.
 */
import { isEditLog, type VocabOp } from "@folio/core";
import type { FolioApp } from "./app.js";
import { readBody, sendJson, sendProblem, type Router } from "./httpkit.js";
import { deckOr404 } from "./routes-deck.js";
import type { DeckStore } from "./deckstore.js";
import { changeDeckBank, deckBank, deckOrigin } from "./vocab.js";

/** The bank as the editor shows it: entries with origins, the sections an agent reads, the revision. */
export function vocabularyView(app: FolioApp, store: DeckStore) {
  const bank = deckBank(app.workspace, store);
  const { resolved } = bank;
  return {
    rev: bank.rev,
    own: deckOrigin(store),
    hasOwn: bank.own !== null,
    pack: app.workspace.packOf(store)?.pack.name ?? null,
    wordsHeading: resolved.wordsHeading,
    entries: resolved.entries,
    sections: resolved.sections.filter((s) => s.heading !== resolved.wordsHeading && !isEditLog(s.heading)).map((s) => ({ heading: s.heading, text: s.lines.join("\n"), origin: s.origin })),
    problems: bank.problems,
  };
}

/** Register the vocabulary routes. */
export function vocabRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/:deck/vocabulary", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, vocabularyView(app, store));
  });
  router.on("POST", "/:deck/vocabulary", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ rev?: string; op?: VocabOp }>(req);
    if (!body?.op || !["set", "delete", "section"].includes(body.op.kind)) return sendProblem(res, 400, "Bad change", 'The body is {"rev": "...", "op": {"kind": "set" | "delete" | "section", ...}}.');
    const result = await changeDeckBank(app.workspace, store, body.op, body.rev ?? null);
    if (!result.ok) return sendProblem(res, result.status, result.status === 409 ? "Bank changed" : "Change refused", result.reason, { current: vocabularyView(app, store) });
    app.vocabularyTouched(store);
    sendJson(res, 200, vocabularyView(app, store));
  });
}
