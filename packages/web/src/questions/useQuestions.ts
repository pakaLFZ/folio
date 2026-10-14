/**
 * Questionnaires in the browser: a deck's list and one questionnaire kept live
 * from the stream, the user's draft answers kept per browser while they type,
 * and the submission.
 */
import { useEffect, useState } from "react";
import type { AnswerValue, Questionnaire } from "@folio/core";
import { call } from "../api";
import { subscribe } from "../stream/client";

/** Whether a stream message is about questionnaires. */
export const isQuestionEvent = (type: string) => type.startsWith("question.");

/**
 * A deck's questionnaires, every status, kept live.
 *
 * @returns the list, oldest first, or null while loading.
 */
export function useQuestionList(token: string): Questionnaire[] | null {
  const [list, setList] = useState<Questionnaire[] | null>(null);
  useEffect(() => {
    const load = () => void call<{ questions: Questionnaire[] }>(`${token}/questions`).then((r) => setList(r.questions), () => {});
    load();
    return subscribe([token], (m) => {
      if (m.type === "resync") return load();
      if (!isQuestionEvent(m.type)) return;
      const q = (m.data as { question: Questionnaire }).question;
      setList((prev) => (prev ? (prev.some((x) => x.id === q.id) ? prev.map((x) => (x.id === q.id ? q : x)) : [...prev, q]) : prev));
    });
  }, [token]);
  return list;
}

/**
 * One questionnaire, kept live.
 *
 * @returns it, or null while loading.
 */
export function useQuestion(token: string, id: string): Questionnaire | null {
  const [q, setQ] = useState<Questionnaire | null>(null);
  useEffect(() => {
    setQ(null);
    void call<Questionnaire>(`${token}/questions/${id}`).then(setQ, () => {});
    return subscribe([token], (m) => {
      const next = isQuestionEvent(m.type) ? (m.data as { question: Questionnaire }).question : null;
      if (next?.id === id) setQ(next);
    });
  }, [token, id]);
  return q;
}

/** Send the user's answers. */
export function submitAnswers(token: string, id: string, answers: Record<string, AnswerValue>): Promise<Questionnaire> {
  return call<Questionnaire>(`${token}/questions/${id}/answers`, { method: "POST", json: { answers } });
}

const draftKey = (token: string, id: string) => `folio.question.${token}.${id}`;

/** The answers this browser kept while the user typed, or null. */
export function readDraft(token: string, id: string): Record<string, AnswerValue | undefined> | null {
  try {
    const kept = localStorage.getItem(draftKey(token, id));
    return kept ? (JSON.parse(kept) as Record<string, AnswerValue | undefined>) : null;
  } catch {
    return null;
  }
}

/** Keep the answers being typed; null forgets them. */
export function writeDraft(token: string, id: string, values: Record<string, AnswerValue | undefined> | null): void {
  try {
    if (values) localStorage.setItem(draftKey(token, id), JSON.stringify(values));
    else localStorage.removeItem(draftKey(token, id));
  } catch {
    return;
  }
}
