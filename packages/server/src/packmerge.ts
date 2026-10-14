/**
 * `folio pack merge <src> <dst>`: copy layouts from one pack into another with
 * every named thing they use that the destination lacks. A name both packs
 * define differently is a clash: the merge is refused, naming each clash and
 * the `--rename` that resolves it.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, posix } from "node:path";
import { isTextRole, type Pack } from "@folio/core";
import type { PackChange, PackEdit, PackHandle } from "./packedit.js";

const KINDS = ["roles", "backgrounds", "tables", "hooks"] as const;
type Kind = (typeof KINDS)[number];

export interface MergeOptions {
  /** Only these layouts and what they use; every layout and item when absent. */
  layouts?: string[];
  /** `name` renames a layout; `<kind>.<name>` renames a role style, background, table style or hook. */
  rename: Record<string, string>;
}

interface Plan {
  src: PackHandle & { pack: Pack };
  dst: PackHandle & { pack: Pack };
  rename: Record<string, string>;
  change: PackChange & { copies: { from: string; to: string }[]; writes: { to: string; content: string }[]; hooks: NonNullable<PackChange["hooks"]> };
  clashes: string[];
  assets: Map<string, string>;
  fonts: Set<string>;
}

const nameOf = (plan: Plan, kind: Kind | "layouts", name: string) => plan.rename[kind === "layouts" ? name : `${kind}.${name}`] ?? name;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Hash of every file under a folder, for comparing two hooks. */
function folderDigest(dir: string): string {
  const hash = createHash("sha256");
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (name === "__pycache__" || name === ".DS_Store") continue;
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(`${path.slice(dir.length)}\0`).update(readFileSync(path));
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/** The names of each kind the chosen layouts use (or every name, with no --layouts). */
function namesNeeded(src: Pack, layouts: string[], all: boolean): Record<Kind, Set<string>> {
  const need = { roles: new Set<string>(), backgrounds: new Set<string>(), tables: new Set<string>(), hooks: new Set<string>() };
  if (all) for (const kind of KINDS) Object.keys(kind === "hooks" ? {} : src[kind]).forEach((n) => need[kind].add(n));
  for (const name of layouts) {
    const layout = src.layouts[name]!;
    need.backgrounds.add(layout.background);
    for (const slot of Object.values(layout.slots)) {
      if (isTextRole(slot.role)) need.roles.add(slot.style ?? slot.role);
      if (slot.tableStyle) need.tables.add(slot.tableStyle);
      if (slot.hook) need.hooks.add(slot.hook);
    }
    for (const d of layout.decorations) {
      if (d.style) need.roles.add(d.style);
      d.backgrounds?.forEach((b) => need.backgrounds.add(b));
    }
  }
  return need;
}

/** Place one image of the source in the destination: shared, same path, or `images/<src>-<file>`. */
function placeAsset(plan: Plan, path: string): string {
  const known = plan.assets.get(path);
  if (known) return known;
  const from = join(plan.src.dir, path);
  const bytes = readFileSync(from);
  let to = path;
  for (let n = 1; existsSync(join(plan.dst.dir, to)); n++) {
    if (readFileSync(join(plan.dst.dir, to)).equals(bytes)) break;
    to = posix.join(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "", `${plan.src.pack.name}-${n > 1 ? `${n}-` : ""}${basename(path)}`);
  }
  if (!existsSync(join(plan.dst.dir, to))) {
    plan.change.copies.push({ from, to });
    plan.change.lines.push(`copied ${path}${to === path ? "" : ` as ${to}`}`);
  }
  plan.assets.set(path, to);
  return to;
}

/** A text or table style with its font named, so it keeps its typeface in the destination. */
function withFont(plan: Plan, raw: Record<string, unknown>): Record<string, unknown> {
  const family = (raw.font as string | null | undefined) ?? plan.src.pack.fonts[0]?.family ?? null;
  if (family) plan.fonts.add(family);
  return family && family !== plan.dst.pack.fonts[0]?.family ? { ...raw, font: family } : raw;
}

/** The value of one named item as it would be written into the destination. */
function copiedValue(plan: Plan, kind: Kind, name: string): unknown {
  const raw = structuredClone(plan.src.raw[kind]?.[name]);
  if (kind === "roles" || kind === "tables") return withFont(plan, raw);
  if (kind === "backgrounds" && raw.image) raw.image = placeAsset(plan, raw.image);
  return raw;
}

/** The fields in which the destination's item differs from the source's, compared as each pack resolves them; empty when the same. */
function differences(plan: Plan, kind: Kind, name: string, target: string): string[] {
  if (kind === "hooks") return folderDigest(plan.src.hooks[name]!.dir) === folderDigest(plan.dst.hooks[target]!.dir) ? [] : ["files"];
  const resolveFont = (pack: Pack, v: any) => (kind === "backgrounds" ? v : { ...v, font: v.font ?? pack.fonts[0]?.family ?? null });
  const a = resolveFont(plan.src.pack, plan.src.pack[kind][name]);
  const b = resolveFont(plan.dst.pack, plan.dst.pack[kind][target]);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k]));
}

