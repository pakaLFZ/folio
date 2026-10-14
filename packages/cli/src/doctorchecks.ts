/**
 * The checks of `folio doctor`, one function each. Every check says what it
 * saw and, when it fails, the exact command that fixes it on this system.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { describeRuntime, FolioApp, hookEnv, MIN_PYTHON, PORT_BAND, relative, runtimeExe, staleWebBuild, WEB_DIST, type WorkspaceConfig } from "@folio/server";
import { findServer } from "./queuecmds.js";

export interface DoctorCheck {
  check: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

const pass = (check: string, detail: string): DoctorCheck => ({ check, ok: true, detail });
const fail = (check: string, detail: string, fix: string): DoctorCheck => ({ check, ok: false, detail, fix });

/** The command that installs something on this platform. */
function installLine(what: { darwin: string; linux: string; win32: string }, platform: NodeJS.Platform = process.platform): string {
  return platform === "darwin" ? what.darwin : platform === "win32" ? what.win32 : what.linux;
}

/** Node 20 or later. */
export function nodeCheck(version = process.versions.node, platform: NodeJS.Platform = process.platform): DoctorCheck {
  const major = Number(version.split(".")[0]);
  if (major >= 20) return pass("node", `v${version}`);
  return fail("node", `v${version}; folio needs 20 or later`, installLine({ darwin: "brew install node@20 && brew link --overwrite --force node@20", linux: "nvm install 20 (https://github.com/nvm-sh/nvm)", win32: "winget install OpenJS.NodeJS.LTS" }, platform));
}

/** The web app is built and not older than its sources. */
export function webBuildCheck(dist = WEB_DIST): DoctorCheck {
  if (!existsSync(join(dist, "index.html"))) return fail("web build", `${dist} has no index.html`, "pnpm build:web");
  const stale = staleWebBuild(dist);
  return stale ? fail("web build", stale.replace(/^folio: /, "").replace(/; run pnpm build:web$/, ""), "pnpm build:web") : pass("web build", dist);
}

/** Playwright's Chromium launches headless. */
export async function chromiumCheck(platform: NodeJS.Platform = process.platform): Promise<DoctorCheck> {
  const fix = platform === "linux" ? "pnpm exec playwright install --with-deps chromium" : "pnpm exec playwright install chromium";
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ timeout: 30_000 });
    const version = browser.version();
    await browser.close();
    return pass("chromium", `Chromium ${version} launches (${chromium.executablePath()})`);
  } catch (error) {
    return fail("chromium", (error as Error).message.split("\n").find((l) => l.trim()) ?? "does not launch", fix);
  }
}

/** Run an interpreter with folio's hook environment; stdout, or null on failure. */
function ask(exe: string, args: string[]): string | null {
  const done = spawnSync(exe, args, { env: hookEnv(), encoding: "utf8", timeout: 60_000, windowsHide: true });
  return done.status === 0 ? `${done.stdout}${done.stderr}`.trim() : null;
}

/** The Python hooks run with: configured or found, its version, and matplotlib. */
export function pythonCheck(config: WorkspaceConfig, platform: NodeJS.Platform = process.platform): DoctorCheck {
  const said = describeRuntime("python", config.runtimes);
  const found = runtimeExe("python", config.runtimes);
  const local = join(config.root, "folio.local.toml");
  if (config.runtimes.python && !found) return fail("python", said, `set [runtimes] python in ${local} to an existing interpreter, or remove the line to use python3 from PATH`);
  const install = installLine({ darwin: "brew install python", linux: "sudo apt install python3 python3-matplotlib", win32: "winget install Python.Python.3.12" }, platform);
  if (!found) return fail("python", `${said} (python3, python${platform === "win32" ? ", py -3" : ""}; ${MIN_PYTHON.join(".")} or later)`, install);
  const version = ask(found.exe, ["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"]) ?? "unknown";
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major !== MIN_PYTHON[0] || minor < MIN_PYTHON[1]) return fail("python", `${said}; Python ${version}; folio_hook needs ${MIN_PYTHON.join(".")} or later`, `${install}, then [runtimes] python = "<its path>" in ${local}`);
  const matplotlib = ask(found.exe, ["-c", "import matplotlib; print(matplotlib.__version__)"]);
  const venvPython = platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
  if (!matplotlib) return fail("python", `${said}; Python ${version}; matplotlib does not import`, `"${found.exe}" -m pip install matplotlib (where pip refuses: "${found.exe}" -m venv .venv && ${venvPython} -m pip install matplotlib, then [runtimes] python = "${venvPython.replaceAll("\\", "/")}" in ${local})`);
  return pass("python", `${said}; Python ${version}; matplotlib ${matplotlib}`);
}

/** The workspace: its folio.toml, decks and the packs that load. */
export async function workspaceCheck(config: WorkspaceConfig): Promise<DoctorCheck> {
  if (!existsSync(join(config.root, "folio.toml"))) {
    return fail("workspace", `no folio.toml in ${config.root} or any folder above`, `cd to the folder holding folio.toml, or create one: node -e "require('fs').writeFileSync('folio.toml','[workspace]\\ndecks = \\"decks\\"\\ntemplates = \\"templates\\"\\n')"`);
  }
  const app = new FolioApp(config);
  try {
    const shown = (p: string) => relative(config.root, p) || ".";
    const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
    const detail = `${config.root}: ${count(app.workspace.decks.size, "deck")} in ${shown(config.decksDir)}, ${count(app.workspace.packs.size, "pack")} in ${shown(config.templatesDir)}`;
    const broken = [...app.workspace.packProblems.keys()];
    if (broken.length) return fail("workspace", `${detail}; pack ${broken.join(", ")} does not load`, `folio pack check ${join(shown(config.templatesDir), broken[0]!)}`);
    return pass("workspace", detail);
  } finally {
    await app.close();
  }
}

/** Whether a port takes a listener on a host. */
function free(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

/** A port of the band is free, or this workspace's own server holds one. */
export async function portCheck(config: WorkspaceConfig, platform: NodeJS.Platform = process.platform): Promise<DoctorCheck> {
  const app = new FolioApp(config);
  const running = await findServer(app).finally(() => app.close());
  if (running) return pass("port", `folio serve already runs for this workspace at ${running}`);
  const last = config.port + PORT_BAND - 1;
  for (let port = config.port; port <= last; port += 1) {
    if (await free(port, config.host)) return pass("port", port === config.port ? `${port} is free on ${config.host}` : `${config.port}${port - 1 > config.port ? ` to ${port - 1}` : ""} taken by another process; folio serve will take ${port} on ${config.host}`);
  }
  const who = platform === "win32" ? `netstat -ano | findstr :${config.port}` : `lsof -nP -iTCP:${config.port} -sTCP:LISTEN`;
  return fail("port", `${config.port} to ${last} are all taken on ${config.host}`, `${who} to find the process and stop it, or folio serve --port ${last + 1}`);
}
