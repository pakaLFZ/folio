/**
 * Hooked slots in the browser: each slot's state, kept live, turned into a
 * figure URL or, for a text or table hook, its last good output. While a hook
 * runs, the last good figure stays on screen; a text slot shows its raw text.
 */
import { useEffect, useMemo, useState } from "react";
import { call } from "../api";
import { at } from "../boot";
import type { DeckStore } from "../editor/deckState";
import { useDeck } from "../editor/deckState";
import { staticFigure, type FigureResolver } from "../editor/slideEnv";
import type { FigureState, HookOutput } from "../slide/env";
import { subscribe } from "../stream/client";

export interface SlotView {
  phase: "ok" | "waiting" | "drawing" | "failed" | "paused" | "stale" | "invalid";
  goodKey: string | null;
  ext: string | null;
  output?: HookOutput | null;
  current?: boolean;
  message?: string;
  box?: { w: number; h: number };
}

export type HookStates = Record<string, Record<string, SlotView>>;

const PHASE: Record<SlotView["phase"], FigureState["state"]> = { ok: "ok", waiting: "drawing", drawing: "drawing", failed: "failed", paused: "paused", stale: "stale", invalid: "failed" };

/**
 * Turn hook states into a figure resolver.
 *
 * @param token - the deck token.
 * @param states - slot views by slide.
 * @param files - content versions of the deck files changed while open.
 * @returns a resolver for static paths and hook calls alike.
 */
export function hookResolver(token: string, states: HookStates, files?: Record<string, string>): FigureResolver {
  return (slide, slot, value) => {
    if (!value || typeof value !== "object") return staticFigure(token, value, files);
    const s = states[slide]?.[slot];
    if (!s) return { url: null, state: "drawing" };
    const url = s.goodKey && (s.ext === "png" || s.ext === "svg") ? at(`${token}/hookfig/${s.goodKey}.${s.ext}`) : null;
    return { url, state: PHASE[s.phase], output: s.output ?? null, current: !!s.current, message: s.phase === "invalid" ? "inputs fail the hook's schema" : s.message, ...(s.box ? { box: s.box } : {}) };
  };
}

/**
 * Load a deck's hook states once.
 *
 * @returns the states, or null while loading.
 */
export function useHookStates(token: string, live: boolean): HookStates | null {
  const [states, setStates] = useState<HookStates | null>(null);
  useEffect(() => {
    void call<{ slides: HookStates }>(`${token}/hooks`).then((r) => setStates(r.slides), () => setStates({}));
    if (!live) return;
    return subscribe([token], (m) => {
      if (m.type === "resync") void call<{ slides: HookStates }>(`${token}/hooks`).then((r) => setStates(r.slides));
      if (m.type !== "hook") return;
      const d = m.data as SlotView & { slide: string; slot: string };
      setStates((prev) => ({ ...prev, [d.slide]: { ...prev?.[d.slide], [d.slot]: { phase: d.phase, goodKey: d.goodKey, ext: d.ext, output: d.output ?? null, current: !!d.current, ...(d.message ? { message: d.message } : {}), ...(d.box ? { box: d.box } : {}) } } }));
    });
  }, [token, live]);
  return states;
}

/**
 * The editor's hook model: live states, the resolver, and presence reports.
 *
 * @param store - the deck store.
 * @returns the figure resolver.
 */
export function useHooks(store: DeckStore): FigureResolver {
  const state = useDeck(store);
  const states = useHookStates(state.token, true);
  useEffect(() => {
    if (!state.current) return;
    const report = () => void call(`${state.token}/presence`, { method: "POST", json: { slide: state.current } }).catch(() => {});
    report();
    const timer = setInterval(report, 20_000);
    return () => clearInterval(timer);
  }, [state.token, state.current]);
  return useMemo(() => hookResolver(state.token, states ?? {}, state.files), [state.token, states, state.files]);
}
