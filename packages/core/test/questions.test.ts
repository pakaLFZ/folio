import { describe, expect, it } from "vitest";
import { checkAnswers, checkQuestionnaire, commentTurn, initialAnswers, questionMessageText, withAnswers, type CommentMessage, type Questionnaire } from "../src/index.js";

const good = {
  title: "Which framing?",
  slide: "s002",
  questions: [
    { id: "framing", prompt: "Lead with?", kind: "single", options: ["Mechanism", "Numbers"], other: true, required: true },
    { id: "keep", prompt: "Keep which?", kind: "multi", options: ["a", "b", "c"], min: 1, max: 2, default: ["a"] },
    { id: "name", prompt: "Name", kind: "text", placeholder: "..." },
    { id: "notes", prompt: "Notes", kind: "long", required: true },
  ],
};

const problemsOf = (input: unknown) => {
  const r = checkQuestionnaire(input);
  return r.ok ? [] : r.problems;
};

describe("checkQuestionnaire", () => {
  it("accepts every kind", () => expect(checkQuestionnaire(good).ok).toBe(true));
  it("names a missing title and its fix", () => expect(problemsOf({ ...good, title: "" })).toEqual(['title: required; give "title": "what you are asking, in a few words"']));
  it("refuses a single question with one option", () => {
    const bad = structuredClone(good);
    bad.questions[0]!.options = ["Only"];
    expect(problemsOf(bad)).toContain('questions[0].options: a single question needs at least two options; give "options": ["...", "..."]');
  });
  it("refuses a duplicate id, an unknown key and a missing kind", () => {
    const p = problemsOf({ title: "t", questions: [{ id: "a", prompt: "p", kind: "text", colour: 1 }, { id: "a", prompt: "p" }] });
    expect(p).toContain("questions[0].colour: unknown field; the fields are id, prompt, kind, options, other, min, max, placeholder, required, default");
    expect(p).toContain("questions[1].kind: must be one of single, multi, text, long");
    expect(p).toContain('questions: id "a" is used twice; give each question its own id');
  });
  it("refuses a top-level unknown key, a default outside the options and min above max", () => {
    const bad = structuredClone(good) as Record<string, unknown> & typeof good;
    bad.status = "answered";
    (bad.questions[0] as Record<string, unknown>).default = "Neither";
    Object.assign(bad.questions[1]!, { min: 2, max: 1 });
    const p = problemsOf(bad);
    expect(p[0]).toMatch(/^status: unknown field/);
    expect(p).toContain("questions[0].default: must be one of the options (Mechanism, Numbers)");
    expect(p).toContain("questions[1].min: is more than max (2 > 1); lower min or raise max");
  });
  it("refuses a region without a slide and options on a text question", () => {
    const p = problemsOf({ title: "t", region: [0, 0, 10, 10], questions: [{ id: "a", prompt: "p", kind: "text", options: ["x", "y"] }] });
    expect(p).toContain('region: points at a slide; give "slide": "<slide id>" with it');
    expect(p).toContain('questions[0].options: only a single or multi question takes options; remove it or change "kind"');
  });
  it("takes a comment id and refuses a blank one", () => {
    expect(checkQuestionnaire({ ...good, comment: "c1" }).ok).toBe(true);
    expect(problemsOf({ ...good, comment: "" })).toEqual(["comment: must be a non-empty string, or left out"]);
  });
});

describe("checkAnswers", () => {
  const qs = checkQuestionnaire(good).ok ? (good.questions as Questionnaire["questions"]) : [];
  it("passes a complete answer, Other included", () => expect(checkAnswers(qs, { framing: { other: "Both" }, keep: ["a", "c"], notes: "x" })).toEqual([]));
  it("names missing required questions", () => expect(checkAnswers(qs, { keep: ["a"] }).map((r) => `${r.id} ${r.problem}`)).toEqual(["framing is required", "notes is required"]));
  it("refuses a value outside the options, Other where not allowed, and a count outside min/max", () => {
    const r = checkAnswers(qs, { framing: "Neither", keep: ["a", "b", "c"], notes: "x", nope: "y" }).map((x) => `${x.id} ${x.problem}`);
    expect(r).toEqual(['framing "Neither" is not one of its options', "keep takes at most 2 choices", "nope is not a question of this questionnaire"]);
    expect(checkAnswers(qs, { framing: "Numbers", keep: [{ other: "d" }], notes: "x" })[0]!.problem).toBe("has no Other choice");
  });
});

describe("answer flow", () => {
  const q: Questionnaire = { ...(good as unknown as Questionnaire), id: "q1", deck: "d", comment: "c1", asker: "w1", status: "open", answers: null, history: [], createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z" };
  it("starts from the defaults, then from the last answers", () => {
    expect(initialAnswers(q)).toEqual({ keep: ["a"] });
    const once = withAnswers(q, { framing: "Numbers", notes: "x" }, "user", "2026-10-13T01:00:00Z");
    expect(initialAnswers(once)).toEqual({ framing: "Numbers", notes: "x" });
  });
  it("keeps an earlier round in history", () => {
    const once = withAnswers(q, { framing: "Numbers", notes: "x" }, "user", "t1");
    const twice = withAnswers(once, { framing: "Mechanism", notes: "y" }, "user", "t2");
    expect([once.status, once.answers!.round, twice.answers!.round, twice.history.length, twice.history[0]!.values.framing]).toEqual(["answered", 1, 2, 1, "Numbers"]);
  });
  it("is a thread message whose answer hands the turn back to the agent", () => {
    const asked: CommentMessage = { author: "w1", at: "t1", text: questionMessageText({ title: "T", intro: "I" }), question: { id: "q1", status: "open" } };
    const thread: CommentMessage[] = [{ author: "user", at: "t0", text: "which colour?" }, asked];
    expect([asked.text, commentTurn(thread)]).toEqual(["T\n\nI", "user"]);
    expect(commentTurn([thread[0]!, { ...asked, question: { id: "q1", status: "answered" } }])).toBe("agent");
    expect(commentTurn([thread[0]!, { ...asked, question: { id: "q1", status: "withdrawn" } }])).toBe("user");
  });
});
