/**
 * `folio check <deck>`: render every slide headless, measure it with the live
 * view's routine, and print every warning. Exits 0 unless asked otherwise.
 */
import { parseArgs } from "node:util";
import { findWorkspace, type DeckStore } from "@folio/server";
import { openDeck } from "./deckcmds.js";
import { openPrint, startHeadless } from "./headless.js";
import { printReport, reportOptions, REPORT_OPTIONS } from "./report.js";
import { attachServices, commentPreamble } from "./services.js";

/**
 * Run the check.
 *
 * @param args - `<deck> [--json|--sarif|--format github] [--all] [--max-warnings N] [--fail-on new]`.
 * @returns the exit code from the report policy.
 */
export async function checkCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { ...REPORT_OPTIONS, timeout: { type: "string" } } });
  const target = openDeck(positionals[0] ?? ".").store;
  const headless = await startHeadless(findWorkspace(target.dir), (app) => attachServices(app, false).routes);
  try {
    const store = headless.app.workspace.findDeck(target.dir)!;
    const { page, measured } = await openPrint(headless, store.token, undefined, Number(values.timeout ?? 60) * 1000);
    await page.close();
    const warnings = store.slideIds().flatMap((id) => headless.app.warnings.slideWarnings(store, id, measured[id] ?? null));
    const stores = new Map<string, DeckStore>([[store.token, store]]);
    return printReport(warnings, stores, headless.app.config.root, reportOptions(values), commentPreamble(headless.app, store));
  } finally {
    await headless.close();
  }
}
