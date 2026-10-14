import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeckStore } from "../src/deckstore.js";
import { atomicWrite } from "../src/fsutil.js";
import { readUndo, recordUndo, stepUndo } from "../src/undo.js";
import { finishRecording, newRecording, runRecording } from "../src/write-recording.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function deck() {
  const root = mkdtempSync(join(tmpdir(), "folio-undo-"));
  roots.push(root);
  return DeckStore.create(root, "Undo", "plain@1");
}

function write(store: DeckStore, fn: () => void, op = "patch") {
  const recording = newRecording([store.dir]);
  runRecording(recording, fn);
  finishRecording(recording);
  recordUndo(store, recording, [op]);
  return recording;
}

describe("per-deck undo", () => {
  it("restores every touched file, archives a created slide, and redoes it", async () => {
    const store = deck();
    const first = join(store.dir, "deck.json");
    const second = join(store.dir, "slides", "s001.json");
    const original = readFileSync(first);
    write(store, () => {
      atomicWrite(first, JSON.stringify({ ...JSON.parse(original.toString()), order: ["s001"] }));
      atomicWrite(second, "new slide\n");
    }, "archive and order");
    expect((await stepUndo(store, "undo")).ok).toBe(true);
    expect(readFileSync(first)).toEqual(original);
    expect(existsSync(second)).toBe(false);
    const archived = join(store.slidesDir, ".archive", new Date().toISOString().slice(0, 10), "s001.json");
    expect(readFileSync(archived, "utf8")).toBe("new slide\n");
    expect((await stepUndo(store, "redo")).ok).toBe(true);
    expect(readFileSync(second, "utf8")).toBe("new slide\n");
  });

  it("does not attribute a worker write outside the user's context", () => {
    const store = deck();
    const user = join(store.dir, "slides", "user.txt");
    const agent = join(store.dir, "slides", "agent.txt");
    const recording = newRecording([store.dir]);
    runRecording(recording, () => atomicWrite(user, "user"));
    atomicWrite(agent, "agent");
    finishRecording(recording);
    recordUndo(store, recording, ["user"]);
    expect(readUndo(store).undo[0]?.files.map((f) => f.path)).toEqual(["slides/user.txt"]);
  });

  it("drops a touched path when another writer changes it before the request ends", () => {
    const store = deck();
    const path = join(store.dir, "slides", "shared.txt");
    const recording = newRecording([store.dir]);
    runRecording(recording, () => atomicWrite(path, "user"));
    atomicWrite(path, "agent");
    finishRecording(recording);
    recordUndo(store, recording, ["user"]);
    expect(readUndo(store).undo).toHaveLength(0);
    expect(readFileSync(path, "utf8")).toBe("agent");
  });

  it("reads only touched paths with large and inaccessible unrelated files", () => {
    const store = deck();
    mkdirSync(store.slidesDir, { recursive: true });
    writeFileSync(join(store.slidesDir, "large.png"), Buffer.alloc(8 * 1024 * 1024));
    if (process.platform !== "win32") symlinkSync(join(store.dir, "missing.png"), join(store.slidesDir, "broken.png"));
    const recording = write(store, () => atomicWrite(join(store.slidesDir, "small.txt"), "small"));
    expect([...recording.before.keys()]).toEqual([join(store.slidesDir, "small.txt")]);
    expect(readUndo(store).undo[0]?.files.map((f) => f.path)).toEqual(["slides/small.txt"]);
  });

  it("refuses the whole entry when another writer changed one file", async () => {
    const store = deck();
    const one = join(store.dir, "slides", "a.txt");
    const two = join(store.dir, "slides", "b.txt");
    write(store, () => { atomicWrite(one, "user"); atomicWrite(two, "user"); });
    atomicWrite(two, "agent");
    expect((await stepUndo(store, "undo")).ok).toBe(false);
    expect(readFileSync(one, "utf8")).toBe("user");
    expect(readFileSync(two, "utf8")).toBe("agent");
    expect(readUndo(store).undo).toHaveLength(1);
  });

  it("clears redo after a new write and keeps only 200 undo entries", async () => {
    const store = deck();
    const path = join(store.dir, "slides", "count.txt");
    for (let i = 0; i < 201; i++) write(store, () => atomicWrite(path, String(i)), String(i));
    expect(readUndo(store).undo).toHaveLength(200);
    expect((await stepUndo(store, "undo")).ok).toBe(true);
    write(store, () => atomicWrite(path, "new"), "new");
    expect(readUndo(store).redo).toHaveLength(0);
  });
});
