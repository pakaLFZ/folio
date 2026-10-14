import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { staleWebBuild } from "../src/webbuild.js";

/** A build folder and a source folder whose files have the given ages in seconds. */
function tree(buildAge: number | null, sourceAge: number | null) {
  const root = mkdtempSync(join(tmpdir(), "folio-webbuild-"));
  const dist = join(root, "dist");
  const src = join(root, "src");
  const now = Date.now() / 1000;
  if (buildAge !== null) {
    mkdirSync(dist);
    writeFileSync(join(dist, "index.html"), "");
    utimesSync(join(dist, "index.html"), now - buildAge, now - buildAge);
  }
  if (sourceAge !== null) {
    mkdirSync(join(src, "slide"), { recursive: true });
    writeFileSync(join(src, "slide/View.tsx"), "");
    utimesSync(join(src, "slide/View.tsx"), now - sourceAge, now - sourceAge);
  }
  return { dist, sources: [src] };
}

describe("stale web build", () => {
  it("names pnpm build:web when a source is newer than the build", () => {
    const { dist, sources } = tree(100, 10);
    expect(staleWebBuild(dist, sources)).toMatch(/older than its sources .*View\.tsx.*run pnpm build:web$/);
  });
  it("is silent for a current build, and when no sources are present (an installed package)", () => {
    const current = tree(10, 100);
    expect(staleWebBuild(current.dist, current.sources)).toBeNull();
    const installed = tree(100, null);
    expect(staleWebBuild(installed.dist, installed.sources)).toBeNull();
  });
  it("names a missing build", () => {
    const { dist, sources } = tree(null, 10);
    expect(staleWebBuild(dist, sources)).toMatch(/not built .*run pnpm build:web$/);
  });
});
