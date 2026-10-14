/**
 * A deck served headless with its hook figures drawn: the session `folio pdf`
 * and `folio shot` share. The figures are drawn on the running server's queue
 * when one runs, or by this process when none does.
 */
import { findWorkspace, type DeckStore, type Measured } from "@folio/server";
import { openDeck } from "./deckcmds.js";
import { startHeadless, type Headless } from "./headless.js";
import { findServer } from "./queuecmds.js";
import { attachServices, type Services } from "./services.js";

export interface FigureSession {
  headless: Headless;
  store: DeckStore;
  /** Slots still drawing when the wait ended. */
  pending: string[];
  /** Hand a page's measurement to the queue and wait for the redraws it causes. */
  remeasure: (measured: Measured) => Promise<void>;
}

/**
 * Wait for the deck's queued hook jobs.
 *
 * @returns the slots still pending when the wait ended.
 */
async function waitForFigures(base: string | null, token: string, timeoutMs: number, local: () => Promise<string[]>): Promise<string[]> {
  if (!base) return local();
  const res = await fetch(`${base}/api/queue/wait`, { method: "POST", body: JSON.stringify({ deck: token, timeoutMs }) });
  return ((await res.json()) as { pending: string[] }).pending;
}

/**
 * Serve the deck's workspace headless, wait up to `waitMs` for its figures,
 * run `work`, then stop everything.
 *
 * @param deck - the deck folder (or a path inside it).
 * @returns what `work` returns.
 */
export async function withFigures<T>(deck: string, waitMs: number, work: (session: FigureSession) => Promise<T>): Promise<T> {
  const target = openDeck(deck).store;
  const held: { services?: Services } = {};
  const headless = await startHeadless(findWorkspace(target.dir), (app) => {
    held.services = attachServices(app, false);
    return held.services.routes;
  });
  try {
    const store = headless.app.workspace.findDeck(target.dir)!;
    const server = await findServer(headless.app);
    const hooks = held.services!.hooks;
    if (!server) hooks.start();
    const wait = () => waitForFigures(server, store.token, waitMs, () => hooks.idle(store.token, waitMs));
    const pending = await wait();
    const remeasure = async (measured: Measured) => {
      const base = server ?? headless.base;
      for (const [slide, m] of Object.entries(measured)) await fetch(`${base}/${store.token}/measure`, { method: "POST", body: JSON.stringify({ slide, rev: m.rev, slots: m.slots }) });
      await wait();
    };
    return await work({ headless, store, pending, remeasure });
  } finally {
    held.services?.hooks.close();
    await headless.close();
  }
}
