/**
 * The folder `folio shot` writes into and its manifest. The default
 * `<deck>/.shots/` ignores itself in git, loses its old sheets on every run and
 * the pictures of slides no longer in the deck. `manifest.json` records, per
 * slide, what its picture was made from (revision and figures), and the
 * settings it was made with, so `--changed` can skip what has not changed.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deckHookState, readJson, type DeckStore } from "@folio/server";

export interface ShotManifest {
  settings: string;
  slides: Record<string, string>;
}

const MANIFEST = "manifest.json";

/**
 * Make the folder ready.
 *
 * @param out - the `--out` value; nothing is removed from a folder given there.
 * @returns the folder.
 */
export function shotsFolder(store: DeckStore, out: string | undefined): string {
  const dir = out ? resolve(out) : join(store.dir, ".shots");
  mkdirSync(dir, { recursive: true });
  if (out) return dir;
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
  const ids = new Set(store.slideIds());
  const stale = (f: string) => /^sheet(-\d+)?\.png$/.test(f) || (f.endsWith(".png") && !ids.has(f.slice(0, -4)));
  for (const f of readdirSync(dir).filter(stale)) rmSync(join(dir, f));
  return dir;
}

/**
 * What each slide's picture is made from: its revision and the last good
 * figure of each of its hooked slots.
 *
 * @returns a key per slide id.
 */
export function slideKeys(store: DeckStore, ids: string[]): Record<string, string> {
  const hooks = deckHookState(store);
  const figures = (id: string) => Object.entries(hooks[id] ?? {}).map(([slot, s]) => `${slot}=${s.goodKey}`).sort().join(",");
  return Object.fromEntries(ids.map((id) => [id, `${store.readSlide(id)?.rev ?? "missing"}|${figures(id)}`]));
}

/** The manifest of a folder, or an empty one. */
export function readManifest(dir: string): ShotManifest {
  return readJson<ShotManifest>(join(dir, MANIFEST), { settings: "", slides: {} });
}

/**
 * The slides whose picture is missing or was made from something else, or
 * with other settings.
 *
 * @returns the ids, in the order given.
 */
export function changedSlides(dir: string, manifest: ShotManifest, settings: string, keys: Record<string, string>): string[] {
  const same = (id: string) => manifest.settings === settings && manifest.slides[id] === keys[id] && existsSync(join(dir, `${id}.png`));
  return Object.keys(keys).filter((id) => !same(id));
}

/**
 * Record the slides just shot. Other slides' entries are kept when the
 * settings are the same, dropped when they differ or the slide is gone.
 *
 * @param shot - keys of the slides just shot.
 * @param deckIds - the deck's slides.
 */
export function writeManifest(dir: string, manifest: ShotManifest, settings: string, shot: Record<string, string>, deckIds: string[]): void {
  const kept = manifest.settings === settings ? manifest.slides : {};
  const slides = Object.fromEntries(deckIds.filter((id) => shot[id] ?? kept[id]).map((id) => [id, shot[id] ?? kept[id]!]));
  writeFileSync(join(dir, MANIFEST), `${JSON.stringify({ settings, slides }, null, 1)}\n`);
}
