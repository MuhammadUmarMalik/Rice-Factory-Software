import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the server package.
 *
 * The gate-pass model writes through better-sqlite3, a native module that is
 * safest to exercise from a single worker process, so parallel test files are
 * disabled and the "forks" pool is used (each file gets a real process rather
 * than a worker thread). The schema for the throwaway test database is created
 * by `ensureSchema()` inside the test file, which can shell out to
 * `drizzle-kit push`; the generous hook timeout leaves room for that.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
