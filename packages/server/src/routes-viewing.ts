/** What the user is looking at: editor tabs report it, agents read it. */
import { relative } from "./posixpath.js";
import { parseViewingReport, rankViewing, type Viewing, type ViewingTab } from "@folio/core";
import type { FolioApp } from "./app.js";
import { readBody, sendJson, sendProblem, type Router } from "./httpkit.js";
import type { ViewingEntry } from "./viewing.js";

const MAX_WAIT_S = 600;

/**
 * One tab as an agent reads it: the deck as a workspace-relative folder, the
 * slide with its position and layout.
 *
 * @returns the tab, or null when its deck is no longer mounted.
 */
function describeTab(app: FolioApp, entry: ViewingEntry, now: number): ViewingTab | null {
  const store = app.workspace.decks.get(entry.token);
  if (!store) return null;
  const manifest = app.manifestOf(store).list();
  const index = manifest.findIndex((m) => m.id === entry.slide);
  const found = manifest[index];
  return {
    tab: entry.tab,
    deck: relative(app.config.root, store.dir) || ".",
    token: entry.token,
    title: store.deck.title,
    slide: found ? { id: found.id, position: index + 1, of: manifest.length, layout: found.layout, title: found.title } : null,
    mode: entry.mode,
    selection: { slot: entry.slot, slides: entry.slides },
    visible: entry.visible,
    focused: entry.focused,
    activeSecondsAgo: Math.max(0, Math.round((now - entry.activeAt) / 1000)),
  };
}

/**
 * Every open tab, ranked.
 *
 * @param app - the server state.
 * @returns the version and the tabs, the one most likely in front of the user first.
 */
export function viewingNow(app: FolioApp): Viewing {
  const now = Date.now();
  const tabs = rankViewing(app.viewing.list(now)).map((e) => describeTab(app, e, now)).filter((t): t is ViewingTab => t !== null);
  return { version: app.viewing.version, tabs };
}

/**
 * `GET /api/viewing[?since=V&wait=S]` and `POST /api/viewing`.
 *
 * @param router - the router.
 * @param app - the server state.
 */
export function viewingRoutes(router: Router, app: FolioApp): void {
  router.on("GET", "/api/viewing", async (_req, res, _p, url) => {
    const since = url.searchParams.get("since");
    const wait = Math.min(MAX_WAIT_S, Number(url.searchParams.get("wait") ?? 0));
    if (since !== null && wait > 0) await app.viewing.wait(Number(since), wait * 1000);
    sendJson(res, 200, viewingNow(app));
  });
  router.on("POST", "/api/viewing", async (req, res) => {
    const parsed = parseViewingReport(await readBody(req, 64 * 1024));
    if ("error" in parsed) return sendProblem(res, 422, "Bad viewing report", parsed.error);
    if ("closed" in parsed) app.viewing.close(parsed.closed);
    else app.viewing.report(parsed.report);
    sendJson(res, 200, { version: app.viewing.version });
  });
}
