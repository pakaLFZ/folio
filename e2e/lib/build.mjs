/**
 * Build the folio CLI (and the server it starts) once into one JavaScript file, so checks start it with plain
 * `node` instead of compiling TypeScript through tsx in every process. Prints the built file's path.
 *
 * The bundle lives in the ignored scratch/build/. Two things keep it behaving like the sources:
 * - each source's `import.meta.url` is replaced by that source's own file URL, so paths it reads beside itself
 *   (packs, docs, skills, python, package.json) resolve as they do from src/;
 * - every npm package stays external, imported by the file URL it resolves to from the importing source, since
 *   pnpm installs each package's dependencies beside that package only.
 */
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { repo } from "./server.mjs";

export const built = join(repo, "scratch/build/folio.mjs");

const sourcesOwnUrl = {
  name: "sources-own-url",
  setup(b) {
    b.onLoad({ filter: /\.ts$/ }, ({ path }) => ({
      contents: readFileSync(path, "utf8").replaceAll("import.meta.url", JSON.stringify(pathToFileURL(path).href)),
      loader: "ts",
    }));
  },
};

const packagesByUrl = {
  name: "packages-by-url",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, async ({ path, importer, resolveDir, kind, pluginData }) => {
      if (path.startsWith("@folio/") || path.startsWith("node:") || pluginData === "resolving") return undefined;
      const found = await b.resolve(path, { importer, resolveDir, kind, pluginData: "resolving" });
      if (found.errors.length) return { errors: found.errors };
      return { path: found.external ? path : pathToFileURL(found.path).href, external: true };
    });
  },
};

/** Bundle packages/cli/src/main.ts into scratch/build/folio.mjs, written whole or not at all. */
export async function buildCli() {
  const partial = `${built}.${process.pid}.tmp`;
  await build({
    entryPoints: [join(repo, "packages/cli/src/main.ts")],
    outfile: partial,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "warning",
    plugins: [sourcesOwnUrl, packagesByUrl],
  });
  renameSync(partial, built);
  return built;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(await buildCli());
