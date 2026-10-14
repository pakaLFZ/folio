import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_PACKS_DIR, builtinPackNames, DEFAULT_PACK, installBuiltinPack } from "../src/builtin.js";
import { loadPackDir } from "../src/workspace.js";

describe("built-in packs", () => {
  it("ships plain as a valid pack whose every layout carries a usage note, canvas among them with no slots", () => {
    expect(builtinPackNames()).toContain("plain");
    const result = loadPackDir(join(BUILTIN_PACKS_DIR, "plain"));
    if (!result.ok) throw new Error(result.problems.join("; "));
    const { pack } = result.loaded;
    expect(`${pack.name}@${pack.version}`).toBe(DEFAULT_PACK);
    expect([pack.canvas.w, pack.canvas.h]).toEqual([960, 540]);
    expect(Object.entries(pack.layouts).filter(([, l]) => !l.usage?.when || !l.usage.how)).toEqual([]);
    expect(pack.layouts.canvas!.slots).toEqual({});
  });
  it("is copied into a workspace's templates once, and never over a pack folder the workspace has", () => {
    const templates = join(mkdtempSync(join(tmpdir(), "folio-builtin-")), "templates");
    expect(installBuiltinPack(templates, "plain@1")).toBe(join(templates, "plain"));
    expect(loadPackDir(join(templates, "plain")).ok).toBe(true);
    writeFileSync(join(templates, "plain", "pack.json"), "{}");
    expect(installBuiltinPack(templates, "plain@1")).toBeNull();
    expect(readFileSync(join(templates, "plain", "pack.json"), "utf8")).toBe("{}");
    mkdirSync(join(templates, "house"));
    expect(installBuiltinPack(templates, "house@3")).toBeNull();
    expect(installBuiltinPack(templates, "missing@1")).toBeNull();
  });
});
