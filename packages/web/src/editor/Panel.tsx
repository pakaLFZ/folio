/**
 * The panel: one pane of glass on the right. The PDF export, the inbox and the theme switch
 * float over its header, one row with the panel toggle, same top and height
 * as every other corner control; tabs at the foot.
 */
import { Inbox, Layers, MessageSquare, ListOrdered } from "lucide-react";
import type { ReactNode } from "react";
import { at } from "../boot";
import { cn } from "../ui/cn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ThemeSwitch } from "../ui/ThemeSwitch";
import { Tip } from "../ui/tooltip";
import { paneStyle, PanelToggle } from "./chrome";
import type { DeckState, DeckStore } from "./deckState";
import { ExportPdfButton } from "./ExportPdf";

export interface PanelTab {
  value: string;
  label: string;
  icon: ReactNode;
  count?: number;
  body: ReactNode;
}

export const TAB_ICONS = { slide: <Layers />, comments: <MessageSquare />, queue: <ListOrdered /> };

/**
 * The inbox address, naming the deck and slide it was opened from so the
 * board's return button can come back here.
 */
function inboxLink(state: DeckState): string {
  const q = new URLSearchParams({ from: state.token });
  if (state.current) q.set("slide", state.current);
  return at(`inbox?${q}`);
}

/**
 * The panel.
 *
 * @param props.store - the deck, for the export button's notices.
 * @param props.tabs - the tabs to show.
 * @param props.tab - the open tab; `onTab` switches it.
 * @param props.unread - unread inbox count for the header.
 * @param props.questions - open questionnaires, added to the inbox badge.
 * @param props.open - whether the panel is open; a shut panel stays mounted off-screen.
 * @param props.wide - beside the scene at 900 px and up, a sheet from the bottom below.
 */
export function Panel({ store, state, tabs, tab, onTab, unread, questions = 0, open, wide, onToggle }: { store: DeckStore; state: DeckState; tabs: PanelTab[]; tab: string; onTab: (t: string) => void; unread: number; questions?: number; open: boolean; wide: boolean; onToggle: () => void }) {
  const place = wide ? "bottom-[var(--panel-inset)] right-[var(--panel-inset)] top-[var(--panel-inset)] w-[var(--panel-w)]" : "inset-x-0 bottom-0 h-[45vh] rounded-b-none";
  return (
    <>
      <div className="corner-row corner-right" data-open={open} data-chrome="panel-actions">
        <div className="contents" data-chrome="panel-header-icons" aria-hidden={!open}>
        {open ? <><ExportPdfButton store={store} />
        <Tip label="Comment inbox, every deck">
          <a href={inboxLink(state)} className="corner-fill relative flex size-[var(--corner-hit)] shrink-0 items-center justify-center rounded-chip hover:bg-whisper [&_svg]:size-4" aria-label={`Inbox, ${unread} unread${questions ? `, ${questions} question${questions === 1 ? "" : "s"}` : ""}`}>
            <Inbox />
            {unread + questions ? <span className="num absolute -right-0.5 -top-0.5 min-w-4 rounded-chip bg-ink px-1 text-center text-[10px] leading-4 text-on-ink">{unread + questions}</span> : null}
          </a>
        </Tip>
        <ThemeSwitch className="corner-fill size-[var(--corner-hit)] rounded-chip" /></> : null}
        </div>
      </div>
      <PanelToggle open={open} onToggle={onToggle} />
      <aside aria-label="Deck panel" aria-hidden={!open} className={cn("pane glass", place)} style={paneStyle(open, wide ? "translateX(calc(100% + 1.5rem))" : "translateY(calc(100% + 1.5rem))")}>
        <div className="pane-header" aria-hidden />
        <Tabs value={tab} onValueChange={onTab} className="flex min-h-0 flex-1 flex-col">
          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="panel-body scroll-stable min-h-0 flex-1 pb-[var(--panel-pad)] pl-[var(--panel-pad)] pr-[calc(var(--panel-pad)-var(--scrollbar-w))] outline-none">
              {t.body}
            </TabsContent>
          ))}
          <TabsList className="mt-0 m-[var(--tabbar-margin)]">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} aria-label={t.label} title={t.label} className="group">
                {t.icon}
                <span className="hidden group-data-[state=active]:inline">{t.label}</span>
                {t.count ? <span className="num text-[10px] text-ink-faint">{t.count}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </aside>
    </>
  );
}
