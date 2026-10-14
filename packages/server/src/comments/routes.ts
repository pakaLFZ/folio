/**
 * Comment and inbox routes. Deck routes carry one deck's comments, drafts and
 * screenshots; `/api/inbox` covers every deck of the workspace.
 */
import { filterInbox, inboxCounts, inboxIndex, type Box, type InboxQuery, type InboxRow, type InboxView, type Mark } from "@folio/core";
import type { FolioApp } from "../app.js";
import { readBody, sendFile, sendJson, sendProblem, type Router } from "../httpkit.js";
import type { DeckStore } from "../deckstore.js";
import { deckOr404, workerOf } from "../routes-deck.js";
import { stagedPath, stageUpload } from "./attachments.js";
import { searchQueryOf, searchWorkspace } from "./search.js";
import type { CommentService } from "./service.js";
import { listComments, listDrafts, markRead, readComment, readState, retireDraft, saveDraft, shotsDir, type Draft } from "./store.js";

/**
 * The inbox rows of the whole workspace, drafts included.
 *
 * @returns rows for every draft of the user and every comment.
 */
export function inboxRows(app: FolioApp, comments: CommentService): InboxRow[] {
  const all = [...app.workspace.decks.values()].flatMap((store) => listComments(store, true).map((comment) => ({ comment, deckTitle: store.deck.title, orphaned: comment.status === "resolved" ? null : comments.orphanReason(store, comment) })));
  const rows = inboxIndex(all, readState(app.config.root, comments.user), comments.user);
  const drafts = [...app.workspace.decks.values()].flatMap((store) => listDrafts(store, comments.user).map((d): InboxRow => ({
    id: d.id, deck: store.token, deckTitle: store.deck.title, slide: d.slide, slots: [], roles: [], status: "draft", view: "drafts", turn: "user",
    lastMessage: d.text, lastAuthor: comments.user, authors: [comments.user], assignee: null, rank: 0, updatedAt: d.updatedAt, createdAt: d.updatedAt, unread: 0, following: true, followers: [comments.user], orphaned: null, text: d.text.toLowerCase(),
  })));
  return [...drafts, ...rows];
}

/**
 * Register the routes.
 *
 * @param router - the router.
 * @param app - the server state.
 * @param comments - the comment service.
 */
export function commentRoutes(router: Router, app: FolioApp, comments: CommentService): void {
  router.on("GET", "/api/comments/search", (_req, res, _p, url) => {
    try {
      sendJson(res, 200, searchWorkspace([...app.workspace.decks.values()], searchQueryOf(url.searchParams), comments.user));
    } catch (error) {
      sendProblem(res, 400, "Search refused", (error as Error).message);
    }
  });
  router.on("GET", "/:deck/comments", (_req, res, p, url) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, { comments: listComments(store, url.searchParams.has("archived")).map((c) => ({ ...c, orphaned: comments.orphanReason(store, c) })) });
  });
  router.on("GET", "/:deck/comments/:cid", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    const c = store ? readComment(store, p.cid!) : null;
    if (store && !c) return sendProblem(res, 404, "No such comment", p.cid!);
    if (store && c) sendJson(res, 200, { ...c, orphaned: comments.orphanReason(store, c) });
  });
  router.on("GET", "/:deck/comments/:cid/:file", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store && !(/^(shot-[a-z]+(-\d+)?\.png|att-\d+-[A-Za-z0-9._-]+)$/.test(p.file!) && sendFile(res, shotsDir(store, p.cid!), p.file!))) sendProblem(res, 404, "No such file", p.file!);
  });
  commentWriteRoutes(router, app, comments);
  draftRoutes(router, app, comments);
  uploadRoutes(router, app);
  inboxRoutes(router, app, comments);
}

