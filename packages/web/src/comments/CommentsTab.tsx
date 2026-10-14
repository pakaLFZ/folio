/**
 * The Comments tab: one plain list of the current slide's open issues, in the
 * order agents will work them (`executionOrder`: the board's Queue top first,
 * then In progress, Review and Held). Resolved issues live on the board's Done
 * column and in `folio comment search`. Every issue shows its first message as
 * a chat bubble inside a hairline card; pressing anywhere on the card toggles
 * the issue's selection (the bubble, the region screenshot, or empty card
 * space), which adds the rest of the thread and the input bar. Image
 * thumbnails in the card never open on click, only toggle, like the rest of
 * the card. Resolve is an icon at the card's top-left, shown while the
 * pointer or keyboard focus is in the card, and the reply input bar does its
 * own job without toggling the card. A region comment's draft is written in
 * the bubble on the canvas; at the top of the tab, above the list, an input
 * bar makes a whole-slide comment (no region) straight from the list, the
 * same create path as the bubble. Selecting an issue draws it on the slide in
 * Edit. In View the list is read-only: no
 * input bar, no Resolve. A closed card with an unread reply shows a bell at
 * the same top-left corner; selecting the card clears it. A comment that was
 * just sent opens closed, like any other card. When the first message asks a
 * questionnaire, opening the card adds its form under the bubble.
 */
import { Bell, Check } from "lucide-react";
import type { KeyboardEvent } from "react";
import { executionOrder, type Pack } from "@folio/core";
import type { DeckState, DeckStore } from "../editor/deckState";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { InputBar } from "../ui/InputBar";
import { Tip } from "../ui/tooltip";
import { QuestionMessage } from "../questions/QuestionMessage";
import { bubbleClass, Chat, MessageItem, USER } from "./Chat";
import type { CommentsModel, CommentView, Upload } from "./useComments";

/** The card's Resolve icon, revealed by hover or focus within the card. */
function ResolveButton({ c, model }: { c: CommentView; model: CommentsModel }) {
  return (
    <Tip label="Resolve" side="right">
      <Button size="iconSm" aria-label="Resolve" onClick={(e) => (e.stopPropagation(), void model.setStatus(c.id, "resolved"))} className="absolute left-1.5 top-1.5 text-ink-muted opacity-0 transition-opacity duration-[120ms] hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100 [&_svg]:size-3.5">
        <Check />
      </Button>
    </Tip>
  );
}

/** The closed card's unread bell, top-left, gone once the card is opened. */
function UnreadBell() {
  return (
    <Tip label="New reply" side="right">
      <span aria-label="New reply" className="absolute left-1.5 top-1.5 text-ink opacity-100 transition-opacity duration-[120ms] group-hover:opacity-0 group-focus-within:opacity-0 [&_svg]:size-3.5">
        <Bell fill="currentColor" />
      </span>
    </Tip>
  );
}

/** One issue: its first message, and the whole thread once selected. */
function Issue({ c, model, selected, readOnly, onSelect }: { c: CommentView; model: CommentsModel; selected: boolean; readOnly: boolean; onSelect: () => void }) {
  const first = c.thread[0];
  const unread = !selected && !!c.unread;
  const corner = !readOnly || unread;
  const bubble = first?.text ? (
    <button type="button" aria-expanded={selected} onClick={(e) => (e.stopPropagation(), onSelect())} className={cn(bubbleClass(first.author === USER), "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink")}>
      {first.text}
    </button>
  ) : undefined;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onSelect();
  };
  return (
    <li data-comment={c.id} aria-current={selected || undefined} tabIndex={0} onClick={onSelect} onKeyDown={onKeyDown} className={cn("group relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-card border p-2.5 transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", selected ? "border-line-strong bg-whisper" : "border-line hover:border-line-strong")}>
      {readOnly ? null : <ResolveButton c={c} model={model} />}
      {unread ? <UnreadBell /> : null}
      <ol className={cn("flex min-w-0 flex-col", corner ? "pl-8" : "")}>{first ? <MessageItem comment={c} message={first} index={0} bubble={bubble} openOnClick={false} /> : null}</ol>
      {selected ? (
        <>
          {c.orphaned ? <p className="text-[12px] text-danger">{c.orphaned}</p> : null}
          {first?.question ? <QuestionMessage deck={c.deck} question={first.question} title={false} /> : null}
          <Chat comment={c} compact from={1} reply={!readOnly} openOnClick={false} />
        </>
      ) : null}
    </li>
  );
}

/**
 * The tab.
 *
 * @param props.model - the comments model.
 */
export function CommentsTab({ state, model }: { store: DeckStore; state: DeckState; pack: Pack; model: CommentsModel }) {
  const issues = executionOrder(model.comments.filter((c) => c.slide === state.current && c.status !== "resolved"), USER);
  const readOnly = state.mode === "view";
  const select = (c: CommentView) => {
    model.setFocus(model.focus === c.id ? null : c.id);
  };
  const slide = state.current;
  const onSend = (text: string, uploads: Upload[]) => (slide ? model.sendSlide(slide, text, uploads) : undefined);
  return (
    <div className="flex flex-col gap-2 py-2">
      {readOnly || !slide ? null : <InputBar placeholder="New comment on this slide" onSend={onSend} upload={model.upload} uploadUrl={model.uploadUrl} />}
      {issues.length ? (
        <ul className="flex flex-col gap-2">
          {issues.map((c) => <Issue key={c.id} c={c} model={model} selected={model.focus === c.id} readOnly={readOnly} onSelect={() => select(c)} />)}
        </ul>
      ) : null}
    </div>
  );
}
