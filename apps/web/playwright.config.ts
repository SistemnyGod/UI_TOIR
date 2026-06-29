import { defineConfig, devices } from "@playwright/test";

const useExternalWebServer = process.env.PATROL360_E2E_EXTERNAL_SERVER === "true";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5176";
const previewPort = new URL(baseURL).port || "5176";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  outputDir: "test-results",
  reporter: process.env.CI
    ? [
        ["list"],
        ["junit", { outputFile: "test-results/playwright-junit.xml" }],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : "list",
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  ...(useExternalWebServer
    ? {}
    : {
        webServer: {
          command: `npm run build && node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${previewPort} --strictPort --configLoader runner`,
          reuseExistingServer: false,
          url: baseURL,
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
