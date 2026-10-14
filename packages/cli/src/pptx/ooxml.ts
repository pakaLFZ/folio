/**
 * A pptx is a zip of XML parts tied together by relationship files. This
 * opens one: XML parts parsed on demand, relationships resolved to part
 * paths, media bytes read only when asked for.
 */
import { posix } from "node:path";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

/** A parsed XML element: attributes as `@name`, every child element as an array, text as `#text`. */
export type X = Record<string, any>;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", isArray: (_n, _p, _l, isAttribute) => !isAttribute, parseAttributeValue: false, parseTagValue: false, trimValues: false });

export const all = (node: X | undefined, tag: string): X[] => (node?.[tag] as X[] | undefined) ?? [];
export const one = (node: X | undefined, tag: string): X | undefined => all(node, tag)[0];
export const attr = (node: X | undefined, name: string): string | undefined => node?.[`@${name}`];

/** A numeric attribute, or undefined. */
export function num(node: X | undefined, name: string): number | undefined {
  const value = attr(node, name);
  return value === undefined ? undefined : Number(value);
}

/** The first element at a path of tags, or undefined. */
export function path(node: X | undefined, ...tags: string[]): X | undefined {
  return tags.reduce<X | undefined>((n, tag) => one(n, tag), node);
}

/** The text of an element that holds only text. */
export function text(node: unknown): string {
  if (typeof node === "string") return node;
  return typeof (node as X | undefined)?.["#text"] === "string" ? (node as X)["#text"] : "";
}

export interface Rel {
  type: string;
  target: string;
}

export class Pptx {
  private readonly zip: Uint8Array;
  private readonly parts: Record<string, Uint8Array>;
  private readonly parsed = new Map<string, X>();

  /**
   * Open a pptx's bytes.
   *
   * @throws when the bytes are not a zip with `ppt/presentation.xml`.
   */
  constructor(bytes: Uint8Array) {
    this.zip = bytes;
    try {
      this.parts = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/.test(f.name) });
    } catch (error) {
      throw new Error(`not a pptx (a PowerPoint file is a zip): ${(error as Error).message}`);
    }
    if (!this.parts["ppt/presentation.xml"]) throw new Error("not a pptx: it has no ppt/presentation.xml; save it from PowerPoint as .pptx");
  }

  has(part: string): boolean {
    return part in this.parts;
  }

  /** The root element of an XML part. */
  xml(part: string): X {
    const cached = this.parsed.get(part);
    if (cached) return cached;
    const bytes = this.parts[part];
    if (!bytes) throw new Error(`the pptx has no part ${part}`);
    const doc = parser.parse(new TextDecoder().decode(bytes)) as X;
    const root = Object.entries(doc).find(([k]) => !k.startsWith("?"))?.[1]?.[0] as X;
    this.parsed.set(part, root);
    return root;
  }

  /** The relationships of a part, by id, with targets as part paths. */
  rels(part: string): Map<string, Rel> {
    const relsPart = posix.join(posix.dirname(part), "_rels", `${posix.basename(part)}.rels`);
    const out = new Map<string, Rel>();
    if (!this.has(relsPart)) return out;
    for (const rel of all(this.xml(relsPart), "Relationship")) {
      const target = attr(rel, "TargetMode") === "External" ? attr(rel, "Target")! : posix.normalize(posix.join(posix.dirname(part), attr(rel, "Target")!));
      out.set(attr(rel, "Id")!, { type: attr(rel, "Type")!.split("/").pop()!, target: target.replace(/^\//, "") });
    }
    return out;
  }

  /** The first related part of a type (`slideMaster`, `theme`, `slideLayout`). */
  related(part: string, type: string): string | undefined {
    return [...this.rels(part).values()].find((r) => r.type === type)?.target;
  }

  /** The bytes of any part, media included. */
  bytes(part: string): Uint8Array {
    if (this.parts[part]) return this.parts[part]!;
    const found = unzipSync(this.zip, { filter: (f) => f.name === part })[part];
    if (!found) throw new Error(`the pptx has no part ${part}`);
    return found;
  }
}

/** EMU to pt, rounded to 0.1 pt. */
export const pt = (emu: number | undefined): number => Math.round(((emu ?? 0) / 12700) * 10) / 10;
