import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { runScenario, type ScenarioDefinition } from "./helpers/scenario-runner";

type GeneratedScenarioSuiteDraft = {
  id: string;
  safety: "safe" | "test-account";
  reason: string;
  scenario: ScenarioDefinition;
};

type GeneratedScenarioSuite = {
  schemaVersion: 1;
  name: string;
  selector: string;
  drafts: GeneratedScenarioSuiteDraft[];
};

function resolveSuitePath(input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
}

function assertGeneratedScenarioSuite(value: unknown): asserts value is GeneratedScenarioSuite {
  if (!value || typeof value !== "object") {
    throw new Error("Generated scenario suite file must contain a JSON object.");
  }

  const candidate = value as Partial<GeneratedScenarioSuite>;
  if (candidate.schemaVersion !== 1) {
    throw new Error("Generated scenario suite must contain schemaVersion=1.");
  }
  if (!candidate.name || typeof candidate.name !== "string") {
    throw new Error("Generated scenario suite must contain string field: name.");
  }
  if (!Array.isArray(candidate.drafts) || candidate.drafts.length === 0) {
    throw new Error("Generated scenario suite must contain non-empty array field: drafts.");
  }

  for (const [index, draft] of candidate.drafts.entries()) {
    if (!draft || typeof draft !== "object") {
      throw new Error(`Generated scenario suite draft #${index + 1} must be an object.`);
    }
    if (!draft.id || typeof draft.id !== "string") {
      throw new Error(`Generated scenario suite draft #${index + 1} must contain string field: id.`);
    }
    if (!draft.scenario || typeof draft.scenario !== "object") {
      throw new Error(`Generated scenario suite draft #${index + 1} must contain scenario object.`);
    }
    if (!draft.scenario.name || typeof draft.scenario.name !== "string") {
      throw new Error(`Generated scenario suite draft #${index + 1} scenario must contain string field: name.`);
    }
    if (!Array.isArray(draft.scenario.steps) || draft.scenario.steps.length === 0) {
      throw new Error(`Generated scenario suite draft #${index + 1} scenario must contain non-empty steps.`);
    }
  }
}

function loadGeneratedScenarioSuite(): GeneratedScenarioSuite {
  const suitePath = resolveSuitePath(process.env.GENERATED_SCENARIO_SUITE_FILE || ".generated-scenario-suite.json");
  const parsed = JSON.parse(fs.readFileSync(suitePath, "utf8")) as unknown;
  assertGeneratedScenarioSuite(parsed);
  return parsed;
}

const suite = loadGeneratedScenarioSuite();

test.use({
  trace: "on",
  screenshot: "on",
  video: "on"
});

test.describe(`Generated scenario suite: ${suite.name}`, () => {
  for (const draft of suite.drafts) {
    test(`${draft.id}: ${draft.scenario.name}`, async ({ page }, testInfo) => {
      testInfo.annotations.push({
        type: "generated-draft",
        description: `${draft.safety}: ${draft.reason}`
      });
      test.setTimeout(draft.scenario.timeoutMs ?? 10 * 60_000);

      const result = await runScenario(page, testInfo, draft.scenario);
      if (result.failures.length > 0) {
        throw new Error(`Scenario failed:\n${result.failures.join("\n")}`);
      }
    });
  }
});
