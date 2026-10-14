/**
 * The deck editor page at `/<deck8>/`: scene, rail, panel and their corner
 * controls, wired to the live stream.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Pack } from "@folio/core";
import { boot } from "../boot";
import { subscribe, onStatus } from "../stream/client";
import { installPackFonts } from "../slide/fonts";
import { Notice } from "../ui/notice";
import { ModePill, RailToggles, useRailOpen } from "./chrome";
import { DeckStore, modeFromUrl, useDeck } from "./deckState";
import { Panel, TAB_ICONS, type PanelTab } from "./Panel";
import { PANE_INSET, WIDE_MIN, usePaneWidths } from "./paneWidths";
import { Rail } from "./Rail";
import { PaneGrips } from "./ResizeHandle";
import { NO_SELECTION } from "./railSelection";
import { Scene } from "./Scene";
import { ShapeLayer } from "./ShapeLayer";
import { useElementKeys } from "./elementCommands";
import { ElementMenu } from "./ElementMenu";
import { useShapeKeys } from "./ShapeTools";
import { useSlideKeys } from "./slideKeys";
import { useViewingReport } from "./viewingReport";
import { SlideTab } from "./SlideTab";
import { staticFigure, type FigureResolver } from "./slideEnv";
import type { Zoom } from "./useZoom";

const NO_ZOOM: Zoom = { zoom: 1, pan: { x: 0, y: 0 }, reset: () => {}, grabbing: null };

/**
 * Create the store from the bootstrap.
 *
 * @returns the deck store with the manifest and first slides already in it.
 */
function initialStore(): DeckStore {
  const deck = boot.deck!;
  const params = new URLSearchParams(location.search);
  const slides = Object.fromEntries((boot.slides ?? []).map((s) => [s.id, s]));
  const wanted = params.get("slide");
  const current = wanted && deck.slides.some((s) => s.id === wanted) ? wanted : (deck.slides[0]?.id ?? null);
  return new DeckStore({ token: deck.token, title: deck.title, manifest: deck.slides, slides, current, mode: modeFromUrl(params.get("mode")), selectedSlot: null, selection: NO_SELECTION, overflow: {}, conflicts: {}, connected: false, notice: null });
}

/** Follow the window width, in px. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => innerWidth);
  useEffect(() => {
    const on = () => setWidth(innerWidth);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return width;
}

/**
 * The room the panes take from the scene, as CSS variables for the chrome
 * that floats over the scene: the same numbers the scene fits the slide to.
 */
function sceneInsetVars(inset: { left: number; right: number; bottom: number }): CSSProperties {
  return { "--scene-left": `${inset.left}px`, "--scene-right": `${inset.right}px`, "--scene-bottom": `${inset.bottom}px` } as CSSProperties;
}

export interface EditorExtensions {
  figure?: FigureResolver;
  tabs?: PanelTab[];
  warned?: Set<string>;
  overlay?: ReactNode;
  unread?: number;
  /** Slide ids an open questionnaire points at, marked in the rail. */
  asked?: Set<string>;
  /** Floating chrome drawn over the scene (the comment toolbar). */
  chrome?: ReactNode;
  /** The pointer of the chosen tool, shown over the slides of the column below 100% zoom. */
  cursor?: string;
  /** A tab to switch to, as `tab` or `tab:reason`; a new value switches the panel. */
  focusTab?: string | null;
}

/** A hook that builds the editor's extensions from the live deck state. */
export type UseExtensions = (store: DeckStore, pack: Pack | null) => EditorExtensions;

/**
 * The page.
 *
 * @param props.useExtensions - the services built on the editor (warnings,
 *   comments, hooks) plug their tabs, overlays and figure resolution in here.
 */
