import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relative } from "../src/posixpath.js";
import { watchDeck } from "../src/watcher.js";

/** Poll until a condition holds, or fail after four seconds. */
async function until(what: string, ok: () => boolean): Promise<void> {
  const end = Date.now() + 4000;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("a deck folder's watcher", () => {
  it("routes slide files, deck.json and other files, and ignores .folio and archived slides, on every OS", async () => {
    const dir = mkdtempSync(join(tmpdir(), "folio-watcher-"));
    for (const sub of ["slides/.archive", ".folio", "figures"]) mkdirSync(join(dir, sub), { recursive: true });
    const slides: string[] = [];
    const others: string[] = [];
    let decks = 0;
    const watcher = watchDeck(dir, { slideChanged: (id) => slides.push(id), deckChanged: () => decks++, otherChanged: (p) => others.push(relative(dir, p)) });
    await new Promise<void>((r) => watcher.once("ready", () => r()));
    try {
      writeFileSync(join(dir, ".folio/state.json"), "{}");
      writeFileSync(join(dir, "slides/.archive/s009.json"), "{}");
      writeFileSync(join(dir, "slides/s001.json"), "{}");
      writeFileSync(join(dir, "deck.json"), "{}");
      writeFileSync(join(dir, "figures/a.png"), "x");
      await until("all three events", () => slides.length > 0 && decks > 0 && others.length > 0);
      await new Promise((r) => setTimeout(r, 200));
      expect(slides).toEqual(["s001"]);
      expect(others).toEqual(["figures/a.png"]);
    } finally {
      await watcher.close();
    }
  });
});