/** Copy, share or clash one named item. */
function mergeItem(plan: Plan, kind: Kind, name: string): void {
  const target = nameOf(plan, kind, name);
  const exists = kind === "hooks" ? Boolean(plan.dst.hooks[target]) : Boolean(plan.dst.pack[kind][target]);
  if (kind === "hooks" && !plan.src.hooks[name]) return void plan.clashes.push(`hooks.${name}: a layout names it but ${plan.src.dir} has no such hook; folio pack check ${plan.src.dir}`);
  if (kind !== "hooks" && !plan.src.pack[kind][name]) return;
  const differ = exists ? differences(plan, kind, name, target) : [];
  if (exists && !differ.length) return void plan.change.lines.push(`shared ${kind}.${target} (the same in both)`);
  if (exists) return void plan.clashes.push(`${kind}.${target}: both packs define it differently (${differ.join(", ")}); merge it under another name with --rename ${kind}.${name}=<new>`);
  if (kind === "hooks") return copyHook(plan, name, target);
  plan.change.edits.push({ op: "set", path: [kind, target], value: copiedValue(plan, kind, name) });
  plan.change.lines.push(`copied ${kind}.${name}${target === name ? "" : ` as ${target}`}`);
}

/** Copy a hook's folder, renaming it in its hook.json when asked. */
function copyHook(plan: Plan, name: string, target: string): void {
  const hook = plan.src.hooks[name]!;
  plan.change.copies.push({ from: hook.dir, to: join("hooks", target) });
  plan.change.hooks[target] = { ...hook, name: target };
  if (target !== name) {
    const json = JSON.parse(readFileSync(join(hook.dir, "hook.json"), "utf8"));
    plan.change.writes.push({ to: join("hooks", target, "hook.json"), content: `${JSON.stringify({ ...json, name: target }, null, 2)}\n` });
  }
  plan.change.lines.push(`copied hook ${name}${target === name ? "" : ` as ${target}`}`);
}

/** A source layout with every renamed reference and moved image rewritten. */
function rewrittenLayout(plan: Plan, name: string): Record<string, any> {
  const raw = structuredClone(plan.src.raw.layouts[name]);
  raw.background = nameOf(plan, "backgrounds", raw.background);
  for (const slot of Object.values(raw.slots ?? {}) as Record<string, any>[]) {
    const style = slot.style ?? (isTextRole(slot.role) ? slot.role : null);
    if (style && nameOf(plan, "roles", style) !== style) slot.style = nameOf(plan, "roles", style);
    if (slot.tableStyle) slot.tableStyle = nameOf(plan, "tables", slot.tableStyle);
    if (slot.hook) slot.hook = nameOf(plan, "hooks", slot.hook);
  }
  for (const d of raw.decorations ?? []) {
    if (d.style) d.style = nameOf(plan, "roles", d.style);
    if (d.image) d.image = placeAsset(plan, d.image);
    if (d.backgrounds) d.backgrounds = d.backgrounds.map((b: string) => nameOf(plan, "backgrounds", b));
  }
  return raw;
}

/** Copy, share or clash one layout. */
function mergeLayout(plan: Plan, name: string): void {
  const target = nameOf(plan, "layouts", name);
  const theirs = plan.dst.pack.layouts[target];
  if (theirs && same(theirs, plan.src.pack.layouts[name])) return void plan.change.lines.push(`shared layout ${target} (the same in both)`);
  if (theirs) return void plan.clashes.push(`layouts.${target}: both packs define it differently; merge it under another name with --rename ${name}=<new>`);
  plan.change.edits.push({ op: "set", path: ["layouts", target], value: rewrittenLayout(plan, name) });
  plan.change.lines.push(`copied layout ${name}${target === name ? "" : ` as ${target}`}`);
}