export function DeckEditor({ useExtensions }: { useExtensions: UseExtensions }) {
  const store = useMemo(initialStore, []);
  const state = useDeck(store);
  const pack = state.pack ?? boot.pack ?? null;
  const ext = useExtensions(store, pack);
  const viewport = useViewportWidth();
  const wide = viewport >= WIDE_MIN;
  const [tab, setTab] = useState("slide");
  const [railOpen, setRailOpen] = useRailOpen();
  const [panelOpen, setPanelOpen] = useState(wide);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const onZoom = useCallback((z: Zoom) => setZoom(z), []);
  const sizing = usePaneWidths({ rail: railOpen, panel: panelOpen }, viewport);
  const fontsReady = useDeckLive(store, pack);
  useEffect(() => {
    if (!ext.focusTab) return;
    setTab(ext.focusTab.split(":")[0]!);
    setPanelOpen(true);
  }, [ext.focusTab]);
  if (!pack) return <p className="p-6 text-danger">The pack {boot.deck?.template} is not installed in this workspace.</p>;
  if (!fontsReady) return null;
  const figure = ext.figure ?? ((_id: string, _slot: string, value: unknown) => staticFigure(state.token, value, state.files));
  const tabs: PanelTab[] = [{ value: "slide", label: "Slide", icon: TAB_ICONS.slide, body: <SlideTab store={store} state={state} pack={pack} /> }, ...(ext.tabs ?? [])];
  const inset = { left: railOpen && wide ? PANE_INSET + sizing.widths.rail : 0, right: panelOpen && wide ? PANE_INSET + sizing.widths.panel : 0, bottom: panelOpen && !wide ? innerHeight * 0.45 : 0 };
  return (
    <>
      <Scene store={store} state={state} pack={pack} figure={figure} insetLeft={inset.left} insetRight={inset.right} insetBottom={inset.bottom} overlay={<><ShapeLayer store={store} state={state} />{ext.overlay}</>} cursor={ext.cursor} onZoom={onZoom} />
      <ElementMenu store={store} state={state} pack={pack} />
      <Rail store={store} state={state} pack={pack} figure={figure} warned={ext.warned ?? new Set()} asked={ext.asked} open={railOpen} thumbWidth={sizing.thumb} />
      <Panel store={store} state={state} tabs={tabs} tab={tab} onTab={setTab} unread={ext.unread ?? 0} open={panelOpen} wide={wide} onToggle={() => setPanelOpen(!panelOpen)} />
      <PaneGrips sizing={sizing} open={{ rail: railOpen, panel: panelOpen }} wide={wide} />
      <RailToggles store={store} open={railOpen} onToggle={() => setRailOpen(!railOpen)} />
      <ModePill store={store} state={state} railOpen={railOpen} zoom={zoom} />
      <div className="contents" style={sceneInsetVars(inset)}>
        {ext.chrome}
        <Notice notice={state.notice} />
      </div>
    </>
  );
}

/**
 * Keep the deck live: fonts, the event stream, the connection state, the
 * current slide loaded and named in the URL, and the keyboard.
 *
 * @returns true once the pack fonts have loaded and slides may be measured.
 */
function useDeckLive(store: DeckStore, pack: Pack | null): boolean {
  const state = useDeck(store);
  const [fontsReady, setFontsReady] = useState(false);
  const [since] = useState(() => boot.cursor);
  useEffect(() => void (pack && installPackFonts(pack).then(() => setFontsReady(true))), [pack]);
  useEffect(() => subscribe([state.token], (m) => store.apply(m), since), [store, state.token, since]);
  useEffect(() => {
    const off = onStatus((connected) => store.set((s) => ({ ...s, connected })));
    return () => void off();
  }, [store]);
  useEffect(() => {
    if (state.current) void store.ensure(state.current);
    const url = new URL(location.href);
    if (state.current) url.searchParams.set("slide", state.current);
    history.replaceState(history.state, "", url);
  }, [state.current, state.manifest, store]);
  useKeys(store);
  useSlideKeys(store);
  useShapeKeys(store);
  useElementKeys(store);
  useViewingReport(store);
  return fontsReady;
}

/**
 * Keyboard: PageUp/PageDown always move between slides; arrows do when no text
 * is being edited.
 */
function useKeys(store: DeckStore): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName);
      const step = e.key === "PageDown" || (!typing && (e.key === "ArrowRight" || e.key === "ArrowDown")) ? 1 : e.key === "PageUp" || (!typing && (e.key === "ArrowLeft" || e.key === "ArrowUp")) ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      store.set((s) => {
        const i = s.manifest.findIndex((m) => m.id === s.current);
        return { ...s, current: s.manifest[Math.max(0, Math.min(s.manifest.length - 1, i + step))]?.id ?? s.current, selectedSlot: null, selection: NO_SELECTION };
      });
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [store]);
}
