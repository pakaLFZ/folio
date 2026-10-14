/**
 * The json-render registry of a pack: every layout name maps to `LayoutView`.
 * Built from the pack at run time, as the catalog is, so a new pack needs no code.
 */
import { buildCatalog, type Pack } from "@folio/core";
import { defineRegistry } from "@json-render/react";
import { LayoutView } from "./LayoutView";
import { RenderBoundary } from "./RenderBoundary";

const cache = new Map<string, ReturnType<typeof makeRegistry>>();

/**
 * Create the registry for one pack.
 *
 * @param pack - the pack.
 * @returns the json-render registry.
 */
function makeRegistry(pack: Pack) {
  const catalog = buildCatalog(pack);
  const components = Object.fromEntries(
    Object.keys(pack.layouts).map((name) => [
      name,
      ({ props }: { props: Record<string, unknown> }) => (
        <RenderBoundary resetKey={props}>
          <LayoutView layout={name} props={props} />
        </RenderBoundary>
      ),
    ]),
  );
  return defineRegistry(catalog as never, { components } as never).registry;
}

/**
 * The registry for a pack, cached per pack version.
 *
 * @param pack - the pack.
 * @returns the json-render registry.
 */
export function registryOf(pack: Pack) {
  const key = `${pack.name}@${pack.version}:${Object.keys(pack.layouts).join(",")}`;
  let registry = cache.get(key);
  if (!registry) {
    registry = makeRegistry(pack);
    cache.set(key, registry);
  }
  return registry;
}
