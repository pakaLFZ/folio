/**
 * `folio skill show | install [--project | --user] [--force]`: the agent skill
 * folio ships (`skills/folio/`, `SKILL.md` and `references/`), which tells
 * every agent how to install folio, write a deck and keep a watch on the
 * user's comments. Install copies the folder to the workspace's
 * `.claude/skills/folio/` or the user's `~/.claude/skills/folio/`, and never
 * overwrites a copy that differs without `--force`. `folio quickstart` prints
 * the worked example shipped with it (`skills/folio/references/quickstart.md`).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { relative } from "@folio/server";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findWorkspace } from "@folio/server";

export const SHIPPED_SKILL = fileURLToPath(new URL("../../../skills/folio/", import.meta.url));
export const QUICKSTART = join(SHIPPED_SKILL, "references", "quickstart.md");
const SKILL_PATH = join(".claude", "skills", "folio");

export type SkillScope = "project" | "user";

export interface SkillInstall {
  status: "installed" | "unchanged" | "replaced" | "refused";
  dir: string;
  /** Lines that differ, `- ` installed and `+ ` shipped, per file. */
  diff: string[];
}

/** Where the skill goes for a scope. */
export function skillDir(scope: SkillScope, workspace: string, home = homedir()): string {
  return join(scope === "user" ? home : workspace, SKILL_PATH);
}

/**
 * The lines of `installed` not in `shipped` (`-`) and of `shipped` not in `installed` (`+`).
 *
 * @returns the lines, empty when the texts are equal.
 */
export function lineDiff(installed: string, shipped: string): string[] {
  const a = installed.split("\n");
  const b = shipped.split("\n");
  const inB = new Set(b);
  const inA = new Set(a);
  return [
    ...a.flatMap((line, i) => (inB.has(line) ? [] : [`- ${i + 1}: ${line}`])),
    ...b.flatMap((line, i) => (inA.has(line) ? [] : [`+ ${i + 1}: ${line}`])),
  ];
}

/** Every file under `dir`, as `/`-joined paths relative to it. */
export function skillFiles(dir: string, under = ""): string[] {
  return readdirSync(join(dir, under), { withFileTypes: true }).flatMap((e) => {
    const path = under ? `${under}/${e.name}` : e.name;
    return e.isDirectory() ? skillFiles(dir, path) : [path];
  });
}

/**
 * Copy the shipped skill into `dir`.
 *
 * @param force - replace a copy that differs.
 * @returns what happened, and the differing lines when refused or replaced.
 */
export function installSkill(dir: string, force: boolean, from = SHIPPED_SKILL): SkillInstall {
  const files = skillFiles(from);
  const diff = files.flatMap((f) => {
    const there = join(dir, f);
    if (!existsSync(there)) return [];
    const lines = lineDiff(readFileSync(there, "utf8"), readFileSync(join(from, f), "utf8"));
    return lines.length ? [`${f}:`, ...lines] : [];
  });
  const fresh = !files.some((f) => existsSync(join(dir, f)));
  const complete = files.every((f) => existsSync(join(dir, f)));
  if (diff.length && !force) return { status: "refused", dir, diff };
  if (!diff.length && complete) return { status: "unchanged", dir, diff };
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(from, f), join(dir, f));
  }
  return { status: fresh ? "installed" : "replaced", dir, diff };
}

/**
 * The hint `init-deck` and `serve` print when no agent here would find the skill.
 *
 * @returns the line, or null when the workspace or the home holds it.
 */
export function skillHint(workspace: string, home = homedir()): string | null {
  const found = (["project", "user"] as const).some((s) => existsSync(join(skillDir(s, workspace, home), "SKILL.md")));
  return found ? null : "agents: install the folio skill so they keep a watch on your comments: folio skill install";
}

/** `folio skill show | install [path] [--project | --user] [--force]` */
export async function skillCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { project: { type: "boolean" }, user: { type: "boolean" }, force: { type: "boolean" } } });
  const [verb, path] = positionals;
  if (verb === "show") return (process.stdout.write(readFileSync(join(SHIPPED_SKILL, "SKILL.md"), "utf8")), 0);
  if (verb !== "install" || (values.project && values.user)) throw new Error("usage: folio skill show | install [path] [--project | --user] [--force]");
  const scope: SkillScope = values.user ? "user" : "project";
  const result = installSkill(skillDir(scope, findWorkspace(path ?? ".")), !!values.force);
  const where = relative(process.cwd(), result.dir) || result.dir;
  if (result.status === "refused") {
    process.stderr.write(`folio skill: ${where} holds a changed copy; nothing written. It differs from the shipped skill in:\n${result.diff.map((l) => `  ${l}`).join("\n")}\nReplace it with: folio skill install${scope === "user" ? " --user" : ""} --force\n`);
    return 2;
  }
  const said = { installed: "installed the folio skill in", unchanged: "the folio skill is already installed, unchanged, in", replaced: "replaced the changed folio skill in" }[result.status];
  process.stdout.write(`${said} ${result.dir}\n`);
  return 0;
}

/** `folio quickstart`: a worked example from an empty workspace to a pptx. */
export async function quickstartCommand(): Promise<number> {
  process.stdout.write(readFileSync(QUICKSTART, "utf8"));
  return 0;
}
