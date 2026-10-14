/**
 * A questionnaire as a message in a comment's chat: the form, live, in a
 * hairline card the width of the thread, on the agent's side.
 */
import type { QuestionRef } from "@folio/core";
import { QuestionForm } from "./QuestionForm";
import { useQuestion } from "./useQuestions";

/**
 * The message.
 *
 * @param props.deck - the deck token.
 * @param props.question - the id and status the thread message carries.
 * @param props.title - false leaves out the title and intro, already shown in the bubble above.
 */
export function QuestionMessage({ deck, question, title = true }: { deck: string; question: QuestionRef; title?: boolean }) {
  const q = useQuestion(deck, question.id);
  return (
    <div data-question-message={question.id} data-status={q?.status ?? question.status} onClick={(e) => e.stopPropagation()} className="w-full min-w-0 cursor-auto rounded-menu rounded-bl-chip bg-surface p-3 text-left outline outline-1 outline-line">
      {q ? <QuestionForm key={q.id} token={deck} q={q} title={title} /> : <p className="text-[12px] text-ink-faint">Opening the questionnaire</p>}
    </div>
  );
}
