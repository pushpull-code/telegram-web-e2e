#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const PROMPT_VERSION = "telegram-generated-suite-critic-v1";

function usage() {
  return [
    "Usage:",
    "  node scripts/ai_review_generated_suite.mjs <generated-suite-report.json> <output-review.md>",
    "",
    "Writes a Markdown report and a matching .json file next to it.",
    "The script exits successfully with a disabled review when AI_API_KEY/OPENAI_API_KEY is not configured."
  ].join("\n");
}

function fail(message) {
  console.error(message);
  console.error("");
  console.error(usage());
  process.exit(1);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function readTextIfExists(filePath, maxLength = 12000) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const text = fs.readFileSync(filePath, "utf8");
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

function compactText(value, maxLength = 400) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...` : text;
}

function compactArray(values, limit, itemMapper = (value) => value) {
  return Array.isArray(values) ? values.slice(0, limit).map(itemMapper) : [];
}

function severityRank(value) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[String(value || "").toLowerCase()] || 0;
}

function normalizeReview(value) {
  const candidate = value && typeof value === "object" ? value : {};
  const overview = candidate.overview && typeof candidate.overview === "object" ? candidate.overview : {};
  const nextRun = candidate.nextRun && typeof candidate.nextRun === "object" ? candidate.nextRun : {};

  return {
    overview: {
      summary: compactText(overview.summary || ""),
      productPurpose: compactText(overview.productPurpose || ""),
      mainFlows: compactArray(overview.mainFlows, 12, (item) => compactText(item, 260)),
      testedEvidence: compactArray(overview.testedEvidence, 12, (item) => compactText(item, 260)),
      confidence: ["low", "medium", "high"].includes(overview.confidence) ? overview.confidence : "low"
    },
    flowMap: compactArray(candidate.flowMap, 30, (flow) => ({
      name: compactText(flow?.name || "", 120),
      purpose: compactText(flow?.purpose || "", 280),
      branches: compactArray(flow?.branches, 12, (item) => compactText(item, 160)),
      criticality: ["low", "medium", "high", "critical"].includes(flow?.criticality)
        ? flow.criticality
        : "medium"
    })),
    branchReviews: compactArray(candidate.branchReviews, 80, (branch) => ({
      draftId: compactText(branch?.draftId || branch?.id || "", 120),
      path: compactArray(branch?.path, 12, (item) => compactText(item, 120)),
      intendedBehavior: compactText(branch?.intendedBehavior || "", 360),
      observedBehavior: compactText(branch?.observedBehavior || "", 360),
      verdict: ["pass", "fail", "warning", "unknown"].includes(branch?.verdict) ? branch.verdict : "unknown",
      defects: compactArray(branch?.defects, 8, (item) => compactText(item, 240)),
      missingEvidence: compactArray(branch?.missingEvidence, 8, (item) => compactText(item, 240)),
      confidence: ["low", "medium", "high"].includes(branch?.confidence) ? branch.confidence : "low"
    })),
    defects: compactArray(candidate.defects, 30, (defect) => ({
      title: compactText(defect?.title || "", 180),
      severity: ["low", "medium", "high", "critical"].includes(defect?.severity)
        ? defect.severity
        : "medium",
      evidence: compactArray(defect?.evidence, 8, (item) => compactText(item, 260)),
      likelyCause: compactText(defect?.likelyCause || "", 360),
      repro: compactArray(defect?.repro, 10, (item) => compactText(item, 220)),
      nextCheck: compactText(defect?.nextCheck || "", 260)
    })).sort((left, right) => severityRank(right.severity) - severityRank(left.severity)),
    coverageGaps: compactArray(candidate.coverageGaps, 30, (item) => compactText(item, 260)),
    nextRun: {
      recommendedMode: compactText(nextRun.recommendedMode || ""),
      focusBranches: compactArray(nextRun.focusBranches, 20, (item) => compactText(item, 160)),
      dataNeeded: compactArray(nextRun.dataNeeded, 20, (item) => compactText(item, 220)),
      runnerChanges: compactArray(nextRun.runnerChanges, 20, (item) => compactText(item, 260))
    },
    telegramSummary: compactArray(candidate.telegramSummary, 12, (item) => compactText(item, 260))
  };
}

function buildInputPayload(suiteReportPath) {
  const sourceDir = path.dirname(suiteReportPath);
  const suiteReport = readJsonIfExists(suiteReportPath);
  if (!suiteReport || suiteReport.parseError) {
    fail(`Could not read suite report: ${suiteReport?.parseError || suiteReportPath}`);
  }

  const botMap = readJsonIfExists(path.join(sourceDir, "bot-map.json"));
  const enriched = readJsonIfExists(path.join(sourceDir, "bot-map.enriched.json"));
  const generatedPlan = readJsonIfExists(path.join(sourceDir, "generated-test-plan.json"));
  const generatedScenarios = readJsonIfExists(path.join(sourceDir, "generated-scenarios.json"));
  const webTargets = readJsonIfExists(path.join(sourceDir, "web-target-audits.json"));
  const qaReport = readTextIfExists(path.join(sourceDir, "qa-report.md"), 16000);
  const telegramSummary = readTextIfExists(path.join(sourceDir, "telegram-summary.txt"), 4000);

  return {
    schemaVersion: "ai-review-input-v1",
    suiteReport: {
      suite: suiteReport.suite || null,
      summary: suiteReport.summary || null,
      coverage: suiteReport.coverage || null,
      sourceArtifacts: suiteReport.sourceArtifacts || [],
      drafts: compactArray(suiteReport.drafts, 80, (draft) => ({
        id: draft?.id || "",
        safety: draft?.safety || "",
        reason: draft?.reason || "",
        aiGuidance: draft?.aiGuidance || null,
        sourceType: draft?.sourceType || "",
        scenario: draft?.scenario || "",
        status: draft?.status || "",
        attempts: draft?.attempts || 0,
        firstError: draft?.firstError || "",
        steps: compactArray(draft?.steps, 20, (step) => ({
          index: step?.index || 0,
          name: step?.name || "",
          status: step?.status || "",
          action: step?.action || "",
          error: step?.error || "",
          screenshot: step?.screenshot || "",
          tail: compactArray(step?.tail, 6, (line) => compactText(line, 300))
        }))
      }))
    },
    discovery: {
      botMapStats: botMap && !botMap.parseError
        ? {
            bot: botMap.bot,
            startPayload: botMap.startPayload,
            limits: botMap.limits,
            nodeCount: Array.isArray(botMap.nodes) ? botMap.nodes.length : 0,
            edgeCount: Array.isArray(botMap.edges) ? botMap.edges.length : 0
          }
        : null,
      nodes: botMap && !botMap.parseError
        ? compactArray(botMap.nodes, 80, (node) => ({
            id: node?.id || "",
            depth: node?.depth || 0,
            path: node?.path || [],
            error: node?.error || "",
            tail: compactArray(node?.tail, 8, (message) => ({
              outgoing: Boolean(message?.outgoing),
              text: compactText(message?.text, 360)
            })),
            buttons: compactArray(node?.buttons, 20, (button) => ({
              text: button?.text || "",
              type: button?.type || "",
              queued: Boolean(button?.queued),
              hasUrl: Boolean(button?.url)
            })),
            skippedButtons: compactArray(node?.skippedButtons, 20, (button) => ({
              text: button?.text || "",
              type: button?.type || "",
              skipReason: button?.skipReason || "",
              hasUrl: Boolean(button?.url)
            }))
          }))
        : [],
      aiDiscoveryReview: enriched && !enriched.parseError ? enriched.enrichment?.ai?.report || null : null,
      generatedPlan: generatedPlan && !generatedPlan.parseError ? generatedPlan : null,
      generatedScenarioDrafts: generatedScenarios && !generatedScenarios.parseError
        ? compactArray(generatedScenarios.drafts, 120, (draft) => ({
            id: draft?.id || "",
            runnableNow: Boolean(draft?.runnableNow),
            safety: draft?.safety || "",
            blocker: draft?.blocker || null,
            reason: draft?.reason || "",
            aiGuidance: draft?.aiGuidance || null,
            source: draft?.source || null,
            scenarioSteps: Array.isArray(draft?.scenario?.steps) ? draft.scenario.steps.length : 0
          }))
        : [],
      webTargets: Array.isArray(webTargets)
        ? compactArray(webTargets, 20, (target) => ({
            id: target?.id || "",
            nodeId: target?.nodeId || "",
            path: target?.path || [],
            buttonText: target?.buttonText || "",
            status: target?.status || null,
            ok: Boolean(target?.ok),
            title: target?.title || null,
            finalUrl: target?.finalUrl || null,
            screenshotFile: target?.screenshotFile || null,
            pageCounts: target?.pageSnapshot?.counts || null,
            errors: target?.errors || [],
            failedRequests: compactArray(target?.failedRequests, 10, (request) => request)
          }))
        : []
    },
    readableReports: {
      qaReport,
      telegramSummary
    }
  };
}

function buildPrompt(inputPayload) {
  return [
    "Ты senior QA architect и product-minded тестировщик Telegram-ботов.",
    "Твоя задача: сделать умный второй проход после автопрогона, а не пересказать логи.",
    "",
    "Контекст:",
    "- dev/test bot, поэтому тесты могут проходить все кнопки и следовать инструкциям бота;",
    "- не считай прохождение клика качественным тестом само по себе;",
    "- смотри на всю карту бота, все ветки, статусы, tail сообщений, screenshots paths, web-target evidence и ошибки;",
    "- сначала опиши общий смысл продукта и основные flow, потом каждую важную ветку;",
    "- разделяй факт из evidence и гипотезу;",
    "- если ветка упала из-за ожиданий runner'а, но бот логически ответил, так и пиши: проблема ожиданий теста, а не бота;",
    "- если бот молчит, возвращает старое состояние, не меняет статус, теряет proof/web sync или ведёт в тупик, фиксируй как дефект/риск;",
    "- не выдумывай backend факты, которых нет в артефактах;",
    "- пиши по-русски, коротко, конкретно.",
    "",
    "Верни только валидный JSON без markdown в такой форме:",
    "{",
    '  "overview": {',
    '    "summary": "...",',
    '    "productPurpose": "...",',
    '    "mainFlows": ["..."],',
    '    "testedEvidence": ["..."],',
    '    "confidence": "low|medium|high"',
    "  },",
    '  "flowMap": [{',
    '    "name": "...",',
    '    "purpose": "...",',
    '    "branches": ["draft/node ids"],',
    '    "criticality": "low|medium|high|critical"',
    "  }],",
    '  "branchReviews": [{',
    '    "draftId": "...",',
    '    "path": ["..."],',
    '    "intendedBehavior": "...",',
    '    "observedBehavior": "...",',
    '    "verdict": "pass|fail|warning|unknown",',
    '    "defects": ["..."],',
    '    "missingEvidence": ["..."],',
    '    "confidence": "low|medium|high"',
    "  }],",
    '  "defects": [{',
    '    "title": "...",',
    '    "severity": "low|medium|high|critical",',
    '    "evidence": ["..."],',
    '    "likelyCause": "...",',
    '    "repro": ["..."],',
    '    "nextCheck": "..."',
    "  }],",
    '  "coverageGaps": ["..."],',
    '  "nextRun": {',
    '    "recommendedMode": "...",',
    '    "focusBranches": ["..."],',
    '    "dataNeeded": ["..."],',
    '    "runnerChanges": ["..."]',
    "  },",
    '  "telegramSummary": ["..."]',
    "}",
    "",
    "Полные входные данные:",
    JSON.stringify(inputPayload)
  ].join("\n");
}

function extractJsonObject(text) {
  const direct = tryParseJson(text);
  if (direct) {
    return direct;
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseJson(fenced);
    if (parsed) {
      return parsed;
    }
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return tryParseJson(text.slice(first, last + 1));
  }

  return null;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isDeepSeekAi(baseUrl, model) {
  return /deepseek/i.test(baseUrl) || /^deepseek-/i.test(model);
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function requestAiReview(inputPayload) {
  const apiKey = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const provider = (process.env.AI_PROVIDER || "openai-compatible").trim();
  const model = (process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const baseUrl = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
    .trim()
    .replace(/\/+$/, "");
  const timeoutMs = Number(process.env.AI_REVIEW_TIMEOUT_MS || process.env.AI_REQUEST_TIMEOUT_MS || "60000");
  const maxTokens = positiveNumber(Number(process.env.AI_REVIEW_MAX_TOKENS || process.env.AI_MAX_TOKENS || "8000"), 8000);

  if (!apiKey) {
    return {
      enabled: false,
      provider,
      model,
      promptVersion: PROMPT_VERSION,
      error: "AI_API_KEY/OPENAI_API_KEY is not configured."
    };
  }

  const prompt = buildPrompt(inputPayload);
  const timeoutLabel = positiveNumber(timeoutMs, 60_000);
  let lastResult = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutLabel);
    const userPrompt = attempt === 1
      ? prompt
      : `${prompt}\n\nRetry note: previous AI response was empty or invalid. Return one valid JSON object only.`;
    const body = {
        model,
        temperature: 0.15,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a strict Telegram bot QA critic. Return exactly one valid JSON object. Separate evidence from inference."
          },
          { role: "user", content: userPrompt }
        ]
      };
    if (isDeepSeekAi(baseUrl, model)) {
      body.thinking = { type: "disabled" };
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const payload = await response.json().catch(() => ({}));
      const choice = payload?.choices?.[0];
      const finishReason = choice?.finish_reason || null;
      if (!response.ok) {
        return {
          enabled: true,
          provider,
          model,
          responseModel: payload?.model,
          usage: payload?.usage,
          finishReason,
          promptVersion: PROMPT_VERSION,
          error: `AI request failed: ${response.status} ${payload?.error?.message || "unknown_error"}`
        };
      }

      const rawText = String(choice?.message?.content || "").trim();
      const parsed = extractJsonObject(rawText);

      lastResult = {
        enabled: true,
        provider,
        model,
        responseModel: payload?.model,
        usage: payload?.usage,
        finishReason,
        promptVersion: PROMPT_VERSION,
        rawText,
        ...(parsed
          ? { review: normalizeReview(parsed), parsed }
          : { parseError: `AI response did not contain parseable JSON.${finishReason ? ` finish_reason=${finishReason}.` : ""}` })
      };

      if (parsed) {
        return lastResult;
      }
    } catch (error) {
      lastResult = {
        enabled: true,
        provider,
        model,
        promptVersion: PROMPT_VERSION,
        error: error instanceof Error && error.name === "AbortError"
          ? `AI request timed out after ${timeoutLabel}ms`
          : error instanceof Error ? error.message : String(error)
      };
      if (attempt === 2) {
        return lastResult;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return lastResult || {
    enabled: true,
    provider,
    model,
    promptVersion: PROMPT_VERSION,
    error: "AI request did not return a usable result."
  };
}

function fallbackReview(inputPayload) {
  const summary = inputPayload.suiteReport.summary || {};
  const failedDrafts = inputPayload.suiteReport.drafts.filter((draft) => draft.status === "failed");
  const warningDrafts = inputPayload.suiteReport.drafts.filter(
    (draft) => draft.status === "warning" || draft.status === "flaky" || draft.status === "not_run"
  );

  return normalizeReview({
    overview: {
      summary: `Автопрогон проверил ${summary.total || inputPayload.suiteReport.drafts.length} веток: passed ${summary.passed || 0}, flaky ${summary.flaky || 0}, warning ${summary.warning || 0}, failed ${summary.failed || 0}, not_run ${summary.notRun || 0}.`,
      productPurpose: "Определяется по Telegram transcript и discovered branch map.",
      mainFlows: inputPayload.discovery.aiDiscoveryReview?.botOverview?.mainFlows || [],
      testedEvidence: ["generated-scenario-suite-report.json", "bot-map.json", "bot-map.enriched.json"],
      confidence: "medium"
    },
    branchReviews: inputPayload.suiteReport.drafts.map((draft) => ({
      draftId: draft.id,
      path: [],
      intendedBehavior: draft.reason,
      observedBehavior: draft.firstError || `${draft.status}, steps: ${draft.steps.length}`,
      verdict: draft.status === "passed" || draft.status === "flaky" ? "pass" : draft.status === "failed" ? "fail" : "unknown",
      defects: draft.firstError ? [draft.firstError] : [],
      missingEvidence: draft.status === "not_run" ? ["Ветка не была исполнена в suite run."] : [],
      confidence: "medium"
    })),
    defects: failedDrafts.map((draft) => ({
      title: `Проблема в ветке ${draft.id}`,
      severity: "high",
      evidence: [draft.firstError || "failed without firstError"],
      likelyCause: "Нужен AI review или ручной разбор runner evidence.",
      repro: draft.steps.map((step) => step.action).filter(Boolean),
      nextCheck: "Открыть screenshot/tail конкретного шага и сверить expected behavior."
    })),
    coverageGaps: warningDrafts.map((draft) => `${draft.id}: ${draft.status}`),
    nextRun: {
      recommendedMode: "generated_scenarios dev",
      focusBranches: failedDrafts.map((draft) => draft.id),
      dataNeeded: ["Сохранять backend/admin status evidence для task/proof веток."],
      runnerChanges: ["Добавить AI-planned expected states перед исполнением сценариев."]
    },
    telegramSummary: [
      `Проверено веток: ${summary.total || inputPayload.suiteReport.drafts.length}; passed ${summary.passed || 0}, warning ${summary.warning || 0}, failed ${summary.failed || 0}.`,
      ...failedDrafts.slice(0, 3).map((draft) => `${draft.id}: ${draft.firstError || "failed"}`)
    ]
  });
}

function buildMarkdown(payload) {
  const review = payload.review;
  const lines = [
    "# AI Generated Suite Review",
    "",
    `Generated: ${payload.generatedAtIso}`,
    `AI: ${payload.ai.enabled ? `${payload.ai.provider}/${payload.ai.model}` : "disabled"}`,
    `Prompt: ${payload.ai.promptVersion}`,
    ""
  ];

  if (payload.ai.error || payload.ai.parseError) {
    lines.push(`AI issue: ${payload.ai.error || payload.ai.parseError}`, "");
  }

  lines.push("## Overview", "");
  lines.push(`- Summary: ${review.overview.summary || "нет данных"}`);
  lines.push(`- Product purpose: ${review.overview.productPurpose || "нет данных"}`);
  lines.push(`- Confidence: ${review.overview.confidence}`);
  for (const flow of review.overview.mainFlows) {
    lines.push(`- Flow: ${flow}`);
  }
  lines.push("");

  if (review.flowMap.length > 0) {
    lines.push("## Flow Map", "");
    for (const flow of review.flowMap) {
      lines.push(`- ${flow.name || "flow"} [${flow.criticality}]: ${flow.purpose}`);
      if (flow.branches.length > 0) {
        lines.push(`  Branches: ${flow.branches.join(", ")}`);
      }
    }
    lines.push("");
  }

  lines.push("## Defects", "");
  if (review.defects.length === 0) {
    lines.push("- Нет подтверждённых дефектов по AI review.");
  } else {
    for (const defect of review.defects) {
      lines.push(`- [${defect.severity}] ${defect.title}`);
      if (defect.evidence.length > 0) {
        lines.push(`  Evidence: ${defect.evidence.join(" | ")}`);
      }
      if (defect.likelyCause) {
        lines.push(`  Likely cause: ${defect.likelyCause}`);
      }
      if (defect.nextCheck) {
        lines.push(`  Next check: ${defect.nextCheck}`);
      }
    }
  }
  lines.push("");

  lines.push("## Branch Reviews", "");
  for (const branch of review.branchReviews) {
    lines.push(`- ${branch.draftId || "branch"}: ${branch.verdict}, confidence ${branch.confidence}`);
    if (branch.intendedBehavior) {
      lines.push(`  Intended: ${branch.intendedBehavior}`);
    }
    if (branch.observedBehavior) {
      lines.push(`  Observed: ${branch.observedBehavior}`);
    }
    if (branch.defects.length > 0) {
      lines.push(`  Defects: ${branch.defects.join(" | ")}`);
    }
    if (branch.missingEvidence.length > 0) {
      lines.push(`  Missing evidence: ${branch.missingEvidence.join(" | ")}`);
    }
  }
  lines.push("");

  lines.push("## Coverage Gaps", "");
  if (review.coverageGaps.length === 0) {
    lines.push("- Нет явных gap по AI review.");
  } else {
    for (const gap of review.coverageGaps) {
      lines.push(`- ${gap}`);
    }
  }
  lines.push("");

  lines.push("## Next Run", "");
  if (review.nextRun.recommendedMode) {
    lines.push(`- Mode: ${review.nextRun.recommendedMode}`);
  }
  for (const branch of review.nextRun.focusBranches) {
    lines.push(`- Focus: ${branch}`);
  }
  for (const change of review.nextRun.runnerChanges) {
    lines.push(`- Runner: ${change}`);
  }
  for (const data of review.nextRun.dataNeeded) {
    lines.push(`- Data: ${data}`);
  }
  lines.push("");

  lines.push("## Telegram Summary", "");
  for (const line of review.telegramSummary) {
    lines.push(`- ${line}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

const [, , suiteReportPathInput, outputPathInput] = process.argv;
if (!suiteReportPathInput || !outputPathInput) {
  fail("Missing required arguments.");
}

const suiteReportPath = path.resolve(suiteReportPathInput);
const outputPath = path.resolve(outputPathInput);
const outputDir = path.dirname(outputPath);
const jsonOutputPath = outputPath.replace(/\.md$/i, ".json");

const inputPayload = buildInputPayload(suiteReportPath);
let ai;
try {
  ai = await requestAiReview(inputPayload);
} catch (error) {
  ai = {
    enabled: true,
    provider: (process.env.AI_PROVIDER || "openai-compatible").trim(),
    model: (process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim(),
    promptVersion: PROMPT_VERSION,
    error: error instanceof Error ? error.message : String(error)
  };
}

const review = ai.review || fallbackReview(inputPayload);
const payload = {
  schemaVersion: 1,
  generatedAtIso: new Date().toISOString(),
  source: {
    suiteReportFile: suiteReportPath,
    promptVersion: PROMPT_VERSION
  },
  ai,
  review
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, buildMarkdown(payload), "utf8");
fs.writeFileSync(jsonOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: outputPath,
      jsonOutput: jsonOutputPath,
      aiEnabled: ai.enabled,
      aiModel: ai.model,
      defects: review.defects.length,
      branchReviews: review.branchReviews.length,
      telegramSummary: review.telegramSummary.slice(0, 4)
    },
    null,
    2
  )
);
