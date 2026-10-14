/** The Download format menu in the panel header. */
import { Download, FileArchive, FileText, Presentation } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import { useState } from "react";
import { api } from "../api";
import { Tip } from "../ui/tooltip";
import type { DeckStore } from "./deckState";
import { savedText } from "./exportText";

const SAVED_MS = 4000;
type Format = "PDF" | "PowerPoint" | "Folio deck";
const EXPORTS: Record<Format, (deck: string) => ReturnType<typeof api.exportPdf>> = { PDF: api.exportPdf, PowerPoint: api.exportPptx, "Folio deck": api.exportFolio };
const ITEM = "flex h-9 cursor-default items-center gap-2 rounded-control px-2 text-[13px] outline-none data-[highlighted]:bg-whisper";

/** Pick a download format; Radix handles Escape, outside clicks and focus. */
export function ExportPdfButton({ store }: { store: DeckStore }) {
  const [busy, setBusy] = useState(false);
  const run = async (format: Format) => {
    setBusy(true);
    store.notify(`Exporting ${format}…`, "busy");
    try {
      const result = await EXPORTS[format](store.get().token);
      store.notify(savedText(result), "ok", SAVED_MS);
    } catch (error) {
      store.notify(`${format} export failed: ${(error as Error).message}`, "error");
    } finally { setBusy(false); }
  };
  return (
    <M.Root modal={false}>
      <Tip label="Download">
        <M.Trigger disabled={busy} aria-busy={busy} aria-label="Download" className="corner-fill flex size-[var(--corner-hit)] shrink-0 items-center justify-center rounded-chip text-ink hover:bg-whisper disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4">
          <Download />
        </M.Trigger>
      </Tip>
      <M.Portal>
        <M.Content align="end" sideOffset={6} collisionPadding={12} aria-label="Download format" className="glass z-[30] min-w-48 rounded-menu p-1.5 text-ink outline-none">
          <M.Item onSelect={() => void run("PDF")} className={ITEM}><FileText aria-hidden className="size-4" />PDF</M.Item>
          <M.Item onSelect={() => void run("PowerPoint")} className={ITEM}><Presentation aria-hidden className="size-4" />PowerPoint (.pptx)</M.Item>
          <M.Item onSelect={() => void run("Folio deck")} className={ITEM}><FileArchive aria-hidden className="size-4" />Folio deck (.folio.zip)</M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
