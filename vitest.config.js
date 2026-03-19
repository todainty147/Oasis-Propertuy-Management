import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      globals: true,
      include: ["tests/**/*.test.js"],
      exclude: ["tests/integration/**/*.test.js"],
      coverage: {
        reporter: ["text", "html"],
      },
    },
  }),
);
