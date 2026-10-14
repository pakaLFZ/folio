/**
 * The one place a message is typed: a pill row of attach, a text field one
 * line tall that grows with its text up to six lines, and Send. Enter sends,
 * Shift+Enter breaks the line. Files attach by the paperclip, by paste and by
 * drop, and wait above the row as chips. Text and files are kept here unless
 * the caller holds them (`text`/`onText`, `files`/`onFiles`). `floating` adds
 * the `--glass-lift` shadow for a bar that sits over the slide rather than
 * docked in a panel.
 */
import { FileText, Paperclip, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { isImageAttachment, MAX_ATTACHMENT_BYTES } from "@folio/core";
import type { Upload } from "../comments/useComments";
import { Button } from "./button";
import { cn } from "./cn";
import { Tip } from "./tooltip";

const MAX_LINES = 6;

/**
 * A human file size.
 *
 * @returns e.g. `12 KB`, `3.4 MB`.
 */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A value the caller may hold; kept here when it does not.
 *
 * @returns the value and its setter.
 */
function useHeld<T>(held: T | undefined, onHeld: ((v: T) => void) | undefined, initial: T) {
  const [own, setOwn] = useState(initial);
  return held !== undefined && onHeld ? ([held, onHeld] as const) : ([own, setOwn] as const);
}

/**
 * Upload files for a message, refusing any over 25 MB.
 *
 * @returns `add(files)`, the number still uploading, and the last error.
 */
function useUploads(files: Upload[], onFiles: (u: Upload[]) => void, upload: (f: File) => Promise<Upload>) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const add = async (picked: File[]) => {
    setError(null);
    const fits = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (fits.length < picked.length) setError("A file may be at most 25 MB.");
    setBusy((n) => n + fits.length);
    const done: Upload[] = [];
    for (const f of fits) {
      try {
        done.push(await upload(f));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    onFiles([...files, ...done]);
  };
  const [over, setOver] = useState(false);
  const onPaste = (e: ClipboardEvent) => {
    const pasted = [...e.clipboardData.files];
    if (pasted.length) (e.preventDefault(), void add(pasted));
  };
  const drop = {
    onDragOver: (e: DragEvent) => (e.preventDefault(), setOver(true)),
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => (e.preventDefault(), setOver(false), void add([...e.dataTransfer.files])),
  };
  return { add, busy, error, over, onPaste, drop };
}

/** Grow the field to its text, one line at least and `MAX_LINES` at most. */
function useFitToText(field: React.RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_LINES)}px`;
  }, [field, text]);
}

/** Files waiting to be sent, as small chips with a remove button. */
function FileChips({ files, url, onRemove }: { files: Upload[]; url: (u: Upload) => string; onRemove: (id: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-1 px-1">
      {files.map((f) => (
        <li key={f.id} className="flex h-6 max-w-48 items-center gap-1 rounded-chip border border-line bg-raised pl-1.5 pr-0.5 text-[11px]">
          {isImageAttachment(f) ? <img src={url(f)} alt="" className="size-4 shrink-0 rounded-chip object-cover" /> : <FileText className="size-3.5 shrink-0" />}
          <span className="truncate" title={f.name}>{f.name}</span>
          <span className="num shrink-0 text-[10px] text-ink-faint">{fileSize(f.bytes)}</span>
          <button aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)} className="flex size-5 shrink-0 items-center justify-center rounded-chip text-ink-faint hover:bg-whisper hover:text-ink [&_svg]:size-3">
            <X />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The text field: Enter sends, Shift+Enter breaks the line. */
function Field({ field, text, onText, onEnter, ...rest }: { field: React.RefObject<HTMLTextAreaElement | null>; text: string; onText: (t: string) => void; onEnter: () => void; onPaste: (e: ClipboardEvent) => void; placeholder: string; autoFocus?: boolean; disabled?: boolean }) {
  useFitToText(field, text);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    onEnter();
  };
  return (
    <textarea
      ref={field}
      rows={1}
      value={text}
      onChange={(e) => onText(e.target.value)}
      onKeyDown={onKeyDown}
      {...rest}
      className="my-[5px] block min-w-0 flex-1 resize-none bg-transparent py-0 text-[13px] leading-[18px] outline-none placeholder:text-ink-faint focus-visible:outline-none"
    />
  );
}

export interface InputBarProps {
  placeholder: string;
  onSend: (text: string, files: Upload[]) => void | Promise<void>;
  upload: (f: File) => Promise<Upload>;
  uploadUrl: (u: Upload) => string;
  autoFocus?: boolean;
  disabled?: boolean;
  text?: string;
  onText?: (t: string) => void;
  files?: Upload[];
  onFiles?: (u: Upload[]) => void;
  /** True when the bar floats over the slide (the on-slide bubble): it takes
   * the theme's `--glass-lift` shadow so it reads as lifted above the slide.
   * A docked bar (the Comments tab, a thread's reply, the inbox panel) stays
   * flat. */
  floating?: boolean;
}

/**
 * The input bar.
 *
 * @param props.onSend - receives the text and the uploaded files; when it
 *   resolves, a bar that holds its own text clears itself.
 * @param props.upload - uploads one attached file.
 * @param props.uploadUrl - where an uploaded file is shown from.
 * @param props.floating - true for the shadow that reads as floating.
 */
export function InputBar({ placeholder, onSend, upload, uploadUrl, autoFocus, disabled, floating, ...held }: InputBarProps) {
  const [text, setText] = useHeld(held.text, held.onText, "");
  const [files, setFiles] = useHeld(held.files, held.onFiles, [] as Upload[]);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { add, busy, error, over, onPaste, drop } = useUploads(files, setFiles, upload);
  const ready = !disabled && !busy && (!!text.trim() || files.length > 0);
  const send = async () => {
    if (!ready) return;
    await onSend(text, files);
    if (held.text === undefined) setText("");
    if (held.files === undefined) setFiles([]);
  };
  return (
    <div data-testid="input-bar" className="min-w-0 space-y-1" onClick={(e) => e.stopPropagation()} {...drop}>
      {files.length ? <FileChips files={files} url={uploadUrl} onRemove={(id) => setFiles(files.filter((f) => f.id !== id))} /> : null}
      {busy ? <p className="num px-2 text-[11px] text-ink-faint">Uploading {busy}</p> : null}
      {error ? <p className="px-2 text-[12px] text-danger">{error}</p> : null}
      <div className={cn("flex min-w-0 items-end gap-1 rounded-control border border-line bg-raised p-[3px] focus-within:border-ink", over && "border-line-strong bg-whisper", floating && "shadow-[var(--glass-lift)]")}>
        <input ref={picker} type="file" multiple hidden onChange={(e) => (void add([...(e.target.files ?? [])]), (e.target.value = ""))} />
        <Tip label="Attach files">
          <Button size="iconSm" className="shrink-0" aria-label="Attach files" disabled={disabled} onClick={() => picker.current?.click()}><Paperclip /></Button>
        </Tip>
        <Field field={field} text={text} onText={setText} onEnter={() => void send()} onPaste={onPaste} placeholder={placeholder} autoFocus={autoFocus} disabled={disabled} />
        <Tip label={<>Send (<span className="font-mono">Enter</span>) · <span className="font-mono">Shift+Enter</span> for a new line</>}>
          <Button size="sm" variant="solid" className="shrink-0" disabled={!ready} onClick={() => void send()}>Send</Button>
        </Tip>
      </div>
    </div>
  );
}
