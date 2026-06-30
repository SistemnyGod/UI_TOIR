import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const devServerPort = parsePort(process.env.PATROL360_WEB_DEV_PORT, 5174);

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default defineConfig({
  root: appRoot,
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");

          if (normalizedId.includes("/node_modules/")) {
            return "vendor";
          }

          if (
            normalizedId.includes("/src/app/") ||
            normalizedId.includes("/src/shared/") ||
            normalizedId.includes("/src/api/") ||
            normalizedId.includes("/src/security/") ||
            normalizedId.includes("/src/repositories/browserStorageRepository") ||
            normalizedId.includes("/src/repositories/resultsRepository") ||
            normalizedId.includes("/src/data.ts") ||
            normalizedId.includes("/src/types.ts") ||
            normalizedId.includes("/src/hooks/useAssignmentsWorkspace") ||
            normalizedId.includes("/src/hooks/useHashScreen") ||
            normalizedId.includes("/src/hooks/useMobileAccountsWorkspace") ||
            normalizedId.includes("/src/hooks/usePatrolDataSource") ||
            normalizedId.includes("/src/hooks/usePatrolWorkspaceData") ||
            normalizedId.includes("/src/hooks/useResultsWorkspace") ||
            normalizedId.includes("/src/hooks/useRoutesEditor") ||
            normalizedId.includes("/src/hooks/useSchedulePlanning") ||
            normalizedId.includes("/src/hooks/useSession") ||
            normalizedId.includes("/src/hooks/useSiteUsersWorkspace") ||
            normalizedId.includes("/src/hooks/useStoredState") ||
            normalizedId.includes("/src/hooks/useSystemNotifications") ||
            normalizedId.includes("/src/hooks/useToast")
          ) {
            return "app-core";
          }

          if (
            normalizedId.includes("/src/screens/InventoryScreen") ||
            normalizedId.includes("/src/features/inventory/") ||
            normalizedId.includes("/src/repositories/inventoryRepository")
          ) {
            return "inventory";
          }

          if (
            normalizedId.includes("/src/screens/ResultsScreen") ||
            normalizedId.includes("/src/features/patrol/ResultsScreen") ||
            normalizedId.includes("/src/repositories/resultsRepository") ||
            normalizedId.includes("/src/hooks/useResultsWorkspace")
          ) {
            return "patrol-results";
          }

          if (
            normalizedId.includes("/src/screens/EmuScreen") ||
            normalizedId.includes("/src/screens/emu/") ||
            normalizedId.includes("/src/features/emu/") ||
            normalizedId.includes("/src/hooks/useEmuWorkspace") ||
            normalizedId.includes("/src/repositories/emuRepository") ||
            normalizedId.includes("/src/domain/emu")
          ) {
            return "emu";
          }

          if (
            normalizedId.includes("/src/screens/PercoIntegrationScreen") ||
            normalizedId.includes("/src/features/perco/") ||
            normalizedId.includes("/src/repositories/percoRepository")
          ) {
            return "perco";
          }

          return undefined;
        },
      },
    },
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: devServerPort,
    strictPort: true,
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
