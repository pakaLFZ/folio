/**
 * Asking VS Code to open an address on the user's own machine through its
 * command-line socket, which makes it forward the port first. The inherited
 * socket goes stale, so every `vscode-ipc-*.sock` in the runtime folders is
 * asked too, newest first (`spec/live/vscode-open.md`).
 */
import { readdirSync, statSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { EDITOR_SOCKET_ENV, EDITOR_SOCKET_NAME, editorAccepted, openExternalRequest, socketOrder, type FoundSocket } from "@folio/core";

export const EDITOR_ANSWER_MS = 5000;
const ANSWER_LIMIT = 64 * 1024;

/** The inherited socket and the folders where VS Code leaves its sockets. */
export interface EditorPlaces {
  inherited: string | null;
  folders: string[];
}

/** Where to look, read from an environment: the inherited socket's folder and the runtime folder. */
export function editorPlaces(env: NodeJS.ProcessEnv = process.env): EditorPlaces {
  const inherited = env[EDITOR_SOCKET_ENV] || null;
  const runtime = env.XDG_RUNTIME_DIR || (process.getuid ? `/run/user/${process.getuid()}` : null);
  const folders = [...new Set([inherited && dirname(inherited), runtime].filter((f): f is string => !!f))];
  return { inherited, folders };
}

/** Every socket worth asking, the inherited one first, then the rest newest first. */
export function editorSockets(places: EditorPlaces): string[] {
  const found: FoundSocket[] = [];
  for (const folder of places.folders) {
    let names: string[];
    try {
      names = readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => EDITOR_SOCKET_NAME.test(n))) {
      const path = join(folder, name);
      try {
        found.push({ path, written: statSync(path).mtimeMs });
      } catch {
        continue;
      }
    }
  }
  return socketOrder(places.inherited, found);
}

/** Send one request over a unix socket and collect the answer; rejects when nobody listens. */
function ask(path: string, message: Uint8Array, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const socket = connect({ path });
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error("no answer in time")));
    socket.on("connect", () => socket.write(message));
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= ANSWER_LIMIT) chunks.push(chunk);
    });
    socket.on("error", reject);
    socket.on("close", () => resolve(Buffer.concat(chunks).toString("latin1")));
  });
}

/**
 * Ask VS Code to open `url` on the user's machine, forwarding its port first.
 *
 * @param url - the address to open.
 * @param places - where to look; by default this process's environment.
 * @returns the socket that accepted it, or null when none did. A socket nobody
 *   listens on is passed over; the first one that answers decides.
 */
export async function openInEditor(url: string, places: EditorPlaces = editorPlaces(), timeoutMs = EDITOR_ANSWER_MS): Promise<string | null> {
  const message = openExternalRequest(url);
  for (const path of editorSockets(places)) {
    const answer = await ask(path, message, timeoutMs).catch(() => null);
    if (answer === null) continue;
    return editorAccepted(answer) ? path : null;
  }
  return null;
}
