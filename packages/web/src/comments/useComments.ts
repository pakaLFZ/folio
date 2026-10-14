/**
 * Comments in the editor: the deck's comments kept live, the comment in focus,
 * and the draft being written (region, sketch, text, uploads), saved to the
 * server about a second after each change so nothing is lost.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Box, FolioComment, Mark } from "@folio/core";
import { call } from "../api";
import { at } from "../boot";
import { useDeck, type DeckStore } from "../editor/deckState";
import { subscribe } from "../stream/client";

/** The sketch toolbar's tools: `cursor` edits text, the others draw a comment. */
export type Tool = "cursor" | "region" | "pen" | "rect" | "arrow" | "eraser";

export interface Upload {
  id: string;
  file: string;
  name: string;
  type: string;
  bytes: number;
}

export interface DraftState {
  id: string;
  slide: string;
  slideRev: string;
  region: Box | null;
  marks: Mark[];
  text: string;
  uploads: Upload[];
}

export type CommentView = FolioComment & { orphaned?: string | null; unread?: number };

export interface CommentsModel {
  comments: CommentView[];
  focus: string | null;
  setFocus: (cid: string | null) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  draft: DraftState | null;
  editDraft: (update: (d: DraftState) => DraftState) => void;
  discardDraft: () => Promise<void>;
  send: () => Promise<void>;
  sendSlide: (slide: string, text: string, uploads: Upload[]) => Promise<void>;
  reply: (cid: string, text: string, uploads: Upload[]) => Promise<void>;
  setStatus: (cid: string, status: "open" | "resolved") => Promise<void>;
  upload: (file: File) => Promise<Upload>;
  shotUrl: (cid: string, file: string) => string;
  uploadUrl: (u: Upload) => string;
}

/**
 * Follow a deck's comments and the user's draft.
 *
 * @param store - the deck store.
 * @returns the comments model.
 */
export function useComments(store: DeckStore): CommentsModel {
  const token = useDeck(store).token;
  const [comments, setComments] = useCommentList(token);
  const [focus, setFocusState] = useFocus();
  const [tool, setTool] = useState<Tool>("cursor");
  const { draft, setDraft, editDraft } = useDraft(store, token);
  const [unread, clearUnread] = useUnread(token);
  const setFocus = useCallback(
    (cid: string | null) => {
      if (cid) clearUnread(cid);
      setFocusState(cid);
    },
    [clearUnread, setFocusState],
  );
  return useMemo(() => {
    const discardDraft = async () => {
      if (draft) await call(`${token}/drafts/${draft.id}/discard`, { method: "POST", json: {} }).catch(() => {});
      setDraft(null);
      setTool("cursor");
    };
    const send = async () => {
      if (!draft || (!draft.text.trim() && !draft.uploads.length)) return;
      const made = await call<CommentView>(`${token}/comments`, { method: "POST", json: { slide: draft.slide, region: draft.region, marks: draft.marks, text: draft.text, draft: draft.id, uploads: draft.uploads.map((u) => u.id) } });
      setComments((prev) => (prev.some((x) => x.id === made.id) ? prev : [...prev, made]));
      setDraft(null);
      setTool("cursor");
      store.notify("Comment sent; agents see it in folio status and folio comments");
    };
    const sendSlide = async (slide: string, text: string, uploads: Upload[]) => {
      const d = draft && draft.slide === slide ? draft : null;
      const made = await call<CommentView>(`${token}/comments`, { method: "POST", json: { slide, region: d?.region ?? null, marks: d?.marks ?? [], text, draft: d?.id, uploads: uploads.map((u) => u.id) } });
      setComments((prev) => (prev.some((x) => x.id === made.id) ? prev : [...prev, made]));
      if (d) {
        setDraft(null);
        setTool("cursor");
      }
      store.notify("Comment sent; agents see it in folio status and folio comments");
    };
    const reply = async (cid: string, text: string, uploads: Upload[]) => void (await call(`${token}/comments/${cid}/reply`, { method: "POST", json: { text, uploads: uploads.map((u) => u.id) } }));
    const setStatus = async (cid: string, status: "open" | "resolved") => {
      await call(`${token}/comments/${cid}/status`, { method: "POST", json: { status } });
      if (status === "resolved" && focus === cid) setFocus(null);
      store.notify(status === "resolved" ? "Resolved and moved to the archive" : "Reopened");
    };
    const upload = (file: File) => uploadFile(token, file);
    const shotUrl = (cid: string, file: string) => at(`${token}/comments/${cid}/${file}`);
    const uploadUrl = (u: Upload) => at(`${token}/uploads/${u.file}`);
    const views = comments.map((c) => (unread[c.id] ? { ...c, unread: unread[c.id] } : c));
    return { comments: views, focus, setFocus, tool, setTool, draft, editDraft, discardDraft, send, sendSlide, reply, setStatus, upload, shotUrl, uploadUrl };
  }, [comments, setComments, focus, setFocus, tool, draft, setDraft, editDraft, token, store, unread]);
}

/**
 * Unread reply counts per comment, for the deck's token, kept live and
 * cleared optimistically the moment a comment is selected (the real read
 * state is recorded when its `Chat` mounts and posts `api/inbox/read`).
 *
 * @returns the counts, and a function that zeroes one locally.
 */
function useUnread(token: string): [Record<string, number>, (cid: string) => void] {
  const [unread, setUnread] = useState<Record<string, number>>({});
  useEffect(() => {
    const load = () =>
      void call<{ rows: { id: string; unread: number }[] }>(`api/inbox?scope=${encodeURIComponent(token)}`).then(
        (r) => setUnread(Object.fromEntries(r.rows.filter((x) => x.unread > 0).map((x) => [x.id, x.unread]))),
        () => {},
      );
    load();
    return subscribe([token], (m) => (m.type === "comment" || m.type === "resync" ? load() : undefined));
  }, [token]);
  const clear = useCallback((cid: string) => setUnread((u) => (u[cid] ? { ...u, [cid]: 0 } : u)), []);
  return [unread, clear];
}

