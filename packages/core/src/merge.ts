/** The deep merge every override and style refinement uses. */

export const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Deep merge for overrides.
 *
 * @param base - the template's value.
 * @param over - the override; `undefined` leaves the base.
 * @returns objects merged key by key; arrays, scalars and `null` in `over`
 *   replace the base. Neither input is changed.
 */
export function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return over as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = deepMerge(out[key], value);
  return out as T;
}
