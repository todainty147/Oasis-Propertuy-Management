import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      globals: true,
      include: ["tests/integration/**/*.test.js", "e170-suite/integration/**/*.test.js"],
      testTimeout: 30000,
      hookTimeout: 30000,
      fileParallelism: false,
      maxWorkers: 1,
    },
  }),
);
