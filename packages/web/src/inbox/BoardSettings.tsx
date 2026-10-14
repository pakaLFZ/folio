/**
 * The board's settings: an icon button at the end of the top bar that opens a
 * glass popover with one "Show <column>" switch per column. The hidden columns
 * are kept per browser (`folio.board.hiddenColumns`, a JSON list) and in the
 * URL as `hide=<view>,<view>`. The older `folio.board.showDone = "0"` key and
 * `done=hidden` address still read as Done hidden.
 */
import { SlidersHorizontal } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "../ui/button";
import { SettingsList, Toggle, type SettingsRow } from "../ui/settings";
import { Tip } from "../ui/tooltip";

const HIDDEN_KEY = "folio.board.hiddenColumns";
const LEGACY_DONE_KEY = "folio.board.showDone";

export interface NamedColumn {
  view: string;
  title: string;
}

/** The columns this browser last chose to hide; none when unknown. */
export function storedHidden(): string[] {
  try {
    const kept = localStorage.getItem(HIDDEN_KEY);
    if (kept === null) return localStorage.getItem(LEGACY_DONE_KEY) === "0" ? ["done"] : [];
    const list: unknown = JSON.parse(kept);
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Keep this browser's hidden columns. */
export function storeHidden(hidden: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  } catch {
    return;
  }
}

/**
 * A set of columns to hide, as the board keeps it.
 *
 * @returns those of `views` that are columns, in board order; none when that would hide every column.
 */
export function hiddenColumns(views: Iterable<string>, columns: NamedColumn[]): string[] {
  const named = new Set(views);
  const hidden = columns.map((c) => c.view).filter((v) => named.has(v));
  return hidden.length < columns.length ? hidden : [];
}

/** The hidden columns a board filter names, with the older `done=hidden` read as `hide=done`. */
export function hiddenOf(filter: URLSearchParams, columns: NamedColumn[]): string[] {
  const named = (filter.get("hide") ?? "").split(",");
  return hiddenColumns(filter.get("done") === "hidden" ? [...named, "done"] : named, columns);
}

/**
 * The settings button and its popover.
 *
 * @param props.columns - every column, in board order.
 * @param props.hidden - the hidden ones.
 * @param props.onShown - called with a column and whether it is now shown.
 */
export function BoardSettings({ columns, hidden, onShown }: { columns: NamedColumn[]; hidden: string[]; onShown: (view: string, shown: boolean) => void }) {
  const lastShown = columns.length - hidden.length <= 1;
  const rows: SettingsRow[] = columns.map((c) => {
    const shown = !hidden.includes(c.view);
    return { label: `Show ${c.title} column`, control: (id) => <Toggle id={id} checked={shown} disabled={shown && lastShown} onChange={(on) => onShown(c.view, on)} /> };
  });
  return (
    <Popover.Root>
      <Tip label="Board settings">
        <Popover.Trigger asChild>
          <Button size="icon" variant="outline" aria-label="Board settings"><SlidersHorizontal /></Button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} aria-label="Board settings" className="glass z-[30] min-w-56 rounded-menu p-1 outline-none">
          <SettingsList label="Board settings" rows={rows} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * While a search is typed, the matches each hidden column holds, with a way to show it.
 *
 * @param props.columns - the hidden columns and their matching cards.
 * @param props.onShow - shows a column again.
 */
export function HiddenMatches({ columns, onShow }: { columns: (NamedColumn & { count: number })[]; onShow: (view: string) => void }) {
  return columns.filter((c) => c.count).map((c) => (
    <p key={c.view} role="status" className="flex items-center gap-2 px-3 pb-2 text-[12px] text-ink-muted sm:px-4">
      <span><span className="num">{c.count}</span> {c.count === 1 ? "match is" : "matches are"} in the hidden {c.title} column.</span>
      <Button size="sm" variant="outline" onClick={() => onShow(c.view)}>Show {c.title}</Button>
    </p>
  ));
}
