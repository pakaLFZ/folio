/**
 * Tell the server what this tab shows, so an agent can act on "this slide":
 * on every change (at most one report per `THROTTLE_MS`), on visibility and
 * focus, when the stream connects, every `HEARTBEAT_MS`, and `closed` on pagehide,
 * after which nothing more is sent (the visibilitychange that follows pagehide
 * would list the closing tab again) until a pageshow brings the page back.
 */
import { useEffect } from "react";
import type { ViewingReport } from "@folio/core";
import { at } from "../boot";
import { onStatus } from "../stream/client";
import type { DeckState, DeckStore } from "./deckState";
import { selectedIds } from "./railSelection";

const THROTTLE_MS = 150;
const HEARTBEAT_MS = 20_000;
const tab = Math.random().toString(36).slice(2, 12);

/** What the tab shows now. */
function currentReport(s: DeckState): ViewingReport {
  const slides = selectedIds(s);
  return {
    tab,
    token: s.token,
    slide: s.current,
    mode: s.mode,
    slot: s.selectedSlot,
    slides: slides.length > 1 ? slides : [],
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
  };
}

/** Send a report. */
function send(body: ViewingReport): void {
  void fetch(at("api/viewing"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

/**
 * Report this tab's view while the editor is open.
 *
 * @param store - the deck editor's store.
 */
export function useViewingReport(store: DeckStore): void {
  useEffect(() => {
    let last = "";
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = (force: boolean) => {
      timer = null;
      if (gone) return;
      const report = currentReport(store.get());
      const key = JSON.stringify(report);
      if (force || key !== last) send(report);
      last = key;
    };
    const soon = () => void (timer ??= setTimeout(() => flush(false), THROTTLE_MS));
    const now = () => flush(true);
    const closed = () => ((gone = true), navigator.sendBeacon(at("api/viewing"), JSON.stringify({ tab, closed: true })));
    const shown = () => ((gone = false), now());
    const offStore = store.subscribe(soon);
    const offStatus = onStatus((connected) => connected && now());
    const heartbeat = setInterval(now, HEARTBEAT_MS);
    const events: [EventTarget, string, () => void][] = [[document, "visibilitychange", now], [window, "focus", now], [window, "blur", now], [window, "pageshow", shown], [window, "pagehide", closed]];
    for (const [target, name, fn] of events) target.addEventListener(name, fn);
    now();
    return () => {
      offStore();
      offStatus();
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      for (const [target, name, fn] of events) target.removeEventListener(name, fn);
    };
  }, [store]);
}
