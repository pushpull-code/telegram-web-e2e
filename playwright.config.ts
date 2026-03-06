import { defineConfig, devices } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.TELEGRAM_WEB_URL || "https://web.telegram.org/k/",
    actionTimeout: 20_000,
    navigationTimeout: 65_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 }
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile
      },
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/
    }
  ]
});
