/**
 * Which slots are hooked, of any kind, with what key: read from the slides and
 * the pack's hooks. Also the warnings a hooked slot carries, from its stored state.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { relative } from "../posixpath.js";
import {
  hashParts, hookWarnings, readTableFile, tableDataSchema, makeWarning, resolveAliases, slideLayout, slideRoot, slotHookKey, slotKind, stampOf, validateHookInputs,
  type FolioWarning, type HookKind, type HookSlot, type SlideSpec, type Slot,
} from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import type { LoadedPack } from "../workspace.js";
import type { LoadedHook } from "./runner.js";
import { readJson } from "../fsutil.js";
import { readSlideState } from "./state.js";

export type FoundSlot =
  | { kind: "ok"; slot: HookSlot; hook: LoadedHook }
  | { kind: "invalid"; slot: string; hook: string; issues: { jsonPath: string; reason: string }[] }
  | { kind: "unknown"; slot: string; hook: string }
  | { kind: "mismatch"; slot: string; hook: string; reason: string };

/**
 * A hash of every file in a hook folder, so editing the script makes a new stamp.
 *
 * @param dir - the hook folder.
 * @returns 16 hex digits over relative paths and contents, skipping caches.
 */
export function scriptHash(dir: string): string {
  const parts: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name === "__pycache__" || name.startsWith(".")) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else parts.push(relative(dir, full), readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return hashParts(parts);
}

const stampCache = new Map<string, { mtime: number; hash: string }>();

/**
 * The stamp of a hook, cached until a file in its folder changes.
 *
 * @returns `name@version:hash`.
 */
export function hookStamp(hook: LoadedHook): { text: string; hash: string } {
  const mtime = Math.max(...readdirSync(hook.dir).map((n) => statSync(join(hook.dir, n)).mtimeMs));
  let cached = stampCache.get(hook.dir);
  if (!cached || cached.mtime !== mtime) {
    cached = { mtime, hash: scriptHash(hook.dir) };
    stampCache.set(hook.dir, cached);
  }
  return { text: stampOf({ name: hook.name, version: hook.version, scriptHash: cached.hash }), hash: cached.hash };
}

/**
 * The hook call a slot's content makes, if any.
 *
 * @param decl - the layout's slot.
 * @param value - what the slide gives the slot.
 * @returns a figure slot's `{hook, inputs}` from the slide, or the layout's hook
 *   over a text or table slot's content; null when nothing is to run.
 */
function hookCall(decl: Slot, value: unknown): { hook: string; input: unknown } | null {
  if (slotKind(decl.role) === "figure") {
    const call = value as { hook?: string; inputs?: unknown } | null | undefined;
    return call && typeof call === "object" && call.hook ? { hook: call.hook, input: call.inputs ?? {} } : null;
  }
  const empty = value === null || value === undefined || value === "";
  return decl.hook && !empty ? { hook: decl.hook, input: value } : null;
}

/**
 * Every hooked slot of a slide, of any kind.
 *
 * @param store - the deck.
 * @param slide - the slide id.
 * @param spec - the slide spec.
 * @param pack - the deck's pack with its hooks.
 * @param flowed - the laid-out height in pt of slots that flow `below`
 *   another, as last measured; a flowed figure is drawn at that height.
 * @returns each hooked slot: ready to run, invalid input, an unknown hook, or a
 *   hook that makes another kind than the slot holds.
 */
export function hookedSlots(store: DeckStore, slide: string, spec: SlideSpec | null, pack: LoadedPack | undefined, flowed: Record<string, number> = {}): FoundSlot[] {
  const root = spec ? slideRoot(spec) : null;
  const layout = root && pack ? slideLayout(pack.pack, root.layout, root.props) : undefined;
  if (!root || !layout || !pack) return [];
  const props = resolveAliases(root.props, layout.aliases);
  const out: FoundSlot[] = [];
  for (const [name, decl] of Object.entries(layout.slots)) {
    const call = hookCall(decl, props[name]);
    const input = call && slotKind(decl.role) === "table" ? tableInput(store, call.input) : call?.input;
    const box = { w: decl.box[2], h: decl.below && slotKind(decl.role) === "figure" && flowed[name]! > 0 ? flowed[name]! : decl.box[3] };
    if (call && input !== undefined) out.push(foundSlot(store, slide, name, { ...decl, box: [decl.box[0], decl.box[1], box.w, box.h] }, { hook: call.hook, input }, pack));
  }
  return out;
}

/**
 * What a table hook receives: the rows alone, inline or read from the deck's
 * `.table.json` file, so a style change does not run the hook again.
 *
 * @returns `{columns, rows}`, or undefined when the rows are not a valid table
 *   (the slot then reports its own problem and draws nothing from a hook).
 */