/** Creating, replying and status. */
function commentWriteRoutes(router: Router, app: FolioApp, comments: CommentService): void {
  router.on("POST", "/:deck/comments", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ slide: string; region: Box | null; marks?: Mark[]; text: string; draft?: string; uploads?: string[] }>(req);
    if (!body?.text?.trim() && !body?.uploads?.length) return sendProblem(res, 422, "Empty comment", "A comment needs a message or an attachment.");
    const comment = comments.create(store, { slide: body.slide, region: body.region, marks: body.marks ?? [], text: (body.text ?? "").trim(), uploads: body.uploads ?? [] }, workerOf(req));
    if (body.draft) retireDraft(store, comments.user, body.draft);
    sendJson(res, 201, comment);
  });
  router.on("POST", "/:deck/comments/:cid/reply", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ text: string; answered?: boolean; uploads?: string[] }>(req);
    try {
      sendJson(res, 200, comments.reply(store, p.cid!, workerOf(req), (body.text ?? "").trim(), !!body.answered, body.uploads ?? []));
    } catch (error) {
      sendProblem(res, 404, "Reply refused", (error as Error).message);
    }
  });
  router.on("POST", "/:deck/comments/:cid/status", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ status: "open" | "answered" | "resolved" }>(req);
    try {
      sendJson(res, 200, comments.setStatus(store, p.cid!, body.status, workerOf(req)));
    } catch (error) {
      sendProblem(res, 403, "Status refused", (error as Error).message);
    }
  });
  commentMetaRoutes(router, app, comments);
}

/** Following, assignment and re-taking the screenshots. */
function commentMetaRoutes(router: Router, app: FolioApp, comments: CommentService): void {
  router.on("POST", "/:deck/comments/:cid/reshoot", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ force?: boolean }>(req);
    try {
      sendJson(res, 200, await comments.reshoot(store, p.cid!, !!body?.force));
    } catch (error) {
      sendProblem(res, 404, "Reshoot refused", (error as Error).message);
    }
  });
  router.on("POST", "/:deck/comments/:cid/follow", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<{ follow: boolean }>(req);
    try {
      sendJson(res, 200, comments.follow(store, p.cid!, workerOf(req), body.follow !== false));
    } catch (error) {
      sendProblem(res, 404, "Follow refused", (error as Error).message);
    }
  });
  router.on("POST", "/:deck/comments/:cid/assign", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, comments.assign(store, p.cid!, (await readBody<{ assignee: string | null }>(req)).assignee ?? null));
  });
}

/** Drafts: listed, saved about once a second, retired on send or discard. */
function draftRoutes(router: Router, app: FolioApp, comments: CommentService): void {
  router.on("GET", "/:deck/drafts", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store) sendJson(res, 200, { drafts: listDrafts(store, comments.user) });
  });
  router.on("PUT", "/:deck/drafts/:id", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const body = await readBody<Draft>(req);
    saveDraft(store, comments.user, { ...body, id: p.id!, deck: store.token, updatedAt: new Date().toISOString() });
    app.hub.publish(store.token, "draft", { id: p.id }, "reading", p.id);
    sendJson(res, 200, { ok: true });
  });
  router.on("POST", "/:deck/drafts/:id/discard", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const discarded = retireDraft(store, comments.user, p.id!);
    if (discarded) app.hub.publish(store.token, "draft", { id: p.id }, "reading", p.id);
    sendJson(res, 200, { discarded });
  });
}

/**
 * The workspace inbox: rows, counts, read state and bulk actions. `scope=<token>`
 * narrows rows, counts and unread to one deck (the board in single deck mode).
 */
