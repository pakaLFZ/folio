/**
 * VS Code's command-line socket protocol: the open request that makes it
 * request a forward and open the page on the user's own machine, the answer
 * that means VS Code accepted the request, and which sockets to ask in order.
 */

export const EDITOR_SOCKET_ENV = "VSCODE_IPC_HOOK_CLI";
export const EDITOR_SOCKET_NAME = /^vscode-ipc-.*\.sock$/;

export interface FoundSocket {
  path: string;
  written: number;
}

/**
 * The whole HTTP message VS Code's own `code` shim sends to open an address.
 *
 * @param url - the address to open; VS Code forwards its port first.
 * @returns the request bytes.
 */
export function openExternalRequest(url: string): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify({ type: "openExternal", uris: [url] }));
  const head = [
    "POST / HTTP/1.1",
    "Host: localhost",
    "Content-Type: application/json",
    "Accept: application/json",
    "Connection: close",
    `Content-Length: ${body.length}`,
    "",
    "",
  ].join("\r\n");
  const head8 = new TextEncoder().encode(head);
  const message = new Uint8Array(head8.length + body.length);
  message.set(head8);
  message.set(body, head8.length);
  return message;
}

/** Whether VS Code accepted the request: its status line is `200 OK`. */
export function editorAccepted(answer: string): boolean {
  return /^HTTP\/1\.[01] 200 OK$/.test(answer.split("\r\n", 1)[0] ?? "");
}

/**
 * The sockets to ask: the inherited one first, then every other one found, newest first.
 *
 * @param inherited - the path in `VSCODE_IPC_HOOK_CLI`, if any.
 * @param found - the `vscode-ipc-*.sock` files in the runtime folders, with their mtimes.
 */
export function socketOrder(inherited: string | null, found: FoundSocket[]): string[] {
  const others = [...found].sort((a, b) => b.written - a.written).map((s) => s.path);
  return [...new Set([...(inherited ? [inherited] : []), ...others])];
}
