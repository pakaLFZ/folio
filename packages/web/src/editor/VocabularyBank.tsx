/**
 * The Slide tab's Vocabulary bank section: the deck's resolved bank, each
 * word with a mark of where it comes from, editable in place. Every change is
 * one request against the bank's revision and lands in the deck's own
 * `vocabulary.md` (spec/slides/vocabulary.md); the pack's bank and other
 * decks' banks are never written from here.
 */
import { Check, Plus, Trash2, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { OriginEntry, VocabOp } from "@folio/core";
import { ApiError, call } from "../api";
import { subscribe } from "../stream/client";
import { Input, Textarea } from "../ui/field";
import { cn } from "../ui/cn";
import { Tip } from "../ui/tooltip";

export interface VocabularyView {
  rev: string;
  own: string;
  hasOwn: boolean;
  pack: string | null;
  entries: OriginEntry[];
  sections: { heading: string; text: string; origin: string }[];
  problems: string[];
}

/** The bank, kept current with the deck's `vocabulary` events, and one change at a time. */
function useBank(token: string) {
  const [bank, setBank] = useState<VocabularyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => call<VocabularyView>(`${token}/vocabulary`).then(setBank, (e: Error) => setError(e.message)), [token]);
  useEffect(() => {
    void load();
    return subscribe([token], (m) => void (m.type === "vocabulary" && load()));
  }, [token, load]);
  const change = async (op: VocabOp) => {
    const send = (rev: string) => call<VocabularyView>(`${token}/vocabulary`, { method: "POST", json: { rev, op } });
    try {
      setBank(await send(bank?.rev ?? "none"));
      setError(null);
    } catch (e) {
      const current = e instanceof ApiError && e.status === 409 ? (e.problem.current as VocabularyView) : null;
      if (current) return send(current.rev).then(setBank, (again: Error) => setError(again.message));
      setError((e as Error).message);
    }
  };
  return { bank, error, change };
}

/** Where a word comes from, in one short word. */
function originMark(origin: string, bank: VocabularyView): string {
  if (origin === bank.own) return "deck";
  if (origin.startsWith("templates/")) return "pack";
  return origin.replace(/^decks\//, "");
}

/** Text that turns into a field on click; Enter or leaving saves, Escape cancels. */
function EditableCell({ value, label, onSave, className }: { value: string; label: string; onSave: (next: string) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    if (draft !== null && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Enter") finish();
    if (e.key === "Escape") setDraft(null);
  };
  if (draft !== null) return <Input autoFocus aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={finish} onKeyDown={keys} className="h-6 px-1.5 text-[12px]" />;
  return (
    <button type="button" aria-label={`${label}: ${value || "empty"}, click to edit`} onClick={() => setDraft(value)} className={cn("min-h-6 w-full rounded-control px-1.5 py-0.5 text-left text-[12px] leading-snug transition-colors duration-[120ms] hover:bg-whisper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", className)}>
      {value || <span className="text-ink-faint">none</span>}
    </button>
  );
}

/** The bin on a row, and the popover that asks before the word goes. */
function DeleteWord({ use, inherited, onDelete }: { use: string; inherited: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const label = inherited ? `Drop "${use}" from this deck's bank` : `Delete "${use}"`;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tip label={label}>
        <Popover.Trigger asChild>
          <button type="button" aria-label={label} className="flex size-6 items-center justify-center rounded-chip text-ink-faint opacity-0 transition-[opacity,color,background-color] duration-[120ms] hover:bg-whisper hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-3.5">
            <Trash2 aria-hidden />
          </button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} aria-label={label} className="glass z-[30] flex items-center gap-1 rounded-menu p-1 outline-none">
          <Tip label="Cancel">
            <Popover.Close asChild>
              <button type="button" aria-label="Cancel" className="flex size-6 items-center justify-center rounded-chip text-ink-muted transition-colors duration-[120ms] hover:bg-whisper hover:text-ink [&_svg]:size-3.5">
                <X aria-hidden />
              </button>
            </Popover.Close>
          </Tip>
          <Tip label={label}>
            <button type="button" aria-label={`Confirm: ${label}`} onClick={() => (setOpen(false), onDelete())} className="flex size-6 items-center justify-center rounded-chip bg-ink text-on-ink transition-colors duration-[120ms] hover:bg-ink-strong-hover [&_svg]:size-3.5">
              <Check aria-hidden />
            </button>
          </Tip>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One word: Use and Never edit in place; Since and the origin under them. */
function WordRow({ entry, bank, change }: { entry: OriginEntry; bank: VocabularyView; change: (op: VocabOp) => void }) {
  const mark = originMark(entry.origin, bank);
  const save = (patch: Partial<OriginEntry>) => change({ kind: "set", from: entry.use, use: patch.use ?? entry.use, never: patch.never ?? entry.never, since: entry.since });
  return (
    <li className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.5rem] items-start gap-x-1 border-t border-line-soft py-1 first:border-t-0" data-vocab-word={entry.use}>
      <EditableCell label="Use" value={entry.use} onSave={(use) => use && save({ use })} className="text-ink" />
      <EditableCell label="Never" value={entry.never} onSave={(never) => save({ never })} className="text-ink-muted" />
      <DeleteWord use={entry.use} inherited={mark !== "deck"} onDelete={() => change({ kind: "delete", use: entry.use })} />
      <p className="col-span-3 flex gap-1.5 px-1.5 text-[10.5px] leading-4 text-ink-faint">
        <Tip label={entry.origin}>
          <span className="num shrink-0 rounded-chip bg-whisper px-1 text-ink-muted" data-origin={mark}>{mark}</span>
        </Tip>
        <span className="truncate" title={entry.since}>{entry.since}</span>
      </p>
    </li>
  );
}

/** The last row: a new word's Use and Never; Since is today. */
function AddWord({ change }: { change: (op: VocabOp) => void }) {
  const [use, setUse] = useState("");
  const [never, setNever] = useState("");
  const add = () => {
    if (!use.trim()) return;
    change({ kind: "set", use: use.trim(), never: never.trim() });
    setUse("");
    setNever("");
  };
  const enter = (e: KeyboardEvent) => e.key === "Enter" && add();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.5rem] items-center gap-x-1 border-t border-line-soft pt-1.5">
      <Input aria-label="New word: use" placeholder="Use" value={use} onChange={(e) => setUse(e.target.value)} onKeyDown={enter} className="h-6 px-1.5 text-[12px]" />
      <Input aria-label="New word: never" placeholder="Never, comma-separated" value={never} onChange={(e) => setNever(e.target.value)} onKeyDown={enter} className="h-6 px-1.5 text-[12px]" />
      <Tip label="Add word">
        <button type="button" aria-label="Add word" disabled={!use.trim()} onClick={add} className="flex size-6 items-center justify-center rounded-chip text-ink-muted transition-colors duration-[120ms] hover:bg-whisper hover:text-ink disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5">
          <Plus aria-hidden />
        </button>
      </Tip>
    </div>
  );
}

