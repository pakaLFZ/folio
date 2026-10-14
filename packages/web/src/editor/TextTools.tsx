/**
 * The Text tool in the bottom tool row and its options popover, pinned above
 * its button while the tool is on or a text box is selected: it sets the next
 * box drawn, or edits the selected one (spec/slides/drawing.md, "Text boxes
 * in the editor"). T turns the tool on; its other keys are the shape keys'.
 */
import { Type } from "lucide-react";
import { textBoxRole, type Pack } from "@folio/core";
import { Segmented } from "../ui/segmented";
import type { DeckState, DeckStore } from "./deckState";
import { propsOf } from "./shapeModel";
import { chooseText, ToolPopover } from "./ShapeTools";
import { writeShape } from "./shapeWrites";
import { lookOf, lookOps, textBoxesOf, withChange, type TextLook } from "./textBoxModel";
import { blockLanguageOps, blocksOf, blockStyleOf, blockStyleOps } from "./blockModel";
import { BlockOptions } from "./BlockOptions";
import type { CodeLanguage } from "@folio/core";
import { TextOptions } from "./TextOptions";
import { ItemDraftToggle } from "./DraftToggle";

/** The text box selected on the current slide, if any. */
export function selectedTextBox(s: DeckState): string | undefined {
  const spec = s.current ? s.slides[s.current]?.spec : null;
  return spec && s.selectedSlot ? textBoxesOf(propsOf(spec)).find((x) => x.name === s.selectedSlot)?.name : undefined;
}

/** The block selected on the current slide, if any. */
export function selectedBlock(s: DeckState): string | undefined {
  const spec = s.current ? s.slides[s.current]?.spec : null;
  return spec && s.selectedSlot ? blocksOf(propsOf(spec)).find((x) => x.name === s.selectedSlot)?.name : undefined;
}

/** The popover of a selected block: its style and, for code, its language; each change is one write. */
function BlockPopover({ store, state, pack, name }: { store: DeckStore; state: DeckState; pack: Pack; name: string }) {
  const id = state.current!;
  const props = propsOf(state.slides[id]!.spec!);
  const value = props[name];
  const language = value && typeof value === "object" ? (value as { language?: CodeLanguage }).language : undefined;
  return (
    <ToolPopover label="Block options" kind="text" title={`Block ${name.slice("block:".length)}`} name={name}>
      <ItemDraftToggle store={store} state={state} name={name} />
      <BlockOptions pack={pack} style={blockStyleOf(props, name) ?? ""} language={language} onStyle={(style) => style && void writeShape(store, id, name, (now) => blockStyleOps(now, pack, name, style))} onLanguage={(l) => void writeShape(store, id, name, (now) => blockLanguageOps(now, pack, name, l))} />
    </ToolPopover>
  );
}

/** The popover's controls: the selected box's own look, else the next box's, which may be a block style instead. */
function TextPopover({ store, state, pack }: { store: DeckStore; state: DeckState; pack: Pack }) {
  const block = selectedBlock(state);
  if (block && state.current) return <BlockPopover store={store} state={state} pack={pack} name={block} />;
  const name = selectedTextBox(state);
  const base = pack.roles[textBoxRole(pack)];
  const spec = state.current ? state.slides[state.current]?.spec : null;
  if (name && spec && state.current) {
    const id = state.current;
    const edit = (change: Partial<TextLook>) => void writeShape(store, id, name, (now) => lookOps(now, name, withChange(lookOf(propsOf(now), name), change)));
    return (
      <ToolPopover label="Text box options" kind="text" title={`Text box ${name.slice("text:".length)}`} name={name}>
        <ItemDraftToggle store={store} state={state} name={name} />
        <TextOptions look={lookOf(propsOf(spec), name)} base={base} pack={pack} onChange={edit} />
      </ToolPopover>
    );
  }
  const set = (change: Partial<TextLook>) => store.set((s) => ({ ...s, textNext: withChange(s.textNext ?? {}, change) }));
  const next = state.blockNext ?? null;
  const setBlock = (style: string) => store.set((s) => ({ ...s, blockNext: style ? { style } : null }));
  return (
    <ToolPopover label="Text box options" kind="text" title={next ? "Next block" : "Next text box"}>
      <ItemDraftToggle store={store} state={state} />
      <BlockOptions pack={pack} style={next?.style ?? ""} language={next?.language} plain="Text box" onStyle={setBlock} onLanguage={(language) => store.set((s) => ({ ...s, blockNext: s.blockNext ? { ...s.blockNext, language } : null }))} />
      {next ? null : <TextOptions look={state.textNext ?? {}} base={base} pack={pack} onChange={set} />}
    </ToolPopover>
  );
}

/**
 * The Text tool's button, with its popover pinned above it while the tool is
 * on or a text box is selected.
 *
 * @param props.onPick - called when the tool is picked, so the comment tools step aside.
 */
export function TextToolButton({ store, state, pack, onPick }: { store: DeckStore; state: DeckState; pack: Pack; onPick: () => void }) {
  const open = !!state.textTool || !!selectedTextBox(state) || !!selectedBlock(state);
  return (
    <div className="relative flex" data-text-tool-button="">
      <Segmented<"text" | "">
        label="Text tool"
        className="bg-transparent p-0"
        itemClassName="size-[var(--corner-hit)] flex-none px-0"
        value={state.textTool ? "text" : ""}
        onChange={() => (onPick(), chooseText(store))}
        options={[{ value: "text", label: <Type />, name: "Text box", title: "Text box: drag on the slide to draw one and type in it; options above (T)" }]}
      />
      {open ? <TextPopover store={store} state={state} pack={pack} /> : null}
    </div>
  );
}
