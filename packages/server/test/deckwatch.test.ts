import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FolioApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { DeckStore } from "../src/deckstore.js";
import { watchDeckFolders } from "../src/deckwatch.js";
import { buildRouter } from "../src/server.js";

interface Seen {
  deck: string;
  type: string;
  data: { token: string; title?: string; archived?: boolean; editedAt?: string };
}

/** A workspace with one deck, its server on a free port, the deck watcher running and a reader of the workspace stream. */
async function liveWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "folio-deckwatch-"));
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  DeckStore.create(join(root, "decks/first"), "First", "plain@1");
  const app = new FolioApp(loadConfig(root));
  const watcher = watchDeckFolders(app.workspace, app.hub);
  await new Promise<void>((r) => watcher.once("ready", () => r()));
  const router = buildRouter(app, { prefix: "" });
  const server = createServer((req, res) => void router.handle(req, res, new URL(req.url!, "http://x"), new URL(req.url!, "http://x").pathname));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const abort = new AbortController();
  const seen: Seen[] = [];
  const body = (await fetch(`${base}/events?decks=workspace`, { signal: abort.signal })).body!.getReader();
  void (async () => {
    let text = "";
    for (;;) {
      const chunk = await body.read().catch(() => ({ done: true, value: undefined }));
      if (chunk.done) return;
      text += new TextDecoder().decode(chunk.value);
      const blocks = text.split("\n\n");
      text = blocks.pop()!;
      for (const b of blocks) {
        const data = b.split("\n").find((l) => l.startsWith("data: "));
        if (data && !b.includes("event: hello")) seen.push(JSON.parse(data.slice(6)));
      }
    }
  })();
  const next = async (type: string, match: (s: Seen) => boolean = () => true): Promise<Seen> => {
    const end = Date.now() + 5000;
    for (;;) {
      const hit = seen.find((s) => s.type === type && match(s));
      if (hit) return (seen.splice(seen.indexOf(hit), 1), hit);
      if (Date.now() > end) throw new Error(`no ${type} event; seen ${JSON.stringify(seen)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const titles = async () => (await (await fetch(`${base}/api/decks`)).json()).decks.map((d: { title: string }) => d.title).sort();
  const close = async () => (abort.abort(), server.close(), await watcher.close(), await app.close());
  return { root, app, next, titles, close };
}

describe("the workspace channel", () => {
  it("mounts a deck folder written by another process and announces it, its archive, its edits and its removal", async () => {
    const w = await liveWorkspace();
    try {
      const store = DeckStore.create(join(w.root, "decks/talk"), "Talk", "plain@1");
      const added = await w.next("deck.added");
      expect(added).toMatchObject({ deck: "workspace", data: { token: store.token, title: "Talk", archived: false } });
      expect(await w.titles()).toEqual(["First", "Talk"]);

      await new DeckStore(join(w.root, "decks/talk")).setArchived(true, "cli");
      expect((await w.next("deck.changed", (s) => s.data.archived === true)).data.token).toBe(store.token);
      expect(await w.titles()).toEqual(["First"]);

      mkdirSync(join(w.root, "decks/first/slides"), { recursive: true });
      writeFileSync(join(w.root, "decks/first/slides/s001.json"), "{}");
      const edited = await w.next("deck.changed", (s) => s.data.title === "First");
      expect(Date.parse(edited.data.editedAt!)).toBeGreaterThan(Date.now() - 10_000);

      mkdirSync(join(w.root, "decks/talk/slides"), { recursive: true });
      writeFileSync(join(w.root, "decks/talk/slides/s001.json"), "{}");
      await w.next("deck.changed", (s) => s.data.token === store.token);
      renameSync(join(w.root, "decks/talk"), join(w.root, "moved-away"));
      expect((await w.next("deck.removed")).data.token).toBe(store.token);
      expect(w.app.workspace.decks.has(store.token)).toBe(false);
    } finally {
      await w.close();
    }
  });

  it("ignores hidden folders and files that are not a deck's row", async () => {
    const w = await liveWorkspace();
    try {
      DeckStore.create(join(w.root, "decks/.archive/old"), "Hidden", "plain@1");
      writeFileSync(join(w.root, "decks/first/notes.txt"), "x");
      DeckStore.create(join(w.root, "decks/shown"), "Shown", "plain@1");
      expect((await w.next("deck.added")).data.title).toBe("Shown");
      await new Promise((r) => setTimeout(r, 300));
      expect(await w.titles()).toEqual(["First", "Shown"]);
    } finally {
      await w.close();
    }
  });
});
