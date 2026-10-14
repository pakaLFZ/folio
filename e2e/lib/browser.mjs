/**
 * One headless Chromium shared by every browser check of a run.
 *
 * `node e2e/lib/browser.mjs <file>` launches a browser server, writes its endpoint to <file> and keeps it until
 * it is signalled or the process that started it is gone. A check started with
 * `node --import ./e2e/lib/browser.mjs` and FOLIO_E2E_BROWSER set gets `chromium.launch()` connected to that
 * server instead: each `newPage`/`newContext` is a fresh context of its own, closed with the check's
 * `browser.close()`. Without the variable `chromium.launch()` is left alone, so `node e2e/<name>.mjs` launches
 * its own browser as before.
 */
import { renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const parent = process.ppid;
const parentGone = () => {
  if (process.ppid !== parent) return true;
  try {
    process.kill(parent, 0);
    return false;
  } catch {
    return true;
  }
};

/** Launch the browser server, publish its endpoint atomically, and close it on a signal or an orphaned parent. */
async function serveBrowser(endpointFile) {
  const server = await chromium.launchServer({ handleSIGINT: false, handleSIGTERM: false });
  writeFileSync(`${endpointFile}.tmp`, server.wsEndpoint());
  renameSync(`${endpointFile}.tmp`, endpointFile);
  const stop = async () => (await server.close(), process.exit(0));
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, stop);
  setInterval(() => parentGone() && stop(), 1000);
}

const endpoint = process.env.FOLIO_E2E_BROWSER;
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await serveBrowser(process.argv[2]);
else if (endpoint) chromium.launch = () => chromium.connect(endpoint);
