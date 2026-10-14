import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FolioApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { DeckStore } from "../src/deckstore.js";
import { deckSlug } from "../src/newdeck.js";
import { buildRouter } from "../src/server.js";

/** An empty workspace served by every route on a free port. */
async function serveEmpty() {
  const root = mkdtempSync(join(tmpdir(), "folio-newdeck-"));
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  const app = new FolioApp(loadConfig(root));
  const router = buildRouter(app, { prefix: "" });
  const server = createServer((req, res) => void router.handle(req, res, new URL(req.url!, "http://x"), new URL(req.url!, "http://x").pathname));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown) => fetch(`${base}/api/decks`, { method: "POST", body: JSON.stringify(body) });
  return { root, app, base, post, close: async () => (server.close(), await app.close()) };
}

describe("new deck routes", () => {
  it("names the folder after the title", () => {
    expect(deckSlug("  CO2 in MOFs: Results! ")).toBe("co2-in-mofs-results");
    expect(deckSlug("***")).toBe("");
  });

  it("offers the built-in plain pack, makes a deck under decks/<slug>, installs the pack and mounts it at once", async () => {
    const s = await serveEmpty();
    try {
      const offered = await (await fetch(`${s.base}/api/deck-templates`)).json();
      expect(offered).toEqual({ templates: ["plain@1"], default: "plain@1" });
      const res = await s.post({ title: "Group meeting" });
      const made = await res.json();
      expect(res.status).toBe(201);
      expect(made).toMatchObject({ dir: "decks/group-meeting", title: "Group meeting", template: "plain@1" });
      expect(JSON.parse(readFileSync(join(s.root, "decks/group-meeting/deck.json"), "utf8"))).toMatchObject({ title: "Group meeting", template: "plain@1", order: [] });
      expect(existsSync(join(s.root, "templates/plain/pack.json"))).toBe(true);
      const store = s.app.workspace.decks.get(made.token);
      expect(store && s.app.workspace.packOf(store)?.pack.name).toBe("plain");
    } finally {
      await s.close();
    }
  });

  it("refuses a title whose folder exists, naming it, and leaves that deck alone", async () => {
    const s = await serveEmpty();
    try {
      const first = await (await s.post({ title: "Talk" })).json();
      const again = await s.post({ title: "talk!" });
      const problem = await again.json();
      expect(again.status).toBe(409);
      expect(problem.detail).toMatch(/decks\/talk already exists/);
      expect(JSON.parse(readFileSync(join(s.root, "decks/talk/deck.json"), "utf8")).title).toBe("Talk");
      expect([...s.app.workspace.decks.keys()]).toEqual([first.token]);
    } finally {
      await s.close();
    }
  });

  it("refuses an empty title and a pack that is neither installed nor built in", async () => {
    const s = await serveEmpty();
    try {
      expect((await s.post({ title: "  " })).status).toBe(400);
      const res = await s.post({ title: "Odd", template: "missing@1" });
      expect(res.status).toBe(422);
      expect((await res.json()).detail).toMatch(/pack missing@1 is not installed.*built in: plain/);
      expect(existsSync(join(s.root, "decks/odd"))).toBe(false);
    } finally {
      await s.close();
    }
  });
});

describe("DeckStore.editedAt", () => {
  it("is the newest mtime of deck.json and the slide files, ignoring other files", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "folio-edited-")), "talk");
    const store = DeckStore.create(dir, "Talk", "plain@1");
    const at = (iso: string) => new Date(iso);
    utimesSync(join(dir, "deck.json"), at("2026-01-01T00:00:00Z"), at("2026-01-01T00:00:00Z"));
    expect(store.editedAt()).toBe("2026-01-01T00:00:00.000Z");
    mkdirSync(join(dir, "slides"));
    writeFileSync(join(dir, "slides/s001.json"), "{}");
    utimesSync(join(dir, "slides/s001.json"), at("2026-03-02T10:00:00Z"), at("2026-03-02T10:00:00Z"));
    writeFileSync(join(dir, "slides/notes.txt"), "x");
    utimesSync(join(dir, "slides/notes.txt"), at("2026-09-09T00:00:00Z"), at("2026-09-09T00:00:00Z"));
    expect(store.editedAt()).toBe("2026-03-02T10:00:00.000Z");
  });
});

describe("archiving a deck", () => {
  it("writes archived and archivedAt into deck.json and takes both out again, keeping the rest", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "folio-archive-")), "talk");
    const store = DeckStore.create(dir, "Talk", "plain@1");
    const before = readFileSync(join(dir, "deck.json"), "utf8");
    const archived = await store.setArchived(true, "test");
    expect(archived).toMatchObject({ title: "Talk", archived: true, archivedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });
    expect(new DeckStore(dir).deck.archived).toBe(true);
    await store.setArchived(false, "test");
    expect(readFileSync(join(dir, "deck.json"), "utf8")).toBe(before);
  });

  it("drops an archived deck from /api/decks, lists it with ?archived=1, and brings it back on unarchive, without a restart", async () => {
    const s = await serveEmpty();
    try {
      await s.post({ title: "Keep" });
      const b = await (await s.post({ title: "Old talk" })).json();
      const list = async (q = "") => (await (await fetch(`${s.base}/api/decks${q}`)).json()).decks.map((d: { title: string; archived: boolean }) => `${d.title}:${d.archived}`).sort();
      const archive = await fetch(`${s.base}/api/decks/${b.token}/archive`, { method: "POST" });
      expect([archive.status, (await archive.json()).archived]).toEqual([200, true]);
      expect(await list()).toEqual(["Keep:false"]);
      expect(await list("?archived=1")).toEqual(["Keep:false", "Old talk:true"]);
      expect(existsSync(join(s.root, "decks/old-talk/deck.json"))).toBe(true);
      await fetch(`${s.base}/api/decks/${b.token}/unarchive`, { method: "POST" });
      expect(await list()).toEqual(["Keep:false", "Old talk:false"]);
      expect((await fetch(`${s.base}/api/decks/ffffffff/archive`, { method: "POST" })).status).toBe(404);
      await new DeckStore(join(s.root, "decks/keep")).setArchived(true, "cli");
      expect(await list()).toEqual(["Old talk:false"]);
    } finally {
      await s.close();
    }
  });
});
