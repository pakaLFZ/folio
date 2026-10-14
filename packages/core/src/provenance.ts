/**
 * Provenance, pure part: the trace record kept beside every hook output, the
 * line that makes the output again, units of a direct call, and the
 * `/FolioTrace` entry appended to an exported PDF.
 */
import type { HookKind } from "./hookdef.js";
import { canonicalJson } from "./hooks.js";
import { hashParts } from "./ids.js";

export const TRACE_VERSION = 1;

/** What made one cached hook output, written beside it as `<key>.json`. */
export interface TraceRecord {
  trace: typeof TRACE_VERSION;
  key: string;
  kind: HookKind;
  hook: { pack: string | null; name: string; version: number; scriptHash: string; stamp: string; files: Record<string, string> };
  inputs: unknown;
  box: { w: number; h: number };
  dpi: number;
  format: string | null;
  slot: { deck: string; slide: string; slot: string; role: string };
  base: string;
  data: { path: string; sha256: string }[];
  runtime: { name: string | null; exe: string | null; version: string | null; mode: "spawn" | "warm" };
  at: string;
  seconds: number;
  output: { file: string; sha256: string; bytes: number };
}

/**
 * Whether a parsed JSON document is a trace record.
 *
 * @returns true for an object with `trace`, `hook.name`, `inputs` and `box`.
 */
export function isTrace(value: unknown): value is TraceRecord {
  const v = value as Partial<TraceRecord> | null;
  return !!v && typeof v === "object" && v.trace === TRACE_VERSION && typeof v.hook?.name === "string" && "inputs" in v && typeof v.box?.w === "number";
}

/**
 * The strings in a hook's inputs that may name data files.
 *
 * @param inputs - the inputs object.
 * @returns every distinct one-line string leaf shorter than 512 characters;
 *   the caller keeps those that are files.
 */
export function dataCandidates(inputs: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      if (v && v.length < 512 && !/[\n\r]/.test(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(inputs);
  return [...out];
}

/**
 * A short hash of inputs, for listings where the whole inputs do not fit.
 *
 * @returns 16 hex digits over the canonical JSON.
 */
export function inputsHash(inputs: unknown): string {
  return hashParts([canonicalJson(inputs)]);
}

/** The file extension of a trace's output. */
export function traceExt(trace: Pick<TraceRecord, "kind" | "format">): string {
  return trace.kind === "figure" ? (trace.format ?? "png") : "json";
}

/**
 * The one line that draws a traced output again from scratch and compares it.
 *
 * @param trace - the record.
 * @param tracePath - where the record is stored (absolute).
 * @returns a `folio hook run` command.
 */
export function regenerateLine(trace: TraceRecord, tracePath: string): string {
  const ref = trace.hook.pack ? `${trace.hook.pack}/${trace.hook.name}` : trace.hook.name;
  return `folio hook run ${ref} --inputs ${shellWord(tracePath)} --fresh --out ${trace.key}.${traceExt(trace)}`;
}

/** Quote a word for a POSIX shell when it needs it. */
export function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`;
}

export const UNITS = { pt: 1, mm: 72 / 25.4, in: 72 } as const;
export type Unit = keyof typeof UNITS;

/**
 * Parse a `--size W,H` value into points.
 *
 * @param size - `W,H` (or `WxH`).
 * @param unit - `pt`, `mm` or `in`.
 * @returns the box in pt, rounded to 0.01, or the reason it is unusable.
 */
export function parseSize(size: string, unit: string): { ok: true; box: { w: number; h: number } } | { ok: false; reason: string } {
  if (!(unit in UNITS)) return { ok: false, reason: `unit "${unit}" is not one of pt, mm, in` };
  const parts = size.split(/[,x]/).map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return { ok: false, reason: `size "${size}" is not W,H with two positive numbers` };
  const k = UNITS[unit as Unit];
  return { ok: true, box: { w: Math.round(parts[0]! * k * 100) / 100, h: Math.round(parts[1]! * k * 100) / 100 } };
}

/** One printed page of a deck, for `/FolioTrace`. */
export interface PageTrace {
  slide: string;
  slots: Record<string, { hook: string; key: string; inputs: string; file?: string; sha256?: string } | { file: string; sha256: string } | { untraced: string }>;
}

/**
 * The `/FolioTrace` value: compact JSON, ASCII only.
 *
 * @param pages - one entry per printed page, in order.
 */
export function folioTraceValue(pages: PageTrace[]): string {
  return JSON.stringify({ v: TRACE_VERSION, pages }).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * Append entries to a PDF's document information by an incremental update,
 * leaving every byte of the original file in place.
 *
 * @param pdf - a PDF with a classic cross-reference table (as Chromium writes).
 * @param entries - info keys (without the slash) and ASCII values.
 * @returns the updated PDF, or the input unchanged when its trailer cannot be read.
 */
export function addPdfInfo(pdf: Uint8Array, entries: Record<string, string>): Uint8Array {
  const text = new TextDecoder("latin1").decode(pdf);
  const trailer = text.slice(text.lastIndexOf("trailer"));
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1]);
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  const prev = Number(/startxref\s+(\d+)/.exec(text.slice(text.lastIndexOf("startxref")))?.[1]);
  if (!size || !root || !Number.isFinite(prev)) return pdf;
  const oldInfo = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(trailer);
  const oldBody = oldInfo ? new RegExp(`(?:^|\\s)${oldInfo[1]}\\s+${oldInfo[2]}\\s+obj\\s*<<([\\s\\S]*?)>>\\s*endobj`).exec(text)?.[1] ?? "" : "";
  const kept = oldBody.replace(new RegExp(`/(${Object.keys(entries).join("|")})\\s*\\((?:\\\\.|[^\\\\)])*\\)`, "g"), "").trim();
  const added = Object.entries(entries).map(([k, v]) => `/${k} (${v.replace(/[\\()]/g, (c) => `\\${c}`)})`).join("\n");
  const sep = text.endsWith("\n") ? "" : "\n";
  const object = `${sep}${size} 0 obj\n<<${kept ? `${kept}\n` : ""}${added}>>\nendobj\n`;
  const offset = pdf.length + sep.length;
  const xrefAt = pdf.length + object.length;
  const tail = `xref\n${size} 1\n${String(offset).padStart(10, "0")} 00000 n \ntrailer\n<</Size ${size + 1}\n/Root ${root}\n/Info ${size} 0 R\n/Prev ${prev}>>\nstartxref\n${xrefAt}\n%%EOF\n`;
  const extra = Uint8Array.from(object + tail, (c) => c.charCodeAt(0) & 0xff);
  const out = new Uint8Array(pdf.length + extra.length);
  out.set(pdf);
  out.set(extra, pdf.length);
  return out;
}

/**
 * Read a PDF's latest info entry.
 *
 * @returns the unescaped literal string, or null when there is none.
 */
export function readPdfInfo(pdf: Uint8Array, key: string): string | null {
  const text = new TextDecoder("latin1").decode(pdf);
  const all = [...text.matchAll(new RegExp(`/${key}\\s*\\(((?:\\\\.|[^\\\\)])*)\\)`, "g"))];
  const last = all[all.length - 1]?.[1];
  return last === undefined ? null : last.replace(/\\(.)/g, "$1");
}