/**
 * A deck's comments, archived ones included, kept live.
 *
 * @returns the list and its setter.
 */
function useCommentList(token: string) {
  const [comments, setComments] = useState<CommentView[]>([]);
  useEffect(() => {
    const load = () => void call<{ comments: CommentView[] }>(`${token}/comments?archived=1`).then((r) => setComments(r.comments));
    load();
    return subscribe([token], (m) => {
      if (m.type === "resync") load();
      if (m.type !== "comment") return;
      const c = (m.data as { comment: CommentView }).comment;
      setComments((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c]));
    });
  }, [token]);
  return [comments, setComments] as const;
}

/**
 * The comment in focus, named in the URL.
 *
 * @returns focus and its setter.
 */
function useFocus() {
  const [focus, setFocusState] = useState<string | null>(() => new URLSearchParams(location.search).get("comment"));
  const setFocus = useCallback((cid: string | null) => {
    setFocusState(cid);
    const url = new URL(location.href);
    if (cid) url.searchParams.set("comment", cid);
    else url.searchParams.delete("comment");
    history.replaceState(history.state, "", url);
  }, []);
  return [focus, setFocus] as const;
}

/**
 * The draft being written, saved a second after each change and restored
 * from `?draft=<id>`.
 *
 * @returns the draft, its setter, and `editDraft` which marks it for saving.
 */
function useDraft(store: DeckStore, token: string) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const dirty = useRef(false);
  const draftRef = useRef<DraftState | null>(null);
  draftRef.current = draft;
  useDraftRestore(token, setDraft, store);
  useSlideDraft(store, token, draftRef, setDraft);
  useEffect(() => {
    if (!draft || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      void call(`${token}/drafts/${draft.id}`, { method: "PUT", json: { ...draft, uploads: draft.uploads.map((u) => u.id), uploadsMeta: draft.uploads } });
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, token]);
  const editDraft = useCallback(
    (update: (d: DraftState) => DraftState) => {
      dirty.current = true;
      const slide = store.get().current ?? "";
      setDraft((d) => update(d && d.slide === slide ? d : newDraft(store)));
    },
    [store],
  );
  return { draft, setDraft, editDraft };
}

/**
 * Keep the open draft matched to the current slide. Without this, drawing
 * after a slide switch silently wrote its marks into the draft left on the
 * slide behind (its `slide` field never moved), so the new mark showed
 * nowhere and the old slide gained marks that were never drawn on it: "the
 * drawing disappears on slide for some reason" *(user, 2026-10-14)*. When the
 * current slide no longer owns the in-memory draft, its own saved draft (if
 * the user had one going, from the autosave a second after each change) is
 * loaded back in its place, rather than starting over or keeping the wrong
 * one. The draft left behind is flushed to disk first (the 1 s autosave may
 * not have fired yet), so a switch away never drops a mark drawn moments
 * before.
 */
function useSlideDraft(store: DeckStore, token: string, draftRef: RefObject<DraftState | null>, setDraft: (d: DraftState | null) => void): void {
  const current = useDeck(store).current;
  const seen = useRef(current);
  useEffect(() => {
    if (seen.current === current) return;
    seen.current = current;
    const leaving = draftRef.current;
    if (leaving?.slide === current) return;
    let cancelled = false;
    const flush = leaving
      ? call(`${token}/drafts/${leaving.id}`, { method: "PUT", json: { ...leaving, uploads: leaving.uploads.map((u) => u.id), uploadsMeta: leaving.uploads } }).catch(() => {})
      : Promise.resolve();
    void flush
      .then(() => call<{ drafts: (DraftState & { uploadsMeta?: Upload[] })[] }>(`${token}/drafts`))
      .then(
        (r) => {
          if (cancelled) return;
          const found = r.drafts.find((d) => d.slide === current);
          setDraft(found ? { ...found, uploads: found.uploadsMeta ?? [] } : null);
        },
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, [current, token, draftRef, setDraft]);
}

/**
 * A new draft on the current slide.
 *
 * @returns an empty draft with a fresh id.
 */
function newDraft(store: DeckStore): DraftState {
  const s = store.get();
  const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return { id, slide: s.current ?? "", slideRev: s.current ? (s.slides[s.current]?.rev ?? "") : "", region: null, marks: [], text: "", uploads: [] };
}

/**
 * Restore a draft named in the URL (`?draft=<id>`), as the inbox links it.
 */
function useDraftRestore(token: string, setDraft: (d: DraftState) => void, store: DeckStore): void {
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("draft");
    if (!id) return;
    void call<{ drafts: (DraftState & { uploadsMeta?: Upload[] })[] }>(`${token}/drafts`).then((r) => {
      const d = r.drafts.find((x) => x.id === id);
      if (!d) return;
      setDraft({ ...d, uploads: d.uploadsMeta ?? [] });
      store.set((s) => ({ ...s, current: d.slide, mode: "edit" }));
    });
  }, [token, setDraft, store]);
}

/**
 * Upload a file to the deck's staging area.
 *
 * @returns the staged upload, to send with a comment or reply.
 */
export async function uploadFile(token: string, file: File): Promise<Upload> {
  const res = await fetch(at(`${token}/uploads`), { method: "POST", headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) }, body: file });
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail ?? `upload failed (${res.status})`);
  return body as Upload;
}


