/**
 * One question of a questionnaire as a form field: radios for `single`,
 * checkboxes for `multi`, a one-line input for `text`, a paragraph for `long`.
 * Other adds a text field that takes focus when chosen. Read-only, a question
 * shows its answer as text.
 */
import { useEffect, useId, useRef } from "react";
import { isOther, type AnswerValue, type ChoiceAnswer, type Question } from "@folio/core";
import { CheckItem, RadioGroup, RadioItem } from "../ui/choice";
import { Input, Textarea } from "../ui/field";

const OTHER = "\u0000other";

type FieldProps = { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue | undefined) => void; problem: string | null };

/** The Other choice's text field, shown while Other is chosen. */
function OtherText({ value, onChange, label }: { value: string; onChange: (text: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const chosenJustNow = useRef(!value);
  useEffect(() => void (chosenJustNow.current && ref.current?.focus()), []);
  return <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your answer" aria-label={label} className="ml-8 w-[calc(100%-2.5rem)]" />;
}

/** Radios over the options, and Other. */
function SingleField({ q, value, onChange }: FieldProps) {
  const other = isOther(value) ? value : null;
  const choose = (v: string) => onChange(v === OTHER ? { other: other?.other ?? "" } : v);
  return (
    <div className="flex flex-col gap-1">
      <RadioGroup value={other ? OTHER : typeof value === "string" ? value : ""} onValueChange={choose} aria-label={q.prompt}>
        {(q.options ?? []).map((o) => <RadioItem key={o} value={o}>{o}</RadioItem>)}
        {q.other ? <RadioItem value={OTHER}>Other</RadioItem> : null}
      </RadioGroup>
      {other ? <OtherText value={other.other} label={`${q.prompt}: other`} onChange={(text) => onChange({ other: text })} /> : null}
    </div>
  );
}

/** Checkboxes over the options, and Other. */
function MultiField({ q, value, onChange }: FieldProps) {
  const list: ChoiceAnswer[] = Array.isArray(value) ? value : [];
  const other = list.find(isOther) ?? null;
  const set = (next: ChoiceAnswer[]) => onChange(next.length ? next : undefined);
  const toggle = (o: string, on: boolean) => set(on ? [...list, o] : list.filter((x) => x !== o));
  return (
    <div className="flex flex-col gap-1" role="group" aria-label={q.prompt}>
      <div className="flex flex-col">
        {(q.options ?? []).map((o) => <CheckItem key={o} checked={list.includes(o)} onChange={(on) => toggle(o, on)}>{o}</CheckItem>)}
        {q.other ? <CheckItem checked={!!other} onChange={(on) => set(on ? [...list, { other: "" }] : list.filter((x) => !isOther(x)))}>Other</CheckItem> : null}
      </div>
      {other ? <OtherText value={other.other} label={`${q.prompt}: other`} onChange={(text) => set(list.map((x) => (isOther(x) ? { other: text } : x)))} /> : null}
    </div>
  );
}

/**
 * One question: its prompt, a quiet "Required" mark, the field, and the note
 * saying what is missing.
 *
 * @param props.problem - why the current value cannot be sent, or null.
 */
export function QuestionField(props: FieldProps) {
  const { q, value, onChange, problem } = props;
  const id = useId();
  const text = typeof value === "string" ? value : "";
  const field =
    q.kind === "single" ? <SingleField {...props} /> :
    q.kind === "multi" ? <MultiField {...props} /> :
    q.kind === "text" ? <Input id={id} value={text} placeholder={q.placeholder} aria-invalid={!!problem} onChange={(e) => onChange(e.target.value || undefined)} /> :
    <Textarea id={id} value={text} placeholder={q.placeholder} aria-invalid={!!problem} onChange={(e) => onChange(e.target.value || undefined)} />;
  return (
    <fieldset data-question={q.id} data-kind={q.kind} className="flex min-w-0 flex-col gap-1.5">
      <legend className="contents">
        <label htmlFor={q.kind === "text" || q.kind === "long" ? id : undefined} className="flex items-baseline gap-2 text-[12px] font-medium leading-snug text-ink">
          <span className="min-w-0 flex-1">{q.prompt}</span>
          {q.required ? <span className="shrink-0 text-[11px] font-normal text-ink-faint">Required</span> : null}
        </label>
      </legend>
      {q.kind === "multi" && (q.min !== undefined || q.max !== undefined) ? <p className="text-[11px] text-ink-faint">{countHint(q)}</p> : null}
      <div className={q.kind === "single" || q.kind === "multi" ? "-mx-2" : undefined}>{field}</div>
      {problem ? <p role="status" className="text-[11px] text-ink-muted">{problem}</p> : null}
    </fieldset>
  );
}

/** How many a multi question takes, in words. */
function countHint(q: Question): string {
  if (q.min !== undefined && q.max !== undefined) return q.min === q.max ? `Choose ${q.min}` : `Choose ${q.min} to ${q.max}`;
  return q.min !== undefined ? `Choose at least ${q.min}` : `Choose at most ${q.max}`;
}

/** An answer as text for the read-only view. */
export function answerText(value: AnswerValue | undefined): string {
  if (value === undefined) return "No answer";
  const one = (v: ChoiceAnswer) => (isOther(v) ? `Other: ${v.other}` : v);
  return Array.isArray(value) ? value.map(one).join(", ") || "No answer" : one(value);
}
