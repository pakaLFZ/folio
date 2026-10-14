import { linkSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorAccepted, openExternalRequest, socketOrder } from "@folio/core";
import { editorPlaces, editorSockets, openInEditor } from "../src/editoropen.js";

const URL_TO_OPEN = "http://127.0.0.1:4399/abcd1234/";

interface FakeEditor {
  server: Server;
  bodies: unknown[];
}

/** A VS Code CLI socket: answers every POST with `status` and keeps each JSON body it received. */
function fakeEditor(path: string, status = 200): Promise<FakeEditor> {
  const bodies: unknown[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      bodies.push({ method: req.method, url: req.url, type: req.headers["content-type"], body: JSON.parse(text) });
      res.writeHead(status, { "content-type": "application/json" }).end("{}");
    });
  });
  return new Promise((resolve) => server.listen(path, () => resolve({ server, bodies })));
}

/** A socket file nobody listens on: a link to a live socket, left behind when that socket closes. */
async function deadSocket(path: string): Promise<void> {
  const live = `${path}.live`;
  const { server } = await fakeEditor(live);
  linkSync(live, path);
  await new Promise((resolve) => server.close(resolve));
}

const age = (path: string, secondsAgo: number) => utimesSync(path, new Date(), new Date(Date.now() - secondsAgo * 1000));

describe("the VS Code socket protocol", () => {
  it("sends the openExternal request VS Code's own CLI sends", () => {
    const text = new TextDecoder().decode(openExternalRequest(URL_TO_OPEN));
    const [head, body] = text.split("\r\n\r\n");
    expect(head!.split("\r\n")[0]).toBe("POST / HTTP/1.1");
    expect(JSON.parse(body!)).toEqual({ type: "openExternal", uris: [URL_TO_OPEN] });
    expect(head).toContain(`Content-Length: ${body!.length}`);
  });

  it("counts only a 200 OK status line as opened", () => {
    expect(editorAccepted("HTTP/1.1 200 OK\r\ncontent-type: x\r\n\r\n{}")).toBe(true);
    expect(editorAccepted("HTTP/1.1 500 Internal Server Error\r\n\r\n")).toBe(false);
    expect(editorAccepted("")).toBe(false);
  });

  it("asks the inherited socket first, then the others newest first, each once", () => {
    const found = [{ path: "/r/old", written: 1 }, { path: "/r/new", written: 3 }, { path: "/r/mine", written: 2 }];
    expect(socketOrder("/r/mine", found)).toEqual(["/r/mine", "/r/new", "/r/old"]);
    expect(socketOrder(null, found)).toEqual(["/r/new", "/r/mine", "/r/old"]);
  });
});

describe.skipIf(process.platform === "win32")("the socket walk", () => {
  let dir = "";
  const servers: Server[] = [];
  const live = async (name: string, status = 200) => {
    const editor = await fakeEditor(join(dir, name), status);
    servers.push(editor.server);
    return editor;
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "folio-vscode-"));
  });
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens through a live socket with the right JSON body", async () => {
    const editor = await live("vscode-ipc-live.sock");
    const opened = await openInEditor(URL_TO_OPEN, { inherited: join(dir, "vscode-ipc-live.sock"), folders: [] });
    expect(opened).toBe(join(dir, "vscode-ipc-live.sock"));
    expect(editor.bodies).toEqual([{ method: "POST", url: "/", type: "application/json", body: { type: "openExternal", uris: [URL_TO_OPEN] } }]);
  });

  it("gives no open when the only socket is dead", async () => {
    await deadSocket(join(dir, "vscode-ipc-dead.sock"));
    expect(await openInEditor(URL_TO_OPEN, { inherited: null, folders: [dir] })).toBeNull();
  });

  it("walks past a dead inherited socket to a live one in the runtime folder", async () => {
    const editor = await live("vscode-ipc-live.sock");
    await deadSocket(join(dir, "vscode-ipc-dead.sock"));
    await deadSocket(join(dir, "vscode-ipc-newer-dead.sock"));
    age(join(dir, "vscode-ipc-live.sock"), 60);
    const places = editorPlaces({ VSCODE_IPC_HOOK_CLI: join(dir, "vscode-ipc-dead.sock"), XDG_RUNTIME_DIR: dir });
    expect(editorSockets(places)[0]).toBe(join(dir, "vscode-ipc-dead.sock"));
    expect(await openInEditor(URL_TO_OPEN, places)).toBe(join(dir, "vscode-ipc-live.sock"));
    expect(editor.bodies).toEqual([{ method: "POST", url: "/", type: "application/json", body: { type: "openExternal", uris: [URL_TO_OPEN] } }]);
  });

  it("stops at the first socket that answers, even with a refusal", async () => {
    const refusing = await live("vscode-ipc-refuses.sock", 500);
    const accepting = await live("vscode-ipc-accepts.sock");
    age(join(dir, "vscode-ipc-accepts.sock"), 60);
    expect(await openInEditor(URL_TO_OPEN, { inherited: null, folders: [dir] })).toBeNull();
    expect([refusing.bodies.length, accepting.bodies.length]).toEqual([1, 0]);
  });

  it("finds nothing where the runtime folder does not exist", () => {
    expect(editorSockets({ inherited: null, folders: [join(dir, "missing")] })).toEqual([]);
  });
});
