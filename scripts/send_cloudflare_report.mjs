import fs from "node:fs";

const callbackUrl = (process.env.CALLBACK_URL || process.env.CALLBACK_URL_FALLBACK || "").trim();
const callbackToken = (process.env.CALLBACK_TOKEN || "").trim();
const chatId = (process.env.CHAT_ID || "").trim();
const lang = (process.env.RUN_LANG || "ru").trim();
const scenarioKey = (process.env.RUN_SCENARIO_KEY || "start_finish").trim();
const status = (process.env.RUN_STATUS || "failure").trim();
const durationSec = Number(process.env.RUN_DURATION_SEC || "0");
const runUrl = (process.env.RUN_URL || "").trim();
const screenshotsFile = (process.env.SCREENSHOTS_FILE || ".cloudflare-report-screenshots.json").trim();
const failureFile = (process.env.FAILURE_FILE || ".cloudflare-report-failure.json").trim();
const generatedSuiteReportFile = (
  process.env.GENERATED_SUITE_REPORT_FILE || "generated-scenario-source/generated-scenario-suite-report.json"
).trim();
const generatedSuiteAiReviewFile = (
  process.env.GENERATED_SUITE_AI_REVIEW_FILE || "generated-scenario-source/generated-scenario-ai-review.json"
).trim();
const maxChunkBase64Chars = Number(process.env.REPORT_CALLBACK_CHUNK_BASE64_MAX || "1500000");
const maxChunkFiles = Number(process.env.REPORT_CALLBACK_CHUNK_FILE_MAX || "4");
const maxGeneratedSuiteDrafts = Number(process.env.REPORT_CALLBACK_GENERATED_SUITE_MAX_DRAFTS || "8");
const maxAiReviewBranches = Number(process.env.REPORT_CALLBACK_AI_REVIEW_BRANCH_MAX || "6");

if (!chatId) {
  console.log("CHAT_ID is empty. Skip callback.");
  process.exit(0);
}

if (!callbackUrl || !callbackToken) {
  console.log("CALLBACK_URL or CALLBACK_TOKEN is missing. Skip callback.");
  process.exit(0);
}

