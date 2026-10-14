/**
 * Writing a comment: the shared input bar, holding the draft's text and
 * files. Attachments of sent messages show as thumbnails and chips.
 */
import { FileText, X } from "lucide-react";
import { isImageAttachment, type Attachment } from "@folio/core";
import { fileSize, InputBar } from "../ui/InputBar";
import type { Upload } from "./useComments";

export { fileSize };

/**
 * Attachments as thumbnails and chips.
 *
 * @param props.items - attachments with their URLs.
 * @param props.onRemove - shown as a remove button on each item when given.
 * @param props.openOnClick - false keeps an image thumbnail from opening in a
 *   new tab (the Comments tab, where a click toggles the issue card instead).
 */
export function AttachmentList({ items, onRemove, openOnClick = true }: { items: (Pick<Attachment, "name" | "type" | "bytes"> & { url: string; key: string })[]; onRemove?: (key: string) => void; openOnClick?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="flex min-w-0 max-w-full flex-wrap gap-1.5">
      {items.map((a) => (
        <li key={a.key} className="group relative min-w-0 max-w-full">
          {isImageAttachment(a) ? (
            openOnClick ? (
              <a href={a.url} target="_blank" rel="noreferrer" title={`${a.name}, ${fileSize(a.bytes)}`} className="block max-w-full overflow-hidden rounded-card outline outline-1 -outline-offset-1 outline-line">
                <img src={a.url} alt={a.name} className="block h-16 w-auto max-w-[min(10rem,100%)] object-cover" />
              </a>
            ) : (
              <div title={`${a.name}, ${fileSize(a.bytes)}`} className="block max-w-full overflow-hidden rounded-card outline outline-1 -outline-offset-1 outline-line">
                <img src={a.url} alt={a.name} className="block h-16 w-auto max-w-[min(10rem,100%)] object-cover" />
              </div>
            )
          ) : (
            <a href={a.url} download={a.name} className="flex h-8 max-w-56 items-center gap-1.5 rounded-control border border-line px-3 text-[12px] hover:bg-whisper">
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{a.name}</span>
              <span className="num shrink-0 text-[10px] text-ink-faint">{fileSize(a.bytes)}</span>
            </a>
          )}
          {onRemove ? (
            <button aria-label={`Remove ${a.name}`} onClick={() => onRemove(a.key)} className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-chip bg-ink text-on-ink group-hover:flex [&_svg]:size-3">
              <X />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The composer.
 *
 * @param props.text - the text; `onText` changes it.
 * @param props.uploads - files already uploaded for this message.
 * @param props.upload - uploads one file and returns it.
 * @param props.onUploads - replaces the upload list.
 * @param props.onSend - sends the message.
 * @param props.extra - shown above the bar.
 * @param props.floating - true for the `--glass-lift` shadow (the on-slide bubble).
 */
export function Composer({ text, onText, uploads, onUploads, upload, uploadUrl, onSend, placeholder, extra, floating }: {
  text: string; onText: (t: string) => void; uploads: Upload[]; onUploads: (u: Upload[]) => void; upload: (f: File) => Promise<Upload>;
  uploadUrl: (u: Upload) => string; onSend: () => void; sendLabel?: string; placeholder: string; extra?: React.ReactNode; floating?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {extra}
      <InputBar text={text} onText={onText} files={uploads} onFiles={onUploads} upload={upload} uploadUrl={uploadUrl} onSend={onSend} placeholder={placeholder} floating={floating} />
    </div>
  );
}
