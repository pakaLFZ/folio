/**
 * Headless rendering for `check`, `pdf` and comment screenshots: the workspace
 * is served in-process on a free loopback port and the print page is driven by
 * Playwright's Chromium, so the measurement is the live view's own routine.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createFolioServer, FolioApp, loadConfig, loadPlaywright, openPrintPage, staleWebBuild, type Measured, type WorkspaceConfig } from "@folio/server";

type Browser = import("playwright").Browser;
type Page = import("playwright").Page;

export interface Headless {
  app: FolioApp;
  base: string;
  browser: Browser;
  close: () => Promise<void>;
}

/**
 * Load Playwright, or refuse naming how to install it.
 *
 * @returns the chromium launcher.
 */
async function chromium() {
  try {
    return (await loadPlaywright()).chromium;
  } catch {
    throw new Error("Playwright is not installed; run: pnpm add -w playwright@1.62.1 && pnpm exec playwright install chromium");
  }
}

/**
 * Serve a workspace on a free port and open a headless browser.
 *
 * @param root - the workspace folder.
 * @param configure - attaches services to the app and returns their routes.
 * @returns the app, the base URL and the browser; `close` stops all three.
 */
export async function startHeadless(root: string, configure?: (app: FolioApp) => ((router: import("@folio/server").Router) => void) | void): Promise<Headless> {
  warnIfStale();
  const config: WorkspaceConfig = loadConfig(root);
  const app = new FolioApp(config);
  const routes = configure?.(app) ?? undefined;
  const server: Server = createFolioServer(app, { prefix: "", ...(routes ? { extraRoutes: routes } : {}) });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = await (await chromium()).launch();
  const close = async () => {
    await browser.close();
    await app.close();
    await new Promise((r) => server.close(r));
  };
  return { app, base, browser, close };
}

/** Say on stderr, in one line, when the web build is older than its sources. */
export function warnIfStale(): void {
  const stale = staleWebBuild();
  if (stale) process.stderr.write(`${stale}\n`);
}

/**
 * Open a deck's print page on the headless server and wait until every slide
 * is laid out.
 *
 * @param slides - limit to these slide ids; all when omitted.
 * @returns the open page and the measurements it published.
 */
export function openPrint(headless: Headless, token: string, slides?: string[], timeoutMs = 60_000): Promise<{ page: Page; measured: Measured }> {
  return openPrintPage(headless.browser, headless.base, token, slides, timeoutMs);
}
