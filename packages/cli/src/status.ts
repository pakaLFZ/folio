/**
 * `folio status [workspace|deck]`: what stands right now, without rendering -
 * open comments first, then per-deck counts and the stored warnings.
 */
import { parseArgs } from "node:util";
import { summarize, summaryLine } from "@folio/core";
import { FolioApp, findWorkspace, loadConfig, type DeckStore } from "@folio/server";
import { printReport, reportOptions, REPORT_OPTIONS } from "./report.js";
import { commentPreamble, configureServices, queueLine } from "./services.js";
import { viewingStatus } from "./viewingcmd.js";

/**
 * Print the status.
 *
 * @param args - `[path] [--json] [--all]`.
 * @returns 0 unless the report policy says otherwise.
 */
export async function statusCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: REPORT_OPTIONS });
  const app = new FolioApp(loadConfig(findWorkspace(positionals[0] ?? ".")));
  configureServices(app);
  const only = positionals[0] ? app.workspace.findDeck(positionals[0]) : undefined;
  const decks = only ? [only] : [...app.workspace.decks.values()];
  const options = reportOptions(values);
  const all = decks.flatMap((store) => app.warnings.deckWarnings(store));
  let preamble = "";
  for (const store of decks) {
    const stale = store.slideIds().filter((id) => !app.warnings.measuredCurrent(store, id));
    const s = summarize(all.filter((w) => w.location.deck === store.token));
    preamble += commentPreamble(app, store);
    preamble += `${store.deck.title}  /${store.token}/  ${store.slideIds().length} slides  ${summaryLine(s)}${stale.length ? `  (${stale.length} not measured since their last edit: run folio check)` : ""}\n`;
  }
  preamble += queueLine(app);
  preamble += await viewingStatus(app);
  const stores = new Map<string, DeckStore>(decks.map((d) => [d.token, d]));
  const code = printReport(all, stores, app.config.root, options, `${preamble}\n`);
  await app.close();
  return code;
}
