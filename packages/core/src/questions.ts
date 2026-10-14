/**
 * Questionnaires an agent asks the user, pure part: the record, the answers,
 * and which answers are still missing or refused. One questionnaire is one
 * file, `questions/<id>.json`, and a message in the comment conversation it
 * belongs to; the user answers it in that comment's chat.
 */
import type { Box } from "./pack.js";

export type QuestionKind = "single" | "multi" | "text" | "long";

/** The Other choice of a single or multi question: the user's own words. */
export interface OtherAnswer {
  other: string;
}

export type ChoiceAnswer = string | OtherAnswer;
export type AnswerValue = ChoiceAnswer | ChoiceAnswer[];

export interface Question {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options?: string[];
  other?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  required?: boolean;
  default?: string | string[];
}

export interface QuestionAnswers {
  by: string;
  at: string;
  round: number;
  values: Record<string, AnswerValue>;
}

export type QuestionnaireStatus = "open" | "answered" | "withdrawn";

/** What an agent posts. */
export interface QuestionnaireInput {
  title: string;
  intro?: string;
  slide?: string;
  region?: Box;
  asker?: string;
  /** The comment to ask in; left out, a new conversation is started. */
  comment?: string;
  questions: Question[];
}

export interface Questionnaire extends QuestionnaireInput {
  id: string;
  deck: string;
  /** The comment conversation it belongs to. */
  comment: string;
  asker: string;
  status: QuestionnaireStatus;
  answers: QuestionAnswers | null;
  history: QuestionAnswers[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A new questionnaire id.
 *
 * @returns `q` followed by base-36 time and the random part; sorts by time.
 */
export function newQuestionId(now: number, random: string): string {
  return `q${now.toString(36)}${random}`;
}

/** Whether a value is the Other choice. */
export function isOther(value: unknown): value is OtherAnswer {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as OtherAnswer).other === "string";
}

/**
 * Whether a question has an answer worth sending.
 *
 * @returns false for undefined, blank text, an empty list or a blank Other.
 */
export function answered(value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return isOther(value) ? value.other.trim() !== "" : value.trim() !== "";
}

/**
 * Why one answer is refused, if it is.
 *
 * @returns a sentence naming what is wrong, or null when the value is fine.
 */
export function answerProblem(q: Question, value: AnswerValue | undefined): string | null {
  if (!answered(value)) return q.required ? "is required" : null;
  const choice = (v: ChoiceAnswer) => (isOther(v) ? (q.other ? (v.other.trim() ? null : "Other needs its text") : "has no Other choice") : typeof v === "string" && (q.options ?? []).includes(v) ? null : `"${String(v)}" is not one of its options`);
  if (q.kind === "text" || q.kind === "long") return typeof value === "string" ? null : "takes a string";
  if (q.kind === "single") return Array.isArray(value) ? "takes one choice, not a list" : choice(value!);
  if (!Array.isArray(value)) return "takes a list of choices";
  const bad = value.map(choice).find(Boolean);
  if (bad) return bad;
  if (q.min !== undefined && value.length < q.min) return `needs at least ${q.min} choices`;
  if (q.max !== undefined && value.length > q.max) return `takes at most ${q.max} choices`;
  return null;
}

/**
 * Every refused answer of a submission.
 *
 * @param values - the answers by question id.
 * @returns `{id, prompt, problem}` per refused question, in question order;
 *   an answer to a question that does not exist is refused by its id.
 */
export function checkAnswers(questions: Question[], values: Record<string, AnswerValue>): { id: string; prompt: string; problem: string }[] {
  const out = questions.flatMap((q) => {
    const problem = answerProblem(q, values[q.id]);
    return problem ? [{ id: q.id, prompt: q.prompt, problem }] : [];
  });
  const known = new Set(questions.map((q) => q.id));
  for (const id of Object.keys(values)) if (!known.has(id)) out.push({ id, prompt: id, problem: "is not a question of this questionnaire" });
  return out;
}

/**
 * The answers to send.
 *
 * @returns only the questions that have an answer, so an optional one left blank is not sent.
 */
export function answersToSend(questions: Question[], values: Record<string, AnswerValue | undefined>): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const q of questions) if (answered(values[q.id])) out[q.id] = values[q.id]!;
  return out;
}

/**
 * The starting values of a form: the last answers, else each question's default.
 *
 * @returns values by question id.
 */
export function initialAnswers(q: Pick<Questionnaire, "questions" | "answers">): Record<string, AnswerValue> {
  if (q.answers) return { ...q.answers.values };
  const out: Record<string, AnswerValue> = {};
  for (const question of q.questions) if (question.default !== undefined) out[question.id] = question.default;
  return out;
}

/**
 * Record a submission on a questionnaire.
 *
 * @returns a new record: status answered, the next round, the previous round in history.
 */
export function withAnswers(q: Questionnaire, values: Record<string, AnswerValue>, by: string, at: string): Questionnaire {
  const round = (q.answers?.round ?? 0) + 1;
  return { ...q, status: "answered", answers: { by, at, round, values }, history: q.answers ? [...q.history, q.answers] : q.history, updatedAt: at };
}

/**
 * The text of the thread message that carries a questionnaire, for readers
 * that do not draw the form (`folio comment show`, search, notifications).
 *
 * @returns the title, and the intro after a blank line.
 */
export function questionMessageText(q: Pick<QuestionnaireInput, "title" | "intro">): string {
  return q.intro ? `${q.title}\n\n${q.intro}` : q.title;
}
