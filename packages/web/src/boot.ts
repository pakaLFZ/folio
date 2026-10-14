/**
 * The page bootstrap the server writes into the HTML. Every address the client
 * uses is built from `root`, never from `location`, so `/<deck8>` without a
 * trailing slash cannot send a request to the wrong place.
 */
import type { Pack } from "@folio/core";

export interface ManifestEntry {
  id: string;
  rev: string;
  layout: string | null;
  title: string;
  error: string | null;
}

export interface SlideRecord {
  id: string;
  rev: string;
  spec: import("@folio/core").SlideSpec | null;
  error: string | null;
}

export interface HookSummary {
  name: string;
  version: number;
  inputs: Record<string, unknown>;
}

export interface Boot {
  view: "landing" | "deck" | "inbox";
  root: string;
  /** The stream cursor taken before the page's slides were read; the stream starts from it. */
  cursor?: string;
  user?: string;
  /** `dir` is the deck's folder relative to the workspace root, e.g. `decks/example`: what an agent passes to every `folio` CLI command for this deck. */
  deck?: { token: string; title: string; template: string; slides: ManifestEntry[]; dir: string };
  pack?: Pack | null;
  hooks?: Record<string, HookSummary>;
  slides?: SlideRecord[];
  editor?: { showDeckList: boolean };
  inbox?: { onlyDeck: string | null };
}

/**
 * Read the bootstrap.
 *
 * @returns `window.__FOLIO__`, or a landing-page default when it is missing
 *   (the page was opened from disk or from the Vite dev server).
 */
export function readBoot(): Boot {
  const boot = (window as unknown as { __FOLIO__?: Boot }).__FOLIO__;
  return boot ?? { view: "landing", root: "/" };
}

export const boot = readBoot();

/**
 * An address under the server root.
 *
 * @param path - a path without a leading slash, e.g. `a1b2c3d4/manifest`.
 * @returns the absolute path including any mount prefix.
 */
export function at(path: string): string {
  return `${boot.root}${path.replace(/^\/+/, "")}`;
}

/**
 * Switch the bootstrap to another page opened in place (no reload): the same
 * object every module reads is refilled, keeping `root`.
 *
 * @param next - the page's bootstrap as the server sends it.
 */
export function setBoot(next: Boot): void {
  const root = boot.root;
  for (const key of Object.keys(boot)) delete (boot as unknown as Record<string, unknown>)[key];
  Object.assign(boot, next, { root });
}
