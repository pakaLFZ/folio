import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

// isolate: false lets each worker import and transform a module once for all its test files instead of once per
// file (import time summed over files fell from 138 s to 8 s on 64 cores); no test leaves global state behind.
// At most 8 workers: every worker transforms the sources again, and beyond 8 that costs more than it shares.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    isolate: false,
    maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
  },
});
