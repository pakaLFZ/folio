/**
 * Comment attachments. An upload streams into the deck's staging folder,
 * `.folio/uploads/`, and gets an id; when a comment or reply is sent with that
 * id, the file moves into the comment's folder as `att-<n>-<name>`. Staged
 * files of a draft stay until the draft is sent or discarded.
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { MAX_ATTACHMENT_BYTES, safeFileName, type Attachment } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import { atomicWrite, formatJson, readJson, renameRetrying } from "../fsutil.js";
import { shotsDir } from "./store.js";

export interface StagedUpload extends Attachment {
  id: string;
}

/** The staging folder of a deck. */
function stagingDir(store: DeckStore): string {
  return join(store.stateDir, "uploads");
}

/**
 * Stream an upload into staging.
 *
 * @param req - the request; its body is the raw file.
 * @param name - the original file name (from `X-File-Name`).
 * @param type - the media type.
 * @returns the staged upload, or throws when it exceeds 25 MB.
 */
export async function stageUpload(store: DeckStore, req: IncomingMessage, name: string, type: string): Promise<StagedUpload> {
  const id = `u${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  mkdirSync(stagingDir(store), { recursive: true });
  const path = join(stagingDir(store), `${id}-${safeFileName(name)}`);
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      bytes += chunk.length;
      done(bytes > MAX_ATTACHMENT_BYTES ? new Error("a file may be at most 25 MB") : null, chunk);
    },
  });
  await pipeline(req, limit, createWriteStream(path));
  const staged = { id, file: basename(path), name, type: type || "application/octet-stream", bytes };
  atomicWrite(`${path}.json`, formatJson(staged));
  return staged;
}

/**
 * Stage a local file (the CLI's `--attach` without a server).
 *
 * @returns the staged upload.
 */
export function stageLocalFile(store: DeckStore, path: string, type: string): StagedUpload {
  const bytes = statSync(path).size;
  if (bytes > MAX_ATTACHMENT_BYTES) throw new Error(`${path} is larger than 25 MB`);
  const id = `u${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  mkdirSync(stagingDir(store), { recursive: true });
  const file = `${id}-${safeFileName(basename(path))}`;
  copyFileSync(path, join(stagingDir(store), file));
  const staged = { id, file, name: basename(path), type, bytes };
  atomicWrite(join(stagingDir(store), `${file}.json`), formatJson(staged));
  return staged;
}

/**
 * Move staged uploads into a comment's folder.
 *
 * @param ids - upload ids sent with the message.
 * @returns the attachments to store on the message; unknown ids are skipped.
 */
export function claimUploads(store: DeckStore, cid: string, ids: string[]): Attachment[] {
  if (!ids.length) return [];
  const dir = shotsDir(store, cid);
  mkdirSync(dir, { recursive: true });
  let n = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith("att-")).length : 0;
  const staged = existsSync(stagingDir(store)) ? readdirSync(stagingDir(store)) : [];
  const out: Attachment[] = [];
  for (const id of ids) {
    const file = staged.find((f) => f.startsWith(`${id}-`) && !f.endsWith(".json"));
    if (!file) continue;
    const meta = readJson<StagedUpload | null>(join(stagingDir(store), `${file}.json`), null);
    n += 1;
    const target = `att-${n}-${file.slice(id.length + 1)}`;
    renameRetrying(join(stagingDir(store), file), join(dir, target));
    out.push({ file: target, name: meta?.name ?? file, type: meta?.type ?? "application/octet-stream", bytes: meta?.bytes ?? statSync(join(dir, target)).size });
  }
  return out;
}

/**
 * Read a staged upload's description (a draft shows its attachments).
 *
 * @returns the staged upload, or null.
 */
export function stagedUpload(store: DeckStore, id: string): StagedUpload | null {
  const file = existsSync(stagingDir(store)) ? readdirSync(stagingDir(store)).find((f) => f.startsWith(`${id}-`) && f.endsWith(".json")) : undefined;
  return file ? readJson<StagedUpload | null>(join(stagingDir(store), file), null) : null;
}

/** The staging folder, for serving a draft's upload. */
export function stagedPath(store: DeckStore): string {
  return stagingDir(store);
}
