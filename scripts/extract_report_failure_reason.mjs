import fs from "node:fs";

const logPath = (process.argv[2] || "autorun-output.log").trim();
const outputPath = (process.argv[3] || ".cloudflare-report-failure.json").trim();
const runStatus = String(process.env.RUN_STATUS || "").trim().toLowerCase();
const generatedSuiteReportPath = (
  process.env.GENERATED_SUITE_REPORT_FILE || "generated-scenario-source/generated-scenario-suite-report.json"
).trim();

function writeResult(result) {
  fs.writeFileSync(outputPath, JSON.stringify(result));
  console.log(`Saved failure reason to ${outputPath}: ${JSON.stringify(result)}`);
}

function cleanLine(value) {
  return String(value ?? "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

if (runStatus === "success") {
  writeResult({});
  process.exit(0);
}

if (fs.existsSync(generatedSuiteReportPath)) {
  try {
    const report = JSON.parse(fs.readFileSync(generatedSuiteReportPath, "utf8"));
    const failedDrafts = Array.isArray(report?.drafts)
      ? report.drafts.filter((draft) => String(draft?.status || "").toLowerCase() === "failed")
      : [];
    const firstFailedDraft = failedDrafts[0];
    if (firstFailedDraft) {
      const failedStep = Array.isArray(firstFailedDraft.steps)
        ? firstFailedDraft.steps.find((step) => String(step?.status || "").toLowerCase() === "failed")
        : null;
      const draftId = String(firstFailedDraft.id || firstFailedDraft.scenario || "generated scenario").trim();
      const stepName = String(failedStep?.name || "").trim();
      const stepError = cleanLine(failedStep?.error || firstFailedDraft.firstError || "");

      writeResult({
        code: "generated_suite_failed",
        message: [
          `Generated scenario failed: ${draftId}`,
          stepName ? `step: ${stepName}` : "",
          stepError ? `error: ${stepError}` : ""
        ].filter(Boolean).join("; ")
      });
      process.exit(0);
    }
  } catch (error) {
    console.log(
      `Failed to parse ${generatedSuiteReportPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

if (!fs.existsSync(logPath)) {
  writeResult({
    message: "Run failed, but no autorun log file was found."
  });
  process.exit(0);
}

const raw = fs.readFileSync(logPath, "utf8");
const markerMatches = [...raw.matchAll(/REPORT_REASON:([a-z_]+):([^\r\n]+)/g)];
if (markerMatches.length > 0) {
  const [, code, message] = markerMatches[markerMatches.length - 1];
  writeResult({
    code: String(code || "").trim(),
    message: cleanLine(message)
  });
  process.exit(0);
}

if (/\/join_task returned no-task branch/i.test(raw) || /There are no tasks available now/i.test(raw)) {
  writeResult({
    code: "no_task",
    message: "Bot did not provide a new task."
  });
  process.exit(0);
}

const errorMatches = [...raw.matchAll(/Error:\s*([^\r\n]+)/g)];
const lastErrorMessage = errorMatches.length > 0 ? cleanLine(errorMatches[errorMatches.length - 1][1]) : "";

writeResult(
  lastErrorMessage
    ? { message: lastErrorMessage }
    : { message: "Run failed without a recognized failure reason." }
);
