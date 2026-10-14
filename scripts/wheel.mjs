/**
 * Build the pip wheel `folio-deck`: the minimal release's payload staged into
 * `python/folio_deck/_dist` (so the bundle's `import.meta.url`-relative paths
 * resolve exactly as in `release/folio-<version>/`), then `python -m build`
 * run in a scratch venv — never into a developer's own Python environment.
 *
 * Usage: node scripts/wheel.mjs [--build-web] [--no-release]
 *   --build-web   also run `pnpm build:web` as part of the release build
 *                 (omit it when the caller already built the web app)
 *   --no-release  skip the release build and reuse an existing
 *                 `release/folio-<version>/`
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(repo, "packages/cli/package.json"), "utf8")).version;
const pyDir = join(repo, "python");
const distDir = join(pyDir, "folio_deck", "_dist");
const releaseDir = join(repo, "release", `folio-${version}`);
const wheelOut = join(repo, "dist-pip");

if (!process.argv.includes("--no-release")) {
  const releaseArgs = process.argv.includes("--build-web") ? ["--build-web"] : [];
  execFileSync("node", [join(repo, "scripts/release.mjs"), ...releaseArgs], { cwd: repo, stdio: "inherit" });
}
if (!existsSync(join(releaseDir, "packages/cli/bin/folio.mjs"))) throw new Error(`${releaseDir} is missing: run node scripts/release.mjs first`);

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(releaseDir, distDir, { recursive: true, filter: (p) => !/__pycache__|\.pyc$/.test(p) });

const pyprojectPath = join(pyDir, "pyproject.toml");
const original = readFileSync(pyprojectPath, "utf8");
writeFileSync(pyprojectPath, original.replace(/^version = ".*"$/m, `version = "${version}"`));

const venv = mkdtempSync(join(tmpdir(), "folio-wheel-venv-"));
try {
  execFileSync("python3", ["-m", "venv", venv], { stdio: "inherit" });
  const pip = join(venv, "bin", "pip");
  const python = join(venv, "bin", "python");
  execFileSync(pip, ["install", "--quiet", "build>=1.0"], { stdio: "inherit" });
  rmSync(wheelOut, { recursive: true, force: true });
  execFileSync(python, ["-m", "build", "--outdir", wheelOut, pyDir], { stdio: "inherit" });
} finally {
  writeFileSync(pyprojectPath, original);
  rmSync(venv, { recursive: true, force: true });
  rmSync(distDir, { recursive: true, force: true });
}

console.log(wheelOut);