function tableInput(store: DeckStore, value: unknown): unknown {
  const v = value as { src?: unknown; columns?: unknown; rows?: unknown };
  if (typeof v.src === "string") {
    const file = readTableFile(readJson<unknown>(join(store.dir, v.src), null));
    return file.ok ? file.table : undefined;
  }
  const table = tableDataSchema.safeParse({ columns: v.columns, rows: v.rows });
  return table.success ? table.data : undefined;
}

/** One hooked slot, checked against its hook. */
function foundSlot(store: DeckStore, slide: string, name: string, decl: Slot, call: { hook: string; input: unknown }, pack: LoadedPack): FoundSlot {
  const hook = pack.hooks[call.hook];
  if (!hook) return { kind: "unknown", slot: name, hook: call.hook };
  const kind: HookKind = slotKind(decl.role);
  if (hook.output !== kind) return { kind: "mismatch", slot: name, hook: hook.name, reason: `it makes a ${hook.output}, and ${name} is a ${kind} slot` };
  const issues = validateHookInputs(hook.inputs, call.input);
  if (issues.length) return { kind: "invalid", slot: name, hook: hook.name, issues };
  return { kind: "ok", hook, slot: hookJob(hook, { deck: store.token, slide, slot: name, role: decl.role, input: call.input, w: decl.box[2], h: decl.box[3] }) };
}

/**
 * The job of one hook call: the one function a deck slot and a direct call
 * both use, so equal calls get equal keys and share the cache.
 *
 * @param call - where it is shown, its input, its box in pt, and a figure
 *   format other than the hook's own (direct calls only).
 */
export function hookJob(hook: LoadedHook, call: { deck: string; slide: string; slot: string; role: string; input: unknown; w: number; h: number; format?: string }): HookSlot {
  const kind: HookKind = slotKind(call.role);
  const stamp = hookStamp(hook);
  const box = { w: call.w, h: call.h, dpi: kind === "figure" ? hook.dpi : 0 };
  const format = call.format && call.format !== hook.outputs ? call.format : undefined;
  const key = slotHookKey(kind, call.input, { name: call.slot, role: call.role, w: box.w, h: box.h }, hook.dpi, { name: hook.name, version: hook.version, scriptHash: stamp.hash }, format);
  return { deck: call.deck, slide: call.slide, slot: call.slot, kind, role: call.role, hook: hook.name, stamp: stamp.text, key, inputs: call.input, box };
}

/**
 * The laid-out heights of a slide's flowed slots, from a measurement.
 *
 * @param measured - the slide's last measured slots, if any.
 * @returns height in whole pt by slot, for slots that reported a positive `boxPt`.
 */
export function flowedHeights(measured: { slot: string; boxPt?: number }[] | null): Record<string, number> {
  return Object.fromEntries((measured ?? []).flatMap((m) => (m.boxPt !== undefined && m.boxPt > 0 ? [[m.slot, Math.round(m.boxPt)]] : [])));
}

/**
 * The warnings of a slide's hooked slots.
 *
 * @param store - the deck.
 * @param slide - the slide id.
 * @param found - the slide's hooked slots.
 * @param packName - for HOOK-010.
 * @param at - the time (ISO).
 * @returns schema, run, paused, stale and waiting warnings.
 */
export function hookSlotWarnings(store: DeckStore, slide: string, found: FoundSlot[], packName: string, at: string): FolioWarning[] {
  const states = readSlideState(store, slide);
  const out: FolioWarning[] = [];
  for (const f of found) {
    const location = { deck: store.token, slide, slot: f.kind === "ok" ? f.slot.slot : f.slot };
    if (f.kind === "unknown") out.push(makeWarning("FOLIO-HOOK-010", location, { hook: f.hook, pack: packName }, { at, subject: f.hook }));
    if (f.kind === "invalid") for (const i of f.issues) out.push(makeWarning("FOLIO-HOOK-001", location, { jsonPath: i.jsonPath, reason: `${i.reason}; folio hook show ${packName}/${f.hook} prints an example` }, { at, subject: i.jsonPath }));
    if (f.kind === "mismatch") out.push(makeWarning("FOLIO-HOOK-012", location, { hook: f.hook, reason: f.reason }, { at, subject: f.hook }));
    if (f.kind !== "ok") continue;
    const state = states[f.slot.slot];
    if (!state || state.key !== f.slot.key) continue;
    if (state.record && state.record.status !== "cancelled") out.push(...hookWarnings(state.record, location, at));
    if (state.phase === "paused") out.push(makeWarning("FOLIO-HOOK-007", location, { hook: f.slot.hook, failures: 3 }, { at, subject: f.slot.hook }));
    if (state.phase === "stale") out.push(makeWarning("FOLIO-HOOK-008", location, { hook: f.slot.hook, version: f.slot.stamp.split("@")[1] ?? "" }, { at, subject: f.slot.hook }));
    if ((state.phase === "waiting" || state.phase === "drawing") && !state.goodKey) out.push(makeWarning("FOLIO-HOOK-011", location, { hook: f.slot.hook }, { at, subject: f.slot.hook }));
  }
  return out;
}
