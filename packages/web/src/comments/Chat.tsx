/**
 * A comment as a tiny chat: bubbles in order, the user's on the right and the
 * agents' on the left, files and screenshots inline, the input bar at the foot.
 * Who wrote a message and when is the bubble's tooltip. A message that asks a
 * questionnaire is drawn as its form, the width of the thread.
 * The bell follows the thread: its new messages count as unread and can raise
 * a browser notification.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { FolioComment } from "@folio/core";
import { call } from "../api";
import { at } from "../boot";
import { QuestionMessage } from "../questions/QuestionMessage";
import { cn } from "../ui/cn";
import { InputBar } from "../ui/InputBar";
import { AttachmentList } from "./Composer";
import { uploadFile, type Upload } from "./useComments";

export const USER = "user";

type Message = FolioComment["thread"][number];

/** The bubble's look: the user's in ink on the right, an agent's in white on the left. */
export function bubbleClass(mine: boolean): string {
  return cn("whitespace-pre-wrap rounded-menu px-3 py-1.5 text-left text-[12px] leading-snug [overflow-wrap:anywhere]", mine ? "rounded-br-chip bg-ink text-on-ink" : "rounded-bl-chip bg-surface outline outline-1 outline-line");
}

/**
 * One message: its bubble, then its files and screenshots.
 *
 * @param props.index - its place in the thread; the first one's screenshot is "region when written".
 * @param props.bubble - drawn instead of the plain text bubble (the Comments tab makes it a button).
 * @param props.openOnClick - false keeps its image attachments from opening in a new tab.
 */
export function MessageItem({ comment, message: m, index, bubble, openOnClick = true }: { comment: FolioComment; message: Message; index: number; bubble?: ReactNode; openOnClick?: boolean }) {
  const mine = m.author === USER;
  const file = (name: string) => at(`${comment.deck}/comments/${comment.id}/${name}`);
  if (m.question && !bubble) return <li className="flex min-w-0 self-stretch"><QuestionMessage deck={comment.deck} question={m.question} /></li>;
  return (
    <li title={`${m.author}, ${new Date(m.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`} className={cn("flex min-w-0 max-w-[88%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")}>
      {bubble ?? (m.text ? <p className={bubbleClass(mine)}>{m.text}</p> : null)}
      <AttachmentList
        openOnClick={openOnClick}
        items={[
          ...(m.attachments ?? []).map((a) => ({ ...a, key: a.file, url: file(a.file) })),
          ...(m.shots ? [{ key: m.shots.region, name: index === 0 ? "region when written" : "region at this message", type: "image/png", bytes: 0, url: file(m.shots.region) }] : []),
        ]}
      />
    </li>
  );
}

/**
 * The chat.
 *
 * @param props.comment - the comment, kept live by the caller.
 * @param props.compact - no scroll box of its own, for the editor panel.
 * @param props.from - the first message drawn; the Comments tab draws the first one itself.
 * @param props.reply - false leaves out the input bar (the read-only list in View mode).
 * @param props.openOnClick - false keeps image attachments from opening in a new tab (the Comments tab).
 */
export function Chat({ comment, compact = false, from = 0, reply = true, openOnClick = true }: { comment: FolioComment; compact?: boolean; from?: number; reply?: boolean; openOnClick?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    void end.current?.scrollIntoView({ block: "nearest" });
  }, [comment.thread.length]);
  useEffect(() => {
    void call("api/inbox/read", { method: "POST", json: { seen: { [comment.id]: comment.thread.length } } }).catch(() => {});
  }, [comment.id, comment.thread.length]);
  const send = async (text: string, uploads: Upload[]) => void (await call(`${comment.deck}/comments/${comment.id}/reply`, { method: "POST", json: { text, uploads: uploads.map((u) => u.id) } }));
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-2", !compact && "h-full")}>
      <ol className={cn("flex flex-col gap-2", compact ? "" : "min-h-0 flex-1 overflow-y-auto px-1")} aria-live="polite">
        {comment.thread.slice(from).map((m, i) => <MessageItem key={from + i} comment={comment} message={m} index={from + i} openOnClick={openOnClick} />)}
        <div ref={end} />
      </ol>
      {!reply ? null : comment.status !== "resolved" ? (
        <InputBar placeholder="Message the agent" onSend={send} upload={(f) => uploadFile(comment.deck, f)} uploadUrl={(u) => at(`${comment.deck}/uploads/${u.file}`)} />
      ) : (
        <p className="text-center text-[11px] text-ink-faint">Resolved. Reopen it to write again.</p>
      )}
    </div>
  );
}

/**
 * Raise a browser notification for a new message in a followed chat, while
 * the page is in the background.
 *
 * @param comment - the comment that changed.
 * @param seen - message counts already known, per comment; updated here.
 */
export function notifyFollowed(comment: FolioComment, seen: Map<string, number>): void {
  const before = seen.get(comment.id);
  seen.set(comment.id, comment.thread.length);
  const last = comment.thread[comment.thread.length - 1];
  const following = (comment.followers ?? []).includes(USER);
  if (before === undefined || comment.thread.length <= before || !last || last.author === USER || !following) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  new Notification(`${last.author} on ${comment.slide}`, { body: last.text.slice(0, 160), tag: comment.id });
}
