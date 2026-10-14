/**
 * A questionnaire as a form: its title and intro, one field per question, and
 * Submit, disabled until every required question is answered and every count
 * fits, with a note naming what is missing. What the user types is kept per
 * browser until it is sent. Once answered it reads back the answers with
 * "Edit answers", which reopens the form; a withdrawn one is read-only.
 */
import { useState } from "react";
import { answersToSend, checkAnswers, initialAnswers, type AnswerValue, type Questionnaire } from "@folio/core";
import { ago } from "../inbox/inboxData";
import { Button } from "../ui/button";
import { answerText, QuestionField } from "./QuestionFields";
import { readDraft, submitAnswers, writeDraft } from "./useQuestions";

type Values = Record<string, AnswerValue | undefined>;

/** The title, who asked, where, and the intro; `title` false leaves out what a bubble above already shows. */
function FormHead({ q, title = true }: { q: Questionnaire; title?: boolean }) {
  return (
    <header className="flex flex-col gap-1">
      {title ? <h2 className="text-[13px] font-medium leading-snug text-ink">{q.title}</h2> : null}
      <p className="flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
        <span className="num">{q.asker}</span>
        {q.slide ? <span className="num">{q.slide}</span> : null}
        <span className="num">{ago(q.createdAt)}</span>
      </p>
      {title && q.intro ? <p className="whitespace-pre-line text-[12px] leading-relaxed text-ink-muted">{q.intro}</p> : null}
    </header>
  );
}

/** The answers as text, with who answered and when. */
function ReadBack({ q, onEdit }: { q: Questionnaire; onEdit?: () => void }) {
  const values = q.answers?.values ?? {};
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        {q.questions.map((x) => (
          <div key={x.id} data-question={x.id} className="flex flex-col gap-0.5">
            <dt className="text-[12px] text-ink-muted">{x.prompt}</dt>
            <dd className="whitespace-pre-line text-[13px] text-ink">{answerText(values[x.id])}</dd>
          </div>
        ))}
      </dl>
      <footer className="flex items-center gap-2 border-t border-line-soft pt-3">
        <p className="num flex-1 text-[11px] text-ink-faint">
          {q.status === "withdrawn" ? `Withdrawn by ${q.asker}` : q.answers ? `Answered ${since(q.answers.at)}${q.answers.round > 1 ? `, round ${q.answers.round}` : ""}` : ""}
        </p>
        {onEdit ? <Button variant="outline" size="sm" onClick={onEdit}>Edit answers</Button> : null}
      </footer>
    </div>
  );
}

/** How long ago, as a phrase. */
const since = (iso: string) => (ago(iso) === "now" ? "just now" : `${ago(iso)} ago`);

/**
 * The answers being typed, kept per browser as they change.
 *
 * @returns the values, whether the user has changed any, a setter per question and a reset.
 */
function useAnswerDraft(token: string, q: Questionnaire) {
  const [values, setValues] = useState<Values>(() => readDraft(token, q.id) ?? initialAnswers(q));
  const [touched, setTouched] = useState(() => readDraft(token, q.id) !== null);
  const change = (id: string, v: AnswerValue | undefined) => {
    const next = { ...values, [id]: v };
    setValues(next);
    setTouched(true);
    writeDraft(token, q.id, next);
  };
  const reset = () => setValues(readDraft(token, q.id) ?? initialAnswers(q));
  return { values, touched, change, reset };
}

/** The note under the form: which required questions are still open. */
function missingNote(refused: { prompt: string; problem: string }[]): string {
  const missing = refused.filter((r) => r.problem === "is required").map((r) => r.prompt);
  const other = refused.length - missing.length;
  const parts = [missing.length ? `Answer ${missing.length} required question${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}` : "", other ? `fix ${other} answer${other > 1 ? "s" : ""} above` : ""];
  return parts.filter(Boolean).join("; ");
}

/**
 * The form.
 *
 * @param props.token - the deck.
 * @param props.q - the questionnaire, kept live by the caller.
 * @param props.title - false leaves out the title and intro, shown by the bubble above it.
 */
export function QuestionForm({ token, q, title = true }: { token: string; q: Questionnaire; title?: boolean }) {
  const [editing, setEditing] = useState(q.status === "open");
  const { values, touched, change, reset } = useAnswerDraft(token, q);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (q.status === "withdrawn") return <section aria-label={q.title} className="flex flex-col gap-4"><FormHead q={q} title={title} /><ReadBack q={q} /></section>;
  if (!editing && q.answers) return <section aria-label={q.title} className="flex flex-col gap-4"><FormHead q={q} title={title} /><ReadBack q={q} onEdit={() => (reset(), setEditing(true))} /></section>;
  const toSend = answersToSend(q.questions, values as Record<string, AnswerValue>);
  const refused = checkAnswers(q.questions, toSend);
  const problemOf = (id: string) => {
    const r = refused.find((x) => x.id === id);
    return r && (touched || r.problem !== "is required") ? (r.problem === "is required" ? "This question needs an answer" : `This answer ${r.problem}`) : null;
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitAnswers(token, q.id, toSend);
      writeDraft(token, q.id, null);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form aria-label={q.title} className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), refused.length || busy ? undefined : void submit())}>
      <FormHead q={q} title={title} />
      {q.questions.map((x) => <QuestionField key={x.id} q={x} value={values[x.id]} onChange={(v) => change(x.id, v)} problem={problemOf(x.id)} />)}
      <footer className="flex flex-col gap-2 border-t border-line-soft pt-3">
        {refused.length ? <p data-missing className="text-[11px] leading-snug text-ink-muted">{missingNote(refused)}</p> : null}
        {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {q.answers ? <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button> : null}
          <Button type="submit" variant="solid" size="sm" disabled={refused.length > 0 || busy}>{busy ? "Sending" : q.answers ? "Submit changes" : "Submit"}</Button>
        </div>
      </footer>
    </form>
  );
}
