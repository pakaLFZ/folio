import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite } from "../src/fsutil.js";
import { toPosix } from "../src/posixpath.js";
import { contentVersion, fileVersion, looksWhole, settler, type Settled } from "../src/settle.js";
import { watchDeck } from "../src/watcher.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PNG_END = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const png = (body: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, body, ...PNG_END]);
const TIMING = { retryMs: 5, goneMs: 60, giveUpMs: 400, confirmMs: 20 };

function folder() {
  const dir = mkdtempSync(join(tmpdir(), "folio-settle-"));
  const seen: Settled[] = [];
  return { dir, seen, touch: settler((c) => seen.push(c), TIMING) };
}

describe("looksWhole", () => {
  it("wants a PNG's IEND, a JPEG's end marker and JSON that parses", () => {
    expect(looksWhole("a.png", png(1))).toBe(true);
    expect(looksWhole("a.png", png(1).subarray(0, 8))).toBe(false);
    expect(looksWhole("a.JPG", Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd9]))).toBe(true);
    expect(looksWhole("a.jpeg", Buffer.from([0xff, 0xd8, 0x00]))).toBe(false);
    expect(looksWhole("s001.json", Buffer.from('{"root": "s"}'))).toBe(true);
    expect(looksWhole("s001.json", Buffer.from('{"root": '))).toBe(false);
    expect(looksWhole("notes.md", Buffer.from(""))).toBe(true);
  });
});

describe("settler", () => {
  it("publishes a replace reported as unlink then add as one change, never as gone", async () => {
    const { dir, seen, touch } = folder();
    const file = join(dir, "fig.png");
    writeFileSync(file, png(1));
    rmSync(file);
    touch(file);
    await sleep(20);
    writeFileSync(file, png(2));
    touch(file);
    await sleep(150);
    expect(seen).toEqual([{ path: toPosix(file), version: contentVersion(png(2)) }]);
  });

  it("publishes a file that stays missing as gone, once", async () => {
    const { dir, seen, touch } = folder();
    const file = join(dir, "s001.json");
    touch(file);
    touch(file);
    await sleep(150);
    expect(seen).toEqual([{ path: toPosix(file), version: null }]);
  });

  it("waits for a half-written file and publishes only the whole one", async () => {
    const { dir, seen, touch } = folder();
    const file = join(dir, "fig.png");
    writeFileSync(file, png(3).subarray(0, 6));
    touch(file);
    await sleep(30);
    expect(seen).toEqual([]);
    writeFileSync(file, png(3));
    touch(file);
    await sleep(60);
    expect(seen).toEqual([{ path: toPosix(file), version: contentVersion(png(3)) }]);
  });

  it("sees a second quick write whose own event the watcher dropped", async () => {
    const { dir, seen, touch } = folder();
    const file = join(dir, "draw.py");
    writeFileSync(file, "");
    touch(file);
    await sleep(5);
    writeFileSync(file, "print(1)\n");
    await sleep(60);
    expect(seen.at(-1)).toEqual({ path: toPosix(file), version: contentVersion(Buffer.from("print(1)\n")) });
  });

  it("does not publish the same version twice in a row", async () => {
    const { dir, seen, touch } = folder();
    const file = join(dir, "a.table.json");
    writeFileSync(file, "[]");
    touch(file);
    await sleep(30);
    touch(file);
    await sleep(30);
    writeFileSync(file, "[1]");
    touch(file);
    await sleep(30);
    expect(seen.map((s) => s.version)).toEqual([contentVersion(Buffer.from("[]")), contentVersion(Buffer.from("[1]"))]);
    expect(fileVersion(file)).toBe(contentVersion(Buffer.from("[1]")));
  });
});

describe("watchDeck", () => {
  it("sees an atomic slide write as a slide change and a figure overwritten in place with its new version", async () => {
    const dir = mkdtempSync(join(tmpdir(), "folio-watchdeck-"));
    mkdirSync(join(dir, "slides"));
    mkdirSync(join(dir, "fig"));
    writeFileSync(join(dir, "fig/plot.png"), png(1));
    const slides: string[] = [];
    const files: Settled[] = [];
    const watcher = watchDeck(dir, { slideChanged: (id) => slides.push(id), deckChanged: () => {}, otherChanged: (path, version) => files.push({ path, version }) });
    await new Promise<void>((r) => watcher.once("ready", () => r()));
    atomicWrite(join(dir, "slides/s001.json"), '{"root": "s", "elements": {}}\n');
    writeFileSync(join(dir, "fig/plot.png"), png(2));
    for (let i = 0; i < 100 && (slides.length === 0 || files.length === 0); i += 1) await sleep(20);
    await watcher.close();
    expect(slides).toEqual(["s001"]);
    expect(files).toEqual([{ path: `${toPosix(dir)}/fig/plot.png`, version: contentVersion(png(2)) }]);
  });
});
