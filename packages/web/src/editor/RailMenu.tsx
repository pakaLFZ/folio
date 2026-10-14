/**
 * The rail's right-click menu: Cut, Copy, Paste, Duplicate and Delete for the
 * selected slides, each with its key binding at the right in mono. Cut and
 * Delete both archive; the slides move to the deck's `.archive` folder, and
 * Cut also leaves them on the clipboard for Paste.
 */
import { Archive, ClipboardPaste, Copy, CopyPlus, Scissors, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ContextMenu as M } from "radix-ui";
import { cn } from "../ui/cn";
import type { DeckStore } from "./deckState";
import { canPaste, slidesLabel } from "./slideCommands";
import { COMMANDS, KEY_LABELS, type SlideCommand } from "./slideKeys";

/** One row: icon, label, key binding. */
function Row({ store, command, label, icon: Icon, disabled, title }: { store: DeckStore; command: SlideCommand; label: string; icon: LucideIcon; disabled?: boolean; title?: string }) {
  return (
    <M.Item
      disabled={disabled}
      title={title}
      onSelect={() => void COMMANDS[command](store)}
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2 rounded-control pl-2 pr-2.5 text-[13px] text-ink outline-none data-[disabled]:text-ink-faint data-[highlighted]:bg-whisper [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-ink-muted",
        command === "delete" && "data-[highlighted]:bg-danger/[0.06] data-[highlighted]:text-danger data-[highlighted]:[&_svg]:text-danger",
      )}
    >
      <Icon aria-hidden />
      <span className="flex-1">{label}</span>
      <span className="num pl-4 font-mono text-[11px] text-ink-faint">{KEY_LABELS[command]}</span>
    </M.Item>
  );
}

/**
 * The menu around the rail's list.
 *
 * @param props.count - how many slides the menu acts on.
 * @param props.children - the list it opens over.
 */
export function RailMenu({ store, count, children }: { store: DeckStore; count: number; children: ReactNode }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{children}</M.Trigger>
      <M.Portal>
        <M.Content
          collisionPadding={12}
          aria-label="Slide actions"
          className="glass z-[30] min-w-52 origin-(--radix-context-menu-content-transform-origin) rounded-menu p-1.5 transition-[opacity,scale] duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-none"
        >
          {count > 1 ? <M.Label className="section-title px-2 pb-1 pt-0.5">{slidesLabel(count)}</M.Label> : null}
          <Row store={store} command="cut" label="Cut" icon={Scissors} title="Copies the slides, then moves them to the deck's archive folder; nothing is erased" />
          <Row store={store} command="copy" label="Copy" icon={Copy} />
          <Row store={store} command="paste" label="Paste" icon={ClipboardPaste} disabled={!canPaste()} title="Insert the copied slides after the current slide" />
          <Row store={store} command="duplicate" label="Duplicate" icon={CopyPlus} />
          <M.Separator className="mx-2 my-1.5 h-px bg-line-soft" />
          <Row store={store} command="delete" label="Delete" icon={Archive} title="Moves the slides to the deck's archive folder; nothing is erased" />
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
