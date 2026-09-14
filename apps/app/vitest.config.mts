import { defineConfig } from "vitest/config";

// Nur die reine Logik unter test/ — keine Komponenten, kein React Native.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
