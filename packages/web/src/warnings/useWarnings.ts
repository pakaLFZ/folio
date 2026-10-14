/**
 * Warnings in the browser: the server's list, kept live, and the live view's
 * line measurements and render failures sent back so `folio status` and
 * `check` show what the browser shows. The slide ids with an active failure
 * mark the rail, except a vocabulary warning (FOLIO-VOC-001), which is for
 * agents only ("vocab check dont leave reddot on page", user 2026-10-13); reviewing and acknowledging warnings themselves is `folio
 * check` and `folio ack`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { FolioWarning } from "@folio/core";
import { call } from "../api";
import { useDeck, type DeckStore } from "../editor/deckState";
import { subscribe } from "../stream/client";

export interface WarningsModel {
  warned: Set<string>;
}

/**
 * Whether a warning counts: present and not acknowledged.
 *
 * @param w - a warning.
 * @returns true for active warnings.
 */
export const active = (w: FolioWarning) => w.state !== "absent" && !w.ack;

/** Whether a warning puts the red dot on its slide in the rail: an active failure that is not about vocabulary. */
export const marksRail = (w: FolioWarning) => w.kind === "fail" && w.source !== "vocabulary";

/**
 * Follow a deck's warnings.
 *
 * @param store - the deck store.
 * @returns the slide ids to mark in the rail.
 */
export function useWarnings(store: DeckStore): WarningsModel {
  const state = useDeck(store);
  const [bySlide, setBySlide] = useState<Record<string, FolioWarning[]>>({});
  const posted = useRef<Record<string, string>>({});
  const token = state.token;
  useEffect(() => {
    void call<{ warnings: FolioWarning[] }>(`${token}/warnings`).then((r) => setBySlide(group(r.warnings)));
    return subscribe([token], (m) => {
      if (m.type === "warnings") {
        const d = m.data as { slide: string; warnings: FolioWarning[] };
        setBySlide((prev) => ({ ...prev, [d.slide]: d.warnings }));
      }
    });
  }, [token]);
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const id of new Set([...Object.keys(state.overflow), ...Object.keys(state.renderErrors ?? {})])) {
        const rev = state.slides[id]?.rev;
        const failed = state.renderErrors?.[id];
        const renderError = failed && failed.rev === rev ? failed.message : undefined;
        const slots = Object.values(state.overflow[id] ?? {});
        const key = `${rev}:${JSON.stringify(slots)}:${renderError ?? ""}`;
        if (!rev || (!renderError && !state.overflow[id]) || posted.current[id] === key) continue;
        posted.current[id] = key;
        void call(`${token}/measure`, { method: "POST", json: { slide: id, rev, slots, renderError } }).catch(() => delete posted.current[id]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [state.overflow, state.renderErrors, state.slides, token]);
  return useMemo(() => {
    const all = Object.values(bySlide).flat().filter(active);
    const warned = new Set(all.filter(marksRail).map((w) => w.location.slide));
    return { warned };
  }, [bySlide]);
}

/**
 * Group a flat warning list by slide.
 *
 * @returns warnings keyed by slide id.
 */
function group(warnings: FolioWarning[]): Record<string, FolioWarning[]> {
  const out: Record<string, FolioWarning[]> = {};
  for (const w of warnings) (out[w.location.slide] ??= []).push(w);
  return out;
}
