import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { DeckStore } from "../src/deckstore.js";
import { toPosix } from "../src/posixpath.js";
import { Workspace } from "../src/workspace.js";

describe("finding a deck", () => {
  it("takes a token, a folder name, a relative path or the absolute folder in either separator form", () => {
    const root = mkdtempSync(join(tmpdir(), "folio-finddeck-"));
    writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
    DeckStore.create(join(root, "decks/talk"), "Talk", "plain@1");
    DeckStore.create(join(root, "decks/stalk"), "Stalk", "plain@1");
    const workspace = new Workspace(loadConfig(root));
    const talk = [...workspace.decks.values()].find((d) => d.deck.title === "Talk")!;
    const native = join(root, "decks", "talk");
    for (const key of [talk.token, "talk", "talk/", "decks/talk", "decks/talk/", native, native + sep, toPosix(native)]) {
      expect(workspace.findDeck(key)?.token, key).toBe(talk.token);
    }
    expect(workspace.findDeck("alk")).toBeUndefined();
    expect(workspace.findDeck("decks/other")).toBeUndefined();
  });
});
