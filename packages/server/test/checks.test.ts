import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeSlideSpec, slideLayout, textSlots } from "@folio/core";
import { FolioApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { fileURLToPath } from "node:url";

const nusIcl = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));

/** A workspace with lectern and a deck whose order lists only one of its two slide files. */
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "folio-order-"));
  cpSync(nusIcl, join(root, "templates/lectern"), { recursive: true });
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  const deck = join(root, "decks/talk");
  mkdirSync(join(deck, "slides"), { recursive: true });
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "c0ffee00c0ffee00", title: "Talk", template: "lectern@1", order: ["s001"] }));
  writeFileSync(join(deck, "slides/s001.json"), JSON.stringify(makeSlideSpec("note-figure", { title: "Listed" })));
  writeFileSync(join(deck, "slides/s002.json"), JSON.stringify(makeSlideSpec("note-figure", { title: "Not listed" })));
  return root;
}

describe("FOLIO-ORD-001", () => {
  it("flags a slide file present but not in deck.json's order, naming how to fix it", async () => {
    const app = new FolioApp(loadConfig(workspace()));
    try {
      const store = app.workspace.findDeck("talk")!;
      expect(store.slideIds()).toEqual(["s001", "s002"]);
      const unlisted = app.warnings.deckWarnings(store).filter((w) => w.code === "FOLIO-ORD-001");
      expect(unlisted).toHaveLength(1);
      expect(unlisted[0]!.location.slide).toBe("s002");
      expect(unlisted[0]!.message).toMatch(/folio slide move <deck> <id> --to N/);
      expect(unlisted[0]!.message).toMatch(/folio slide rm <deck> <id>/);
    } finally {
      await app.close();
    }
  });

  it("does not flag a slide that is listed", async () => {
    const app = new FolioApp(loadConfig(workspace()));
    try {
      const store = app.workspace.findDeck("talk")!;
      const listed = app.warnings.slideWarnings(store, "s001", null).filter((w) => w.code === "FOLIO-ORD-001");
      expect(listed).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});

describe("FOLIO-RND-001", () => {
  it("comes from a measurement that names a render error, stays without a fresh one, and goes with a good one", async () => {
    const app = new FolioApp(loadConfig(workspace()));
    try {
      const store = app.workspace.findDeck("talk")!;
      const rev = store.readSlide("s001")!.rev;
      const render = (measured: Parameters<typeof app.warnings.slideWarnings>[2]) => app.warnings.slideWarnings(store, "s001", measured).filter((w) => w.code === "FOLIO-RND-001" && w.state !== "absent");
      expect(render({ rev, slots: [], renderError: "boom", complete: true }).map((w) => w.message)).toEqual([expect.stringMatching(/^Slide s001 did not render: boom\./)]);
      expect(render(null)).toHaveLength(1);
      const pack = app.workspace.packOf(store)!.pack;
      const slots = textSlots(pack, slideLayout(pack, "note-figure", {})!).map((t) => ({ slot: t.name, lines: 1, overPt: 0 }));
      expect(render({ rev, slots, complete: true })).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
