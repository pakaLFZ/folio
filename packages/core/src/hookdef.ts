/**
 * `hook.json`: a script that a template runs to fill a slot of any kind.
 *
 * A hook lives in `templates/<pack>/hooks/<name>/` and travels with its pack.
 * `output` is what it makes: a figure (the default), text or a table.
 * `runtime` is a name resolved by the workspace config, never a path.
 */
import { z } from "zod";
import type { Pack } from "./pack.js";

export const HOOK_KINDS = ["figure", "text", "table"] as const;
export type HookKind = (typeof HOOK_KINDS)[number];

export const hookDefSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.number().int().positive().default(1),
  description: z.string().default(""),
  output: z.enum(HOOK_KINDS).default("figure"),
  inputs: z.record(z.string(), z.unknown()).default({}),
  command: z.array(z.string()).min(1),
  runtime: z.string().nullable().default(null),
  outputs: z.enum(["png", "svg"]).default("png"),
  timeout: z.number().positive().default(60),
  dpi: z.number().int().positive().default(200),
  mode: z.enum(["spawn", "warm"]).default("spawn"),
  entry: z.string().regex(/^[\w.]+:\w+$/).nullable().default(null),
  requires: z.array(z.string()).default([]),
  example: z.unknown().optional(),
});
export type HookDef = z.infer<typeof hookDefSchema>;

/**
 * Validate a parsed `hook.json`.
 *
 * @param json - the parsed document.
 * @returns `{ok: true, hook}` with defaults filled in, or `{ok: false, problems}`.
 */
export function loadHookDef(json: unknown): { ok: true; hook: HookDef } | { ok: false; problems: string[] } {
  const parsed = hookDefSchema.safeParse(json);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  const given = json as { inputs?: unknown };
  if (parsed.data.output === "figure" && given.inputs === undefined) return { ok: false, problems: ["inputs: a figure hook needs an inputs JSON Schema"] };
  return { ok: true, hook: parsed.data };
}

/**
 * The kind of slot a role makes.
 *
 * @param role - a slot role.
 * @returns `figure`, `table`, or `text` for every text role.
 */
export function slotKind(role: string): HookKind {
  return role === "figure" || role === "table" ? role : "text";
}

/**
 * The kind of content a role holds.
 *
 * @param role - a slot role.
 * @returns `shape` or `block` for those slots, else the kind `slotKind` gives.
 */
export function contentKind(role: string): HookKind | "shape" | "block" {
  return role === "shape" || role === "block" ? role : slotKind(role);
}

/**
 * Slots that name a hook the pack lacks, or a hook that makes another kind.
 *
 * @param pack - a schema-valid pack.
 * @param hooks - the pack's hooks by name.
 * @returns one message per bad slot, naming slot, hook and both kinds.
 */
export function hookSlotProblems(pack: Pack, hooks: Record<string, Pick<HookDef, "output">>): string[] {
  const problems: string[] = [];
  for (const [layoutName, layout] of Object.entries(pack.layouts)) {
    for (const [slotName, slot] of Object.entries(layout.slots)) {
      if (!slot.hook) continue;
      const where = `layouts.${layoutName}.slots.${slotName}.hook`;
      const kind = slotKind(slot.role);
      const hook = hooks[slot.hook];
      if (!hook) problems.push(`${where}: hook "${slot.hook}" is not in hooks/; add hooks/${slot.hook}/hook.json or remove the field`);
      else if (hook.output !== kind) problems.push(`${where}: hook "${slot.hook}" makes a ${hook.output}, but ${slotName} is a ${kind} slot (role ${slot.role}); name a hook with "output": "${kind}"`);
    }
  }
  return problems;
}
