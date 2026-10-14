/**
 * `folio doctor [path] [--json]`: whether this machine can run folio, one line
 * per check with the command that fixes a failure. Exit 1 when any fails.
 */
import { parseArgs } from "node:util";
import { findWorkspace, loadConfig } from "@folio/server";
import { chromiumCheck, nodeCheck, portCheck, pythonCheck, webBuildCheck, workspaceCheck, type DoctorCheck } from "./doctorchecks.js";

/** One printed line per check. */
export function doctorLines(checks: DoctorCheck[]): string[] {
  const width = Math.max(...checks.map((c) => c.check.length));
  return checks.map((c) => `${c.ok ? "ok  " : "FAIL"}  ${c.check.padEnd(width)}  ${c.detail}${c.fix ? `\n${" ".repeat(width + 8)}fix: ${c.fix}` : ""}`);
}

/** `folio doctor [path] [--json]`. */
export async function doctorCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" } } });
  const config = loadConfig(findWorkspace(positionals[0] ?? "."));
  const checks = [nodeCheck(), webBuildCheck(), await chromiumCheck(), pythonCheck(config), await workspaceCheck(config), await portCheck(config)];
  process.stdout.write(values.json ? `${JSON.stringify(checks)}\n` : `${doctorLines(checks).join("\n")}\n`);
  return checks.every((c) => c.ok) ? 0 : 1;
}
