import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archiveComment } from "../src/comments/store.js";
import type { DeckStore } from "../src/deckstore.js";

describe("archiveComment", () => {
  it("leaves an already archived comment where it is", () => {
    const dir = mkdtempSync(join(tmpdir(), "folio-archive-"));
    mkdirSync(join(dir, "comments"));
    writeFileSync(join(dir, "comments", "c1.json"), "{}");
    const store = { dir } as unknown as DeckStore;
    const first = archiveComment(store, "c1");
    expect(archiveComment(store, "c1")).toBe(first);
  });
});
