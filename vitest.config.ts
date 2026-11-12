import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 테스트는 test-mysql(:3307)의 tutoring_test만 쓴다. src/test/test-db.ts 참고
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
