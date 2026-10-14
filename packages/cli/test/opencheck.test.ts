import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@folio/server";
import { openChecked } from "../src/opencmd.js";
import { findServer } from "../src/queuecmds.js";

const BIN = fileURLToPath(new URL("../bin/folio.mjs", import.meta.url));
const WAITS = [1500, 1500] as const;

/** A VS Code CLI socket that accepts every open and has a browser load only the ports `reaches` allows. */
function fakeEditor(path: string, reaches: (port: number) => boolean): Promise<{ server: Server; asked: string[] }> {
  const asked: string[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      const url = (JSON.parse(text) as { uris: string[] }).uris[0]!;
      asked.push(url);
      res.writeHead(200).end("{}");
      if (reaches(Number(new URL(url).port))) void fetch(url, { headers: { "sec-fetch-dest": "document" } });
    });
  });
  return new Promise((resolve) => server.listen(path, () => resolve({ server, asked })));
}

describe.skipIf(process.platform === "win32")("opening through VS Code, held to its word", () => {
  const dir = mkdtempSync(join(tmpdir(), "folio-opencheck-"));
  let serve: ChildProcess;
  let base = "";
  let editor: { server: Server; asked: string[] } | null = null;
  const withEditor = async (reaches: (port: number) => boolean) => {
    if (editor) await new Promise((resolve) => editor!.server.close(resolve));
    rmSync(join(dir, "vscode-ipc-fake.sock"), { force: true });
    editor = await fakeEditor(join(dir, "vscode-ipc-fake.sock"), reaches);
    return editor.asked;
  };
  const said = () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    return () => {
      const text = out.mock.calls.map((c) => String(c[0])).join("");
      out.mockRestore();
      return text;
    };
  };

  beforeAll(async () => {
    const ws = join(dir, "ws");
    mkdirSync(join(ws, "decks"), { recursive: true });
    writeFileSync(join(ws, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
    serve = spawn("node", [BIN, "serve", ws, "--port", "4396"], { stdio: "ignore" });
    for (let tries = 0; !base && tries < 100; tries++) base = (await findServer({ config: loadConfig(ws) })) ?? (await new Promise((r) => setTimeout(r, 200, "")));
    vi.stubEnv("VSCODE_IPC_HOOK_CLI", join(dir, "vscode-ipc-fake.sock"));
    vi.stubEnv("XDG_RUNTIME_DIR", join(dir, "none"));
  }, 30_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (editor) await new Promise((resolve) => editor!.server.close(resolve));
    serve.kill("SIGTERM");
    await new Promise((r) => serve.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens on a fresh port every time, never the held one", async () => {
    const held = Number(new URL(base).port);
    const asked = await withEditor(() => true);
    const done = said();
    expect(await openChecked(base, "", WAITS)).toBe(true);
    expect(await openChecked(base, "", WAITS)).toBe(true);
    expect(done()).toContain("the page loaded");
    const ports = asked.map((u) => Number(new URL(u).port));
    expect(ports).toHaveLength(2);
    expect(ports).not.toContain(held);
    expect(ports[0]).not.toBe(ports[1]);
  });

  it("tries a second fresh port when the first loads nothing", async () => {
    let tried = 0;
    const asked = await withEditor(() => (tried += 1) > 1);
    const done = said();
    expect(await openChecked(base, "", WAITS)).toBe(true);
    expect(done()).toContain("reached nothing, so the page moved to");
    const [first, second] = asked.map((u) => Number(new URL(u).port));
    expect(second).not.toBe(first);
  }, 20_000);

  it("says how to forward by hand when no port is ever loaded", async () => {
    await withEditor(() => false);
    const done = said();
    expect(await openChecked(base, "", WAITS)).toBe(false);
    expect(done()).toMatch(/no browser loaded it\. Forward it yourself:\n  ssh -L (\d+):127\.0\.0\.1:\1 /);
  }, 20_000);
});
