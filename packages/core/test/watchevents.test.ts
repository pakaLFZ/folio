import { describe, expect, it } from "vitest";
import { answersEvent, clipWatchText, commentEvents, commentEventsSince, parseWatchTopics, viewingEvent, watchLine, type FolioComment, type Questionnaire, type ViewingTab } from "../src/index.js";

const msg = (author: string, text: string, at: string) => ({ author, text, at });
const comment = (thread: { author: string; text: string; at: string }[], status: FolioComment["status"] = "open"): FolioComment => ({
  id: "c1", deck: "tok", slide: "s004", slideRev: "r", region: [0, 0, 10, 10], marks: [], components: [{ slot: "title", role: "title" }],
  shots: null, thread, status, assignee: null, createdAt: thread[0]!.at, updatedAt: "2026-10-13T10:00:09.000Z",
});
const kinds = (events: { kind: string }[]) => events.map((e) => e.kind);

describe("commentEvents", () => {
  const first = msg("user", "make it red", "2026-10-13T10:00:01.000Z");
  it("reports the user's new comment", () => {
    const events = commentEvents(undefined, comment([first]), "decks/talk", "user");
    expect(events).toMatchObject([{ kind: "comment", id: "c1", deck: "decks/talk", slide: "s004", slots: ["title"], author: "user", read: "folio comment show c1" }]);
  });
  it("never reports an agent's reply, a screenshot update or an agent's comment", () => {
    const seen = { messages: 1, status: "open" as const };
    expect(commentEvents(seen, comment([first, msg("w1", "done", "2026-10-13T10:00:02.000Z")], "answered"), "decks/talk", "user")).toEqual([]);
    expect(commentEvents(seen, comment([first]), "decks/talk", "user")).toEqual([]);
    expect(commentEvents(undefined, comment([msg("w1", "question", "2026-10-13T10:00:01.000Z")]), "decks/talk", "user")).toEqual([]);
  });
  it("reports the user's follow-up, also on an answered thread, once", () => {
    const thread = [first, msg("w1", "done", "2026-10-13T10:00:02.000Z"), msg("user", "and bigger", "2026-10-13T10:00:03.000Z")];
    expect(kinds(commentEvents({ messages: 2, status: "answered" }, comment(thread, "open"), "decks/talk", "user"))).toEqual(["message"]);
  });
  it("reports a reopen and a hold without a message", () => {
    expect(kinds(commentEvents({ messages: 1, status: "resolved" }, comment([first], "open"), "d", "user"))).toEqual(["reopened"]);
    expect(kinds(commentEvents({ messages: 1, status: "open" }, comment([first], "held"), "d", "user"))).toEqual(["held"]);
    expect(commentEvents({ messages: 1, status: "open" }, comment([first], "answered"), "d", "user")).toEqual([]);
  });
  it("lists the user's messages after --since", () => {
    const thread = [first, msg("w1", "ok", "2026-10-13T10:00:02.000Z"), msg("user", "more", "2026-10-13T10:00:03.000Z")];
    expect(kinds(commentEventsSince(comment(thread), "d", "user", "2026-10-13T10:00:00.000Z"))).toEqual(["comment", "message"]);
    expect(kinds(commentEventsSince(comment(thread), "d", "user", "2026-10-13T10:00:01.000Z"))).toEqual(["message"]);
  });
});

describe("answersEvent", () => {
  const q = { id: "q1", deck: "tok", title: "Framing", slide: "s002", questions: [], asker: "w1", status: "answered", history: [], createdAt: "a", updatedAt: "2026-10-13T10:00:05.000Z",
    answers: { by: "user", at: "2026-10-13T10:00:05.000Z", round: 1, values: { framing: "Numbers", keep: ["a", { other: "z" }] } } } as unknown as Questionnaire;
  it("reports a submission once, with the answers in the text", () => {
    const e = answersEvent(undefined, q, "decks/talk", "user");
    expect(e).toMatchObject({ kind: "answers", id: "q1", read: "folio answers decks/talk q1", text: 'Framing: framing=Numbers; keep=a,{"other":"z"}' });
    expect(answersEvent(q.updatedAt, q, "decks/talk", "user")).toBeNull();
    expect(answersEvent(undefined, { ...q, status: "open", answers: null }, "d", "user")).toBeNull();
  });
});

describe("viewingEvent", () => {
  const tab = (slide: string): ViewingTab => ({ tab: "t1", deck: "decks/talk", token: "tok", title: "Talk", slide: { id: slide, position: 2, of: 9, layout: "x", title: "" }, mode: "edit", selection: { slot: null, slides: [] }, visible: true, focused: true, activeSecondsAgo: 0 });
  it("reports a move to another slide only", () => {
    expect(viewingEvent(tab("s002"), tab("s003"), "user", "t")).toMatchObject({ kind: "viewing", slide: "s003", read: "folio viewing" });
    expect(viewingEvent(tab("s002"), tab("s002"), "user", "t")).toBeNull();
  });
});

describe("the line", () => {
  it("clips long text on one line", () => {
    const clipped = clipWatchText(`a\nb ${"x".repeat(300)}`);
    expect(clipped.length).toBe(200);
    expect(clipped.startsWith("a b ")).toBe(true);
    expect(clipped.endsWith("...")).toBe(true);
  });
  it("prints time, kind, id, deck, slide, slots, author, text and the command", () => {
    const [e] = commentEvents(undefined, comment([msg("user", 'say "hi"', "2026-10-13T10:00:01.000Z")]), "decks/talk", "user");
    expect(watchLine(e!)).toBe('2026-10-13T10:00:01.000Z comment c1 decks/talk s004 [title] user: "say \\"hi\\"" -> folio comment show c1');
    expect(JSON.parse(watchLine(e!, true))).toMatchObject({ kind: "comment", text: 'say "hi"' });
  });
  it("parses --for", () => {
    expect(parseWatchTopics(undefined)).toEqual(["comments", "answers"]);
    expect(parseWatchTopics("viewing,comments")).toEqual(["viewing", "comments"]);
    expect(() => parseWatchTopics("drafts")).toThrow(/comments,answers,viewing/);
  });
});