function inboxRoutes(router: Router, app: FolioApp, comments: CommentService): void {
  router.on("GET", "/api/inbox", (_req, res, _p, url) => {
    const q: InboxQuery = Object.fromEntries([...url.searchParams].map(([k, v]) => [k, /Days$/.test(k) ? Number(v) : v]));
    const scope = url.searchParams.get("scope");
    const rows = inboxRows(app, comments).filter((r) => !scope || r.deck === scope);
    const unread = rows.reduce((n, r) => n + (r.view !== "done" && r.following ? r.unread : 0), 0);
    sendJson(res, 200, { rows: filterInbox(rows, q), counts: inboxCounts(rows), unread });
  });
  router.on("POST", "/api/inbox/read", async (req, res) => {
    markRead(app.config.root, comments.user, (await readBody<{ seen: Record<string, number> }>(req)).seen);
    sendJson(res, 200, { ok: true });
  });
  router.on("POST", "/api/inbox/move", async (req, res) => {
    const body = await readBody<{ deck: string; id: string; column: "queue" | "held" | "review" | "done" | "progress"; rank?: number }>(req);
    const store = app.workspace.decks.get(body.deck);
    if (!store) return sendProblem(res, 404, "No such deck", body.deck);
    try {
      sendJson(res, 200, comments.move(store, body.id, body.column, body.rank, workerOf(req)));
    } catch (error) {
      sendProblem(res, 409, "Move refused", (error as Error).message);
    }
  });
  router.on("POST", "/api/inbox/claim", async (req, res) => {
    const claimed = comments.claimNext([...app.workspace.decks.values()], workerOf(req));
    sendJson(res, 200, claimed ? { deck: claimed.store.token, comment: claimed.comment } : { deck: null, comment: null });
  });
  router.on("POST", "/api/inbox/bulk", async (req, res) => {
    const body = await readBody<{ items: { deck: string; id: string }[]; action: "resolve" | "reopen" | "assign" | "hold"; assignee?: string | null }>(req);
    const done: string[] = [];
    for (const item of body.items) {
      const store = app.workspace.decks.get(item.deck);
      if (!store) continue;
      if (body.action === "assign") comments.assign(store, item.id, body.assignee ?? null);
      else comments.move(store, item.id, body.action === "resolve" ? "done" : body.action === "hold" ? "held" : "queue", undefined, workerOf(req));
      done.push(item.id);
    }
    sendJson(res, 200, { done });
  });
  router.on("POST", "/api/inbox/clear", async (req, res) => {
    const body = await readBody<{ column: InboxView; cards: { deck: string; id: string }[] }>(req);
    if (!INBOX_VIEWS.includes(body?.column) || !Array.isArray(body.cards)) return sendProblem(res, 422, "Clear refused", `name a column (${INBOX_VIEWS.join(", ")}) and its cards as [{deck, id}]`);
    try {
      sendJson(res, 200, clearCards(app, comments, body.column, body.cards, workerOf(req)));
    } catch (error) {
      sendProblem(res, 403, "Clear refused", (error as Error).message);
    }
  });
}

const INBOX_VIEWS: InboxView[] = ["drafts", "queue", "progress", "review", "held", "done"];

/** Retire drafts to the drafts archive. */
function discardDrafts(store: DeckStore, user: string, ids: string[]): { cleared: string[]; skipped: string[] } {
  const cleared = ids.filter((id) => retireDraft(store, user, id));
  return { cleared, skipped: ids.filter((id) => !cleared.includes(id)) };
}

/**
 * Clear the cards of one board column, deck by deck, in one synchronous pass:
 * drafts move to the drafts archive, task cards are resolved, Done cards leave the board.
 *
 * @returns the cards cleared and the cards skipped (gone, or no longer in the column).
 */
function clearCards(app: FolioApp, comments: CommentService, column: InboxView, cards: { deck: string; id: string }[], by: string) {
  if (by !== comments.user) throw new Error("only the user clears a column");
  const out = { cleared: [] as { deck: string; id: string }[], skipped: [] as { deck: string; id: string }[] };
  for (const deck of new Set(cards.map((c) => c.deck))) {
    const store = app.workspace.decks.get(deck);
    const ids = cards.filter((c) => c.deck === deck).map((c) => c.id);
    const result = !store ? { cleared: [], skipped: ids } : column === "drafts" ? discardDrafts(store, comments.user, ids) : comments.clear(store, column, ids, by);
    out.cleared.push(...result.cleared.map((id) => ({ deck, id })));
    out.skipped.push(...result.skipped.map((id) => ({ deck, id })));
    if (store && column === "drafts" && result.cleared.length) app.hub.publish(store.token, "draft", { ids: result.cleared }, "reading", result.cleared[0]!);
  }
  return out;
}

/** Uploads: streamed into staging, then claimed by a comment or reply. */
function uploadRoutes(router: Router, app: FolioApp): void {
  router.on("POST", "/:deck/uploads", async (req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    const name = decodeURIComponent(String(req.headers["x-file-name"] ?? "file"));
    try {
      sendJson(res, 201, await stageUpload(store, req, name, String(req.headers["content-type"] ?? "")));
    } catch (error) {
      sendProblem(res, 413, "Upload refused", (error as Error).message);
    }
  });
  router.on("GET", "/:deck/uploads/:file", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (store && !(/^u[0-9a-z]+-[A-Za-z0-9._-]+$/.test(p.file!) && sendFile(res, stagedPath(store), p.file!))) sendProblem(res, 404, "No such upload", p.file!);
  });
}
