/**
 * The chat panel beside the board: the comment chosen on the board as a live
 * tiny chat, with a Resolve button, where it sits, and the way to its slide.
 * On a phone it covers the board.
 */
import { Check, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FolioComment, InboxRow } from "@folio/core";
import { call } from "../api";
import { Chat } from "../comments/Chat";
import { subscribe } from "../stream/client";
import { Button } from "../ui/button";
import { Tip } from "../ui/tooltip";
import { moveCard, rowLink } from "./inboxData";

/**
 * Keep one comment current.
 *
 * @returns the comment, or null while loading.
 */
function useLiveComment(deck: string, id: string): FolioComment | null {
  const [comment, setComment] = useState<FolioComment | null>(null);
  useEffect(() => {
    setComment(null);
    void call<FolioComment>(`${deck}/comments/${id}`).then(setComment, () => {});
    return subscribe([deck], (m) => {
      const c = m.type === "comment" ? (m.data as { comment: FolioComment }).comment : null;
      if (c?.id === id) setComment(c);
    });
  }, [deck, id]);
  return comment;
}

/**
 * The panel.
 *
 * @param props.row - the card that was opened.
 * @param props.onClose - closes the panel.
 */
export function ChatPanel({ row, onClose }: { row: InboxRow; onClose: () => void }) {
  const comment = useLiveComment(row.deck, row.id);
  return (
    <aside aria-label="Comment chat" className="glass fixed inset-0 z-[25] flex flex-col sm:absolute sm:inset-auto sm:bottom-3 sm:right-3 sm:top-0 sm:w-[380px] sm:rounded-pane">
      <header className="flex items-center gap-1 px-3 pb-1 pt-2.5">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.deckTitle} <span className="num text-[11px] font-normal text-ink-faint">{row.slide}</span></p>
        {comment && comment.status !== "resolved" ? (
          <Tip label="Resolve">
            <Button size="iconSm" aria-label="Resolve" onClick={() => void moveCard(row, "done")}>
              <Check />
            </Button>
          </Tip>
        ) : null}
        <Tip label="Open on its slide"><Button asChild size="iconSm" aria-label="Open on its slide"><a href={rowLink(row)}><ExternalLink /></a></Button></Tip>
        <Button size="iconSm" aria-label="Close" onClick={onClose}><X /></Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">{comment ? <Chat comment={comment} /> : <p className="text-[12px] text-ink-faint">Opening the chat</p>}</div>
    </aside>
  );
}
