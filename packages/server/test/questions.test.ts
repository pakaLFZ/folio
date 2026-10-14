import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commentTurn, inboxIndex, makeSlideSpec, type FolioComment } from "@folio/core";
import { FolioApp } from "../src/app.js";
import { CommentService } from "../src/comments/service.js";
import { listComments, readComment } from "../src/comments/store.js";
import { loadConfig } from "../src/config.js";
import type { DeckStore } from "../src/deckstore.js";
import { listQuestions, QuestionError, QuestionService } from "../src/questions/service.js";
import { fileURLToPath } from "node:url";

const nusIcl = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));
const opened: FolioApp[] = [];

/** Services over a temporary workspace with one two-slide deck, recording the events emitted. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "folio-q-"));
  cpSync(nusIcl, join(root, "templates/lectern"), { recursive: true });
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  const deck = join(root, "decks/talk");
  mkdirSync(join(deck, "slides"), { recursive: true });
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "c0ffee00c0ffee00", title: "Talk", template: "lectern@1", order: ["s001", "s002"] }));
  for (const id of ["s001", "s002"]) writeFileSync(join(deck, `slides/${id}.json`), JSON.stringify(makeSlideSpec("note-figure", { title: id })));
  const app = new FolioApp(loadConfig(root));
  opened.push(app);
  const events: { type: string; data: { question?: { id: string; answers: { round: number } | null } } }[] = [];
  app.listen((_token, type, data) => void events.push({ type, data: data as never }));
  const comments = new CommentService(app);
  const store = app.workspace.findDeck("talk")!;
  return { app, comments, service: new QuestionService(app, comments), store, events };
}

afterEach(async () => {
  for (const app of opened.splice(0)) await app.close();
});

const input = { title: "Pick one", intro: "Only you know.", slide: "s002", questions: [{ id: "a", prompt: "A or B?", kind: "single", options: ["A", "B"], required: true }] };

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof QuestionError ? { status: e.status, problems: e.problems } : null;
  }
  return null;
};

const unread = (store: DeckStore, c: FolioComment) => inboxIndex([{ comment: c, deckTitle: store.deck.title, orphaned: null }], {}, "user")[0]!;

describe("QuestionService", () => {
  it("without a comment, starts a conversation the asker holds and the user follows, with one unread message", () => {
    const { service, store, events } = setup();
    const q = service.ask(store, input, "w1");
    expect([q.status, q.asker, q.answers]).toEqual(["open", "w1", null]);
    expect(JSON.parse(readFileSync(join(store.dir, "questions", `${q.id}.json`), "utf8")).comment).toBe(q.comment);
    const c = readComment(store, q.comment)!;
    expect([c.slide, c.assignee, c.followers, c.thread.length, c.thread[0]!.author, c.thread[0]!.text, c.thread[0]!.question]).toEqual(["s002", "w1", ["w1", "user"], 1, "w1", "Pick one\n\nOnly you know.", { id: q.id, status: "open" }]);
    const row = unread(store, c);
    expect([row.unread, row.turn, row.view]).toEqual([1, "user", "review"]);
    expect(events.map((e) => e.type)).toContain("question.posted");
  });
  it("with a comment, appends the questionnaire to that thread", () => {
    const { comments, service, store } = setup();
    const c = comments.create(store, { slide: "s001", region: null, marks: [], text: "which colour?" }, "user");
    const q = service.ask(store, { ...input, comment: c.id }, "w1");
    const after = readComment(store, c.id)!;
    expect([q.comment, after.thread.length, after.thread[1]!.question?.id, commentTurn(after.thread)]).toEqual([c.id, 2, q.id, "user"]);
    expect(listComments(store)).toHaveLength(1);
  });
  it("refuses an unknown slide, an unknown comment and a resolved one by name", () => {
    const { comments, service, store } = setup();
    expect(refusal(() => service.ask(store, { ...input, slide: "s999" }, "w1"))).toEqual({ status: 422, problems: ["slide: s999 is not a slide of Talk; give one of s001, s002 or leave it out"] });
    expect(refusal(() => service.ask(store, { ...input, comment: "cnope" }, "w1"))?.problems[0]).toMatch(/^comment: no comment cnope in Talk; .*leave it out to start a new conversation$/);
    const c = comments.create(store, { slide: "s001", region: null, marks: [], text: "x" }, "user");
    comments.setStatus(store, c.id, "resolved", "user");
    expect(refusal(() => service.ask(store, { ...input, comment: c.id }, "w1"))?.problems[0]).toMatch(/^comment: .* is resolved/);
  });
  it("takes the user's answers without a new message, refuses a worker's and an incomplete one, and keeps rounds", () => {
    const { service, store, events } = setup();
    const q = service.ask(store, input, "w1");
    expect(refusal(() => service.answer(store, q.id, { a: "A" }, "w1"))?.status).toBe(403);
    expect(refusal(() => service.answer(store, q.id, {}, "user"))).toEqual({ status: 422, problems: ["answers.a: A or B? is required"] });
    const first = service.answer(store, q.id, { a: "A" }, "user");
    const second = service.answer(store, q.id, { a: "B" }, "user");
    expect([first.status, first.answers!.round, second.answers!.round, second.history[0]!.values.a]).toEqual(["answered", 1, 2, "A"]);
    expect(events.filter((e) => e.type === "question.answered").map((e) => e.data.question!.answers!.round)).toEqual([1, 2]);
    const c = readComment(store, q.comment)!;
    expect([c.thread.length, c.thread[0]!.question?.status, commentTurn(c.thread)]).toEqual([1, "answered", "agent"]);
  });
  it("withdraws without deleting, and then takes no answers", () => {
    const { service, store, events } = setup();
    const q = service.ask(store, input, "w1");
    expect(service.withdraw(store, q.id).status).toBe("withdrawn");
    expect(listQuestions(store).map((x) => x.status)).toEqual(["withdrawn"]);
    expect(refusal(() => service.answer(store, q.id, { a: "A" }, "user"))?.status).toBe(409);
    expect(events.at(-1)!.type).toBe("question.withdrawn");
    expect(readComment(store, q.comment)!.thread[0]!.question?.status).toBe("withdrawn");
  });
  it("links an older file without a comment once, leaving the file as it was", () => {
    const { service, store } = setup();
    const old = { ...input, id: "qold1", deck: store.token, asker: "w9", status: "open", answers: null, history: [], createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z" };
    mkdirSync(join(store.dir, "questions"), { recursive: true });
    const file = join(store.dir, "questions", "qold1.json");
    writeFileSync(file, JSON.stringify(old));
    const first = service.get(store, "qold1")!;
    const again = service.list(store)[0]!;
    expect([first.comment, again.comment, listComments(store).length, readFileSync(file, "utf8")]).toEqual([again.comment, first.comment, 1, JSON.stringify(old)]);
    expect(readComment(store, first.comment)!.thread[0]).toMatchObject({ author: "w9", question: { id: "qold1", status: "open" } });
  });
});
