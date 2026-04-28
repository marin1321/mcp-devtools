import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts", "src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "tests/fixtures/**"],
    globalSetup: ["tests/fixtures/seed-sqlite.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/index.ts", "src/types/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
