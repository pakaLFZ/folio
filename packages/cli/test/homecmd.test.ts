import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { browserCommand, defaultWorkspace, ensureWorkspace, freshForwardUrl, HOME_PORT } from "../src/homecmd.js";
import { findServer } from "../src/queuecmds.js";
import { loadConfig } from "@folio/server";

const temp = () => mkdtempSync(join(tmpdir(), "folio-home-"));
const BIN = fileURLToPath(new URL("../bin/folio.mjs", import.meta.url));

describe("folio alone", () => {
  it("defaults to $FOLIO_HOME, else Documents/folio, else folio-decks", () => {
    const home = temp();
    expect(defaultWorkspace(home, { FOLIO_HOME: "/x" })).toBe("/x");
    expect(defaultWorkspace(home, {})).toBe(join(home, "folio-decks"));
    mkdirSync(join(home, "Documents"));
    expect(defaultWorkspace(home, {})).toBe(join(home, "Documents", "folio"));
  });
  it("makes the default workspace once, with folio.toml and the lectern pack", () => {
    const dir = join(temp(), "ws");
    expect(ensureWorkspace(dir)).toBe(true);
    expect(readFileSync(join(dir, "folio.toml"), "utf8")).toContain('decks = "decks"');
    expect(existsSync(join(dir, "templates", "lectern", "pack.json"))).toBe(true);
    expect(loadConfig(dir).port).toBe(HOME_PORT);
    expect(ensureWorkspace(dir)).toBe(false);
  });
  it("opens nothing in an SSH session or without a display on Linux", () => {
    expect(browserCommand("linux", { SSH_CONNECTION: "1 2 3 4" })).toBeNull();
    expect(browserCommand("linux", {})).toBeNull();
    expect(browserCommand("darwin", {})).toEqual(["open"]);
  });
  it("prints the usage and starts nothing when not in a terminal", () => {
    const out = execFileSync("node", [BIN], { cwd: temp(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(out).toBe("");
  });
  it("opens through a fresh forward port that reaches the same server", async () => {
    const dir = join(temp(), "ws");
    ensureWorkspace(dir);
    const server = spawn("node", [BIN, "serve", dir, "--port", "4397"], { stdio: "ignore" });
    try {
      const config = loadConfig(dir);
      let base: string | null = null;
      for (let tries = 0; !base && tries < 100; tries++) base = (await findServer({ config })) ?? (await new Promise((r) => setTimeout(r, 200, null)));
      const url = new URL(await freshForwardUrl(base!));
      expect(url.port).not.toBe(new URL(base!).port);
      expect((await fetch(url)).status).toBe(200);
    } finally {
      server.kill("SIGTERM");
      await new Promise((r) => server.once("exit", r));
    }
  }, 30_000);
});
