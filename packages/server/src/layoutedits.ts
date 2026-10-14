/**
 * The scripted edits of `folio pack edit`: add, rename and remove a layout,
 * and set one value by its path. Each returns a change for `applyPackChange`,
 * which validates it and protects the workspace's decks.
 */
import { packSchema } from "@folio/core";
import type { JSONPath } from "jsonc-parser";
import type { PackChange, PackHandle } from "./packedit.js";

const LAYOUT_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Throw unless the pack has this layout, naming the ones it has. */
function needLayout(handle: PackHandle, name: string): void {
  const layouts = Object.keys(handle.raw.layouts ?? {});
  if (!layouts.includes(name)) throw new Error(`layout "${name}" is not in ${handle.dir} (layouts: ${layouts.join(", ")})`);
}

/** Throw when a new layout name is taken or malformed. */
function freeName(handle: PackHandle, name: string): void {
  if (!LAYOUT_NAME.test(name)) throw new Error(`"${name}" is not a layout name: use lower-case letters, digits and hyphens`);
  if (handle.raw.layouts?.[name]) throw new Error(`layout "${name}" already exists; choose another name, or folio pack edit <pack> layout remove ${name} first`);
}

/**
 * Add a layout, copied from another layout of the pack or given as JSON.
 *
 * @param from - `{layout}` to copy, or `{json}` holding a layout object.
 */
export function layoutAdd(handle: PackHandle, name: string, from: { layout: string } | { json: unknown }): PackChange {
  freeName(handle, name);
  const value = "layout" in from ? (needLayout(handle, from.layout), handle.raw.layouts[from.layout]) : from.json;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error('the layout must be a JSON object {"description", "background", "slots", ...}; folio pack schema shows the shape');
  return { edits: [{ op: "set", path: ["layouts", name], value }], lines: [`added layout ${name}${"layout" in from ? ` (a copy of ${from.layout})` : ""}`] };
}

/** Rename a layout in place. */
export function layoutRename(handle: PackHandle, from: string, to: string): PackChange {
  needLayout(handle, from);
  freeName(handle, to);
  return { edits: [{ op: "rename", path: ["layouts", from], to }], lines: [`renamed layout ${from} to ${to}`] };
}

/** Move a layout out of pack.json into the pack's archive. */
export function layoutRemove(handle: PackHandle, name: string): PackChange {
  needLayout(handle, name);
  if (Object.keys(handle.raw.layouts).length === 1) throw new Error(`"${name}" is the pack's only layout; add another before removing it`);
  return {
    edits: [{ op: "remove", path: ["layouts", name] }],
    archive: [{ name, value: handle.raw.layouts[name] }],
    lines: [`removed layout ${name}; kept in .archive/<day>/layouts/${name}.json`],
  };
}

/** Split `a.b.0=json` into a JSON path (numbers where the parent is an array) and the parsed value. */
export function parseAssignment(raw: Record<string, any>, assignment: string): { path: JSONPath; value: unknown } {
  const eq = assignment.indexOf("=");
  if (eq <= 0) throw new Error(`"${assignment}" is not <path>=<json>; e.g. layouts.title.slots.title.box=[22.5,316.1,720,212.4]`);
  let value: unknown;
  try {
    value = JSON.parse(assignment.slice(eq + 1));
  } catch {
    throw new Error(`the value of ${assignment.slice(0, eq)} is not JSON; quote strings: ${assignment.slice(0, eq)}='"#FFFFFF"'`);
  }
  const path: JSONPath = [];
  let node: any = raw;
  for (const key of assignment.slice(0, eq).split(".")) {
    if (node !== undefined && typeof node !== "object") throw new Error(`${path.join(".")} is a value, not an object; set it whole`);
    const segment = Array.isArray(node) && /^\d+$/.test(key) ? Number(key) : key;
    path.push(segment);
    node = node?.[segment];
  }
  return { path, value };
}

/** The value at a path of a parsed pack, or undefined. */
function at(value: any, path: JSONPath): unknown {
  return path.reduce((node, key) => (node == null ? undefined : node[key]), value);
}

/**
 * Set one value of pack.json by its path.
 *
 * @throws when the path names a field pack.json does not have, so a typo is never written.
 */
export function setValue(handle: PackHandle, assignment: string): PackChange {
  const { path, value } = parseAssignment(handle.raw, assignment);
  const parent = at(handle.raw, path.slice(0, -1));
  if (parent === undefined) throw new Error(`${path.slice(0, -1).join(".")} is not in pack.json; set an existing object's member, or the object whole`);
  const draft = structuredClone(handle.raw);
  (at(draft, path.slice(0, -1)) as Record<string | number, unknown>)[path.at(-1)!] = value;
  const parsed = packSchema.safeParse(draft);
  if (parsed.success && value !== null && at(parsed.data, path) === undefined) {
    throw new Error(`${path.join(".")}: pack.json has no such field, so it would be ignored; folio pack schema lists the fields`);
  }
  return { edits: [{ op: "set", path, value }], lines: [`set ${path.join(".")} = ${JSON.stringify(value)}`] };
}
