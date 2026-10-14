import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { findPython, pythonCandidates } from "../src/hooks/findpython.js";
import { describeRuntime, runtimeExe } from "../src/hooks/runtime.js";

describe("the Python found on PATH", () => {
  it("tries python3, then python, then py -3 on Windows only", () => {
    expect(pythonCandidates("darwin")).toEqual([["python3"], ["python"]]);
    expect(pythonCandidates("linux")).toEqual([["python3"], ["python"]]);
    expect(pythonCandidates("win32")).toEqual([["python3"], ["python"], ["py", "-3"]]);
  });

  it("finds nothing on a PATH without Python", () => {
    expect(findPython({ PATH: join(tmpdir(), "folio-no-such-dir") })).toBeNull();
  });

  it.skipIf(!findPython())("finds an interpreter that exists on this machine's PATH", () => {
    const found = findPython()!;
    expect(["python3", "python", "py -3"]).toContain(found.via);
    expect(runtimeExe("python", {})).toEqual({ exe: found.exe, source: "path", via: found.via });
    expect(describeRuntime("python", {})).toContain(`found on PATH as ${found.via}`);
  });

  it("never replaces a configured path, even one that does not exist", () => {
    expect(runtimeExe("python", { python: process.execPath })).toEqual({ exe: process.execPath, source: "configured" });
    expect(runtimeExe("python", { python: "/no/such/python" })).toBeNull();
    expect(describeRuntime("python", { python: "/no/such/python" })).toBe("python: /no/such/python is configured but does not exist");
    expect(runtimeExe("julia", {})).toBeNull();
  });
});

describe("configured runtime paths", () => {
  it("reads a relative path from the workspace root and ~/ as the home folder", () => {
    const root = mkdtempSync(join(tmpdir(), "folio-runtimes-"));
    writeFileSync(join(root, "folio.toml"), "");
    writeFileSync(join(root, "folio.local.toml"), '[runtimes]\npython = ".venv/bin/python"\nother = "~/py/bin/python"\nabs = "/opt/python"\n');
    const { runtimes } = loadConfig(root);
    expect(runtimes.python).toBe(join(root, ".venv/bin/python"));
    expect(runtimes.other).toBe(join(homedir(), "py/bin/python"));
    expect(runtimes.abs).toBe("/opt/python");
  });
});
