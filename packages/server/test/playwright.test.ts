import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlaywright } from "../src/playwright.js";

describe("loadPlaywright", () => {
  afterEach(() => {
    delete process.env.FOLIO_PLAYWRIGHT;
  });

  it("imports the real package when FOLIO_PLAYWRIGHT is unset", async () => {
    delete process.env.FOLIO_PLAYWRIGHT;
    const { chromium } = await loadPlaywright();
    expect(typeof chromium.launch).toBe("function");
  });

  it("imports from a playwright-core child directory named by its package.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "folio-playwright-"));
    const pkgDir = join(dir, "playwright-core");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "playwright-core", main: "stub.mjs" }));
    writeFileSync(join(pkgDir, "stub.mjs"), 'export const chromium = { launch: () => "stubbed" };\n');
    process.env.FOLIO_PLAYWRIGHT = dir;
    const { chromium } = await loadPlaywright();
    expect(chromium.launch()).toBe("stubbed");
  });

  it("imports FOLIO_PLAYWRIGHT itself when it is the package directory, via exports[\".\"].import", async () => {
    const pkgDir = mkdtempSync(join(tmpdir(), "folio-playwright-driver-"));
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "playwright-core", exports: { ".": { import: "./index.mjs" } } }));
    writeFileSync(join(pkgDir, "index.mjs"), 'export const chromium = { launch: () => "driver-stub" };\n');
    process.env.FOLIO_PLAYWRIGHT = pkgDir;
    const { chromium } = await loadPlaywright();
    expect(chromium.launch()).toBe("driver-stub");
  });

  it("refuses a FOLIO_PLAYWRIGHT directory with neither package", async () => {
    const dir = mkdtempSync(join(tmpdir(), "folio-playwright-empty-"));
    process.env.FOLIO_PLAYWRIGHT = dir;
    await expect(loadPlaywright()).rejects.toThrow(/has no playwright/);
  });
});
