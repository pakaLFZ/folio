/**
 * The services that plug into the editor and the print page.
 */
import type { Pack } from "@folio/core";
import type { DeckStore } from "./editor/deckState";
import { useDeck } from "./editor/deckState";
import type { EditorExtensions } from "./editor/DeckEditor";
import { TAB_ICONS } from "./editor/Panel";
import type { FigureResolver } from "./editor/slideEnv";
import { hookResolver, useHookStates, useHooks } from "./hooks/useHooks";
import { QueueTab, useQueue } from "./hooks/QueueTab";
import { boot } from "./boot";
import { useWarnings } from "./warnings/useWarnings";
import { useEffect, useState } from "react";
import { call } from "./api";
import { CommentsTab } from "./comments/CommentsTab";
import { useFollowNotifications } from "./inbox/notify";
import { CommentBubble } from "./comments/CommentBubble";
import { CommentToolbar } from "./comments/CommentToolbar";
import { dropShapeTool, selectedItem, ShapeToolButton } from "./editor/ShapeTools";
import { TextToolButton } from "./editor/TextTools";
import { Sketch, toolCursor } from "./comments/Sketch";
import { useComments } from "./comments/useComments";
import { subscribe } from "./stream/client";
import { useQuestionList } from "./questions/useQuestions";
import type { Questionnaire } from "@folio/core";

/**
 * The editor extensions in use, as a hook over the live deck.
 *
 * @param store - the deck store.
 * @param pack - the deck's pack.
 * @returns tabs, totals, marks and resolvers.
 */
export function useEditorExtensions(store: DeckStore, pack: Pack | null): EditorExtensions {
  const state = useDeck(store);
  const warnings = useWarnings(store);
  const figure = useHooks(store);
  const queue = useQueue();
  const comments = useComments(store);
  const inbox = useUnread();
  const asked = (useQuestionList(state.token) ?? []).filter((q) => q.status === "open");
  useQuestionLink(store, state.token, comments.setFocus);
  useArrival(store, comments.focus);
  useOneToolAtATime(store, !!state.shapeTool || !!state.textTool, comments.tool, comments.setTool);
  useFollowNotifications();
  const jobs = (queue?.running.length ?? 0) + (queue?.queued.length ?? 0);
  const open = comments.comments.filter((c) => c.status !== "resolved").length;
  return {
    figure,
    unread: inbox,
    asked: new Set(asked.flatMap((q) => (q.slide ? [q.slide] : []))),
    overlay: pack ? <Sketch model={comments} state={state} pack={pack} /> : null,
    chrome: (
      <>
        <CommentToolbar model={comments} state={state} shape={pack ? { active: !!state.shapeTool || !!state.textTool, drop: () => dropShapeTool(store), button: <><ShapeToolButton store={store} state={state} pack={pack} onPick={() => comments.setTool("cursor")} /><TextToolButton store={store} state={state} pack={pack} onPick={() => comments.setTool("cursor")} /></> } : undefined} />
        {pack ? <CommentBubble model={comments} state={state} pack={pack} /> : null}
      </>
    ),
    cursor: state.mode !== "edit" ? undefined : state.shapeTool || state.textTool ? "crosshair" : toolCursor(comments.tool),
    focusTab: comments.focus ? `comments:${comments.focus}` : state.mode === "edit" && comments.tool !== "cursor" ? "comments:tool" : null,
    warned: warnings.warned,
    tabs: [
      ...(pack ? [{ value: "comments", label: "Comments", icon: TAB_ICONS.comments, count: open, body: <CommentsTab store={store} state={state} pack={pack} model={comments} /> }] : []),
      { value: "queue", label: "Queue", icon: TAB_ICONS.queue, count: jobs, body: <QueueTab snap={queue} /> },
    ],
  };
}

/**
 * Figure resolution for the print page.
 *
 * @returns a resolver, or null while hook states load.
 */
export function usePrintFigure(): FigureResolver | null {
  const token = boot.deck!.token;
  const states = useHookStates(token, false);
  return states ? hookResolver(token, states) : null;
}

/**
 * The user's unread comment messages across the workspace, kept current; a
 * questionnaire an agent asks is one of them.
 *
 * @returns the count the inbox button shows.
 */
function useUnread(): number {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const load = () => void call<{ unread: number }>("api/inbox?view=open").then((r) => setUnread(r.unread), () => {});
    load();
    return subscribe(["*"], (m) => (m.type === "comment" ? load() : undefined));
  }, []);
  return unread;
}

/**
 * An address naming a questionnaire (`?question=<id>`) opens the comment it
 * was asked in, on its slide, and the address names that comment instead.
 */
function useQuestionLink(store: DeckStore, token: string, openComment: (cid: string) => void): void {
  useEffect(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get("question");
    if (!id) return;
    void call<Questionnaire>(`${token}/questions/${id}`).then(async (q) => {
      const comment = await call<{ slide: string }>(`${token}/comments/${q.comment}`);
      url.searchParams.delete("question");
      history.replaceState(history.state, "", url);
      store.set((s) => ({ ...s, current: comment.slide, mode: "edit" }));
      openComment(q.comment);
    }, () => {});
  }, [store, token, openComment]);
}

/**
 * The Shape tool and a comment tool are never chosen together: picking the
 * Shape tool puts the comment tool back to Cursor; picking a comment tool
 * drops the Shape tool and deselects a shape, which closes its popover.
 */
function useOneToolAtATime(store: DeckStore, shapeTool: boolean, commentTool: string, setCommentTool: (t: "cursor") => void): void {
  useEffect(() => {
    if (shapeTool) setCommentTool("cursor");
  }, [shapeTool, setCommentTool]);
  useEffect(() => {
    if (commentTool !== "cursor") store.set((s) => (s.shapeTool || s.textTool || selectedItem(s) ? { ...s, shapeTool: false, textTool: false, selectedSlot: selectedItem(s) ? null : s.selectedSlot } : s));
  }, [commentTool, store]);
}

/**
 * Arriving from a comment link puts the editor in Edit on its slide, where
 * the comment's region and marks show.
 *
 * @param focus - the comment id from the URL, if any.
 */
function useArrival(store: DeckStore, focus: string | null): void {
  const [arrival] = useState(focus);
  useEffect(() => {
    if (arrival) store.set((s) => ({ ...s, mode: "edit" }));
  }, [arrival, store]);
}
