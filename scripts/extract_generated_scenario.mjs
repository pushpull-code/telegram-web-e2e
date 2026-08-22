#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  return [
    "Usage:",
    "  node scripts/extract_generated_scenario.mjs <generated-scenarios.json> <draft-id> <output-scenario.json>",
    "",
    "Environment:",
    "  GENERATED_SCENARIO_ALLOW_TEST_ACCOUNT=1 allows drafts marked safety=test-account"
  ].join("\n");
}

function fail(message) {
  console.error(message);
  console.error("");
  console.error(usage());
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Could not read JSON from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertDraftBundle(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.drafts)) {
    fail("Input file must be generated-scenarios.json with a drafts array.");
  }
}

function listRunnableDrafts(drafts) {
  return drafts
    .filter((draft) => draft?.runnableNow && draft?.scenario)
    .map((draft) => `${draft.id} (${draft.safety || "unknown"})`)
    .join(", ");
}

const [, , sourcePathInput, draftIdInput, outputPathInput] = process.argv;
if (!sourcePathInput || !draftIdInput || !outputPathInput) {
  fail("Missing required arguments.");
}

const sourcePath = path.resolve(sourcePathInput);
const outputPath = path.resolve(outputPathInput);
const requestedDraftId = draftIdInput.trim();
const allowTestAccount = /^(1|true|yes)$/i.test(process.env.GENERATED_SCENARIO_ALLOW_TEST_ACCOUNT || "");

const bundle = readJson(sourcePath);
assertDraftBundle(bundle);

const draft = bundle.drafts.find((item) => item?.id === requestedDraftId);
if (!draft) {
  fail(`Draft not found: ${requestedDraftId}\nRunnable drafts: ${listRunnableDrafts(bundle.drafts) || "none"}`);
}

if (!draft.runnableNow || !draft.scenario) {
  fail(`Draft is not executable: ${requestedDraftId}\nBlocker: ${draft.blocker || "no scenario object"}`);
}

if (draft.safety === "manual") {
  fail(`Draft requires manual review: ${requestedDraftId}\nBlocker: ${draft.blocker || "manual safety boundary"}`);
}

if (draft.safety === "test-account" && !allowTestAccount) {
  fail(
    [
      `Draft requires a dedicated test account: ${requestedDraftId}`,
      `Blocker: ${draft.blocker || "test-account safety boundary"}`,
      "Set GENERATED_SCENARIO_ALLOW_TEST_ACCOUNT=1 only when the Telegram account is safe to mutate."
    ].join("\n")
  );
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(draft.scenario, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      source: sourcePath,
      output: outputPath,
      draft: draft.id,
      safety: draft.safety,
      scenario: draft.scenario.name,
      steps: Array.isArray(draft.scenario.steps) ? draft.scenario.steps.length : 0
    },
    null,
    2
  )
);
