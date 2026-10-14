/**
 * RFC 6902 JSON Patch on a slide spec, through json-render's `applySpecPatch`,
 * with the RFC's rule that `remove` and `replace` need an existing target.
 */
import { applySpecPatch, getByPath, type Spec } from "@json-render/core";
import { slideSpecSchema, type SlideSpec } from "./schema.js";

export interface PatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export type PatchResult = { ok: true; spec: SlideSpec } | { ok: false; reason: string };

/**
 * Apply a patch to a slide without touching the input.
 *
 * @param spec - the slide as stored.
 * @param ops - the RFC 6902 operations, applied in order, all or nothing.
 * @returns the patched slide, or the reason the patch was refused: a failed
 *   `test`, a missing target, or a result that is no longer a slide spec.
 */
export function applySlidePatch(spec: SlideSpec, ops: PatchOp[]): PatchResult {
  let next = structuredClone(spec) as unknown as Spec;
  try {
    for (const op of ops) {
      if ((op.op === "remove" || op.op === "replace") && getByPath(next as never, op.path) === undefined) {
        return { ok: false, reason: `${op.op} ${op.path}: no value at that path` };
      }
      next = applySpecPatch(next, op as never);
    }
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  const parsed = slideSpecSchema.safeParse(next);
  return parsed.success ? { ok: true, spec: parsed.data } : { ok: false, reason: "the patched file is not a slide spec" };
}

/**
 * Escape a slot name for use in a JSON Pointer.
 *
 * @param slot - e.g. `label:a` or a name containing `/`.
 * @returns the RFC 6901 escaped token (`~` to `~0`, `/` to `~1`).
 */
export function pointerToken(slot: string): string {
  return slot.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * The patch that sets one slot of a slide.
 *
 * @param spec - the slide, for its root key.
 * @param slot - the slot name.
 * @param value - the new content; null clears the slot.
 * @returns a single `add` operation (add replaces an existing member).
 */
export function setSlotOp(spec: SlideSpec, slot: string, value: unknown): PatchOp {
  return { op: "add", path: `/elements/${pointerToken(spec.root)}/props/${pointerToken(slot)}`, value };
}
