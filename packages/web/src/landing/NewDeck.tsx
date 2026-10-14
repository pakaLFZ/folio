/**
 * The landing header's New deck button and its popover: a title and the pack
 * the deck uses, then Create, which makes `decks/<slug of title>/` on the
 * server (the same function as `folio init-deck`) and opens its editor. A
 * refusal, such as a folder of that name already there, is shown in the
 * popover and nothing is made.
 */
import { Plus } from "lucide-react";
import { Popover } from "radix-ui";
import { useState, type FormEvent } from "react";
import { call } from "../api";
import { at } from "../boot";
import { Button } from "../ui/button";
import { RadioGroup, RadioItem } from "../ui/choice";
import { Input } from "../ui/field";

interface Templates {
  templates: string[];
  default: string;
}

/** The button and its form. */
export function NewDeck() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [offered, setOffered] = useState<Templates | null>(null);
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const onOpen = (next: boolean) => {
    setOpen(next);
    setRefused(null);
    if (next) void call<Templates>("api/deck-templates").then((t) => (setOffered(t), setTemplate((v) => v || (t.templates.includes(t.default) ? t.default : (t.templates[0] ?? "")))), (e: Error) => setRefused(e.message));
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setRefused(null);
    call<{ token: string }>("api/decks", { method: "POST", json: { title, template } }).then(
      (made) => location.assign(at(`${made.token}/`)),
      (error: Error) => (setRefused(error.message), setBusy(false)),
    );
  };
  return (
    <Popover.Root open={open} onOpenChange={onOpen}>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm"><Plus />New deck</Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} aria-label="New deck" className="glass z-[30] w-72 rounded-menu p-3 outline-none">
          <form onSubmit={create} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[12px] text-ink-muted">
              Title
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group meeting" aria-invalid={refused ? true : undefined} />
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-[12px] text-ink-muted">Template</legend>
              {offered ? (
                <RadioGroup aria-label="Template" value={template} onValueChange={setTemplate} className="-mx-2 max-h-48 overflow-y-auto">
                  {offered.templates.map((t) => <RadioItem key={t} value={t}><span className="num">{t}</span></RadioItem>)}
                </RadioGroup>
              ) : <p className="text-[12px] text-ink-faint">Reading the packs</p>}
            </fieldset>
            {refused ? <p role="alert" className="text-[12px] leading-snug text-danger">{refused}</p> : null}
            <div className="flex justify-end gap-1.5">
              <Popover.Close asChild><Button type="button" variant="ghost" size="sm">Cancel</Button></Popover.Close>
              <Button type="submit" variant="solid" size="sm" disabled={busy || !title.trim() || !template}>Create</Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
