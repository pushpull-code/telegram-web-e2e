#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  return [
    "Usage:",
    "  node scripts/build_generated_scenario_suite_report.mjs <scenario-suite.json> <test-results-dir> <output-report.md>",
    "",
    "Writes a readable Markdown report and a matching .json file next to it."
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

function assertSuite(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 || !Array.isArray(value.drafts)) {
    fail("Scenario suite file must contain schemaVersion=1 and a drafts array.");
  }
}

function walkFiles(dir, predicate, result = []) {
  if (!fs.existsSync(dir)) {
    return result;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, predicate, result);
      continue;
    }
    if (entry.isFile() && predicate(entryPath)) {
      result.push(entryPath);
    }
  }

  return result;
}

function normalizeScenarioDirName(name) {
  return name.startsWith("scenario-") ? name.slice("scenario-".length) : name;
}

function normalizePathForReport(filePath) {
  return filePath.split(path.sep).join("/");
}

function cleanLine(value, maxLength = 220) {
  const text = String(value ?? "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function readReportEntry(reportPath, outputDir) {
  const report = readJson(reportPath);
  const scenario = normalizeScenarioDirName(path.basename(path.dirname(reportPath)));
  const steps = Array.isArray(report.steps) ? report.steps : [];
  const hasFailedStep = steps.some((step) => step?.status === "failed");
  const hasPassedStep = steps.some((step) => step?.status === "passed");
  const status = hasFailedStep ? "failed" : hasPassedStep ? "passed" : "unknown";

  return {
    scenario,
    reportPath,
    reportRelativePath: normalizePathForReport(path.relative(outputDir, reportPath)),
    status,
    generatedAt: report.generatedAt || null,
    steps: steps.map((step) => {
      const screenshotPath = step?.screenshot
        ? path.join(path.dirname(reportPath), step.screenshot)
        : null;
      return {
        index: Number(step?.index) || 0,
        name: cleanLine(step?.name || "step", 140),
        status: step?.status || "unknown",
        action: cleanLine(step?.action || "", 220),
        error: step?.error ? cleanLine(step.error, 500) : "",
        screenshot: screenshotPath && fs.existsSync(screenshotPath)
          ? normalizePathForReport(path.relative(outputDir, screenshotPath))
          : "",
        tail: Array.isArray(step?.tail)
          ? step.tail.slice(-4).map((line) => cleanLine(line, 220)).filter(Boolean)
          : []
      };
    })
  };
}

function rankReport(entry) {
  if (entry.status === "passed") {
    return 3;
  }
  if (entry.status === "failed") {
    return 2;
  }
  return 1;
}

function buildReportIndex(resultsDir, outputDir) {
  const reportFiles = walkFiles(resultsDir, (filePath) => path.basename(filePath) === "report.json");
  const reportsByScenario = new Map();

  for (const reportPath of reportFiles) {
    const entry = readReportEntry(reportPath, outputDir);
    const entries = reportsByScenario.get(entry.scenario) || [];
    entries.push(entry);
    reportsByScenario.set(entry.scenario, entries);
  }

  return reportsByScenario;
}

function chooseReport(entries) {
  if (!entries || entries.length === 0) {
    return null;
  }

  return [...entries].sort((left, right) => {
    const rankDiff = rankReport(right) - rankReport(left);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return (right.steps?.length || 0) - (left.steps?.length || 0);
  })[0];
}

function statusForDraft(chosenReport, attempts) {
  if (!chosenReport) {
    return "not_run";
  }
  const hadFailedAttempt = attempts.some((entry) => entry.status === "failed");
  if (chosenReport.status === "passed" && hadFailedAttempt) {
    return "flaky";
  }
  return chosenReport.status;
}

function markdownStatus(status) {
  if (status === "passed") {
    return "passed";
  }
  if (status === "flaky") {
    return "flaky";
  }
  if (status === "failed") {
    return "failed";
  }
  return "not run";
}

function buildDraftResults(suite, reportsByScenario) {
  return suite.drafts.map((draft) => {
    const scenarioName = draft?.scenario?.name || "";
    const attempts = reportsByScenario.get(scenarioName) || [];
    const chosenReport = chooseReport(attempts);
    const status = statusForDraft(chosenReport, attempts);

    return {
      id: draft.id,
      safety: draft.safety,
      reason: draft.reason || "",
      sourceType: draft.source?.type || "",
      scenario: scenarioName,
      status,
      attempts: attempts.length,
      reportPath: chosenReport?.reportRelativePath || "",
      steps: chosenReport?.steps || [],
      firstError: chosenReport?.steps.find((step) => step.status === "failed")?.error || ""
    };
  });
}

function countByStatus(draftResults, status) {
  return draftResults.filter((draft) => draft.status === status).length;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function existingSourceArtifacts(sourceDirs) {
  return [
    "scenario-suite.json",
    "generated-scenarios.json",
    "generated-test-plan.json",
    "qa-report.md",
    "telegram-summary.txt",
    "web-target-audits.json",
    "bot-map.enriched.json",
    "bot-map.json"
  ].filter((artifact) =>
    sourceDirs.some((sourceDir) => fs.existsSync(path.join(sourceDir, artifact)))
  );
}

function buildMarkdown(payload) {
  const lines = [
    "# Generated Scenario Suite Report",
    "",
    `Generated: ${payload.generatedAtIso}`,
    `Suite: ${payload.suite.name}`,
    `Selector: ${payload.suite.selector}`,
    `Bot: ${payload.suite.bot || "unknown"}`,
    "",
    "## Summary",
    "",
    `- Drafts selected: ${payload.summary.total}`,
    `- Passed: ${payload.summary.passed}`,
    `- Flaky: ${payload.summary.flaky}`,
    `- Failed: ${payload.summary.failed}`,
    `- Not run: ${payload.summary.notRun}`,
    ""
  ];

  if (payload.sourceArtifacts.length > 0) {
    lines.push("## Source Artifacts", "");
    for (const artifact of payload.sourceArtifacts) {
      lines.push(`- ${artifact}`);
    }
    lines.push("");
  }

  if (payload.coverage) {
    lines.push("## Coverage", "");
    lines.push(`- Drafts discovered: ${Number(payload.coverage.discovered) || 0}`);
    lines.push(`- Selected before limit: ${Number(payload.coverage.selectedBeforeLimit) || 0}`);
    lines.push(`- Selected for run: ${Number(payload.coverage.selected) || 0}`);
    lines.push(`- Runnable safe: ${Number(payload.coverage.runnableSafe) || 0}`);
    lines.push(`- Runnable test-account: ${Number(payload.coverage.runnableTestAccount) || 0}`);
    lines.push(`- Manual/not runnable: ${Number(payload.coverage.manual) || 0}/${Number(payload.coverage.notRunnable) || 0}`);
    if (Number(payload.coverage.limitedOut) > 0) {
      lines.push(`- Limited out by maxDrafts: ${Number(payload.coverage.limitedOut)}`);
    }
    lines.push("");
  }

  lines.push("## Branch Results", "");
  for (const draft of payload.drafts) {
    lines.push(`### ${draft.id}`);
    lines.push(`- Status: ${markdownStatus(draft.status)}`);
    lines.push(`- Scenario: ${draft.scenario || "unknown"}`);
    lines.push(`- Safety: ${draft.safety || "unknown"}`);
    if (draft.sourceType) {
      lines.push(`- Source: ${draft.sourceType}`);
    }
    if (draft.reason) {
      lines.push(`- Purpose: ${cleanLine(draft.reason, 220)}`);
    }
    if (draft.attempts > 0) {
      lines.push(`- Attempts: ${draft.attempts}`);
    }
    if (draft.reportPath) {
      lines.push(`- Report: ${draft.reportPath}`);
    }
    if (draft.firstError) {
      lines.push(`- First error: ${cleanLine(draft.firstError, 260)}`);
    }

    if (draft.steps.length > 0) {
      lines.push("- Steps:");
      for (const step of draft.steps) {
        const action = step.action ? `; ${step.action}` : "";
        lines.push(`  - ${step.index}. ${step.name}: ${step.status}${action}`);
        if (step.error) {
          lines.push(`    Error: ${cleanLine(step.error, 260)}`);
        }
        if (step.screenshot) {
          lines.push(`    Screenshot: ${step.screenshot}`);
        }
      }
    }

    const tail = draft.steps.at(-1)?.tail || [];
    if (tail.length > 0) {
      lines.push("- Last visible bot/chat tail:");
      for (const line of tail.slice(-3)) {
        lines.push(`  - ${line}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

const [, , suitePathInput, resultsDirInput, outputPathInput] = process.argv;
if (!suitePathInput || !resultsDirInput || !outputPathInput) {
  fail("Missing required arguments.");
}

const suitePath = path.resolve(suitePathInput);
const resultsDir = path.resolve(resultsDirInput);
const outputPath = path.resolve(outputPathInput);
const outputDir = path.dirname(outputPath);

const suite = readJson(suitePath);
assertSuite(suite);

const reportsByScenario = buildReportIndex(resultsDir, outputDir);
const draftResults = buildDraftResults(suite, reportsByScenario);
const sourceArtifacts = existingSourceArtifacts(uniqueValues([path.dirname(suitePath), outputDir]));

const payload = {
  schemaVersion: 1,
  generatedAtIso: new Date().toISOString(),
  suite: {
    name: suite.name || "",
    selector: suite.selector || "",
    bot: suite.source?.bot || null,
    startPayload: suite.source?.startPayload || null,
    aiEnabled: suite.source?.aiEnabled ?? null,
    aiModel: suite.source?.aiModel ?? null
  },
  summary: {
    total: draftResults.length,
    passed: countByStatus(draftResults, "passed"),
    flaky: countByStatus(draftResults, "flaky"),
    failed: countByStatus(draftResults, "failed"),
    notRun: countByStatus(draftResults, "not_run")
  },
  coverage: suite.coverage || null,
  sourceArtifacts,
  drafts: draftResults
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, buildMarkdown(payload), "utf8");

const jsonPath = outputPath.replace(/\.md$/i, ".json");
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: outputPath,
      jsonOutput: jsonPath,
      summary: payload.summary,
      drafts: payload.drafts.map((draft) => ({
        id: draft.id,
        scenario: draft.scenario,
        status: draft.status,
        steps: draft.steps.length
      }))
    },
    null,
    2
  )
);
