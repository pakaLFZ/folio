import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { installSkill, lineDiff, quickstartCommand, SHIPPED_SKILL, skillDir, skillFiles, skillHint } from "../src/skillcmd.js";

const temp = () => mkdtempSync(join(tmpdir(), "folio-skill-"));

describe("folio skill", () => {
  it("ships a skill named folio that arms the watch", () => {
    const text = readFileSync(join(SHIPPED_SKILL, "SKILL.md"), "utf8");
    expect(text).toMatch(/^---\nname: folio\ndescription: /);
    expect(text).toContain("folio watch --deck");
    expect(text.split("\n").length).toBeLessThan(130);
  });
  it("opens with Starting a deck: quickstart and the four things agents get wrong", () => {
    const text = readFileSync(join(SHIPPED_SKILL, "SKILL.md"), "utf8");
    const start = text.slice(text.indexOf("## Starting a deck"), text.indexOf("## 1. First"));
    expect(text.indexOf("## Starting a deck")).toBeLessThan(text.indexOf("## 1. First"));
    for (const point of ["folio quickstart", "folio.toml", "fig/", "[runtimes] python", "FOLIO-HOOK-006", "--props"]) expect(start).toContain(point);
  });
  it("quickstart prints each command of the walk-through in order", async () => {
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
    expect(await quickstartCommand()).toBe(0);
    spy.mockRestore();
    const text = out.join("");
    expect(text.split("\n").length).toBeLessThan(80);
    const steps = ["[runtimes]", "folio init-deck decks/talk --template lectern@1", "folio watch --deck decks/talk", "folio layouts decks/talk",
      "folio new decks/talk --template title --worker me --props -", "decks/talk/fig/", "--template note-figure", "folio box decks/talk",
      "--template plot-table", '"columns"', "folio shot decks/talk --sheet", "folio check decks/talk", "folio pptx decks/talk --out"];
    const at = steps.map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
  it("installs into the workspace or the home, then reports it unchanged", () => {
    const ws = temp();
    const home = temp();
    expect(skillHint(ws, home)).toMatch(/folio skill install/);
    expect(installSkill(skillDir("project", ws, home), false).status).toBe("installed");
    expect(readFileSync(join(ws, ".claude/skills/folio/SKILL.md"), "utf8")).toBe(readFileSync(join(SHIPPED_SKILL, "SKILL.md"), "utf8"));
    expect(readFileSync(join(ws, ".claude/skills/folio/references/quickstart.md"), "utf8")).toBe(readFileSync(join(SHIPPED_SKILL, "references/quickstart.md"), "utf8"));
    expect(installSkill(skillDir("project", ws, home), false).status).toBe("unchanged");
    expect(skillHint(ws, home)).toBeNull();
    expect(installSkill(skillDir("user", ws, home), false).dir).toBe(join(home, ".claude/skills/folio"));
    expect(skillHint(temp(), home)).toBeNull();
  });
  it("refuses a changed copy naming the diff, and replaces it with force", () => {
    const dir = skillDir("project", temp(), temp());
    installSkill(dir, false);
    const file = join(dir, "SKILL.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("## 1. First: arm the watch", "## 1. My own heading"));
    const refused = installSkill(dir, false);
    expect(refused.status).toBe("refused");
    expect(refused.diff).toContain("SKILL.md:");
    expect(refused.diff.some((l) => l.startsWith("- ") && l.includes("My own heading"))).toBe(true);
    expect(refused.diff.some((l) => l.startsWith("+ ") && l.includes("arm the watch"))).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("My own heading");
    expect(installSkill(dir, true).status).toBe("replaced");
    expect(readFileSync(file, "utf8")).not.toContain("My own heading");
  });
  it("links only reference files it ships", () => {
    const text = readFileSync(join(SHIPPED_SKILL, "SKILL.md"), "utf8");
    const linked = [...text.matchAll(/\]\((references\/[^)]+)\)/g)].map((m) => m[1]!);
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((f) => !skillFiles(SHIPPED_SKILL).includes(f))).toEqual([]);
  });
  it("diffs by line", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([]);
    expect(lineDiff("a\nx", "a\nb")).toEqual(["- 2: x", "+ 2: b"]);
  });
});
