/**
 * `folio comment search`: every comment of every deck, any status, over the
 * whole chat and attachment names. Asks the running server when there is one,
 * and reads the comment files itself when none runs.
 */
import { parseArgs } from "node:util";
import { findWorkspace, FolioApp, loadConfig, searchQueryOf, searchWorkspace, type SearchRow } from "@folio/server";
import { findServer } from "./queuecmds.js";

const FILTERS = ["deck", "slide", "slot", "status", "author", "since", "limit"] as const;

/**
 * Run the search, through the server when it runs.
 *
 * @returns the hits, the total before the limit, and the address the links start with.
 */
async function runSearch(app: FolioApp, params: URLSearchParams): Promise<{ hits: SearchRow[]; total: number; root: string }> {
  const base = await findServer(app);
  if (!base) return { ...searchWorkspace([...app.workspace.decks.values()], searchQueryOf(params), app.config.user), root: `http://localhost:${app.config.port}` };
  const res = await fetch(`${base}/api/comments/search?${params}`);
  const body = (await res.json()) as { hits: SearchRow[]; total: number; detail?: string };
  if (!res.ok) throw new Error(body.detail ?? `search failed with ${res.status}`);
  return { ...body, root: base };
}

/** Print one hit as a block. */
function printHit(hit: SearchRow, root: string): void {
  const status = hit.view === hit.status ? hit.status : `${hit.status} (${hit.view})`;
  process.stdout.write(`${hit.id}  ${hit.deck}/${hit.slide}  [${hit.slots.join(", ") || "whole slide"}]  ${status}  ${hit.hits ? `${hit.hits} ${hit.hits === 1 ? "hit" : "hits"}` : `by ${hit.author}`}\n`);
  if (!hit.messages.length) process.stdout.write(`    ${hit.author}: ${hit.excerpt}\n`);
  for (const m of hit.messages) process.stdout.write(`    #${m.index} ${m.author} ${m.at.slice(0, 16).replace("T", " ")}: ${m.snippet}\n`);
  process.stdout.write(`    read it: folio comment show ${hit.id}\n    ${root}${hit.url}\n`);
}

/** `folio comment search "QUERY" [--deck D] [--slide S] [--slot X] [--status S[,S]] [--author A] [--since DATE] [--limit N] [--json]` */
export async function searchCommand(args: string[]): Promise<number> {
  const filter = { type: "string" } as const;
  const options = { deck: filter, slide: filter, slot: filter, status: filter, author: filter, since: filter, limit: filter, json: { type: "boolean" } } as const;
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options });
  const params = new URLSearchParams();
  if (positionals.length) params.set("q", positionals.join(" "));
  for (const k of FILTERS) if (values[k]) params.set(k, values[k]);
  const app = new FolioApp(loadConfig(findWorkspace(".")));
  try {
    const { hits, total, root } = await runSearch(app, params);
    if (values.json) process.stdout.write(`${JSON.stringify({ hits, total })}\n`);
    else if (!hits.length) process.stdout.write("no comments match\n");
    else {
      hits.forEach((h) => printHit(h, root));
      if (total > hits.length) process.stdout.write(`${hits.length} of ${total} shown; raise --limit for more\n`);
    }
  } finally {
    await app.close();
  }
  return 0;
}
