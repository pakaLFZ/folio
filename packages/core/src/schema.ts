/**
 * The slide spec: a json-render flat spec whose root element is one layout.
 *
 * `{"root": "s", "elements": {"s": {"type": "<layout>", "props": {...}, "children": []}}}`
 * The props are the slot contents keyed by slot name, plus `background`.
 */
import { defineSchema, type PromptTemplate } from "@json-render/core";
import { z } from "zod";

/** A hooked figure: the hook draws the picture from these inputs. */
export const hookFigureSchema = z.object({
  hook: z.string(),
  inputs: z.record(z.string(), z.unknown()),
});
export type HookFigure = z.infer<typeof hookFigureSchema>;

/** A figure slot holds a file path relative to the deck, a hook call, or nothing. */
export const figureValueSchema = z.union([z.string(), hookFigureSchema]).nullable();
export type FigureValue = z.infer<typeof figureValueSchema>;

/** One slide file as stored at `decks/<deck>/slides/<id>.json`. */
export const slideSpecSchema = z.object({
  root: z.string(),
  elements: z.record(
    z.string(),
    z.object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()),
      children: z.array(z.string()).default([]),
    }),
  ),
});
export type SlideSpec = z.infer<typeof slideSpecSchema>;

/** The root element of a slide spec, which is the layout instance. */
export interface SlideRoot {
  layout: string;
  props: Record<string, unknown>;
}

/**
 * Read the layout name and slot contents from a slide spec.
 *
 * @param spec - a parsed slide spec.
 * @returns the root element's type and props, or null when `root` names no element.
 */
export function slideRoot(spec: SlideSpec): SlideRoot | null {
  const element = spec.elements[spec.root];
  return element ? { layout: element.type, props: element.props } : null;
}

/**
 * Build a slide spec for a layout.
 *
 * @param layout - the layout name, the root element's type.
 * @param props - the slot contents.
 * @returns a spec with root key `s`. Used by `folio new` and by tests.
 */
export function makeSlideSpec(layout: string, props: Record<string, unknown>): SlideSpec {
  return { root: "s", elements: { s: { type: layout, props, children: [] } } };
}

/**
 * Create the folio json-render schema with a prompt template.
 *
 * @param promptTemplate - the generator used by `catalog.prompt()`.
 * @returns a json-render `Schema` whose catalog holds one component per layout.
 */
export function defineSlideSchema(promptTemplate: PromptTemplate) {
  return defineSchema(
    (s) => ({
      spec: s.object({
        root: s.string(),
        elements: s.record(
          s.object({
            type: s.ref("catalog.components"),
            props: s.propsOf("catalog.components"),
            children: s.array(s.string()),
          }),
        ),
      }),
      catalog: s.object({
        components: s.map({ props: s.zod(), description: s.string() }),
      }),
    }),
    { promptTemplate },
  );
}

/**
 * Slot contents with a layout's aliases applied, so a slide written for one
 * pack renders in another whose slots have other names.
 *
 * @param props - the slide's props.
 * @param aliases - `{nameInTheSlide: slotInThisLayout}` from the layout.
 * @returns props with each aliased name moved to its slot name;
 *   a slot the slide sets itself wins over an alias.
 */
export function resolveAliases(props: Record<string, unknown>, aliases: Record<string, string>): Record<string, unknown> {
  const out = { ...props };
  for (const [from, to] of Object.entries(aliases)) {
    if (from in props && !(to in props)) out[to] = props[from];
    delete out[from];
  }
  return out;
}
