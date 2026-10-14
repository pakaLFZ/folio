/**
 * A hook's inputs against its JSON Schema: every failure named by its JSON
 * Pointer and worded so an agent can fix it in one try, saying what is
 * allowed (the keys, the type with an example, the values), not only what is
 * wrong. An example of a whole input is made from the same schema.
 */
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

type Schema = { type?: string; enum?: unknown[]; properties?: Record<string, unknown>; required?: string[]; items?: unknown; minItems?: number };

/**
 * An example of a hook's inputs, made from its JSON Schema.
 *
 * @param schema - the `inputs` schema.
 * @returns a value with every required property filled by a placeholder of its type.
 */
export function exampleOf(schema: unknown): unknown {
  const s = (schema ?? {}) as Schema;
  if (s.enum?.length) return s.enum[0];
  if (s.type === "object" || s.properties) return Object.fromEntries((s.required ?? []).map((k) => [k, exampleOf(s.properties?.[k])]));
  if (s.type === "array") return Array.from({ length: Math.max(1, s.minItems ?? 1) }, (_, i) => (typeof exampleOf(s.items) === "number" ? i : exampleOf(s.items)));
  if (s.type === "number" || s.type === "integer") return 0;
  if (s.type === "boolean") return false;
  return "";
}

const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
const compiled = new Map<string, ValidateFunction>();

/**
 * Validate hook inputs against the hook's schema.
 *
 * @param schema - the `inputs` JSON Schema from `hook.json`.
 * @param inputs - what the slide gives.
 * @returns one issue per failure, with the JSON Pointer of the bad key and a
 *   reason that names what is allowed there; empty when the inputs are valid.
 */
export function validateHookInputs(schema: object, inputs: unknown): { jsonPath: string; reason: string }[] {
  const id = JSON.stringify(schema);
  let validate = compiled.get(id);
  if (!validate) {
    validate = ajv.compile(schema);
    compiled.set(id, validate);
  }
  if (validate(inputs)) return [];
  return (validate.errors ?? []).map(hookInputIssue);
}

const example = (schema: unknown) => JSON.stringify(exampleOf(schema));

/** One Ajv error as a path and a reason that says what is allowed. */
function hookInputIssue(e: ErrorObject): { jsonPath: string; reason: string } {
  const parent = (e.parentSchema ?? {}) as Schema;
  const keys = Object.keys(parent.properties ?? {});
  const where = e.instancePath ? "a key here" : "an input of this hook";
  if (e.keyword === "additionalProperties") {
    const key = (e.params as { additionalProperty: string }).additionalProperty;
    return { jsonPath: `${e.instancePath}/${key}`, reason: `"${key}" is not ${where}; allowed: ${keys.join(", ") || "none"}` };
  }
  if (e.keyword === "required") {
    const key = (e.params as { missingProperty: string }).missingProperty;
    return { jsonPath: `${e.instancePath}/${key}`, reason: `"${key}" is required, e.g. ${example(parent.properties?.[key])}` };
  }
  const reasons: Record<string, () => string> = {
    type: () => `must be ${(e.params as { type: string }).type}, e.g. ${example(parent)}`,
    enum: () => `must be one of ${(parent.enum ?? []).map((v) => JSON.stringify(v)).join(", ")}`,
    minItems: () => `${e.message}, e.g. ${example(parent)}`,
  };
  return { jsonPath: e.instancePath || "/", reason: reasons[e.keyword]?.() ?? e.message ?? e.keyword };
}
