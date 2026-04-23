import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mujoco/mujoco": path.resolve(
        __dirname,
        "src/vendor/mujoco-mujoco.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
  },
});