/** Bring in the font entries and files of every family the copied styles use that the destination lacks. */
function mergeFonts(plan: Plan): PackEdit[] {
  const added = plan.src.pack.fonts.filter((f) => plan.fonts.has(f.family) && !plan.dst.pack.fonts.some((d) => d.family === f.family));
  if (!added.length) return [];
  const raws = (plan.src.raw.fonts as Record<string, unknown>[]).filter((f) => added.some((a) => a.file === f.file));
  const entries = raws.map((f) => ({ ...f, file: placeAsset(plan, f.file as string) }));
  plan.change.lines.push(`added font ${[...new Set(added.map((f) => f.family))].join(", ")}`);
  return [{ op: "set", path: ["fonts"], value: [...(plan.dst.raw.fonts ?? []), ...entries] }];
}

/** Check the inputs: both packs load, the same canvas, known layouts and renames. */
function checkInputs(src: PackHandle, dst: PackHandle, options: MergeOptions): string[] {
  for (const h of [src, dst]) if (!h.pack) throw new Error(`${h.dir} does not load as a pack; folio pack check ${h.dir} names the problems`);
  const [s, d] = [src.pack!, dst.pack!];
  if (s.canvas.w !== d.canvas.w || s.canvas.h !== d.canvas.h) throw new Error(`refused: ${s.name} is ${s.canvas.w} x ${s.canvas.h} pt and ${d.name} is ${d.canvas.w} x ${d.canvas.h} pt; boxes would not fit`);
  const layouts = options.layouts ?? Object.keys(s.layouts);
  const unknown = layouts.filter((l) => !s.layouts[l]);
  if (unknown.length) throw new Error(`${s.name} has no layout ${unknown.join(", ")} (layouts: ${Object.keys(s.layouts).join(", ")})`);
  for (const key of Object.keys(options.rename)) {
    const [kind, name] = key.includes(".") ? key.split(/\.(.*)/) : ["layouts", key];
    const known = kind === "layouts" ? layouts : kind === "hooks" ? Object.keys(src.hooks) : (KINDS as readonly string[]).includes(kind!) ? Object.keys((s as any)[kind!]) : null;
    if (!known) throw new Error(`--rename ${key}: "${kind}" is not one of roles, backgrounds, tables, hooks`);
    if (!known.includes(name!)) throw new Error(`--rename ${key}: ${s.name} has no ${kind === "layouts" ? "layout" : kind} "${name}" to merge`);
  }
  return layouts;
}

/**
 * Plan a merge.
 *
 * @returns the change for `applyPackChange`.
 * @throws refusing with every clash and its `--rename`.
 */
export function planMerge(src: PackHandle, dst: PackHandle, options: MergeOptions): PackChange {
  const layouts = checkInputs(src, dst, options);
  const change: Plan["change"] = { edits: [], copies: [], writes: [], hooks: {}, lines: [] };
  const plan: Plan = { src: src as Plan["src"], dst: dst as Plan["dst"], rename: options.rename, change, clashes: [], assets: new Map(), fonts: new Set() };
  const need = namesNeeded(plan.src.pack, layouts, !options.layouts);
  if (!options.layouts) Object.keys(src.hooks).forEach((h) => need.hooks.add(h));
  for (const kind of KINDS) for (const name of need[kind]) mergeItem(plan, kind, name);
  for (const name of layouts) mergeLayout(plan, name);
  for (const key of Object.keys(options.rename)) {
    const [kind, name] = key.includes(".") ? key.split(/\.(.*)/) : ["layouts", key];
    const used = kind === "layouts" ? layouts.includes(name!) : need[kind as Kind]?.has(name!);
    if (!used) change.lines.push(`--rename ${key} was not needed: nothing merged uses ${kind === "layouts" ? "layout" : kind} "${name}"`);
  }
  if (plan.clashes.length) throw new Error(`refused: ${plan.clashes.length} name${plan.clashes.length > 1 ? "s" : ""} clash:\n  ${plan.clashes.join("\n  ")}`);
  change.edits.push(...mergeFonts(plan));
  return change;
}
