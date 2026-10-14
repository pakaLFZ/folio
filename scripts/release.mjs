/**
 * Build the minimal folio release: `release/folio-<version>/`, its `.zip`, and the `.tgz` that
 * `npm install -g` takes.
 *
 * The release runs with Node and Playwright alone. The CLI, the server and every npm package but Playwright are
 * bundled into `packages/cli/bin/folio.mjs`; the editor ships as its built assets only. Files keep their repository
 * paths, so each source's `import.meta.url` is rewritten to its old place under the release root and what it reads
 * beside itself (packs, docs, skills, python, the web build) resolves as in a clone.
 *
 * Usage: node scripts/release.mjs   (run `pnpm build:web` first, or pass --build-web)
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(repo, "packages/cli/package.json"), "utf8")).version;
const playwright = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).devDependencies.playwright;
const name = `folio-${version}`;
const out = join(repo, "release", name);
const BIN = "packages/cli/bin/folio.mjs";

const SHIPPED = [
  "LICENSE",
  "folio.toml",
  "docs/pack-guide.md",
  "docs/warnings.md",
  "skills/folio-deck",
  "templates/lectern",
  "packages/server/packs",
  "packages/web/dist",
  "python/folio_hook",
  "python/folio_client",
  "python/pyproject.toml",
];

const sourcesAtTheirPlace = {
  name: "sources-at-their-place",
  setup(b) {
    b.onLoad({ filter: /\.ts$/ }, ({ path }) => ({
      contents: readFileSync(path, "utf8").replaceAll(
        "import.meta.url",
        `new URL(${JSON.stringify(relative(repo, path).split("\\").join("/"))}, __folioRoot).href`,
      ),
      loader: "ts",
    }));
  },
};

async function bundle() {
  await build({
    entryPoints: [join(repo, "packages/cli/src/main.ts")],
    outfile: join(out, BIN),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: ["playwright", "playwright-core"],
    mainFields: ["module", "main"],
    banner: {
      js: [
        "#!/usr/bin/env node",
        'import { createRequire as __folioRequire } from "node:module";',
        "const require = __folioRequire(import.meta.url);",
        'const __folioRoot = new URL("../../../", import.meta.url);',
      ].join("\n"),
    },
    plugins: [sourcesAtTheirPlace],
    logLevel: "warning",
  });
}

function writeManifest() {
  writeFileSync(join(out, "packages/server/package.json"), JSON.stringify({ name: "@folio/server", version, type: "module" }, null, 2) + "\n");
  writeFileSync(
    join(out, "package.json"),
    JSON.stringify(
      { name: "folio", version, license: "Apache-2.0", type: "module", private: true, bin: { folio: BIN }, engines: { node: ">=20" }, dependencies: { playwright } },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(out, "README.md"), readFileSync(join(repo, "scripts/release-readme.md"), "utf8").replaceAll("{version}", version));
}

if (process.argv.includes("--build-web")) execFileSync("pnpm", ["build:web"], { cwd: repo, stdio: "inherit", shell: process.platform === "win32" });
if (!existsSync(join(repo, "packages/web/dist/index.html"))) throw new Error("packages/web/dist is missing: run pnpm build:web first");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const path of SHIPPED) cpSync(join(repo, path), join(out, path), { recursive: true, filter: (p) => !/__pycache__|\.pyc$/.test(p) });
await bundle();
writeManifest();
execFileSync("zip", ["-qr", `${name}.zip`, name], { cwd: join(repo, "release") });
execFileSync("npm", ["pack", "--silent", "--pack-destination", ".."], { cwd: out, shell: process.platform === "win32" });
console.log(join(repo, "release", `${name}.zip`));
console.log(join(repo, "release", `${name}.tgz`));
