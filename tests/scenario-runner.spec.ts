import { test } from "@playwright/test";
import { loadScenarioFromEnv, runScenario } from "./helpers/scenario-runner";

const scenario = loadScenarioFromEnv();

test.use({
  trace: "on",
  screenshot: "on",
  video: "on"
});

test.describe.serial("Telegram bot scenario runner", () => {
  test(scenario.name, async ({ page }, testInfo) => {
    test.setTimeout(scenario.timeoutMs ?? 10 * 60_000);

    const result = await runScenario(page, testInfo, scenario);
    if (result.failures.length > 0) {
      throw new Error(`Scenario failed:\n${result.failures.join("\n")}`);
    }
  });
});
