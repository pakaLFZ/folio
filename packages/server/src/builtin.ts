/**
 * Built-in packs: pack folders shipped with folio under `packages/server/packs/`.
 * A workspace gets one by copy, into its own `templates/`, the first time a deck
 * asks for it; from then on it is an ordinary pack of that workspace, so
 * promotion and `folio pack edit` never write into folio's own install.
 */
import { cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parsePackRef } from "@folio/core";
import { fileURLToPath } from "node:url";

export const BUILTIN_PACKS_DIR = fileURLToPath(new URL("../packs", import.meta.url));

/** The pack a deck made without `--template` uses. */
export const DEFAULT_PACK = "plain@1";

/** Names of the built-in packs. */
export function builtinPackNames(): string[] {
  return readdirSync(BUILTIN_PACKS_DIR).filter((n) => existsSync(join(BUILTIN_PACKS_DIR, n, "pack.json")));
}

/**
 * Copy a built-in pack into a workspace's templates when the workspace lacks it.
 *
 * @param templatesDir - the workspace's `templates/`.
 * @param ref - a pack reference such as `plain@1`.
 * @returns the folder it was copied to, or null when the workspace already has
 *   a pack folder of that name (never overwritten) or no built-in pack has it.
 */
export function installBuiltinPack(templatesDir: string, ref: string): string | null {
  const { name } = parsePackRef(ref);
  const target = join(templatesDir, name);
  if (existsSync(target) || !builtinPackNames().includes(name)) return null;
  cpSync(join(BUILTIN_PACKS_DIR, name), target, { recursive: true });
  return target;
}
