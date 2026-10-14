/**
 * The schema of a questionnaire an agent posts. Every refusal is one line that
 * names the field and the fix, so an agent can correct its file without
 * reading the code.
 */
import type { Question, QuestionnaireInput } from "./questions.js";

const TOP_KEYS = ["title", "intro", "slide", "region", "asker", "comment", "questions"];
const QUESTION_KEYS = ["id", "prompt", "kind", "options", "other", "min", "max", "placeholder", "required", "default"];
const KINDS = ["single", "multi", "text", "long"];
const ID = /^[A-Za-z0-9_-]{1,40}$/;

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Unknown keys of an object, as refusal lines. */
function unknownKeys(obj: Record<string, unknown>, allowed: string[], at: string): string[] {
  return Object.keys(obj).filter((k) => !allowed.includes(k)).map((k) => `${at}${k}: unknown field; the fields are ${allowed.join(", ")}`);
}

/** The top-level fields other than `questions`. */
function topProblems(input: Record<string, unknown>): string[] {
  const out = unknownKeys(input, TOP_KEYS, "");
  if (!isText(input.title)) out.push('title: required; give "title": "what you are asking, in a few words"');
  for (const k of ["intro", "slide", "asker", "comment"]) if (input[k] !== undefined && !isText(input[k])) out.push(`${k}: must be a non-empty string, or left out`);
  const region = input.region;
  if (region !== undefined) {
    if (!Array.isArray(region) || region.length !== 4 || !region.every((n) => typeof n === "number" && Number.isFinite(n))) out.push("region: must be [x, y, w, h] in pt on the slide's canvas");
    if (input.slide === undefined) out.push('region: points at a slide; give "slide": "<slide id>" with it');
  }
  if (!Array.isArray(input.questions) || !input.questions.length) out.push('questions: required; give a list such as [{"id": "q1", "prompt": "...", "kind": "single", "options": ["A", "B"]}]');
  return out;
}

/** The options, Other, min and max of a choice question. */
function choiceProblems(q: Record<string, unknown>, at: string): string[] {
  const out: string[] = [];
  const options = q.options;
  if (!Array.isArray(options) || !options.every(isText)) return [`${at}options: a ${q.kind} question needs "options": ["...", "..."], a list of non-empty strings`];
  if (options.length < 2) out.push(`${at}options: a ${q.kind} question needs at least two options; give "options": ["...", "..."]`);
  if (new Set(options).size !== options.length) out.push(`${at}options: each option must differ from the others`);
  if (q.other !== undefined && typeof q.other !== "boolean") out.push(`${at}other: true adds a free-text Other choice; false or left out has none`);
  const choices = options.length + (q.other ? 1 : 0);
  for (const k of ["min", "max"]) {
    if (q[k] === undefined) continue;
    if (q.kind !== "multi") out.push(`${at}${k}: only a multi question takes ${k}; remove it`);
    else if (!isCount(q[k]) || (q[k] as number) > choices) out.push(`${at}${k}: must be a whole number from 0 to ${choices} (the number of choices)`);
  }
  if (isCount(q.min) && isCount(q.max) && q.min > q.max) out.push(`${at}min: is more than max (${q.min} > ${q.max}); lower min or raise max`);
  return out;
}

/** Fields that only some kinds take. */
function kindFieldProblems(q: Record<string, unknown>, at: string): string[] {
  const choice = q.kind === "single" || q.kind === "multi";
  const out: string[] = [];
  if (!choice) for (const k of ["options", "other", "min", "max"]) if (q[k] !== undefined) out.push(`${at}${k}: only a single or multi question takes ${k}; remove it or change "kind"`);
  if (choice && q.placeholder !== undefined) out.push(`${at}placeholder: only a text or long question takes a placeholder; remove it`);
  if (!choice && q.placeholder !== undefined && typeof q.placeholder !== "string") out.push(`${at}placeholder: must be a string`);
  if (q.required !== undefined && typeof q.required !== "boolean") out.push(`${at}required: must be true or false`);
  return out;
}

/** Whether a default fits its question. */
function defaultProblem(q: Record<string, unknown>, at: string): string | null {
  const d = q.default;
  const options = Array.isArray(q.options) ? (q.options as string[]) : [];
  if (d === undefined) return null;
  if (q.kind === "single") return typeof d === "string" && options.includes(d) ? null : `${at}default: must be one of the options (${options.join(", ")})`;
  if (q.kind === "multi") return Array.isArray(d) && d.every((x) => options.includes(x)) ? null : `${at}default: must be a list of options (${options.join(", ")})`;
  return typeof d === "string" ? null : `${at}default: a ${q.kind} question's default is a string`;
}

/** Everything wrong with one question. */
function questionProblems(raw: unknown, index: number): string[] {
  const at = `questions[${index}].`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [`questions[${index}]: must be an object with id, prompt and kind`];
  const q = raw as Record<string, unknown>;
  const out = unknownKeys(q, QUESTION_KEYS, at);
  if (typeof q.id !== "string" || !ID.test(q.id)) out.push(`${at}id: required; letters, digits, - and _ only, e.g. "id": "framing"`);
  if (!isText(q.prompt)) out.push(`${at}prompt: required; give "prompt": "the question as the user should read it"`);
  if (!KINDS.includes(q.kind as string)) return [...out, `${at}kind: must be one of ${KINDS.join(", ")}`];
  if (q.kind === "single" || q.kind === "multi") out.push(...choiceProblems(q, at));
  out.push(...kindFieldProblems(q, at));
  const d = defaultProblem(q, at);
  return d ? [...out, d] : out;
}

/**
 * Validate a questionnaire an agent posts.
 *
 * @param input - the parsed JSON.
 * @returns the questionnaire, or every problem as one line naming the field and the fix.
 */
export function checkQuestionnaire(input: unknown): { ok: true; value: QuestionnaireInput } | { ok: false; problems: string[] } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, problems: ['(root): a questionnaire is an object: {"title": "...", "questions": [...]}'] };
  const obj = input as Record<string, unknown>;
  const problems = topProblems(obj);
  const questions = Array.isArray(obj.questions) ? obj.questions : [];
  questions.forEach((q, i) => problems.push(...questionProblems(q, i)));
  const ids = questions.map((q) => (q as Question)?.id).filter((id) => typeof id === "string");
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) problems.push(`questions: id "${id}" is used twice; give each question its own id`);
  return problems.length ? { ok: false, problems } : { ok: true, value: obj as unknown as QuestionnaireInput };
}
