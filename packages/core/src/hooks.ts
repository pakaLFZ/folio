/**
 * Hooks, pure part: the cache key of a hooked slot of any kind, the expected
 * figure size, the check of a text or table output, and the warnings of a run.
 * Input validation is in `hookinputs.ts`.
 */
import type { HookKind } from "./hookdef.js";
import { hashParts } from "./ids.js";
import { tableDataSchema, type TableData } from "./tables.js";
import { makeWarning, type FolioLocation, type FolioWarning } from "./warnings.js";

/** What identifies a hook's code: name, declared version and a hash of its files. */
export interface HookStamp {
  name: string;
  version: number;
  scriptHash: string;
}

/** The record of one hook run, as written to the hook log. */
export interface RunRecord {
  key: string;
  hook: string;
  stamp: string;
  deck: string;
  slide: string;
  slot: string;
  kind?: HookKind;
  inputs: unknown;
  status: "ok" | "schema" | "exit" | "timeout" | "signal" | "size" | "output" | "runtime" | "requirement" | "cancelled" | "error";
  exit: number | null;
  seconds: number;
  stderrTail: string;
  warnings: { warning: string; field?: string }[];
  issues?: { jsonPath: string; reason: string }[];
  size?: { w: number; h: number; ew: number; eh: number };
  detail?: string;
  /** The interpreter that ran the hook, named in an unmet-requirement warning. */
  interpreter?: string;
  at: string;
}

/**
 * Canonical JSON: object keys sorted at every level, so equal inputs hash equal.
 *
 * @param value - any JSON value.
 * @returns the canonical text.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The text form of a stamp.
 *
 * @returns `name@version:scriptHash`.
 */
export function stampOf(stamp: HookStamp): string {
  return `${stamp.name}@${stamp.version}:${stamp.scriptHash}`;
}

/**
 * The cache key of a hooked figure.
 *
 * @param inputs - the slot's hook inputs.
 * @param box - the slot box size in pt and the output dpi.
 * @param stamp - the hook's stamp.
 * @returns 16 hex digits; equal inputs, box and code never run twice.
 */
export function hookCacheKey(inputs: unknown, box: { w: number; h: number; dpi: number }, stamp: HookStamp): string {
  return hashParts([canonicalJson(inputs), String(box.w), String(box.h), String(box.dpi), stampOf(stamp)]);
}

/**
 * The cache key of a hooked slot of any kind.
 *
 * @param kind - what the hook makes.
 * @param input - what the slot received: text, figure inputs or a table.
 * @param slot - slot name, role and box size in pt.
 * @param dpi - the figure dpi (ignored for text and tables).
 * @param stamp - the hook's stamp.
 * @param format - a figure format other than the hook's own (a direct call);
 *   left out for a slot, so a deck's keys do not depend on it.
 * @returns a figure's key exactly as `hookCacheKey` gives it; for text and
 *   tables the same hash over kind, slot, role and input, with no dpi.
 */
export function slotHookKey(kind: HookKind, input: unknown, slot: { name: string; role: string; w: number; h: number }, dpi: number, stamp: HookStamp, format?: string): string {
  if (kind === "figure") {
    const key = hookCacheKey(input, { w: slot.w, h: slot.h, dpi }, stamp);
    return format ? hashParts([key, format]) : key;
  }
  return hookCacheKey({ kind, slot: slot.name, role: slot.role, input }, { w: slot.w, h: slot.h, dpi: 0 }, stamp);
}

/** A text or table hook's output, as stored beside the input it was made from. */
export type HookOutput = { text: string } | TableData;

/**
 * Check what a text or table hook returned.
 *
 * @param kind - `text` or `table`.
 * @param value - the parsed response line, or undefined when there was none.
 * @returns the output with only its own keys, or the reason it is unusable.
 */
export function checkHookOutput(kind: Exclude<HookKind, "figure">, value: unknown): { ok: true; output: HookOutput } | { ok: false; reason: string } {
  const v = (value ?? {}) as Record<string, unknown>;
  if (kind === "text") return typeof v.text === "string" ? { ok: true, output: { text: v.text } } : { ok: false, reason: 'it printed no {"text": "..."} line' };
  const table = tableDataSchema.safeParse({ columns: v.columns, rows: v.rows });
  if (table.success) return { ok: true, output: table.data };
  const issue = table.error.issues[0];
  return { ok: false, reason: `its table is not {"columns": [...], "rows": [[...]]}: ${issue?.path.join(".") || "table"}: ${issue?.message ?? "invalid"}` };
}

/**
 * Split what a hook printed into warning lines and its response line.
 *
 * @param stdout - everything the hook wrote to stdout.
 * @returns the `{"warning", "field"}` lines, and the last other JSON object
 *   line (the response of a text or table hook), if any.
 */
