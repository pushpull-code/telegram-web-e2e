#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const OBSERVED_EVIDENCE = "observed exact command mention";

function usage() {
  return [
    "Usage:",
    "  node scripts/extract_generated_scenario_suite.mjs <generated-scenarios.json> <selector> <output-suite.json>",
    "",
    "Selectors:",
    "  safe                 runnable safe drafts with observed evidence only",
    "  all-safe             all runnable safe drafts",
    "  runnable             safe drafts plus test-account drafts when explicitly allowed",
    "  dev                  all executable drafts for a dedicated dev/test bot",
    "  draft-a,draft-b      explicit draft ids",
    "",
    "Environment:",
    "  GENERATED_SCENARIO_ALLOW_TEST_ACCOUNT=1 allows drafts marked safety=test-account",
    "  GENERATED_SCENARIO_ALLOW_UNSAFE_BUTTONS=1 allows generated manual button paths to become executable before extraction",
    "  GENERATED_SCENARIO_MAX_DRAFTS=4 limits selected drafts"
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

function isExecutableDraft(draft) {
  return Boolean(draft?.runnableNow && draft?.scenario && draft.safety !== "manual");
}

function isObservedSafeDraft(draft) {
  if (!isExecutableDraft(draft) || draft.safety !== "safe") {
    return false;
  }

  const sourceType = draft.source?.type || "";
  const evidence = Array.isArray(draft.source?.evidence) ? draft.source.evidence : [];
  return sourceType === "start" || sourceType === "button-path" || evidence.includes(OBSERVED_EVIDENCE);
}

function selectedByExplicitIds(drafts, ids, allowTestAccount) {
  return ids.map((id) => {
    const draft = drafts.find((item) => item?.id === id);
    if (!draft) {
      fail(`Draft not found: ${id}`);
    }
    if (!isExecutableDraft(draft)) {
      fail(`Draft is not executable: ${id}\nBlocker: ${draft.blocker || "no scenario object"}`);
    }
    if (draft.safety === "test-account" && !allowTestAccount) {
      fail(
        [
          `Draft requires a dedicated test account: ${id}`,
          `Blocker: ${draft.blocker || "test-account safety boundary"}`,
          "Set GENERATED_SCENARIO_ALLOW_TEST_ACCOUNT=1 only when the Telegram account is safe to mutate."
        ].join("\n")
      );
    }
    return draft;
  });
}

function uniqueDrafts(drafts) {
  const seen = new Set();
  const result = [];
  for (const draft of drafts) {
    if (seen.has(draft.id)) {
      continue;
    }
    seen.add(draft.id);
    result.push(draft);
  }
  return result;
}

function countDrafts(drafts, predicate) {
  return drafts.filter((draft) => {
    try {
      return predicate(draft);
    } catch {
      return false;
    }
  }).length;
}

function countBySourceType(drafts) {
  const counts = {};
  for (const draft of drafts) {
    const sourceType = String(draft?.source?.type || "unknown").trim() || "unknown";
    counts[sourceType] = (counts[sourceType] || 0) + 1;
  }
  return counts;
}

function buildCoverage(drafts, selectedBeforeLimit, selectedAfterLimit, selector, maxDrafts, allowTestAccount) {
  return {
    selector: selector || "safe",
    maxDrafts,
    allowTestAccount,
    discovered: drafts.length,
    selectedBeforeLimit: selectedBeforeLimit.length,
    selected: selectedAfterLimit.length,
    limitedOut: Math.max(0, selectedBeforeLimit.length - selectedAfterLimit.length),
    runnable: countDrafts(drafts, isExecutableDraft),
    runnableSafe: countDrafts(drafts, (draft) => isExecutableDraft(draft) && draft.safety === "safe"),
    runnableTestAccount: countDrafts(drafts, (draft) => isExecutableDraft(draft) && draft.safety === "test-account"),
    manual: countDrafts(drafts, (draft) => draft?.safety === "manual"),
    notRunnable: countDrafts(drafts, (draft) => !isExecutableDraft(draft)),
    bySourceType: countBySourceType(drafts)
  };
}

function selectDrafts(bundle, selector, allowTestAccount) {
  const drafts = bundle.drafts.filter(Boolean);
  const normalized = (selector || "safe").trim();
  const devMode = normalized === "dev" || normalized === "unsafe";
  const canRunTestAccount = allowTestAccount || devMode;

  if (!normalized || normalized === "safe") {
    return drafts.filter(isObservedSafeDraft);
  }

  if (normalized === "all-safe") {
    return drafts.filter((draft) => isExecutableDraft(draft) && draft.safety === "safe");
  }

  if (normalized === "runnable") {
    return drafts.filter(
      (draft) =>
        isExecutableDraft(draft) &&
        (draft.safety === "safe" || (draft.safety === "test-account" && canRunTestAccount))
    );
  }

  if (devMode) {
    return drafts.filter((draft) => isExecutableDraft(draft));
  }

  const explicitIds = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (explicitIds.length === 0) {
    fail("Selector did not resolve to any draft ids.");
  }

  return selectedByExplicitIds(drafts, explicitIds, allowTestAccount);
}

const [, , sourcePathInput, selectorInput = "safe", outputPathInput] = process.argv;
if (!sourcePathInput || !outputPathInput) {
  fail("Missing required arguments.");
}

const sourcePath = path.resolve(sourcePathInput);
const outputPath = path.resolve(outputPathInput);
const allowTestAccount = /^(1|true|yes)$/i.test(process.env.GENERATED_SCENARIO_ALLOW_TEST_ACCOUNT || "");
const effectiveAllowTestAccount = allowTestAccount || selectorInput === "dev" || selectorInput === "unsafe";
const maxDrafts = Math.max(1, Number(process.env.GENERATED_SCENARIO_MAX_DRAFTS || "4"));

const bundle = readJson(sourcePath);
assertDraftBundle(bundle);

const drafts = bundle.drafts.filter(Boolean);
const selectedBeforeLimit = uniqueDrafts(selectDrafts(bundle, selectorInput, effectiveAllowTestAccount));
const selected = selectedBeforeLimit.slice(0, maxDrafts);
if (selected.length === 0) {
  fail(`No executable drafts selected by selector: ${selectorInput || "safe"}`);
}

const suite = {
  schemaVersion: 1,
  generatedAtIso: new Date().toISOString(),
  name: `generated-scenario-suite-${selectorInput || "safe"}`,
  selector: selectorInput || "safe",
  maxDrafts,
  source: {
    generatedScenariosPath: sourcePath,
    bot: bundle.bot || null,
    startPayload: bundle.startPayload || null,
    aiEnabled: bundle.source?.aiEnabled ?? null,
    aiModel: bundle.source?.aiModel ?? null
  },
  coverage: buildCoverage(drafts, selectedBeforeLimit, selected, selectorInput, maxDrafts, effectiveAllowTestAccount),
  drafts: selected.map((draft) => ({
    id: draft.id,
    safety: draft.safety,
    reason: draft.reason,
    source: draft.source,
    scenario: draft.scenario
  }))
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(suite, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      source: sourcePath,
      output: outputPath,
      selector: selectorInput || "safe",
      coverage: suite.coverage,
      selected: suite.drafts.map((draft) => ({
        id: draft.id,
        safety: draft.safety,
        scenario: draft.scenario.name,
        steps: Array.isArray(draft.scenario.steps) ? draft.scenario.steps.length : 0
      }))
    },
    null,
    2
  )
);
