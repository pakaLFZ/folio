/**
 * Relative paths in one written form on every OS: forward slashes, as folio
 * stores, compares and prints them. On Linux and macOS this is `node:path`'s
 * own `relative`; on Windows its backslashes are turned into `/`.
 */
import { relative as nativeRelative, sep } from "node:path";

/**
 * Turn an OS-native path into its forward-slash form.
 *
 * @param path - a path as `node:path` builds it on this OS.
 * @returns the same path with every separator written `/`.
 */
export function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/**
 * `node:path`'s `relative`, written with forward slashes.
 *
 * @param from - the base directory.
 * @param to - the target path.
 * @returns the path from `from` to `to`, separated by `/`.
 */
export function relative(from: string, to: string): string {
  return toPosix(nativeRelative(from, to));
}