let screenshots = [];
if (fs.existsSync(screenshotsFile)) {
  try {
    const raw = fs.readFileSync(screenshotsFile, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      screenshots = parsed;
    }
  } catch (error) {
    console.log(`Failed to parse ${screenshotsFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let failureCode = "";
let failureMessage = "";
if (fs.existsSync(failureFile)) {
  try {
    const raw = fs.readFileSync(failureFile, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      failureCode = String(parsed.code || "").trim();
      failureMessage = String(parsed.message || "").trim();
    }
  } catch (error) {
    console.log(`Failed to parse ${failureFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function compactText(value, maxLength = 240) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function countStepsByStatus(steps, status) {
  return steps.filter((step) => String(step?.status || "").toLowerCase() === status).length;
}

function readGeneratedSuiteReport() {
  if (!fs.existsSync(generatedSuiteReportFile)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(generatedSuiteReportFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
    const boundedDrafts = drafts.slice(0, Math.max(1, maxGeneratedSuiteDrafts)).map((draft) => {
      const steps = Array.isArray(draft?.steps) ? draft.steps : [];
      return {
        id: compactText(draft?.id, 80),
        status: compactText(draft?.status, 40),
        scenario: compactText(draft?.scenario, 120),
        safety: compactText(draft?.safety, 40),
        source_type: compactText(draft?.sourceType, 80),
        attempts: Number.isFinite(Number(draft?.attempts)) ? Number(draft.attempts) : 0,
        step_count: steps.length,
        passed_steps: countStepsByStatus(steps, "passed"),
        failed_steps: countStepsByStatus(steps, "failed"),
        first_error: compactText(draft?.firstError, 320),
        steps: steps.slice(0, 8).map((step) => ({
          index: Number.isFinite(Number(step?.index)) ? Number(step.index) : 0,
          name: compactText(step?.name, 120),
          status: compactText(step?.status, 40),
          action: compactText(step?.action, 180),
          error: compactText(step?.error, 240)
        })),
        last_tail: Array.isArray(steps.at(-1)?.tail)
          ? steps.at(-1).tail.slice(-2).map((line) => compactText(line, 180)).filter(Boolean)
          : []
      };
    });

    return {
      schema_version: 1,
      report_file: generatedSuiteReportFile,
      suite: parsed.suite || null,
      summary: parsed.summary || null,
      coverage: parsed.coverage || null,
      source_artifacts: Array.isArray(parsed.sourceArtifacts) ? parsed.sourceArtifacts : [],
      draft_count: drafts.length,
      included_draft_count: boundedDrafts.length,
      drafts: boundedDrafts
    };
  } catch (error) {
    console.log(
      `Failed to parse ${generatedSuiteReportFile}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

const generatedSuiteReport = readGeneratedSuiteReport();

function readGeneratedSuiteAiReview() {
  if (!fs.existsSync(generatedSuiteAiReviewFile)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(generatedSuiteAiReviewFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const review = parsed.review && typeof parsed.review === "object" ? parsed.review : {};
    const overview = review.overview && typeof review.overview === "object" ? review.overview : {};
    const nextRun = review.nextRun && typeof review.nextRun === "object" ? review.nextRun : {};

    return {
      schema_version: 1,
      report_file: generatedSuiteAiReviewFile,
      ai: {
        enabled: Boolean(parsed.ai?.enabled),
        provider: compactText(parsed.ai?.provider, 80),
        model: compactText(parsed.ai?.model, 120),
        error: compactText(parsed.ai?.error || parsed.ai?.parseError, 240)
      },
      overview: {
        summary: compactText(overview.summary, 420),
        product_purpose: compactText(overview.productPurpose, 300),
        confidence: compactText(overview.confidence, 40),
        main_flows: Array.isArray(overview.mainFlows)
          ? overview.mainFlows.slice(0, 8).map((line) => compactText(line, 220))
          : []
      },
      defects: Array.isArray(review.defects)
        ? review.defects.slice(0, 6).map((defect) => ({
            title: compactText(defect?.title, 180),
            severity: compactText(defect?.severity, 40),
            evidence: Array.isArray(defect?.evidence)
              ? defect.evidence.slice(0, 4).map((line) => compactText(line, 220))
              : [],
            next_check: compactText(defect?.nextCheck, 220)
          }))
        : [],
      branch_reviews: Array.isArray(review.branchReviews)
        ? review.branchReviews.slice(0, Math.max(1, maxAiReviewBranches)).map((branch) => ({
            draft_id: compactText(branch?.draftId, 100),
            verdict: compactText(branch?.verdict, 40),
            intended_behavior: compactText(branch?.intendedBehavior, 220),
            observed_behavior: compactText(branch?.observedBehavior, 220),
            defects: Array.isArray(branch?.defects)
              ? branch.defects.slice(0, 3).map((line) => compactText(line, 180))
              : [],
            missing_evidence: Array.isArray(branch?.missingEvidence)
              ? branch.missingEvidence.slice(0, 3).map((line) => compactText(line, 180))
              : []
          }))
        : [],
      coverage_gaps: Array.isArray(review.coverageGaps)
        ? review.coverageGaps.slice(0, 8).map((line) => compactText(line, 220))
        : [],
      next_run: {
        recommended_mode: compactText(nextRun.recommendedMode, 160),
        focus_branches: Array.isArray(nextRun.focusBranches)
          ? nextRun.focusBranches.slice(0, 8).map((line) => compactText(line, 160))
          : [],
        runner_changes: Array.isArray(nextRun.runnerChanges)
          ? nextRun.runnerChanges.slice(0, 6).map((line) => compactText(line, 220))
          : []
      },
      telegram_summary: Array.isArray(review.telegramSummary)
        ? review.telegramSummary.slice(0, 8).map((line) => compactText(line, 260))
        : []
    };
  } catch (error) {
    console.log(
      `Failed to parse ${generatedSuiteAiReviewFile}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

const generatedSuiteAiReview = readGeneratedSuiteAiReview();

function reportEnvelope(extra = {}) {
  return {
    chat_id: chatId,
    lang,
    scenario_key: scenarioKey,
    status,
    duration_sec: Number.isFinite(durationSec) && durationSec >= 0 ? Math.floor(durationSec) : 0,
    run_url: runUrl,
    failure_code: failureCode,
    failure_message: failureMessage,
    ...(generatedSuiteReport ? { generated_suite: generatedSuiteReport } : {}),
    ...(generatedSuiteAiReview ? { generated_suite_ai_review: generatedSuiteAiReview } : {}),
    ...extra
  };
}

async function sendPayload(payload) {
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-report-token": callbackToken
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Cloudflare report callback failed: ${response.status} ${text}`);
  }
}

function chunkScreenshots(items) {
  const chunks = [];
  let currentChunk = [];
  let currentBase64Chars = 0;

  for (const item of items) {
    const base64 = String(item?.data_base64 || "");
    if (!base64) {
      continue;
    }

    const nextFileCount = currentChunk.length + 1;
    const nextBase64Chars = currentBase64Chars + base64.length;
    if (
      currentChunk.length > 0 &&
      (nextFileCount > maxChunkFiles || nextBase64Chars > maxChunkBase64Chars)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBase64Chars = 0;
    }

    currentChunk.push(item);
    currentBase64Chars += base64.length;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

await sendPayload(
  reportEnvelope({
    phase: "summary",
    screenshot_count: screenshots.length
  })
);

const screenshotChunks = chunkScreenshots(screenshots);
for (let index = 0; index < screenshotChunks.length; index += 1) {
  await sendPayload(
    reportEnvelope({
      phase: "screenshots",
      chunk_index: index,
      chunk_count: screenshotChunks.length,
      screenshots: screenshotChunks[index]
    })
  );
}

await sendPayload(
  reportEnvelope({
    phase: "finish",
    screenshot_count: screenshots.length
  })
);

console.log(`Cloudflare report callback sent in ${screenshotChunks.length + 2} request(s).`);