/** A text section of the bank (phrasing, abstract frames), saved when the field is left. */
function SectionText({ section, change }: { section: VocabularyView["sections"][number]; change: (op: VocabOp) => void }) {
  const [draft, setDraft] = useState(section.text);
  useEffect(() => setDraft(section.text), [section.text]);
  return (
    <label className="block space-y-1">
      <span className="section-title block">{section.heading}</span>
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== section.text && change({ kind: "section", heading: section.heading, text: draft })} className="max-h-80 overflow-y-auto px-2 py-1.5 text-[11.5px] leading-[16px]" />
    </label>
  );
}

/**
 * The section's body.
 *
 * @param props.token - the deck.
 */
export function VocabularyBank({ token }: { token: string }) {
  const { bank, error, change } = useBank(token);
  if (!bank) return <p className="text-[11px] text-ink-faint">{error ?? "Loading the bank..."}</p>;
  const apply = (op: VocabOp) => void change(op);
  return (
    <div className="space-y-3" data-vocab-rev={bank.rev}>
      <p className="text-[11px] leading-snug text-ink-faint">
        {bank.hasOwn ? `Edits save to ${bank.own}/vocabulary.md.` : `This deck uses the ${bank.pack ?? "pack"} bank; the first edit makes its own, inheriting it.`} A Never word on a slide is a warning only.
      </p>
      {error ? <p role="alert" className="text-[11px] text-danger">{error}</p> : null}
      <div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.5rem] gap-x-1 px-1.5 pb-0.5 text-[10.5px] text-ink-faint">
          <span>Use</span>
          <span>Never</span>
        </div>
        <ul aria-label="Words">{bank.entries.map((e) => <WordRow key={`${e.origin}:${e.use}`} entry={e} bank={bank} change={apply} />)}</ul>
        <AddWord change={apply} />
      </div>
      {bank.sections.map((s) => <SectionText key={s.heading} section={s} change={apply} />)}
    </div>
  );
}
