import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { Router } from "../src/httpkit.js";
import { exportDeckPdf, notReady, pdfRoutes, pdfTarget, writeFreshPdf, type PrintedDeck } from "../src/pdf.js";
import type { DeckStore } from "../src/deckstore.js";
import type { FolioApp } from "../src/app.js";

const bytes = (text: string) => Buffer.from(text);
const fresh = () => mkdtempSync(join(tmpdir(), "folio-pdf-"));

describe("notReady", () => {
  it("names what the print page still waited for, eight at most", () => {
    const pending = Array.from({ length: 10 }, (_, i) => `s0${i}/fig:a image fig/${i}.png`);
    expect(notReady(60_000, pending.slice(0, 1))).toBe("the print page was not ready after 60 s; still waiting for s00/fig:a image fig/0.png");
    expect(notReady(60_000, pending)).toMatch(/s07\/fig:a image fig\/7\.png; and 2 more$/);
  });

  it("says when the page never started or had nothing left to load", () => {
    expect(notReady(5_000, null)).toMatch(/after 5 s: the page never started drawing \(run pnpm build:web/);
    expect(notReady(5_000, [])).toMatch(/nothing is still loading/);
  });
});

describe("writeFreshPdf", () => {
  it("writes <stem>.pdf when it is free", () => {
    const dir = fresh();
    expect(writeFreshPdf(dir, "example", bytes("a"))).toBe(join(dir, "example.pdf"));
  });

  it("numbers past existing files and leaves them untouched", () => {
    const dir = fresh();
    writeFileSync(join(dir, "example.pdf"), "first");
    expect(writeFreshPdf(dir, "example", bytes("b"))).toBe(join(dir, "example-1.pdf"));
    expect(writeFreshPdf(dir, "example", bytes("c"))).toBe(join(dir, "example-2.pdf"));
    expect(readFileSync(join(dir, "example.pdf"), "utf8")).toBe("first");
    expect(readFileSync(join(dir, "example-1.pdf"), "utf8")).toBe("b");
  });

  it("gives concurrent writers distinct files", async () => {
    const dir = fresh();
    const module = new URL("../src/pdf.ts", import.meta.url).href;
    const script = (i: number) => `import(${JSON.stringify(module)}).then((m) => m.writeFreshPdf(${JSON.stringify(dir)}, "deck", Buffer.from("writer ${i}")))`;
    const run = promisify(execFile);
    await Promise.all(Array.from({ length: 6 }, (_, i) => run(process.execPath, ["--import", "tsx", "-e", script(i)])));
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["deck-1.pdf", "deck-2.pdf", "deck-3.pdf", "deck-4.pdf", "deck-5.pdf", "deck.pdf"]);
    const contents = new Set(files.map((f) => readFileSync(join(dir, f), "utf8")));
    expect(contents.size).toBe(6);
  }, 60_000);
});

describe("pdfTarget", () => {
  it("names the PDF after the deck folder, beside it", () => {
    expect(pdfTarget("/w/decks/example")).toEqual({ dir: "/w/decks", stem: "example" });
  });
});

describe("the export route", () => {
  const deckIn = (root: string) => {
    const dir = join(root, "decks", "talk");
    mkdirSync(dir, { recursive: true });
    return { token: "abcd1234", dir } as DeckStore;
  };
  const serve = async (store: DeckStore, exportPdf: Parameters<typeof pdfRoutes>[2]) => {
    const app = { workspace: { decks: new Map([[store.token, store]]) } } as unknown as FolioApp;
    const router = new Router();
    pdfRoutes(router, app, exportPdf);
    const server = createServer((req, res) => void router.handle(req, res, new URL(req.url!, "http://x"), new URL(req.url!, "http://x").pathname));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  };
  const printed: PrintedDeck = { pdf: bytes("%PDF-fake"), measured: { s001: { rev: "r", slots: [] }, s002: { rev: "r", slots: [] } }, warnings: [] };

  it("streams the PDF as a download and writes nothing into the workspace", async () => {
    const root = fresh();
    const store = deckIn(root);
    const { server, base } = await serve(store, (s) => exportDeckPdf(s, async () => ["s002/plot"], async () => printed));
    const url = `${base}/${store.token}/export-pdf`;
    try {
      const res = await fetch(url, { method: "POST" });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="talk.pdf"');
      expect(res.headers.get("x-folio-file")).toBe("talk.pdf");
      expect(res.headers.get("x-folio-slides")).toBe("2");
      expect(res.headers.get("x-folio-warnings")).toBe("0");
      expect(res.headers.get("x-folio-stale")).toBe("s002/plot");
      expect(Buffer.from(await res.arrayBuffer()).toString("utf8")).toBe("%PDF-fake");
      const second = await fetch(url, { method: "POST" });
      expect(second.headers.get("x-folio-file")).toBe("talk.pdf");
      expect(readdirSync(join(root, "decks", "talk"))).toEqual([]);
      expect(readdirSync(join(root, "decks"))).toEqual(["talk"]);
      const missing = await fetch(`${base}/nope/export-pdf`, { method: "POST" });
      expect(missing.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it("answers a failed print as a problem with the reason", async () => {
    const root = fresh();
    const store = deckIn(root);
    const { server, base } = await serve(store, (s) => exportDeckPdf(s, async () => [], async () => Promise.reject(new Error("pack x is not installed"))));
    try {
      const res = await fetch(`${base}/${store.token}/export-pdf`, { method: "POST" });
      expect(res.status).toBe(500);
      expect((await res.json()).detail).toBe("pack x is not installed");
      expect(readdirSync(join(root, "decks"))).toEqual(["talk"]);
    } finally {
      server.close();
    }
  });
});
