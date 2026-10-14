/**
 * "Clear all" at the right end of a column header, and the popover that asks
 * before it clears. The popover is one compact row of two icon buttons: an X
 * that cancels and a check that confirms, each named by its `Tip`; Escape
 * cancels even while the focused X shows its tooltip. Nothing is
 * deleted: drafts move to the drafts archive, task cards are resolved into
 * Done, and Done cards leave the board while staying archived and searchable.
 * One request clears exactly the cards shown.
 */
import { Check, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import type { InboxRow, InboxView } from "@folio/core";
import { call } from "../api";
import { Tip } from "../ui/tooltip";

type ConfirmTip = (n: number, title: string) => string;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const RESOLVE: ConfirmTip = (n, title) => `Resolve ${plural(n, "card")} from ${title}`;

/** The columns that can be cleared. */
export type ClearableView = InboxView;

const WORDING: Record<ClearableView, ConfirmTip> = {
  drafts: (n) => `Discard ${plural(n, "draft")}`,
  queue: RESOLVE,
  progress: RESOLVE,
  review: RESOLVE,
  held: RESOLVE,
  done: (n, title) => `Clear ${plural(n, "card")} from ${title}`,
};

/** Send one clear for the cards shown in a column. */
function clearCards(column: ClearableView, rows: InboxRow[]): Promise<unknown> {
  return call("api/inbox/clear", { method: "POST", json: { column, cards: rows.map((r) => ({ deck: r.deck, id: r.id })) } });
}

/**
 * The button and its confirmation.
 *
 * @param props.view - the column.
 * @param props.title - its name, as the header shows it.
 * @param props.rows - the cards the column shows; only these are cleared.
 */
export function ClearColumn({ view, title, rows }: { view: ClearableView; title: string; rows: InboxRow[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [shown, setShown] = useState<InboxRow[]>([]);
  const onOpen = (next: boolean) => (setOpen(next), setRefused(null), next && setShown(rows));
  const confirm = () => {
    setBusy(true);
    clearCards(view, shown).then(() => setOpen(false), (e: Error) => setRefused(e.message)).finally(() => setBusy(false));
  };
  const n = shown.length;
  const confirmLabel = WORDING[view](n, title);
  return (
    <Popover.Root open={open} onOpenChange={onOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="-my-1 ml-auto h-6 rounded-chip px-1.5 text-[11px] font-normal text-ink-faint transition-colors duration-[120ms] hover:bg-whisper hover:text-ink data-[state=open]:bg-whisper data-[state=open]:text-ink">Clear all</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} aria-label={`Clear ${title}`} onKeyDownCapture={(e) => e.key === "Escape" && onOpen(false)} className="glass z-[30] rounded-menu p-1 outline-none">
          {refused ? <p role="alert" className="mb-1 max-w-56 px-1 text-[12px] leading-snug text-danger">{refused}</p> : null}
          <div className="flex items-center gap-1">
            <Tip label="Cancel">
              <Popover.Close asChild>
                <button type="button" aria-label="Cancel" className="flex size-6 items-center justify-center rounded-chip text-ink-muted transition-colors duration-[120ms] hover:bg-whisper hover:text-ink [&_svg]:size-3.5">
                  <X aria-hidden />
                </button>
              </Popover.Close>
            </Tip>
            <Tip label={confirmLabel}>
              <button type="button" aria-label={confirmLabel} disabled={busy} onClick={confirm} className="flex size-6 items-center justify-center rounded-chip bg-ink text-on-ink transition-colors duration-[120ms] hover:bg-ink-strong-hover disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5">
                <Check aria-hidden />
              </button>
            </Tip>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
