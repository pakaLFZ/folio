import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureChromium, loadPlaywright, type PlaywrightModule } from "../src/playwright.js";

const fakePw = { chromium: { executablePath: () => "/fake/chromium" } } as unknown as PlaywrightModule;

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

describe("ensureChromium", () => {
  const log: string[] = [];
  const opts = (overrides: Partial<Parameters<typeof ensureChromium>[1]> = {}) => ({
    log: (line: string) => log.push(line),
    env: {},
    ...overrides,
  });

  afterEach(() => {
    log.length = 0;
  });

  it("does nothing, and never installs, when Chromium is already present", async () => {
    const install = () => {
      throw new Error("must not be called");
    };
    await ensureChromium(fakePw, opts({ exists: () => true, install }));
    expect(log).toHaveLength(0);
  });

  it("runs the installer, then checks again, when Chromium is missing", async () => {
    let present = false;
    const install = () => {
      present = true;
      return true;
    };
    await ensureChromium(fakePw, opts({ exists: () => present, install }));
    expect(present).toBe(true);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/downloading Chromium/);
  });

  it("throws a clear error when the installer fails", async () => {
    await expect(ensureChromium(fakePw, opts({ exists: () => false, install: () => false }))).rejects.toThrow(/did not install/);
  });

  it("throws a clear error when the installer exits 0 but Chromium is still missing", async () => {
    await expect(ensureChromium(fakePw, opts({ exists: () => false, install: () => true }))).rejects.toThrow(/did not install/);
  });

  it("refuses without installing when FOLIO_NO_BROWSER_DOWNLOAD is set", async () => {
    const install = () => {
      throw new Error("must not be called");
    };
    await expect(ensureChromium(fakePw, opts({ exists: () => false, install, env: { FOLIO_NO_BROWSER_DOWNLOAD: "1" } }))).rejects.toThrow(/FOLIO_NO_BROWSER_DOWNLOAD/);
    expect(log).toHaveLength(0);
  });

  it("names the pip channel's manual command when FOLIO_PLAYWRIGHT is set", async () => {
    await expect(ensureChromium(fakePw, opts({ exists: () => false, env: { FOLIO_PLAYWRIGHT: "/opt/playwright", FOLIO_NO_BROWSER_DOWNLOAD: "1" } }))).rejects.toThrow(/python -m playwright install chromium/);
  });

  it("names the npm channel's manual command otherwise", async () => {
    await expect(ensureChromium(fakePw, opts({ exists: () => false, env: { FOLIO_NO_BROWSER_DOWNLOAD: "1" } }))).rejects.toThrow(/npx playwright install chromium/);
  });
});
