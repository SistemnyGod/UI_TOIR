import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");

          if (normalizedId.includes("/node_modules/")) {
            return "vendor";
          }

          if (
            normalizedId.includes("/src/screens/InventoryScreen") ||
            normalizedId.includes("/src/repositories/inventoryRepository")
          ) {
            return "inventory";
          }

          return undefined;
        },
      },
    },
  },
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["localhost", "127.0.0.1", "192.168.2.194"],
    proxy: {
      "/api": "http://localhost:5080",
      "/health": "http://localhost:5080"
    }
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"]
  }
});
