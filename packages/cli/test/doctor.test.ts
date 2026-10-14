import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@folio/server";
import { doctorLines } from "../src/doctor.js";
import { nodeCheck, portCheck, pythonCheck, webBuildCheck, workspaceCheck } from "../src/doctorchecks.js";

const workspace = (local = "") => {
  const root = mkdtempSync(join(tmpdir(), "folio-doctor-"));
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  if (local) writeFileSync(join(root, "folio.local.toml"), local);
  return root;
};

const listen = (port: number): Promise<Server | null> =>
  new Promise((resolve) => {
    const server = createServer((_req, res) => res.end("not folio"));
    server.once("error", () => resolve(null));
    server.listen(port, "127.0.0.1", () => resolve(server));
  });

describe("folio doctor", () => {
  it("wants Node 20 and names the install line of the system", () => {
    expect(nodeCheck("20.1.0").ok).toBe(true);
    const old = nodeCheck("18.19.0", "darwin");
    expect(old.ok).toBe(false);
    expect(old.fix).toContain("brew install node@20");
    expect(nodeCheck("18.19.0", "win32").fix).toContain("winget");
  });

  it("fails a missing web build with pnpm build:web", () => {
    expect(webBuildCheck(mkdtempSync(join(tmpdir(), "folio-dist-")))).toMatchObject({ ok: false, fix: "pnpm build:web" });
  });

  it("fails a configured Python that does not exist, naming folio.local.toml", () => {
    const root = workspace('[runtimes]\npython = "/no/such/python"\n');
    const check = pythonCheck(loadConfig(root));
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("/no/such/python is configured but does not exist");
    expect(check.fix).toContain(join(root, "folio.local.toml"));
  });

  it("fails a folder with no folio.toml and passes a workspace", async () => {
    const bare = mkdtempSync(join(tmpdir(), "folio-bare-"));
    expect(await workspaceCheck(loadConfig(bare))).toMatchObject({ ok: false });
    expect(await workspaceCheck(loadConfig(workspace()))).toMatchObject({ ok: true });
  });

  it("passes a free port, and fails a taken band with the command that finds the holder", async () => {
    const probe = await listen(0);
    const first = (probe!.address() as AddressInfo).port;
    await new Promise((r) => probe!.close(r));
    const root = workspace();
    const config = { ...loadConfig(root), port: first };
    expect((await portCheck(config, "darwin")).ok).toBe(true);
    const held = await Promise.all([0, 1, 2, 3].map((i) => listen(first + i)));
    try {
      if (held.every(Boolean)) {
        const taken = await portCheck(config, "darwin");
        expect(taken.ok).toBe(false);
        expect(taken.fix).toContain(`lsof -nP -iTCP:${first}`);
        expect(taken.fix).toContain(`folio serve --port ${first + 4}`);
      }
    } finally {
      await Promise.all(held.map((s) => s && new Promise((r) => s.close(r))));
    }
  });

  it("prints one line per check and the fix under a failure", () => {
    const lines = doctorLines([{ check: "node", ok: true, detail: "v20.1.0" }, { check: "python", ok: false, detail: "none", fix: "brew install python" }]);
    expect(lines[0]).toBe("ok    node    v20.1.0");
    expect(lines[1]).toBe(`FAIL  python  none\n${" ".repeat(14)}fix: brew install python`);
  });
});
