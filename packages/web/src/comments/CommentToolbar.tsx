/**
 * The floating sketch toolbar at the foot of the scene in Edit, centred
 * between the rail and the panel (the `--scene-*` insets the editor sets):
 * the Cursor tool (text editing, the default), then a divider, then one
 * unbroken draft tools group (region, pen, rectangle, arrow, undo, eraser),
 * then, after another divider, the editor's Shape and Text tools (slide
 * content, not a comment mark), when given. While a draft tool other than
 * Undo is current, a note above the toolbar says the marks it draws are
 * drafts for comments, not slide edits.
 */
import { MousePointer, MoveUpRight, Pen, Square, SquareMousePointer, Undo2, Eraser } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Segmented } from "../ui/segmented";
import { Tip } from "../ui/tooltip";
import type { DeckState } from "../editor/deckState";
import { TOOL_KEYS, useToolKeys } from "./toolKeys";
import type { CommentsModel, Tool } from "./useComments";

const DRAFT_TOOLS = new Set<Tool>(["region", "pen", "rect", "arrow", "eraser"]);

/** The editor's Shape tool, as the toolbar carries it. */
export interface ShapeToolSlot {
  active: boolean;
  drop: () => void;
  button: ReactNode;
}

/**
 * The toolbar.
 *
 * @param props.model - the comments model.
 * @param props.state - the deck state.
 * @param props.shape - the Shape tool: while it is on no comment tool shows
 *   chosen, and picking one drops it.
 */
export function CommentToolbar({ model, state, shape }: { model: CommentsModel; state: DeckState; shape?: ShapeToolSlot }) {
  const draft = model.draft?.slide === state.current ? model.draft : null;
  useToolKeys(state.mode === "edit", !!draft, model.setTool);
  useEffect(() => model.setTool("cursor"), [state.mode, model.setTool]);
  const tool = shape?.active ? ("" as Tool) : model.tool;
  const setTool = (t: Tool) => (shape?.drop(), model.setTool(t));
  const undo = () => model.editDraft((d) => (d.marks.length ? { ...d, marks: d.marks.slice(0, -1) } : { ...d, region: null }));
  const draftNote = state.mode === "edit" && DRAFT_TOOLS.has(tool);
  return (
    <div data-chrome="sketch-toolbar" className="pointer-events-none fixed bottom-[calc(var(--scene-bottom,0px)+var(--panel-inset)+var(--glass-edge-w)+var(--tabbar-margin)-2px)] left-[var(--scene-left,0px)] right-[var(--scene-right,0px)] z-[20] flex flex-col items-center gap-2 px-3">
      {draftNote ? (
        <div className="max-w-72 rounded-card border border-line bg-surface px-2.5 py-1.5 text-center text-[12px] leading-snug text-ink shadow-[var(--glass-lift)]">
          Draft marks for comments: they do not edit the slide.
        </div>
      ) : null}
      {state.mode === "edit" ? (
        <div role="toolbar" aria-label="Tools" className="glass pointer-events-auto flex items-center gap-0.5 rounded-control bg-sunken p-0.5">
          <ToolChoice tool={tool} setTool={setTool} />
          <Tip label="Undo the last mark"><Button size="icon" className="rounded-chip! text-ink-muted hover:text-ink" aria-label="Undo" disabled={!draft || (!draft.marks.length && !draft.region)} onClick={undo}><Undo2 /></Button></Tip>
          <Segmented<Tool> label="Eraser tool" className="bg-transparent p-0" itemClassName="size-[var(--corner-hit)] flex-none px-0" value={tool} onChange={setTool} options={[{ value: "eraser", label: <Eraser />, title: `Eraser: touch a mark to remove it (${TOOL_KEYS.eraser})` }]} />
          {shape ? (
            <>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
              {shape.button}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The Cursor tool, a divider, then the four selectable draft tools (region, pen, rectangle, arrow): one choice across two groups, continuing into Undo and Eraser with no divider between. */
function ToolChoice({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  return (
    <>
      <Segmented<Tool> label="Cursor tool" className="bg-transparent p-0" itemClassName="size-[var(--corner-hit)] flex-none px-0" value={tool} onChange={setTool} options={[{ value: "cursor", label: <MousePointer />, title: `Edit text (${TOOL_KEYS.cursor})` }]} />
      <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
      <Segmented<Tool>
        label="Comment tool"
        className="bg-transparent p-0"
        itemClassName="size-[var(--corner-hit)] flex-none px-0"
        value={tool}
        onChange={setTool}
        options={[
          { value: "region", label: <SquareMousePointer />, title: `Region: drag a box, or click a slot, to comment (${TOOL_KEYS.region})` },
          { value: "pen", label: <Pen />, title: `Pen (${TOOL_KEYS.pen})` },
          { value: "rect", label: <Square />, title: `Rectangle (${TOOL_KEYS.rect})` },
          { value: "arrow", label: <MoveUpRight />, title: `Arrow (${TOOL_KEYS.arrow})` },
        ]}
      />
    </>
  );
}
