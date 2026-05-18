import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:5176",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5176 --strictPort",
    reuseExistingServer: false,
    url: "http://127.0.0.1:5176",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
