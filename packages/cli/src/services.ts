/**
 * The services attached to an app: the hook queue, the comments and (in the
 * serving process) the PDF export, their routes, and the text they add to `check`, `status` and `pdf`.
 */
import { join } from "node:path";
import { relative } from "@folio/server";
import { commentLink, commentTurn, rankOf } from "@folio/core";
import {
  CommentService, FIGURE_WAIT_MS, HookService, PdfBrowser, PlaywrightShots, QuestionService, commentRoutes, exportDeckPdf, exportDeckPptx, hookRoutes, listComments, pdfRoutes, pptxRoutes, printDeck, questionRoutes, shotsDir,
  type DeckStore, type FolioApp, type Router,
} from "@folio/server";

export interface Services {
  hooks: HookService;
  comments: CommentService;
  questions: QuestionService;
  routes: (router: Router) => void;
  setBase: (base: string) => void;
  close: () => Promise<void>;
}

const attached = new WeakMap<FolioApp, Services>();

/**
 * Attach the services to an app.
 *
 * @param app - the app.
 * @param run - true in `folio serve`: the hook queue runs, comment
 *   screenshots are taken and the editor's PDF export is served. False for `check`, `status` and headless pages.
 * @returns the services.
 */
export function attachServices(app: FolioApp, run: boolean): Services {
  const existing = attached.get(app);
  if (existing) return existing;
  const hooks = new HookService(app, app.config.memoryMb);
  const comments = new CommentService(app);
  const questions = new QuestionService(app, comments);
  let base = `http://127.0.0.1:${app.config.port}`;
  const shots = run ? new PlaywrightShots(() => base) : null;
  const pdfBrowser = run ? new PdfBrowser() : null;
  comments.shots = shots;
  if (run) hooks.start();
  if (run) questions.adoptAll();
  app.deckSummary = (store) => {
    const warnings = app.warnings.deckWarnings(store).filter((w) => w.state !== "absent" && !w.ack);
    const count = (s: string) => warnings.filter((w) => w.severity === s).length;
    return { openComments: listComments(store).length, warnings: { error: count("error"), warning: count("warning"), note: count("note") } };
  };
  const services: Services = {
    hooks,
    comments,
    questions,
    routes: (router) => {
      hookRoutes(router, app, run ? hooks : null);
      commentRoutes(router, app, comments);
      questionRoutes(router, app, questions);
      const remeasure = (store: DeckStore) => async (measured: Record<string, unknown>) => {
        for (const slide of Object.keys(measured)) app.notify(store.token, "measured", { slide });
        await hooks.idle(store.token, FIGURE_WAIT_MS);
      };
      if (pdfBrowser) pdfRoutes(router, app, (store) => exportDeckPdf(store, (token) => hooks.idle(token, FIGURE_WAIT_MS), async (s) => printDeck(app, s, await pdfBrowser.get(), base), remeasure(store)));
      if (pdfBrowser) pptxRoutes(router, app, async (store) => {
        await hooks.idle(store.token, FIGURE_WAIT_MS);
        return exportDeckPptx(app, store, pdfBrowser, base);
      });
    },
    setBase: (b) => void (base = b),
    close: async () => {
      hooks.close();
      await shots?.close();
      await pdfBrowser?.close();
    },
  };
  attached.set(app, services);
  return services;
}

/**
 * The open-comment table printed before warnings, so a worker sees outstanding
 * comments every time it compiles.
 *
 * @returns text, empty when the deck has no open comments.
 */
export function commentPreamble(app: FolioApp, store: DeckStore): string {
  const { comments } = attachServices(app, false);
  const open = listComments(store).filter((c) => c.status !== "resolved").sort((a, b) => rankOf(a) - rankOf(b));
  if (!open.length) return "";
  const lines = [`${open.length} open comment${open.length === 1 ? "" : "s"} on ${store.deck.title}:`];
  for (const c of open) {
    const last = c.thread[c.thread.length - 1];
    const turn = c.status === "held" ? "held by the user: do not work on it" : c.status === "answered" ? "answered, user to resolve" : commentTurn(c.thread, comments.user) === "agent" ? "agent's turn" : "user's turn";
    const shots = c.shots ? relative(app.config.root, join(shotsDir(store, c.id), c.shots.region)) : "screenshots pending";
    lines.push(`  ${c.id}  ${c.slide}  [${c.components.map((k) => k.slot).join(", ") || "whole slide"}]  ${turn}${c.assignee ? `  assigned ${c.assignee}` : ""}`);
    lines.push(`      ${last?.author}: ${(last?.text ?? "").replace(/\s+/g, " ").slice(0, 140)}`);
    lines.push(`      ${shots}  ${commentLink(`http://localhost:${app.config.port}/`, store.token, c.slide, c.id)}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * One line on the hook queue for `status`, from the queue ledger.
 *
 * @returns text, empty when nothing is paused or failed.
 */
export function queueLine(app: FolioApp): string {
  const ledger = attachServices(app, false).hooks.ledger;
  const paused = ledger.pausedStamps();
  const failed = ledger.failedRollouts();
  const parts = [...paused.map((p) => `paused ${p.stamp} after ${p.failures} failures`), ...failed.map((f) => `rollout stopped ${f.stamp}: ${f.reason}`)];
  return parts.length ? `hooks: ${parts.join("; ")} (folio queue resume <hook>)\n` : "";
}

/** Attach the reporting side of the services (used by check, status, pdf). */
export function configureServices(app: FolioApp): void {
  attachServices(app, false);
}
