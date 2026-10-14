/**
 * Draft or Final, at the top of the Shape and Text box popovers. What the user
 * draws is a draft by default: a sketch of intent for an agent, shown in Edit
 * only (spec/slides/drafts.md). The toggle marks the selected item final, or
 * makes the next one final from the start.
 */
import { clearOverride, overridesPatch, setOverride, type PatchOp, type SlideSpec } from "@folio/core";
import { Segmented } from "../ui/segmented";
import type { DeckState, DeckStore } from "./deckState";
import { propsOf } from "./shapeModel";
import { writeShape } from "./shapeWrites";

type Status = "draft" | "final";

/** Whether an added slot is marked a draft. */
export function isDraft(props: Record<string, unknown>, name: string): boolean {
  const slots = (props.overrides as { slots?: Record<string, { draft?: unknown }> } | undefined)?.slots;
  return slots?.[name]?.draft === true;
}

/** Mark an added slot a draft, or final (the field removed), in one patch. */
export function draftOps(spec: SlideSpec, name: string, draft: boolean): PatchOp[] {
  const overrides = propsOf(spec).overrides;
  return overridesPatch(spec, draft ? setOverride(overrides, `slots.${name}.draft`, true) : clearOverride(overrides, `slots.${name}.draft`));
}

/** The toggle. */
export function DraftToggle({ draft, onChange }: { draft: boolean; onChange: (draft: boolean) => void }) {
  return (
    <Segmented<Status>
      label="Draft or final"
      className="w-full"
      value={draft ? "draft" : "final"}
      onChange={(v) => onChange(v === "draft")}
      options={[
        { value: "draft", label: "Draft", title: "A sketch for an agent: shown while editing only, left out of View, the PDF and shots" },
        { value: "final", label: "Final", title: "Slide content: shown everywhere, printed in the PDF" },
      ]}
    />
  );
}

/**
 * The toggle for a popover: the selected item's status, written at once, or,
 * with no `name`, the status the next item is drawn with.
 */
export function ItemDraftToggle({ store, state, name }: { store: DeckStore; state: DeckState; name?: string }) {
  const id = state.current;
  const spec = id ? state.slides[id]?.spec : null;
  if (name && id && spec) return <DraftToggle draft={isDraft(propsOf(spec), name)} onChange={(draft) => void writeShape(store, id, name, (now) => draftOps(now, name, draft))} />;
  return <DraftToggle draft={!state.nextFinal} onChange={(draft) => store.set((s) => ({ ...s, nextFinal: !draft }))} />;
}
