/**
 * Names derived by hashing: deck tokens in URLs, slide revisions, slide ids.
 *
 * A deck token is a name, not a password. It is the blake2s of a random id that
 * is created once and stored in `deck.json`, so it survives restarts and moves.
 */
import { blake2s } from "@noble/hashes/blake2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const TOKEN_DIGITS = 8;

/**
 * The URL token of a deck.
 *
 * @param deckId - the random id stored in `deck.json` as `id`.
 * @returns 8 lowercase hex digits, the deck's `/<deck8>/` path segment.
 */
export function deckToken(deckId: string): string {
  return bytesToHex(blake2s(utf8ToBytes(deckId), { dkLen: TOKEN_DIGITS / 2 }));
}

/**
 * Whether a string is a deck token.
 *
 * @param value - a URL path segment.
 * @returns true for exactly 8 lowercase hex digits.
 */
export function isToken(value: string): boolean {
  return /^[0-9a-f]{8}$/.test(value);
}

/**
 * The revision of a file's content.
 *
 * @param content - the file's text or bytes.
 * @returns 12 hex digits of blake2s; any edit, from any writer, changes it.
 */
export function revisionOf(content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? utf8ToBytes(content) : content;
  return bytesToHex(blake2s(bytes, { dkLen: 6 }));
}

/**
 * A short content hash for cache keys.
 *
 * @param parts - strings joined with a separator that cannot occur in them.
 * @returns 16 hex digits of blake2s.
 */
export function hashParts(parts: string[]): string {
  return bytesToHex(blake2s(utf8ToBytes(parts.join("\u001f")), { dkLen: 8 }));
}

/**
 * The next free slide id.
 *
 * @param existing - ids already used in the deck, live or archived.
 * @returns `s` plus a three-digit number one above the highest `sNNN` in use.
 */
export function nextSlideId(existing: Iterable<string>): string {
  let highest = 0;
  for (const id of existing) {
    const m = /^s(\d+)$/.exec(id);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `s${String(highest + 1).padStart(3, "0")}`;
}