export function parseHookStdout(stdout: string): { warnings: RunRecord["warnings"]; response: Record<string, unknown> | undefined } {
  const warnings: RunRecord["warnings"] = [];
  let response: Record<string, unknown> | undefined;
  for (const line of stdout.split("\n")) {
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    if (typeof o.warning === "string") warnings.push({ warning: o.warning, ...(o.field ? { field: String(o.field) } : {}) });
    else response = o;
  }
  return { warnings, response };
}

/**
 * The text a hooked text slot shows.
 *
 * @param raw - the slot's stored text.
 * @param cached - the last good output with the input it was made from, if any.
 * @returns the hook's text when it was made from this raw text, else the raw
 *   text: while the hook runs, after it fails, or before it ever ran.
 */
export function hookedTextOf(raw: string, cached: { input: unknown; output: unknown } | null | undefined): string {
  const text = (cached?.output as { text?: unknown } | undefined)?.text;
  return cached && cached.input === raw && typeof text === "string" ? text : raw;
}

/**
 * The rows a hooked table slot shows.
 *
 * @param value - the slot's stored value: rows inline, or `{src}`.
 * @param cached - the last good output with the input it was made from, if any.
 * @param current - whether the hook's last good output is for the slot's
 *   current input (the server's word, needed for a `{src}` table whose rows
 *   the browser does not hold).
 * @returns the hook's table when it was made from this content, else null:
 *   the slot then draws its raw content.
 */
export function hookedTableOf(value: unknown, cached: { input: unknown; output: unknown } | null | undefined, current: boolean): TableData | null {
  const output = tableDataSchema.safeParse(cached?.output);
  if (!cached || !output.success) return null;
  const v = (value ?? {}) as { columns?: unknown; rows?: unknown; src?: unknown };
  if (typeof v.src === "string") return current ? output.data : null;
  return canonicalJson(cached.input) === canonicalJson({ columns: v.columns, rows: v.rows }) ? output.data : null;
}

/**
 * The pixel size a figure must have.
 *
 * @param box - width and height in pt, and dpi.
 * @returns width and height in pixels: pt x dpi / 72, halves rounded up. A
 *   PNG must have exactly this size (FOLIO-HOOK-005 otherwise).
 */
export function expectedPixels(box: { w: number; h: number; dpi: number }): { w: number; h: number } {
  return { w: Math.round((box.w * box.dpi) / 72), h: Math.round((box.h * box.dpi) / 72) };
}

/**
 * The warnings a hook run leaves on its slot.
 *
 * @param record - the run record.
 * @param location - deck, slide and slot.
 * @param at - the time (ISO).
 * @returns HOOK-001 per schema issue, HOOK-002/003 for a failed or timed-out
 *   run, HOOK-004 per printed warning, HOOK-005 for a wrong size, HOOK-006 for
 *   a missing runtime, HOOK-009 for an unmet requirement and HOOK-012 for an
 *   unusable text or table output.
 */
export function hookWarnings(record: RunRecord, location: FolioLocation, at: string): FolioWarning[] {
  const hook = record.hook;
  const out: FolioWarning[] = [];
  const add = (code: string, args: Record<string, string | number>, subject = hook) => out.push(makeWarning(code, location, args, { at, subject }));
  if (record.status === "schema") for (const i of record.issues ?? []) add("FOLIO-HOOK-001", { jsonPath: i.jsonPath, reason: i.reason }, i.jsonPath);
  if (record.status === "exit" || record.status === "error") add("FOLIO-HOOK-002", { hook, exit: record.exit ?? "none" });
  if (record.status === "timeout" || record.status === "signal") add("FOLIO-HOOK-003", { hook, seconds: Math.round(record.seconds) });
  if (record.status === "runtime") add("FOLIO-HOOK-006", { runtime: record.detail ?? "?" });
  if (record.status === "requirement") add("FOLIO-HOOK-009", { hook, requirement: record.detail ?? "?", runtime: record.interpreter ? `python (${record.interpreter})` : "python" });
  if (record.status === "output") add("FOLIO-HOOK-012", { hook, reason: record.detail ?? "it returned nothing usable" });
  if (record.status === "size" && record.size) add("FOLIO-HOOK-005", { w: record.size.w, h: record.size.h, ew: record.size.ew, eh: record.size.eh });
  record.warnings.forEach((w, i) => add("FOLIO-HOOK-004", { hook, text: w.field ? `${w.warning} (${w.field})` : w.warning }, `${hook}#${i}:${w.field ?? ""}`));
  const failed = out.find((w) => w.code === "FOLIO-HOOK-002");
  if (failed && record.stderrTail) failed.related = [{ location, message: record.stderrTail.slice(-600) }];
  return out;
}

/**
 * Read the pixel size of a PNG from its header.
 *
 * @param bytes - the file content.
 * @returns width and height, or null when the bytes are not a PNG.
 */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: view.getUint32(16), h: view.getUint32(20) };
}
