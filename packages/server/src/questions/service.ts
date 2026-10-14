/**
 * Questionnaires an agent asks the user: one file per questionnaire,
 * `questions/<id>.json` in the deck, and one message in the comment
 * conversation it belongs to, which carries its id and status. An agent posts
 * and withdraws; only the user answers. Every change is a `question.posted`,
 * `question.answered` or `question.withdrawn` event on the deck's stream.
 * Nothing is deleted: a withdrawn questionnaire keeps its file and an edit
 * keeps the earlier round. A file from before questionnaires belonged to a
 * comment is linked to one on read, recorded on the comment's message only.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkAnswers, checkQuestionnaire, newQuestionId, questionMessageText, withAnswers, type AnswerValue, type FolioComment, type Questionnaire, type QuestionnaireInput } from "@folio/core";
import type { FolioApp } from "../app.js";
import type { CommentService } from "../comments/service.js";
import { listComments, readComment } from "../comments/store.js";
import type { DeckStore } from "../deckstore.js";
import { atomicWrite, formatJson, readJson } from "../fsutil.js";

/** A refusal with its HTTP status and one line per problem. */
export class QuestionError extends Error {
  constructor(readonly status: number, readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

/** The questions folder of a deck. */
export function questionsDir(store: DeckStore): string {
  return join(store.dir, "questions");
}

/** Read one questionnaire as stored, or null. */
export function readQuestion(store: DeckStore, id: string): Questionnaire | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return readJson<Questionnaire | null>(join(questionsDir(store), `${id}.json`), null);
}

/** Every questionnaire of a deck as stored, oldest first. */
export function listQuestions(store: DeckStore): Questionnaire[] {
  const dir = questionsDir(store);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Questionnaire | null>(join(dir, f), null))
    .filter((q): q is Questionnaire => !!q)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export class QuestionService {
  constructor(private readonly app: FolioApp, private readonly comments: CommentService, readonly user = app.config.user) {}

  /**
   * Post a questionnaire into a comment conversation.
   *
   * @param input - the parsed JSON an agent sent; its `comment` names the
   *   conversation, left out a new one is started by the asker.
   * @param asker - the worker posting it, used when the input names no asker.
   * @returns the stored record. Throws a 422 QuestionError naming each problem.
   */
  ask(store: DeckStore, input: unknown, asker: string): Questionnaire {
    const checked = checkQuestionnaire(input);
    if (!checked.ok) throw new QuestionError(422, checked.problems);
    const value = checked.value;
    if (value.slide && !store.readSlide(value.slide)) throw new QuestionError(422, [`slide: ${value.slide} is not a slide of ${store.deck.title}; give one of ${store.slideIds().join(", ")} or leave it out`]);
    if (value.comment) this.askable(store, value.comment);
    const now = new Date().toISOString();
    const id = newQuestionId(Date.now(), randomBytes(2).toString("hex"));
    const who = value.asker ?? asker;
    const comment = value.comment ? this.comments.reply(store, value.comment, who, questionMessageText(value), false, [], { id, status: "open" }).id : this.start(store, value, id, who, "open").id;
    const q: Questionnaire = { ...value, id, deck: store.token, comment, asker: who, status: "open", answers: null, history: [], createdAt: now, updatedAt: now };
    return this.write(store, q, "question.posted");
  }

  /**
   * Record the user's answers; a second submission is the next round.
   *
   * @param by - who answers; only the user may.
   * @returns the answered record. Throws a QuestionError: 403 for a worker,
   *   404 when missing, 409 when withdrawn, 422 naming each refused answer.
   */
  answer(store: DeckStore, id: string, values: Record<string, AnswerValue>, by: string): Questionnaire {
    if (by !== this.user) throw new QuestionError(403, [`only the user answers a questionnaire; ${by} may read the answers with folio answers`]);
    const q = this.read(store, id);
    if (q.status === "withdrawn") throw new QuestionError(409, [`${id} was withdrawn by ${q.asker}; it takes no answers`]);
    if (typeof values !== "object" || values === null || Array.isArray(values)) throw new QuestionError(422, ['answers: give {"answers": {"<question id>": <value>}}']);
    const refused = checkAnswers(q.questions, values);
    if (refused.length) throw new QuestionError(422, refused.map((r) => `answers.${r.id}: ${r.prompt} ${r.problem}`));
    return this.write(store, withAnswers(q, values, by, new Date().toISOString()), "question.answered");
  }

  /** Withdraw a questionnaire; its file stays. */
  withdraw(store: DeckStore, id: string): Questionnaire {
    const q = this.read(store, id);
    if (q.status === "withdrawn") return q;
    return this.write(store, { ...q, status: "withdrawn", updatedAt: new Date().toISOString() }, "question.withdrawn");
  }

  /**
   * A questionnaire with its conversation: an older file without `comment`
   * is linked to the comment whose message asks it, or to a new conversation
   * started for it once. The file is not rewritten.
   *
   * @returns the record with `comment`, or null when there is none.
   */
  get(store: DeckStore, id: string): Questionnaire | null {
    const q = readQuestion(store, id);
    return q ? this.linked(store, q) : null;
  }

  /** Every questionnaire of a deck with its conversation, oldest first. */
  list(store: DeckStore): Questionnaire[] {
    return listQuestions(store).map((q) => this.linked(store, q));
  }

  /** Link every older questionnaire of every deck to a conversation, as `folio serve` starts. */
  adoptAll(): void {
    for (const store of this.app.workspace.decks.values()) this.list(store);
  }

  private linked(store: DeckStore, q: Questionnaire): Questionnaire {
    if (q.comment) return q;
    const asking = listComments(store, true).find((c) => c.thread.some((m) => m.question?.id === q.id));
    try {
      return { ...q, comment: (asking ?? this.start(store, q, q.id, q.asker, q.status)).id };
    } catch (error) {
      if (error instanceof QuestionError) return q;
      throw error;
    }
  }

  /** Start a conversation whose first message asks the questionnaire. */
  private start(store: DeckStore, value: QuestionnaireInput, id: string, asker: string, status: Questionnaire["status"]): FolioComment {
    const slide = value.slide ?? store.slideIds()[0];
    if (!slide) throw new QuestionError(422, [`comment: ${store.deck.title} has no slide to start a conversation on; add a slide, or give "comment": "<comment id>"`]);
    return this.comments.create(store, { slide, region: value.slide ? (value.region ?? null) : null, marks: [], text: questionMessageText(value), question: { id, status } }, asker);
  }

  /** Refuse a comment that cannot take a questionnaire, by name. */
  private askable(store: DeckStore, cid: string): void {
    const c = readComment(store, cid);
    if (!c) throw new QuestionError(422, [`comment: no comment ${cid} in ${store.deck.title}; give an id from folio comments <deck>, or leave it out to start a new conversation`]);
    if (c.status === "resolved") throw new QuestionError(422, [`comment: ${cid} is resolved; leave "comment" out to start a new conversation`]);
  }

  private read(store: DeckStore, id: string): Questionnaire {
    const q = this.get(store, id);
    if (!q) throw new QuestionError(404, [`no questionnaire ${id} in ${store.deck.title}`]);
    return q;
  }

  private write(store: DeckStore, q: Questionnaire, event: string): Questionnaire {
    atomicWrite(join(questionsDir(store), `${q.id}.json`), formatJson(q));
    if (event !== "question.posted") this.comments.markQuestion(store, q.comment, { id: q.id, status: q.status });
    this.app.emit(store.token, event, { question: q });
    return q;
  }
}
