import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeSlideSpec } from "@folio/core";
import { deckExportRoutes, FolioApp, loadConfig, Router } from "@folio/server";
import { importDeckCommand } from "../src/deckimport.js";
import { fileURLToPath } from "node:url";

const lecternDir = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));
const scratch = (name: string) => mkdtempSync(join(tmpdir(), `folio-${name}-`));

function workspace(): string {
  const root = scratch("download");
  cpSync(lecternDir, join(root, "templates/lectern"), { recursive: true });
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  const deck = join(root, "decks/talk");
  mkdirSync(join(deck, "slides"), { recursive: true });
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "c0ffee00c0ffee00", title: "Talk", template: "lectern@1", order: ["s001", "s002"] }));
  writeFileSync(join(deck, "slides/s001.json"), JSON.stringify(makeSlideSpec("note-figure", { title: "First" })));
  writeFileSync(join(deck, "slides/s002.json"), JSON.stringify(makeSlideSpec("note-figure", { title: "Second" })));
  return root;
}

const listing = (dir: string) => readdirSync(dir, { recursive: true }).map(String).sort();

describe("POST /<deck>/export-folio", () => {
  it("streams the folio deck archive, writes nothing into the workspace, and folio deck import accepts it", async () => {
    const root = workspace();
    const app = new FolioApp(loadConfig(root));
    const router = new Router();
    deckExportRoutes(router, app);
    const server = createServer((req, res) => void router.handle(req, res, new URL(req.url!, "http://x"), new URL(req.url!, "http://x").pathname));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const store = app.workspace.findDeck("talk")!;
      app.warnings.deckWarnings(store);
      const before = listing(root);
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/${store.token}/export-folio`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="talk.folio.zip"');
      expect(res.headers.get("x-folio-file")).toBe("talk.folio.zip");
      expect(res.headers.get("x-folio-slides")).toBe("2");
      expect(listing(root)).toEqual(before);

      const zip = join(scratch("download-file"), "talk.folio.zip");
      writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
      const into = scratch("download-into");
      expect(await importDeckCommand([zip, "--into", into])).toBe(0);
      expect(existsSync(join(into, "templates/lectern/pack.json"))).toBe(true);
      const imported = new FolioApp(loadConfig(into));
      try {
        const deck = imported.workspace.findDeck("talk")!;
        expect(deck.deck).toMatchObject({ id: "c0ffee00c0ffee00", title: "Talk", template: "lectern@1" });
        expect(deck.slideIds()).toEqual(["s001", "s002"]);
        expect(imported.workspace.packOf(deck)).toBeTruthy();
      } finally {
        await imported.close();
      }
    } finally {
      server.close();
      await app.close();
    }
  }, 30_000); // zips the pack's fonts and unzips them again: about 3.5 s alone, past the 5 s default under a full parallel run
});
