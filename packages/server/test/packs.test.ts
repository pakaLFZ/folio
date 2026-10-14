import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FolioApp } from "../src/app.js";
import { Router } from "../src/httpkit.js";
import { packRoutes } from "../src/routes-packs.js";
import { loadPackDir, type LoadedPack } from "../src/workspace.js";
import { fileURLToPath } from "node:url";

const lecternDir = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));

/** Two packs: lectern and a renamed copy of it with one layout. */
function twoPacks(): LoadedPack[] {
  const dir = join(mkdtempSync(join(tmpdir(), "folio-packs-")), "plain");
  cpSync(lecternDir, dir, { recursive: true });
  const json = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8"));
  json.name = "plain";
  json.layouts = { title: json.layouts.title };
  writeFileSync(join(dir, "pack.json"), JSON.stringify(json));
  return [dir, lecternDir].map((d) => {
    const result = loadPackDir(d);
    if (!result.ok) throw new Error(result.problems.join("; "));
    return result.loaded;
  });
}

describe("GET /api/packs", () => {
  it("lists every loaded pack by name with its canvas and layouts", async () => {
    const packs = new Map(twoPacks().map((l) => [l.pack.name, l]));
    const app = { workspace: { packs } } as unknown as FolioApp;
    const router = new Router();
    packRoutes(router, app);
    const server = createServer((req, res) => void router.handle(req, res, new URL(req.url!, "http://x"), new URL(req.url!, "http://x").pathname));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/packs`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.packs.map((p: { name: string }) => p.name)).toEqual(["lectern", "plain"]);
      expect(Object.keys(body.packs[0].layouts)).toEqual(Object.keys(JSON.parse(readFileSync(join(lecternDir, "pack.json"), "utf8")).layouts));
      expect(Object.keys(body.packs[1].layouts)).toEqual(["title"]);
      expect(body.packs[0].canvas).toMatchObject({ w: 960, h: 540 });
    } finally {
      server.close();
    }
  });
});
