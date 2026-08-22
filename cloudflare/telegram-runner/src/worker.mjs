import { WorkflowEntrypoint } from "cloudflare:workers";
import { executeCloudflareNativeRun, isCloudflareNativeSuite } from "./cloudflare-runner.mjs";

const LANG_RU = "ru";
const LANG_EN = "en";
const SCENARIO_START_FINISH = "start_finish";
const REQUIRED_SUITES = new Set([
  "bot",
  "mtproto",
  "discover_mtproto",
  "generated_scenario",
  "generated_scenarios",
  "scenario",
  "discover",
  "autorun",
  "freelancer",
  "settings",
  "website_audit",
  "all"
]);
const GENERATED_SELECTOR_SUITES = new Set(["generated_scenario", "generated_scenarios"]);
const PANEL_RUN_PREFIX = "panel-run:";
const PANEL_ARTIFACT_PREFIX = "panel-artifact:";
const PANEL_RUN_TTL_SECONDS = 60 * 60 * 24 * 14;
const PANEL_RUN_LIST_LIMIT = 30;
const PANEL_ACTIVE_RUN_WINDOW_MS = 2 * 60 * 60 * 1000;
const PANEL_TERMINAL_STATUSES = new Set([
  "success",
  "failure",
  "failed",
  "completed",
  "cancelled",
  "blocked",
  "timed_out",
  "skipped",
  "dispatch_failed",
  "reported"
]);

const TEXT = {
  [LANG_RU]: {
    chooseLanguage: "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u044f\u0437\u044b\u043a \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430:",
    languageSaved: "\u042f\u0437\u044b\u043a \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d.",
    chooseScenario: "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0439 \u043f\u0440\u043e\u0433\u043e\u043d\u0430:",
    scenarioStartFinish: "1. \u0421\u0442\u0430\u0440\u0442 - \u0424\u0438\u043d\u0438\u0448 (\u0437\u0430\u0434\u0430\u0447\u0430 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0430)",
    launchStarted: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u043b \u043f\u0440\u043e\u0433\u043e\u043d \u0442\u0435\u0441\u0442\u0430 \u0447\u0435\u0440\u0435\u0437 Telegram Web.",
    launchLink: "\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 \u043f\u0440\u043e\u0433\u043e\u043d:",
    launchWaitReport: "\u041f\u043e\u0441\u043b\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u043f\u0440\u0438\u0448\u043b\u044e \u043e\u0442\u0447\u0435\u0442.",
    launchFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u043f\u0440\u043e\u0433\u043e\u043d. \u041f\u0440\u043e\u0432\u0435\u0440\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 GitHub/Cloudflare secrets.",
    reportTitle: "\u041e\u0442\u0447\u0435\u0442 \u043f\u043e \u043f\u0440\u043e\u0433\u043e\u043d\u0443",
    reportScenario: "\u0421\u0446\u0435\u043d\u0430\u0440\u0438\u0439",
    reportStatus: "\u0421\u0442\u0430\u0442\u0443\u0441",
    reportReason: "\u041f\u0440\u0438\u0447\u0438\u043d\u0430",
    reportDuration: "\u0412\u0440\u0435\u043c\u044f",
    reportLink: "\u0421\u0441\u044b\u043b\u043a\u0430",
    reportStatusSuccess: "\u0423\u0441\u043f\u0435\u0448\u043d\u043e",
    reportStatusFailure: "\u041e\u0448\u0438\u0431\u043a\u0430",
    reportStatusCancelled: "\u041e\u0442\u043c\u0435\u043d\u0435\u043d",
    reportReasonBotUnresponsive:
      "\u0442\u0435\u0441\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0441\u044f \u0441 \u043e\u0448\u0438\u0431\u043a\u043e\u0439: \u0431\u043e\u0442 \u043d\u0435 \u043e\u0442\u0432\u0435\u0447\u0430\u043b \u0431\u043e\u043b\u0435\u0435 5 \u043c\u0438\u043d\u0443\u0442.",
    reportReasonNoTask:
      "\u0442\u0435\u0441\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0441\u044f \u0441 \u043e\u0448\u0438\u0431\u043a\u043e\u0439: \u0431\u043e\u0442 \u043d\u0435 \u0432\u044b\u0434\u0430\u043b \u043d\u043e\u0432\u0443\u044e \u0437\u0430\u0434\u0430\u0447\u0443.",
    runTestButton: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0442\u0435\u0441\u0442",
    askRunAgain: "\u0425\u043e\u0442\u0438\u0442\u0435 \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u043d\u043e\u0432\u044b\u0439 \u0442\u0435\u0441\u0442?",
    runAgain: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u043d\u043e\u0432\u044b\u0439 \u0442\u0435\u0441\u0442",
    runStartedToast: "\u0417\u0430\u043f\u0443\u0441\u043a\u0430\u044e \u043f\u0440\u043e\u0433\u043e\u043d...",
    ignoredChat: "\u042d\u0442\u043e\u0442 \u0431\u043e\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u043d\u043e\u043c \u0447\u0430\u0442\u0435."
  },
  [LANG_EN]: {
    chooseLanguage: "Choose interface language:",
    languageSaved: "Language saved.",
    chooseScenario: "Select a test scenario:",
    scenarioStartFinish: "1. Start - Finish (task completed)",
    launchStarted: "Started Telegram Web test run.",
    launchLink: "Run link:",
    launchWaitReport: "I will send the report when it finishes.",
    launchFailed: "Failed to start the run. Check GitHub/Cloudflare secrets.",
    reportTitle: "Run report",
    reportScenario: "Scenario",
    reportStatus: "Status",
    reportReason: "Reason",
    reportDuration: "Duration",
    reportLink: "Link",
    reportStatusSuccess: "Success",
    reportStatusFailure: "Failed",
    reportStatusCancelled: "Cancelled",
    reportReasonBotUnresponsive: "Test failed: the bot did not answer for more than 5 minutes.",
    reportReasonNoTask: "Test failed: the bot did not provide a new task.",
    runTestButton: "Run test",
    askRunAgain: "Do you want to run a new test?",
    runAgain: "Run a new test",
    runStartedToast: "Starting run...",
    ignoredChat: "This bot is allowed only in the configured chat."
  }
};

function t(lang, key) {
  const safeLang = lang === LANG_EN ? LANG_EN : LANG_RU;
  return TEXT[safeLang][key] || TEXT[LANG_RU][key] || key;
}

function normalizeLang(value) {
  return value === LANG_EN ? LANG_EN : LANG_RU;
}

function normalizeSuite(value, fallback = "autorun") {
  const normalized = String(value || "").trim().toLowerCase();
  if (REQUIRED_SUITES.has(normalized)) {
    return normalized;
  }
  const fallbackNormalized = String(fallback || "").trim().toLowerCase();
  return REQUIRED_SUITES.has(fallbackNormalized) ? fallbackNormalized : "autorun";
}

function normalizePanelEngine(value, suite) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["github", "github_actions", "actions"].includes(normalized)) {
    return "github";
  }
  if (["cloudflare", "cf", "native"].includes(normalized)) {
    return "cloudflare";
  }
  return isCloudflareNativeSuite(suite) ? "cloudflare" : "github";
}

function normalizePanelTargetType(value, suite) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["website", "web", "site", "webapp", "app"].includes(normalized) || suite === "website_audit") {
    return "website";
  }
  return "telegram_bot";
}

function stripCommandMention(text) {
  return String(text || "").trim().replace(/^(\/\w+)@\w+/i, "$1");
}

function scenarioKeyForRun(suite, selector) {
  if (suite === "generated_scenario") {
    return selector ? `generated_scenario_${selector}` : "generated_scenario_start-smoke";
  }
  if (suite === "generated_scenarios") {
    return selector ? `generated_scenarios_${selector}` : "generated_scenarios_safe";
  }
  return suite === "autorun" ? SCENARIO_START_FINISH : suite;
}

function isDevGeneratedSelector(selector) {
  return ["dev", "unsafe", "runnable"].includes(String(selector || "").trim().toLowerCase());
}

function parseRunText(text, stateLang, defaultSuite) {
  const normalized = stripCommandMention(text);
  const parts = normalized.split(/\s+/).filter(Boolean);
  const firstArg = String(parts[1] || "").trim().toLowerCase();
  const secondArg = String(parts[2] || "").trim();
  let lang = normalizeLang(stateLang || LANG_RU);
  let suite = normalizeSuite(defaultSuite || "autorun");
  let selector = "";

  if (firstArg === LANG_RU || firstArg === LANG_EN) {
    lang = normalizeLang(firstArg);
  } else if (firstArg) {
    if (!REQUIRED_SUITES.has(firstArg)) {
      return {
        error: `Unknown suite: ${firstArg}`
      };
    }
    suite = firstArg;
    selector = secondArg;
  }

  if (selector && !GENERATED_SELECTOR_SUITES.has(suite)) {
    return {
      error: "Draft selector is allowed only for generated_scenario/generated_scenarios."
    };
  }

  return {
    lang,
    suite,
    scenarioKey: scenarioKeyForRun(suite, selector),
    ...(suite === "generated_scenario" && selector ? { generatedScenarioDraft: selector } : {}),
    ...(suite === "generated_scenarios" && selector ? { generatedScenarioDrafts: selector } : {})
  };
}

function normalizeChatId(chatId) {
  if (chatId === null || chatId === undefined) {
    return "";
  }
  return String(chatId).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalizeBotUsername(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^@+/, "");
  return /^[A-Za-z0-9_]{5,64}$/.test(normalized) ? normalized : "";
}

function normalizeWebsiteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function compactPanelText(value, maxLength = 2000) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function normalizeBrowserProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["mobile", "tablet", "desktop"].includes(normalized) ? normalized : "mobile";
}

function sanitizePanelRunForStorage(run) {
  if (!run || typeof run !== "object") {
    return run;
  }
  const sanitized = { ...run };
  delete sanitized.auth_instructions;
  delete sanitized.auth_secret;
  delete sanitized.password;
  delete sanitized.token;
  return sanitized;
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function runIdFromUrl(value) {
  const match = String(value || "").match(/\/actions\/runs\/(\d+)/);
  return match ? match[1] : "";
}

function panelRunKey(id) {
  return `${PANEL_RUN_PREFIX}${id}`;
}

function normalizePanelArtifactName(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^\/+/, "");
  return /^[A-Za-z0-9._-]{1,140}$/.test(normalized) ? normalized : "";
}

function panelArtifactKey(id, artifactName) {
  return `${PANEL_ARTIFACT_PREFIX}${String(id || "").trim()}:${normalizePanelArtifactName(artifactName)}`;
}

function requirePanelAuthorization() {
  return null;
}

async function loadPanelRun(env, id) {
  if (!env.BOT_STATE_KV || !id) {
    return null;
  }
  try {
    const value = await env.BOT_STATE_KV.get(panelRunKey(id), { type: "json" });
    return value && typeof value === "object" ? value : null;
  } catch (error) {
    console.error("loadPanelRun failed", error);
    return null;
  }
}

async function savePanelRun(env, run) {
  if (!env.BOT_STATE_KV || !run?.id) {
    return;
  }
  await env.BOT_STATE_KV.put(panelRunKey(run.id), JSON.stringify(sanitizePanelRunForStorage(run)), {
    expirationTtl: PANEL_RUN_TTL_SECONDS
  });
}

async function listPanelRuns(env) {
  if (!env.BOT_STATE_KV) {
    return [];
  }
  const listed = await env.BOT_STATE_KV.list({ prefix: PANEL_RUN_PREFIX, limit: PANEL_RUN_LIST_LIMIT });
  const runs = [];
  for (const key of listed.keys || []) {
    const id = String(key.name || "").slice(PANEL_RUN_PREFIX.length);
    const run = await loadPanelRun(env, id);
    if (run) {
      runs.push(run);
    }
  }
  return runs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function appendPanelEvent(run, event) {
  const events = Array.isArray(run.events) ? run.events : [];
  return {
    ...run,
    events: [...events, { time: nowIso(), ...event }].slice(-50)
  };
}

function normalizedPanelRunStatus(run) {
  return String(run?.github_live?.conclusion || run?.github?.conclusion || run?.status || "").trim().toLowerCase();
}

function isTerminalPanelRun(run) {
  const status = normalizedPanelRunStatus(run);
  return PANEL_TERMINAL_STATUSES.has(status);
}

function isActivePanelRun(run) {
  if (!run || isTerminalPanelRun(run)) {
    return false;
  }
  const timestamp = Date.parse(String(run.updated_at || run.created_at || ""));
  if (Number.isFinite(timestamp) && Date.now() - timestamp > PANEL_ACTIVE_RUN_WINDOW_MS) {
    return false;
  }
  return true;
}

function cloudflareRunnerTitle(run) {
  return normalizePanelTargetType(run?.target_type, run?.suite) === "website"
    ? "Cloudflare Browser runner"
    : "Cloudflare MTProto runner";
}

function samePanelRunRequest(run, criteria) {
  const runTargetType = normalizePanelTargetType(run?.target_type, run?.suite);
  const criteriaTargetType = normalizePanelTargetType(criteria?.targetType, criteria?.suite);
  if (runTargetType !== criteriaTargetType) {
    return false;
  }
  if (runTargetType === "website") {
    return (
      normalizeWebsiteUrl(run?.target_url) === normalizeWebsiteUrl(criteria?.targetUrl) &&
      String(run?.test_objective || "").trim() === String(criteria?.testObjective || "").trim() &&
      normalizeBrowserProfile(run?.browser_profile) === normalizeBrowserProfile(criteria?.browserProfile) &&
      String(run?.suite || "").trim() === String(criteria?.suite || "").trim() &&
      normalizePanelEngine(run?.engine, run?.suite) === normalizePanelEngine(criteria?.engine, criteria?.suite)
    );
  }
  const sameBase =
    normalizeBotUsername(run?.bot_username) === normalizeBotUsername(criteria?.botUsername) &&
    String(run?.start_payload || "").trim() === String(criteria?.startPayload || "").trim() &&
    String(run?.suite || "").trim() === String(criteria?.suite || "").trim() &&
    normalizePanelEngine(run?.engine, run?.suite) === normalizePanelEngine(criteria?.engine, criteria?.suite);
  if (sameBase && normalizePanelEngine(run?.engine, run?.suite) === "cloudflare") {
    return true;
  }
  return (
    sameBase &&
    String(run?.selector || "").trim() === String(criteria?.selector || "").trim() &&
    normalizePanelEngine(run?.engine, run?.suite) === normalizePanelEngine(criteria?.engine, criteria?.suite)
  );
}

async function refreshPanelRunTerminalState(env, run) {
  if (normalizePanelEngine(run?.engine, run?.suite) === "cloudflare" && run?.workflow_instance_id) {
    const currentWorkflowStatus = String(run.workflow_status || "").trim().toLowerCase();
    if (isTerminalPanelRun(run) && ["complete", "terminated", "errored"].includes(currentWorkflowStatus)) {
      return run;
    }
    try {
      const instance = await env.PANEL_RUN_WORKFLOW?.get?.(String(run.workflow_instance_id));
      const details = instance ? await instance.status() : null;
      if (details?.status === "errored") {
        const next = appendPanelEvent(
          {
            ...run,
            status: "failure",
            workflow_status: details.status,
            error: details.error?.message || run.error || "Cloudflare Workflow завершился с ошибкой",
            updated_at: nowIso(),
            completed_at: nowIso()
          },
          { phase: "workflow", status: "failure", message: details.error?.message || "Cloudflare Workflow завершился с ошибкой" }
        );
        await savePanelRun(env, next);
        return next;
      }
      if (details?.status === "terminated") {
        if (isTerminalPanelRun(run)) {
          const next = {
            ...run,
            workflow_status: details.status,
            updated_at: nowIso(),
            completed_at: run.completed_at || nowIso()
          };
          await savePanelRun(env, next);
          return next;
        }
        const next = appendPanelEvent(
          {
            ...run,
            status: "cancelled",
            workflow_status: details.status,
            updated_at: nowIso(),
            completed_at: nowIso()
          },
          { phase: "workflow", status: "cancelled", message: "Cloudflare Workflow остановлен" }
        );
        await savePanelRun(env, next);
        return next;
      }
      if (details?.status === "complete" && !isTerminalPanelRun(run)) {
        const latestRun = await loadPanelRun(env, run.id).catch(() => null);
        const sourceRun =
          latestRun && String(latestRun.updated_at || "") >= String(run.updated_at || "") ? latestRun : run;
        if (isTerminalPanelRun(sourceRun)) {
          const next = {
            ...sourceRun,
            workflow_status: details.status,
            completed_at: sourceRun.completed_at || nowIso()
          };
          await savePanelRun(env, next);
          return next;
        }
        const outputStatus = String(details.output?.status || "").trim();
        const sourceHasResult = Boolean(sourceRun.cloudflare_run || sourceRun.generated_suite || sourceRun.bot_map);
        const workflowOutputHasResult = details.output?.has_result === true;
        if (!sourceHasResult && !workflowOutputHasResult && (outputStatus === "success" || details.output?.has_result === false)) {
          return {
            ...sourceRun,
            status: "syncing_result",
            workflow_status: details.status,
            workflow_output_status: outputStatus
          };
        }
        const freshBeforeTerminalSave = await loadPanelRun(env, run.id).catch(() => null);
        if (
          freshBeforeTerminalSave &&
          (isTerminalPanelRun(freshBeforeTerminalSave) ||
            freshBeforeTerminalSave.cloudflare_run ||
            freshBeforeTerminalSave.generated_suite ||
            freshBeforeTerminalSave.bot_map)
        ) {
          const next = {
            ...freshBeforeTerminalSave,
            workflow_status: details.status,
            workflow_output_status: outputStatus,
            completed_at: freshBeforeTerminalSave.completed_at || nowIso(),
            updated_at: nowIso()
          };
          await savePanelRun(env, next);
          return next;
        }
        const nextStatus = PANEL_TERMINAL_STATUSES.has(outputStatus) ? outputStatus : "completed";
        const workflowError =
          details.output?.error ||
          (nextStatus === "failure" && !sourceRun.error
            ? `Cloudflare Workflow завершился без результата раннера; output status: ${outputStatus || "empty"}`
            : "");
        const next = appendPanelEvent(
          {
            ...sourceRun,
            status: nextStatus,
            workflow_status: details.status,
            ...(workflowError ? { error: workflowError } : {}),
            updated_at: nowIso(),
            completed_at: nowIso()
          },
          { phase: "workflow", status: nextStatus, message: workflowError || "Cloudflare Workflow завершён" }
        );
        await savePanelRun(env, next);
        return next;
      }
      return details?.status ? { ...run, workflow_status: details.status } : run;
    } catch (_) {
      return run;
    }
  }

  const runId = run?.github_run_id || runIdFromUrl(run?.github_run_url);
  if (!runId) {
    return run;
  }
  try {
    const githubLive = await fetchGithubRunDetails(env, runId);
    if (!githubLive || !isTerminalPanelRun({ ...run, github_live: githubLive })) {
      return run;
    }
    const next = {
      ...run,
      status: githubLive.conclusion || githubLive.status || run.status,
      github_live: githubLive,
      updated_at: nowIso()
    };
    await savePanelRun(env, next);
    return next;
  } catch (_) {
    return run;
  }
}

async function findActivePanelRun(env, criteria) {
  const runs = await listPanelRuns(env);
  for (const run of runs) {
    if (!samePanelRunRequest(run, criteria) || !isActivePanelRun(run)) {
      continue;
    }
    const refreshed = await refreshPanelRunTerminalState(env, run);
    if (isActivePanelRun(refreshed)) {
      return refreshed;
    }
  }
  return null;
}

function compactPanelDrafts(generatedSuite) {
  const drafts = Array.isArray(generatedSuite?.drafts) ? generatedSuite.drafts : [];
  return drafts.map((draft) => ({
    id: String(draft?.id || ""),
    status: String(draft?.status || ""),
    scenario: String(draft?.scenario || ""),
    source_type: String(draft?.source_type || ""),
    ai_severity: String(draft?.ai_severity || ""),
    first_error: String(draft?.first_error || ""),
    step_count: numberOrZero(draft?.step_count),
    passed_steps: numberOrZero(draft?.passed_steps),
    warning_steps: numberOrZero(draft?.warning_steps),
    failed_steps: numberOrZero(draft?.failed_steps)
  }));
}

function formatDuration(seconds) {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(secs).padStart(2, "0")}s`;
}

function scenarioTitle(lang, scenarioKey) {
  if (scenarioKey === SCENARIO_START_FINISH) {
    return t(lang, "scenarioStartFinish");
  }
  if (String(scenarioKey || "").startsWith("generated_scenario_")) {
    return `generated_scenario: ${String(scenarioKey).slice("generated_scenario_".length)}`;
  }
  if (String(scenarioKey || "").startsWith("generated_scenarios_")) {
    return `generated_scenarios: ${String(scenarioKey).slice("generated_scenarios_".length)}`;
  }
  return scenarioKey;
}

function runStatusText(lang, status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "success") {
    return t(lang, "reportStatusSuccess");
  }
  if (normalized === "cancelled") {
    return t(lang, "reportStatusCancelled");
  }
  return t(lang, "reportStatusFailure");
}

function failureReasonText(lang, failureCode, failureMessage) {
  const normalized = String(failureCode || "").trim().toLowerCase();
  if (normalized === "bot_unresponsive") {
    return t(lang, "reportReasonBotUnresponsive");
  }
  if (normalized === "no_task") {
    return t(lang, "reportReasonNoTask");
  }
  return String(failureMessage || "").trim();
}

function compactReportText(value, maxLength = 180) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function generatedSuiteLabel(lang, key) {
  const labels = {
    [LANG_RU]: {
      title: "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u0432\u0435\u0442\u043e\u043a",
      total: "\u0432\u0441\u0435\u0433\u043e",
      passed: "\u043f\u0440\u043e\u0448\u043b\u043e",
      failed: "\u0443\u043f\u0430\u043b\u043e",
      warning: "\u043f\u0440\u0435\u0434\u0443\u043f\u0440.",
      flaky: "\u043d\u0435\u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e",
      notRun: "\u043d\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u043b\u043e\u0441\u044c",
      steps: "\u0448\u0430\u0433\u043e\u0432",
      attempts: "\u043f\u043e\u043f\u044b\u0442\u043e\u043a",
      error: "\u043e\u0448\u0438\u0431\u043a\u0430",
      discovered: "\u043d\u0430\u0439\u0434\u0435\u043d\u043e",
      selected: "\u0432\u044b\u0431\u0440\u0430\u043d\u043e",
      manual: "manual",
      testAccount: "test-account",
      limitedOut: "\u043d\u0435 \u0432\u043e\u0448\u043b\u043e \u0438\u0437-\u0437\u0430 \u043b\u0438\u043c\u0438\u0442\u0430",
      webappHandoffs: "WebApp/URL",
      webappHandoffsAudited: "WebApp проверено",
      webappScreenshots: "скриншотов",
      followedActions: "выполнено действий",
      telegramClicks: "Telegram кликов",
      more: "\u0435\u0449\u0435",
      branches: "\u0432\u0435\u0442\u043e\u043a"
    },
    [LANG_EN]: {
      title: "Branch checks",
      total: "total",
      passed: "passed",
      failed: "failed",
      warning: "warning",
      flaky: "flaky",
      notRun: "not run",
      steps: "steps",
      attempts: "attempts",
      error: "error",
      discovered: "discovered",
      selected: "selected",
      manual: "manual",
      testAccount: "test-account",
      limitedOut: "limited out",
      webappHandoffs: "WebApp/URL",
      webappHandoffsAudited: "WebApp audited",
      webappScreenshots: "screenshots",
      followedActions: "followed actions",
      telegramClicks: "Telegram clicks",
      more: "more",
      branches: "branches"
    }
  };
  const safeLang = lang === LANG_EN ? LANG_EN : LANG_RU;
  return labels[safeLang][key] || labels[LANG_RU][key] || key;
}

function generatedSuiteStatusText(lang, status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "passed" || normalized === "success") {
    return generatedSuiteLabel(lang, "passed");
  }
  if (normalized === "failed" || normalized === "failure") {
    return generatedSuiteLabel(lang, "failed");
  }
  if (normalized === "flaky") {
    return generatedSuiteLabel(lang, "flaky");
  }
  if (normalized === "warning") {
    return generatedSuiteLabel(lang, "warning");
  }
  return generatedSuiteLabel(lang, "notRun");
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function formatGeneratedSuiteText(lang, generatedSuite) {
  if (!generatedSuite || typeof generatedSuite !== "object") {
    return "";
  }

  const summary = generatedSuite.summary && typeof generatedSuite.summary === "object"
    ? generatedSuite.summary
    : {};
  const coverage = generatedSuite.coverage && typeof generatedSuite.coverage === "object"
    ? generatedSuite.coverage
    : null;
  const drafts = Array.isArray(generatedSuite.drafts) ? generatedSuite.drafts : [];
  const total = numberOrZero(summary.total) || numberOrZero(generatedSuite.draft_count) || drafts.length;
  if (total === 0 && drafts.length === 0) {
    return "";
  }

  const lines = [
    "",
    generatedSuiteLabel(lang, "title"),
    [
      `${generatedSuiteLabel(lang, "total")}: ${total}`,
      `${generatedSuiteLabel(lang, "passed")}: ${numberOrZero(summary.passed)}`,
      `${generatedSuiteLabel(lang, "flaky")}: ${numberOrZero(summary.flaky)}`,
      ...(numberOrZero(summary.warning) > 0 ? [`${generatedSuiteLabel(lang, "warning")}: ${numberOrZero(summary.warning)}`] : []),
      `${generatedSuiteLabel(lang, "failed")}: ${numberOrZero(summary.failed)}`,
      `${generatedSuiteLabel(lang, "notRun")}: ${numberOrZero(summary.notRun)}`
    ].join(", ")
  ];

  if (coverage) {
    const coverageParts = [
      `${generatedSuiteLabel(lang, "discovered")}: ${numberOrZero(coverage.discovered)}`,
      `${generatedSuiteLabel(lang, "selected")}: ${numberOrZero(coverage.selected)}`,
      `${generatedSuiteLabel(lang, "manual")}: ${numberOrZero(coverage.manual)}`,
      `${generatedSuiteLabel(lang, "testAccount")}: ${numberOrZero(coverage.runnableTestAccount)}`
    ];
    if (numberOrZero(coverage.webappHandoffs) > 0) {
      coverageParts.push(`${generatedSuiteLabel(lang, "webappHandoffs")}: ${numberOrZero(coverage.webappHandoffs)}`);
    }
    if (numberOrZero(coverage.webappHandoffsAudited) > 0) {
      coverageParts.push(`${generatedSuiteLabel(lang, "webappHandoffsAudited")}: ${numberOrZero(coverage.webappHandoffsAudited)}`);
    }
    if (numberOrZero(coverage.webappScreenshots) > 0) {
      coverageParts.push(`${generatedSuiteLabel(lang, "webappScreenshots")}: ${numberOrZero(coverage.webappScreenshots)}`);
    }
    if (numberOrZero(coverage.followedActions) > 0) {
      coverageParts.push(`${generatedSuiteLabel(lang, "followedActions")}: ${numberOrZero(coverage.followedActions)}`);
    }
    if (numberOrZero(coverage.telegramClicks) > 0) {
      coverageParts.push(`${generatedSuiteLabel(lang, "telegramClicks")}: ${numberOrZero(coverage.telegramClicks)}`);
    }
    if (numberOrZero(coverage.limitedOut) > 0) {
      coverageParts.push(`${generatedSuiteLabel(lang, "limitedOut")}: ${numberOrZero(coverage.limitedOut)}`);
    }
    lines.push(coverageParts.join(", "));
  }

  const maxDrafts = 6;
  for (const draft of drafts.slice(0, maxDrafts)) {
    const id = compactReportText(draft?.id || draft?.scenario || "draft", 70);
    const status = generatedSuiteStatusText(lang, draft?.status);
    const stepCount = numberOrZero(draft?.step_count) || (Array.isArray(draft?.steps) ? draft.steps.length : 0);
    const passedSteps = numberOrZero(draft?.passed_steps);
    const warningSteps = numberOrZero(draft?.warning_steps);
    const attempts = numberOrZero(draft?.attempts);
    const stepText = stepCount > 0
      ? `, ${generatedSuiteLabel(lang, "steps")}: ${passedSteps}/${stepCount}${warningSteps > 0 ? `, ${generatedSuiteLabel(lang, "warning")}: ${warningSteps}` : ""}`
      : "";
    const attemptsText = attempts > 1 ? `, ${generatedSuiteLabel(lang, "attempts")}: ${attempts}` : "";
    const aiSeverity = compactReportText(draft?.ai_severity, 40);
    const aiText = aiSeverity ? `, AI: ${aiSeverity}` : "";
    lines.push(`- ${id}: ${status}${stepText}${attemptsText}${aiText}`);

    const firstError = compactReportText(draft?.first_error, 220);
    if (firstError && String(draft?.status || "").toLowerCase() !== "passed") {
      lines.push(`  ${generatedSuiteLabel(lang, "error")}: ${firstError}`);
    }
  }

  if (drafts.length > maxDrafts) {
    lines.push(`- ${generatedSuiteLabel(lang, "more")} ${drafts.length - maxDrafts} ${generatedSuiteLabel(lang, "branches")}`);
  }

  return lines.join("\n");
}

function formatGeneratedSuiteAiReviewText(lang, aiReview) {
  if (!aiReview || typeof aiReview !== "object") {
    return "";
  }

  const overview = aiReview.overview && typeof aiReview.overview === "object" ? aiReview.overview : {};
  const defects = Array.isArray(aiReview.defects) ? aiReview.defects : [];
  const branchReviews = Array.isArray(aiReview.branch_reviews) ? aiReview.branch_reviews : [];
  const coverageGaps = Array.isArray(aiReview.coverage_gaps) ? aiReview.coverage_gaps : [];
  const nextRun = aiReview.next_run && typeof aiReview.next_run === "object" ? aiReview.next_run : {};
  const ai = aiReview.ai && typeof aiReview.ai === "object" ? aiReview.ai : {};
  const title = lang === LANG_EN ? "AI review" : "AI-разбор";
  const defectTitle = lang === LANG_EN ? "defects" : "дефекты";
  const branchTitle = lang === LANG_EN ? "branches" : "ветки";
  const gapTitle = lang === LANG_EN ? "coverage gaps" : "пробелы";
  const nextTitle = lang === LANG_EN ? "next" : "дальше";

  const lines = ["", title];
  const summary = compactReportText(overview.summary, 520);
  if (summary) {
    lines.push(summary);
  }

  const aiError = compactReportText(ai.error, 220);
  if (aiError) {
    lines.push(`AI: ${aiError}`);
  }

  for (const defect of defects.slice(0, 3)) {
    const severity = compactReportText(defect?.severity, 40);
    const titleText = compactReportText(defect?.title, 220);
    if (titleText) {
      lines.push(`- ${defectTitle}: ${severity ? `[${severity}] ` : ""}${titleText}`);
    }
    const nextCheck = compactReportText(defect?.next_check, 220);
    if (nextCheck) {
      lines.push(`  ${nextTitle}: ${nextCheck}`);
    }
  }

  const notableBranches = branchReviews
    .filter((branch) => {
      const verdict = String(branch?.verdict || "").toLowerCase();
      return verdict !== "pass" || (Array.isArray(branch?.defects) && branch.defects.length > 0);
    })
    .slice(0, 4);
  for (const branch of notableBranches) {
    const id = compactReportText(branch?.draft_id, 90);
    const verdict = compactReportText(branch?.verdict, 40);
    const observed = compactReportText(branch?.observed_behavior, 220);
    if (id || observed) {
      lines.push(`- ${branchTitle}: ${id || "branch"}${verdict ? ` (${verdict})` : ""}${observed ? ` — ${observed}` : ""}`);
    }
  }

  for (const gap of coverageGaps.slice(0, 3)) {
    const text = compactReportText(gap, 220);
    if (text) {
      lines.push(`- ${gapTitle}: ${text}`);
    }
  }

  const runnerChanges = Array.isArray(nextRun.runner_changes) ? nextRun.runner_changes : [];
  for (const change of runnerChanges.slice(0, 2)) {
    const text = compactReportText(change, 220);
    if (text) {
      lines.push(`- ${nextTitle}: ${text}`);
    }
  }

  return lines.length > 2 ? lines.join("\n") : "";
}

async function telegramJson(env, method, payload) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function telegramForm(env, method, formData) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function sendMessage(env, chatId, text, replyMarkup) {
  return telegramJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: replyMarkup || undefined
  });
}

async function safeSendMessage(env, chatId, text, replyMarkup, fallbackText = text) {
  try {
    return await sendMessage(env, chatId, text, replyMarkup);
  } catch (error) {
    console.error("safeSendMessage failed", error);
    if (!replyMarkup) {
      throw error;
    }
    try {
      return await sendMessage(env, chatId, fallbackText, undefined);
    } catch (fallbackError) {
      console.error("safeSendMessage fallback failed", fallbackError);
      throw fallbackError;
    }
  }
}

async function answerCallback(env, callbackQueryId, text) {
  return telegramJson(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });
}

async function safeAnswerCallback(env, callbackQueryId, text) {
  try {
    await answerCallback(env, callbackQueryId, text);
  } catch (error) {
    console.error("safeAnswerCallback failed", error);
  }
}

async function sendPhoto(env, chatId, bytes, filename, caption) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) {
    form.set("caption", caption);
  }
  form.set("photo", new Blob([bytes], { type: "image/png" }), filename);
  return telegramForm(env, "sendPhoto", form);
}

function languageKeyboard() {
  return {
    keyboard: [[{ text: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439" }, { text: "English" }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function scenarioKeyboard(lang) {
  return {
    keyboard: [[{ text: t(lang, "runTestButton") }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function rerunKeyboard(lang) {
  return {
    keyboard: [[{ text: t(lang, "runTestButton") }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

async function loadState(env, chatId) {
  if (!env.BOT_STATE_KV || !chatId) {
    return { lang: null };
  }

  try {
    const raw = await env.BOT_STATE_KV.get(`chat:${chatId}`, { type: "json" });
    if (raw && typeof raw === "object") {
      return {
        lang: raw.lang === LANG_EN || raw.lang === LANG_RU ? raw.lang : null
      };
    }
  } catch (error) {
    console.error("loadState failed", error);
  }
  return { lang: null };
}

async function saveState(env, chatId, patch) {
  if (!env.BOT_STATE_KV || !chatId) {
    return;
  }
  const current = await loadState(env, chatId);
  const next = { ...current, ...patch, lang: normalizeLang(patch.lang || current.lang || LANG_RU) };
  try {
    await env.BOT_STATE_KV.put(`chat:${chatId}`, JSON.stringify(next));
  } catch (error) {
    console.error("saveState failed", error);
  }
}

function isChatAllowed(env, chatId) {
  const allowed = normalizeChatId(env.TELEGRAM_ALLOWED_CHAT_ID);
  if (!allowed) {
    return true;
  }
  return normalizeChatId(chatId) === allowed;
}

async function dispatchGithubRun(
  env,
  {
    chatId,
    lang,
    scenarioKey,
    suite,
    generatedScenarioDraft,
    generatedScenarioDrafts,
    botUsername,
    startPayload,
    panelRunId,
    maxDrafts,
    reportCallbackUrlOverride
  }
) {
  const owner = String(env.GITHUB_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO || "").trim();
  const workflowFile = String(env.GITHUB_WORKFLOW_FILE || "telegram-web-e2e.yml").trim();
  const runSuite = normalizeSuite(suite || env.DEFAULT_SUITE || "autorun");
  const ref = String(env.GITHUB_REF || "main").trim();
  const reportCallbackUrl = String(reportCallbackUrlOverride || env.REPORT_CALLBACK_URL || "").trim();
  const githubToken = String(env.GITHUB_PAT || "").trim();

  if (!owner || !repo || !githubToken) {
    throw new Error("Missing GITHUB_OWNER/GITHUB_REPO/GITHUB_PAT");
  }

  const startedAtIso = new Date().toISOString();

  const dispatchBody = {
    ref,
    inputs: {
      suite: runSuite,
      chat_id: normalizeChatId(chatId),
      lang: String(lang),
      bot_lang: LANG_RU,
      scenario_key: String(scenarioKey),
      report_callback_url: reportCallbackUrl
    }
  };
  const normalizedBotUsername = normalizeBotUsername(botUsername);
  if (normalizedBotUsername) {
    dispatchBody.inputs.bot_username = normalizedBotUsername;
  }
  if (startPayload) {
    dispatchBody.inputs.bot_start_payload = String(startPayload);
  }
  if (panelRunId) {
    dispatchBody.inputs.panel_run_id = String(panelRunId);
  }
  if (runSuite === "generated_scenario" && generatedScenarioDraft) {
    dispatchBody.inputs.generated_scenario_draft = String(generatedScenarioDraft);
  }
  if (runSuite === "generated_scenarios" && generatedScenarioDrafts) {
    dispatchBody.inputs.generated_scenario_drafts = String(generatedScenarioDrafts);
    if (isDevGeneratedSelector(generatedScenarioDrafts)) {
      dispatchBody.inputs.generated_scenario_allow_test_account = "true";
    }
    dispatchBody.inputs.generated_scenario_max_drafts = String(
      clampNumber(maxDrafts || env.GENERATED_SCENARIO_DEV_MAX_DRAFTS || "8", 8, 1, 50)
    );
  }

  const dispatchResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${githubToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "telegram-e2e-runner-bot",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json"
      },
      body: JSON.stringify(dispatchBody)
    }
  );

  if (!dispatchResponse.ok) {
    const text = await dispatchResponse.text().catch(() => "");
    throw new Error(`Dispatch failed: ${dispatchResponse.status} ${text}`);
  }

  const waitUntil = Date.now() + 15000;
  let runUrl = `https://github.com/${owner}/${repo}/actions/workflows/${workflowFile}`;
  let runId = "";
  let runStatus = "";
  let runConclusion = "";

  while (Date.now() < waitUntil) {
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const runsResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
        workflowFile
      )}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=10`,
      {
        headers: {
          authorization: `Bearer ${githubToken}`,
          accept: "application/vnd.github+json",
          "user-agent": "telegram-e2e-runner-bot",
          "x-github-api-version": "2022-11-28"
        }
      }
    );

    if (!runsResponse.ok) {
      continue;
    }

    const payload = await runsResponse.json().catch(() => ({}));
    const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
    const match = runs.find((run) => typeof run?.created_at === "string" && run.created_at >= startedAtIso);
    if (match && typeof match.html_url === "string") {
      runUrl = match.html_url;
      runId = String(match.id || "");
      runStatus = String(match.status || "");
      runConclusion = String(match.conclusion || "");
      break;
    }
  }

  return {
    runUrl,
    runId,
    status: runStatus,
    conclusion: runConclusion
  };
}

async function triggerScenarioRun(env, chatId, lang, scenarioKey, runOptions = {}) {
  try {
    const run = await dispatchGithubRun(env, { chatId, lang, scenarioKey, ...runOptions });
    const messageText = [
      t(lang, "launchStarted"),
      `${t(lang, "reportScenario")}: ${scenarioTitle(lang, scenarioKey)}`,
      `${t(lang, "launchLink")} ${run.runUrl}`,
      t(lang, "launchWaitReport")
    ].join("\n");
    await safeSendMessage(env, chatId, messageText);
  } catch (error) {
    console.error("triggerScenarioRun failed", error);
    await safeSendMessage(env, chatId, t(lang, "launchFailed"));
  }
}

async function showLanguageMenu(env, chatId) {
  const text = t(LANG_RU, "chooseLanguage");
  await safeSendMessage(env, chatId, text, languageKeyboard(), `${text}\nru / en`);
}

async function showScenarioMenu(env, chatId, lang, withSavedText) {
  const baseText = withSavedText
    ? `${t(lang, "languageSaved")}\n\n${t(lang, "chooseScenario")}\n${scenarioTitle(lang, SCENARIO_START_FINISH)}`
    : `${t(lang, "chooseScenario")}\n${scenarioTitle(lang, SCENARIO_START_FINISH)}`;
  if (withSavedText) {
    await safeSendMessage(env, chatId, baseText, scenarioKeyboard(lang), `${baseText}\n/run ${lang}`);
    return;
  }
  await safeSendMessage(env, chatId, baseText, scenarioKeyboard(lang), `${baseText}\n/run ${lang}`);
}

async function handleStart(env, chatId) {
  const state = await loadState(env, chatId);
  if (state.lang === LANG_RU || state.lang === LANG_EN) {
    await showScenarioMenu(env, chatId, state.lang, false);
    return;
  }
  await showLanguageMenu(env, chatId);
}

async function handleCallbackQuery(env, callbackQuery) {
  const callbackId = callbackQuery?.id;
  const data = callbackQuery?.data || "";
  const message = callbackQuery?.message;
  const chatId = normalizeChatId(message?.chat?.id);

  if (!chatId || !callbackId) {
    return;
  }

  if (!isChatAllowed(env, chatId)) {
    await safeAnswerCallback(env, callbackId, t(LANG_RU, "ignoredChat"));
    return;
  }

  const state = await loadState(env, chatId);
  const lang = normalizeLang(state.lang || LANG_RU);

  if (data.startsWith("lang:")) {
    const selected = normalizeLang(data.split(":")[1]);
    await saveState(env, chatId, { lang: selected });
    await safeAnswerCallback(env, callbackId, t(selected, "languageSaved"));
    await showScenarioMenu(env, chatId, selected, true);
    return;
  }

  if (data === "run_new") {
    await safeAnswerCallback(env, callbackId, t(lang, "runStartedToast"));
    await showScenarioMenu(env, chatId, lang, false);
    return;
  }

  if (data.startsWith("scenario:")) {
    const scenarioKey = data.split(":")[1] || SCENARIO_START_FINISH;
    await safeAnswerCallback(env, callbackId, t(lang, "runStartedToast"));
    await triggerScenarioRun(env, chatId, lang, scenarioKey);
  }
}

function decodeBase64(input) {
  const normalized = String(input || "").trim();
  if (!normalized) {
    return new Uint8Array(0);
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function githubApi(env, path, options = {}) {
  const owner = String(env.GITHUB_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO || "").trim();
  const githubToken = String(env.GITHUB_PAT || "").trim();
  if (!owner || !repo || !githubToken) {
    throw new Error("Missing GITHUB_OWNER/GITHUB_REPO/GITHUB_PAT");
  }
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${githubToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "telegram-e2e-runner-panel",
      "x-github-api-version": "2022-11-28",
      ...(options.body ? { "content-type": "application/json" } : {})
    },
    body: options.body
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub API failed: ${response.status} ${text}`);
  }
  const text = await response.text().catch(() => "");
  return text ? JSON.parse(text) : {};
}

async function githubJson(env, path) {
  return githubApi(env, path);
}

async function cancelGithubRun(env, runId) {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    return false;
  }
  await githubApi(env, `/actions/runs/${encodeURIComponent(safeRunId)}/cancel`, { method: "POST" });
  return true;
}

async function fetchGithubRunDetails(env, runId) {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    return null;
  }
  const [run, jobsPayload] = await Promise.all([
    githubJson(env, `/actions/runs/${encodeURIComponent(safeRunId)}`),
    githubJson(env, `/actions/runs/${encodeURIComponent(safeRunId)}/jobs?per_page=100`)
  ]);
  return {
    id: String(run?.id || safeRunId),
    name: String(run?.name || ""),
    status: String(run?.status || ""),
    conclusion: String(run?.conclusion || ""),
    html_url: String(run?.html_url || ""),
    created_at: String(run?.created_at || ""),
    updated_at: String(run?.updated_at || ""),
    run_started_at: String(run?.run_started_at || ""),
    jobs: Array.isArray(jobsPayload?.jobs)
      ? jobsPayload.jobs.map((job) => ({
          id: String(job?.id || ""),
          name: String(job?.name || ""),
          status: String(job?.status || ""),
          conclusion: String(job?.conclusion || ""),
          started_at: String(job?.started_at || ""),
          completed_at: String(job?.completed_at || ""),
          html_url: String(job?.html_url || ""),
          steps: Array.isArray(job?.steps)
            ? job.steps.map((step) => ({
                name: String(step?.name || ""),
                status: String(step?.status || ""),
                conclusion: String(step?.conclusion || ""),
                number: Number.isFinite(Number(step?.number)) ? Number(step.number) : 0,
                started_at: String(step?.started_at || ""),
                completed_at: String(step?.completed_at || "")
              }))
            : []
        }))
      : []
  };
}

async function isPanelRunCancelled(env, id) {
  const current = await loadPanelRun(env, id);
  return ["cancelled", "cancel_requested"].includes(String(current?.status || "").trim().toLowerCase());
}

async function runCloudflarePanelRun(env, panelRunId, fallbackRun = null) {
  const loadedRun = await loadPanelRun(env, panelRunId);
  let run =
    loadedRun && fallbackRun
      ? {
          ...fallbackRun,
          ...loadedRun,
          workflow_instance_id: loadedRun.workflow_instance_id || fallbackRun.workflow_instance_id,
          workflow_status: loadedRun.workflow_status || fallbackRun.workflow_status
        }
      : loadedRun || fallbackRun;
  if (!run || !env.BOT_STATE_KV) {
    return;
  }
  if (isTerminalPanelRun(run)) {
    return;
  }
  if (!loadedRun && fallbackRun) {
    await savePanelRun(env, run);
  }

  run = appendPanelEvent(
    {
      ...run,
      status: "running",
      engine: "cloudflare",
      cloudflare_phase: "start",
      cloudflare_progress: {
        phase: "start",
        status: "running",
        message: `${cloudflareRunnerTitle(run)} начал прогон`
      },
      updated_at: nowIso()
    },
    { phase: "cloudflare", status: "running", message: `${cloudflareRunnerTitle(run)} начал прогон` }
  );
  await savePanelRun(env, run);

  const recordCloudflareProgress = async (event) => {
    const latest = (await loadPanelRun(env, panelRunId)) || run;
    if (["cancelled", "cancel_requested"].includes(String(latest.status || "").trim().toLowerCase())) {
      return;
    }
    const phase = String(event?.phase || "cloudflare").trim() || "cloudflare";
    const status = String(event?.status || "running").trim() || "running";
    const message = String(event?.message || "").trim();
    const next = appendPanelEvent(
      {
        ...latest,
        status: "running",
        engine: "cloudflare",
        cloudflare_phase: phase,
        cloudflare_progress: {
          ...event,
          phase,
          status,
          message
        },
        updated_at: nowIso()
      },
      { phase, status, message: message || "Cloudflare runner обновил прогресс" }
    );
    await savePanelRun(env, next);
  };

  try {
    const result = await executeCloudflareNativeRun(env, run, {
      shouldStop: () => isPanelRunCancelled(env, panelRunId),
      onProgress: recordCloudflareProgress
    });
    const latest = (await loadPanelRun(env, panelRunId)) || run;
    if (["cancelled", "cancel_requested"].includes(String(latest.status || "").trim().toLowerCase())) {
      await savePanelRun(
        env,
        appendPanelEvent(
          {
            ...latest,
            status: "cancelled",
            cloudflare_phase: "finish",
            cloudflare_progress: {
              phase: "finish",
              status: "cancelled",
              message: "Cloudflare runner остановлен после отмены"
            },
            completed_at: nowIso(),
            updated_at: nowIso()
          },
          { phase: "cloudflare", status: "cancelled", message: "Cloudflare runner остановлен после отмены" }
        )
      );
      return;
    }

    const next = appendPanelEvent(
      {
        ...latest,
        ...result,
        engine: "cloudflare",
        cloudflare_phase: "finish",
        cloudflare_progress: {
          phase: "finish",
          status: result.status || "success",
          message:
            result.status === "success"
              ? `${cloudflareRunnerTitle(latest)} завершил прогон`
              : result.status === "cancelled"
                ? `${cloudflareRunnerTitle(latest)} отменён`
                : `${cloudflareRunnerTitle(latest)} завершился с ошибкой`
        },
        updated_at: nowIso()
      },
      {
        phase: "cloudflare",
        status: result.status || "success",
        message:
          result.status === "success"
            ? `${cloudflareRunnerTitle(latest)} завершил прогон`
            : result.status === "cancelled"
              ? `${cloudflareRunnerTitle(latest)} отменён`
              : `${cloudflareRunnerTitle(latest)} завершился с ошибкой`
      }
    );
    await savePanelRun(env, next);
  } catch (error) {
    const latest = (await loadPanelRun(env, panelRunId)) || run;
    const message = error instanceof Error ? error.message : String(error);
    const next = appendPanelEvent(
      {
        ...latest,
        status: "failure",
        error: message,
        engine: "cloudflare",
        cloudflare_phase: "finish",
        cloudflare_progress: {
          phase: "finish",
          status: "failure",
          message
        },
        completed_at: nowIso(),
        updated_at: nowIso()
      },
      { phase: "cloudflare", status: "failure", message }
    );
    await savePanelRun(env, next);
  }
}

function cloudflareWorkflowInstanceId(panelRunId) {
  return String(panelRunId || "").trim();
}

async function createCloudflarePanelWorkflow(env, panelRunId, runPayload) {
  const workflow = env.PANEL_RUN_WORKFLOW;
  if (!workflow || typeof workflow.create !== "function") {
    return null;
  }
  const workflowInstanceId = cloudflareWorkflowInstanceId(panelRunId);
  const instance = await workflow.create({
    id: workflowInstanceId,
    params: { panelRunId, run: runPayload || null }
  });
  const details = await instance.status().catch(() => null);
  return {
    instanceId: instance.id || workflowInstanceId,
    status: details?.status || "queued"
  };
}

async function terminateCloudflarePanelWorkflow(env, run) {
  const workflowInstanceId = String(run?.workflow_instance_id || "").trim();
  if (!workflowInstanceId || !env.PANEL_RUN_WORKFLOW || typeof env.PANEL_RUN_WORKFLOW.get !== "function") {
    return false;
  }
  const instance = await env.PANEL_RUN_WORKFLOW.get(workflowInstanceId);
  await instance.terminate();
  return true;
}

export class TelegramE2ERunWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const panelRunId = String(event?.payload?.panelRunId || "").trim();
    if (!panelRunId) {
      throw new Error("panelRunId is required");
    }
    return step.do(
      "execute cloudflare mtproto run",
      { retries: { limit: 1, delay: "5 seconds", backoff: "linear" } },
      async () => {
        const fallbackRun = event?.payload?.run && typeof event.payload.run === "object" ? event.payload.run : null;
        await runCloudflarePanelRun(this.env, panelRunId, fallbackRun);
        const run = await loadPanelRun(this.env, panelRunId);
        return {
          panelRunId,
          status: run?.status || "unknown",
          completed_at: run?.completed_at || null,
          error: run?.error || null,
          has_result: Boolean(run?.cloudflare_run || run?.generated_suite || run?.bot_map),
          node_count: run?.cloudflare_run?.node_count || 0
        };
      }
    );
  }
}

function panelHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Панель QA автотестов</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f6f1;
      --ink: #18201d;
      --muted: #66706b;
      --line: #d8ded8;
      --panel: #ffffff;
      --soft: #eef3ef;
      --accent: #23795f;
      --accent-2: #a35f00;
      --danger: #b3261e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    .shell {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      min-height: 100vh;
    }
    aside {
      border-right: 1px solid var(--line);
      background: #fbfcf8;
      padding: 18px;
    }
    main { padding: 18px 22px 40px; }
    h1 { margin: 0 0 18px; font-size: 20px; font-weight: 750; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 16px; font-weight: 700; letter-spacing: 0; }
    label { display: block; margin: 12px 0 6px; color: var(--muted); font-size: 12px; font-weight: 650; }
    input, select, textarea, button {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 11px;
      font: inherit;
      background: #fff;
      color: var(--ink);
    }
    textarea { min-height: 86px; resize: vertical; }
    button {
      cursor: pointer;
      font-weight: 700;
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    button:disabled { cursor: wait; opacity: 0.65; }
    button.secondary { background: #fff; color: var(--ink); border-color: var(--line); }
    button.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
    button.inline { width: auto; min-width: 108px; padding: 8px 10px; }
    .row { display: flex; gap: 8px; align-items: center; }
    .row > * { min-width: 0; }
    .field-note { margin-top: 5px; font-size: 12px; color: var(--muted); }
    .topbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .top-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 16px; }
    .tab {
      width: auto;
      padding: 8px 10px;
      background: transparent;
      color: var(--muted);
      border-color: transparent;
    }
    .tab.active { color: var(--ink); background: var(--soft); border-color: var(--line); }
    .section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .muted { color: var(--muted); }
    .error { color: var(--danger); white-space: pre-wrap; }
    .pill {
      display: inline-flex;
      align-items: center;
      height: 26px;
      padding: 0 9px;
      border-radius: 999px;
      background: var(--soft);
      color: var(--ink);
      font-size: 12px;
      font-weight: 700;
      margin: 0 6px 6px 0;
    }
    .pill.ok { background: #dff2e8; color: #0d5d44; }
    .pill.warn { background: #fff0d6; color: #7a4700; }
    .pill.bad { background: #fde5e2; color: #8b1d16; }
    .list { display: grid; gap: 8px; }
    .item {
      border-top: 1px solid var(--line);
      padding-top: 10px;
    }
    .item:first-child { border-top: 0; padding-top: 0; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .run-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 9px 0;
      border-top: 1px solid var(--line);
    }
    .run-row:first-child { border-top: 0; }
    .branch {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: start;
      padding: 10px 0;
      border-top: 1px solid var(--line);
    }
    .branch:first-child { border-top: 0; }
    .branch input { width: 16px; height: 16px; padding: 0; margin-top: 2px; }
    .steps { margin-top: 8px; display: grid; gap: 5px; }
    .step {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr) 92px;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: #f8faf6;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
    }
    .evidence-shot {
      display: block;
      max-width: min(760px, 100%);
      max-height: 520px;
      object-fit: contain;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      margin-top: 8px;
    }
    .artifact-link {
      display: inline-block;
      margin-top: 6px;
      font-weight: 700;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (max-width: 820px) {
      .shell { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      main { padding: 16px; }
      .topbar { align-items: stretch; flex-direction: column; }
      .top-actions { justify-content: stretch; }
      .row { flex-direction: column; align-items: stretch; }
      button.inline { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <h1>Панель QA автотестов</h1>
      <label for="targetType">Что тестируем</label>
      <select id="targetType">
        <option value="telegram_bot">Telegram-бот</option>
        <option value="website">Сайт или веб-приложение</option>
      </select>
      <div id="telegramFields">
        <label for="botUsername">Username бота</label>
        <input id="botUsername" autocomplete="off" placeholder="@example_bot">
        <label for="startPayload">Payload для /start</label>
        <input id="startPayload" autocomplete="off" placeholder="необязательно">
      </div>
      <div id="websiteFields" hidden>
        <label for="targetUrl">URL сайта / приложения</label>
        <input id="targetUrl" autocomplete="off" placeholder="https://rate2cash.com">
        <label for="browserProfile">Устройство</label>
        <select id="browserProfile">
          <option value="mobile">Мобильный браузер</option>
          <option value="tablet">Планшет</option>
          <option value="desktop">Desktop</option>
        </select>
        <label for="testObjective">Что проверить</label>
        <textarea id="testObjective" placeholder="Например: пройти авторизацию, проверить главный экран, меню, задачи, пополнение, ошибки в формах."></textarea>
        <label for="authInstructions">Авторизация / тестовый аккаунт</label>
        <textarea id="authInstructions" placeholder="Необязательно. Пиши только тестовые данные: как войти, какой аккаунт использовать, что нельзя менять."></textarea>
        <div class="field-note">Инструкции авторизации передаются runner-у на время запуска и не показываются в панели после сохранения.</div>
      </div>
      <div class="row">
        <div style="flex:1">
          <label for="suite">Режим</label>
          <select id="suite">
            <option value="generated_scenarios">Карта + AI + тест веток</option>
            <option value="discover_mtproto">Только карта</option>
            <option value="website_audit">Сайт: обзор + авторизация + AI</option>
          </select>
        </div>
        <div style="width:120px">
          <label for="maxDrafts">Лимит</label>
          <input id="maxDrafts" type="number" min="1" max="50" value="20">
        </div>
      </div>
      <label for="engine">Движок</label>
      <select id="engine">
        <option value="cloudflare">Cloudflare</option>
        <option value="github">GitHub Actions</option>
      </select>
      <label for="selector">Выбор веток</label>
      <select id="selector">
        <option value="dev">полный dev/test проход</option>
        <option value="smart">умный выбор</option>
        <option value="safe">только безопасные</option>
        <option value="all-safe">все безопасные</option>
        <option value="runnable">все исполняемые</option>
      </select>
      <div class="row" style="margin-top:14px">
        <button id="startRun">Запустить</button>
        <button id="refresh" class="secondary">Обновить</button>
      </div>
      <div class="section" style="margin-top:16px">
        <h2>Последние прогоны</h2>
        <div id="runList" class="list muted">Загрузка...</div>
      </div>
    </aside>
    <main>
      <div class="topbar">
        <div>
          <h1 id="runTitle">Прогон не выбран</h1>
          <div id="runMeta" class="muted">Создай новый прогон или выбери существующий слева.</div>
        </div>
        <div class="top-actions">
          <button id="cancelRun" class="inline danger" hidden>Отменить</button>
          <button id="runSelected" class="inline secondary">Запустить выбранное</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab active" data-tab="progress">Прогресс</button>
        <button class="tab" data-tab="documents">Документы</button>
        <button class="tab" data-tab="tree">Дерево логики</button>
        <button class="tab" data-tab="branches">Ветки</button>
        <button class="tab" data-tab="ai">AI-разбор</button>
      </div>
      <div id="message" class="error"></div>
      <section id="tab-progress" class="section"><h2>Прогресс</h2><div class="muted">Прогон не выбран.</div></section>
      <section id="tab-documents" class="section" hidden><h2>Документы</h2><div class="muted">Прогон не выбран.</div></section>
      <section id="tab-tree" class="section" hidden><h2>Дерево логики</h2><div class="muted">Прогон не выбран.</div></section>
      <section id="tab-branches" class="section" hidden><h2>Ветки</h2><div class="muted">Прогон не выбран.</div></section>
      <section id="tab-ai" class="section" hidden><h2>AI-разбор</h2><div class="muted">Прогон не выбран.</div></section>
    </main>
  </div>
  <script>
    const state = {
      runId: new URLSearchParams(location.search).get("run") || "",
      latestRun: null,
      poll: null,
      creating: false,
      cancelling: false
    };
    const q = (selector) => document.querySelector(selector);
    const qa = (selector) => Array.from(document.querySelectorAll(selector));

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char]));
    }

    function compactUiText(value, maxLength) {
      const text = String(value || "").replace(/\\s+/g, " ").trim();
      return text.length > maxLength ? text.slice(0, maxLength - 3).trim() + "..." : text;
    }

    async function api(path, options = {}) {
      const headers = Object.assign({ "content-type": "application/json" }, options.headers || {});
      const response = await fetch(path, Object.assign({}, options, { headers }));
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { error: text }; }
      if (!response.ok) throw new Error(payload.error || text || ("HTTP " + response.status));
      return payload;
    }

    function pill(text, kind) {
      return '<span class="pill ' + (kind || "") + '">' + escapeHtml(uiLabel(text)) + '</span>';
    }

    function statusKind(value) {
      const text = String(value || "").toLowerCase();
      if (text === "success" || text === "completed" || text === "passed" || text === "pass") return "ok";
      if (text === "failure" || text === "failed" || text === "fail" || text === "cancelled" || text === "timed_out" || text === "critical" || text === "high" || text === "browser_run_failed" || text === "blocked") return "bad";
      if (text === "queued" || text === "requested" || text === "running" || text === "in_progress" || text === "syncing_result" || text === "cancel_requested" || text === "warning" || text === "medium" || text === "pending_browser_run" || text === "limited_out") return "warn";
      return "";
    }

    function uiLabel(value) {
      const text = String(value || "");
      const labels = {
        generated_scenarios: "карта + AI + тест веток",
        discover_mtproto: "только карта",
        website_audit: "сайт: обзор + авторизация + AI",
        website: "сайт",
        telegram_bot: "Telegram-бот",
        mobile: "мобильный",
        tablet: "планшет",
        desktop: "desktop",
        cloudflare: "Cloudflare",
        github: "GitHub Actions",
        start: "старт",
        discovery: "карта Telegram",
        suite: "ветки",
        webapp: "WebApp/URL",
        website_audit_phase: "сайт",
        ai: "AI-разбор",
        finish: "финал",
        complete: "завершён",
        errored: "ошибка",
        terminated: "остановлен",
        smart: "умный выбор",
        safe: "безопасные",
        "all-safe": "все безопасные",
        runnable: "исполняемые",
        dev: "полный dev/test",
        telegram_button_click: "Telegram click",
        browser_webapp_audit: "Browser WebApp",
        queued: "в очереди",
        requested: "запрошен",
        waiting: "ожидание",
        pending: "ожидание",
        running: "выполняется",
        in_progress: "выполняется",
        syncing_result: "синхронизирую результат",
        completed: "завершён",
        success: "успешно",
        failure: "ошибка",
        failed: "ошибка",
        cancelled: "отменён",
        cancel_requested: "отменяется",
        dispatch_failed: "ошибка запуска",
        timed_out: "таймаут",
        passed: "прошло",
        pass: "прошло",
        warning: "предупреждение",
        blocked: "заблокировано",
        flaky: "нестабильно",
        not_run: "не запускалось",
        pending_browser_run: "ждёт Browser Run",
        browser_run_complete: "Browser Run готов",
        browser_run_failed: "Browser Run ошибка",
        limited_out: "не вошло в лимит",
        unknown: "неизвестно",
        low: "низкий",
        medium: "средний",
        high: "высокий",
        critical: "критичный",
        created: "создан",
        expected: "ожидается",
        branch: "ветка",
        new: "новая"
      };
      return labels[text.toLowerCase()] || text;
    }

    function setMessage(text) {
      q("#message").textContent = text || "";
    }

    function isLiveStatus(value) {
      const text = String(value || "").toLowerCase();
      return ["queued", "requested", "waiting", "pending", "in_progress", "running", "cancel_requested"].includes(text);
    }

    function runStatusRank(value) {
      const text = String(value || "").toLowerCase();
      if (["success", "failure", "failed", "cancelled", "timed_out", "completed"].includes(text)) return 3;
      if (text === "syncing_result") return 2;
      if (["running", "in_progress", "cancel_requested"].includes(text)) return 1;
      return 0;
    }

    function eventKey(event) {
      return [event.time || "", event.phase || "", event.status || "", event.message || ""].join("|");
    }

    function mergePanelEvents(currentEvents, incomingEvents) {
      const merged = [];
      const seen = new Set();
      [...(currentEvents || []), ...(incomingEvents || [])].forEach((event) => {
        const key = eventKey(event || {});
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(event);
      });
      return merged
        .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
        .slice(-50);
    }

    function mergeRunSnapshot(incoming) {
      const current = state.latestRun;
      if (!incoming || !incoming.id) {
        return incoming || {};
      }
      if (!current || current.id !== incoming.id) {
        state.latestRun = incoming;
        return incoming;
      }
      const currentRank = runStatusRank(current.github_live?.conclusion || current.github?.conclusion || current.status);
      const incomingRank = runStatusRank(incoming.github_live?.conclusion || incoming.github?.conclusion || incoming.status);
      const incomingIsOlder = String(incoming.updated_at || "") < String(current.updated_at || "") ||
        (Array.isArray(incoming.events) && Array.isArray(current.events) && incoming.events.length < current.events.length);
      const merged = {
        ...current,
        ...incoming,
        events: mergePanelEvents(current.events, incoming.events)
      };
      if (currentRank > incomingRank || (incomingIsOlder && incomingRank <= currentRank)) {
        merged.status = current.status || incoming.status;
        merged.workflow_status = current.workflow_status || incoming.workflow_status;
        merged.workflow_output_status = current.workflow_output_status || incoming.workflow_output_status;
        merged.cloudflare_phase = current.cloudflare_phase || incoming.cloudflare_phase;
        merged.cloudflare_progress = current.cloudflare_progress || incoming.cloudflare_progress;
        merged.cloudflare_run = current.cloudflare_run || incoming.cloudflare_run;
        merged.generated_suite = current.generated_suite || incoming.generated_suite;
        merged.generated_suite_ai_review = current.generated_suite_ai_review || incoming.generated_suite_ai_review;
        merged.bot_map = current.bot_map || incoming.bot_map;
        merged.screenshot_count = current.screenshot_count ?? incoming.screenshot_count;
        merged.completed_at = current.completed_at || incoming.completed_at;
        merged.updated_at = current.updated_at || incoming.updated_at;
      }
      state.latestRun = merged;
      return merged;
    }

    function setCreateBusy(isBusy) {
      state.creating = isBusy;
      const startButton = q("#startRun");
      const selectedButton = q("#runSelected");
      startButton.disabled = isBusy;
      selectedButton.disabled = isBusy;
      startButton.textContent = isBusy ? "Запускаю..." : "Запустить";
      selectedButton.textContent = isBusy ? "Запускаю..." : "Запустить выбранное";
    }

    function isWebsiteTarget() {
      return q("#targetType").value === "website";
    }

    function toggleTargetFields() {
      const website = isWebsiteTarget();
      q("#telegramFields").hidden = website;
      q("#websiteFields").hidden = !website;
      q("#runSelected").hidden = website;
      if (website) {
        q("#suite").value = "website_audit";
        q("#engine").value = "cloudflare";
        q("#selector").disabled = true;
        q("#maxDrafts").disabled = true;
        q("#engine").disabled = true;
      } else {
        if (q("#suite").value === "website_audit") q("#suite").value = "generated_scenarios";
        q("#selector").disabled = false;
        q("#maxDrafts").disabled = false;
        q("#engine").disabled = false;
      }
    }

    function setCancelBusy(isBusy) {
      state.cancelling = isBusy;
      const button = q("#cancelRun");
      button.disabled = isBusy;
      button.textContent = isBusy ? "Отменяю..." : "Отменить";
    }

    async function loadRuns() {
      const payload = await api("/api/runs");
      const runs = payload.runs || [];
      q("#runList").innerHTML = runs.length ? runs.map((run) => {
        const targetLabel = run.target_url || run.bot_username || run.id;
        return '<div class="run-row"><div><b>' + escapeHtml(targetLabel) + '</b><div class="muted mono">' +
          escapeHtml(uiLabel(run.status || "queued") + " · " + uiLabel(run.engine || "cloudflare") + " · " + (run.created_at || "")) +
          '</div></div><button class="inline secondary" data-open-run="' + escapeHtml(run.id) + '">Открыть</button></div>';
      }).join("") : '<div class="muted">Прогонов пока нет.</div>';
      qa("[data-open-run]").forEach((button) => {
        button.addEventListener("click", () => {
          state.runId = button.getAttribute("data-open-run") || "";
          state.latestRun = null;
          history.replaceState(null, "", state.runId ? "?run=" + encodeURIComponent(state.runId) : location.pathname);
          loadRun();
        });
      });
    }

    function renderJobs(github) {
      const jobs = github && Array.isArray(github.jobs) ? github.jobs : [];
      if (!jobs.length) return '<div class="muted">Детали GitHub jobs пока недоступны.</div>';
      return jobs.map((job) => {
        const steps = Array.isArray(job.steps) ? job.steps : [];
        return '<div class="item"><b>' + escapeHtml(job.name || "job") + '</b> ' +
          pill(job.status || "unknown", statusKind(job.conclusion || job.status)) +
          (job.conclusion ? pill(job.conclusion, statusKind(job.conclusion)) : "") +
          '<div class="steps">' + steps.map((step) => {
            return '<div class="step"><span class="mono">' + escapeHtml(step.number || "") + '</span><span>' +
              escapeHtml(step.name || "") + '</span><span>' + escapeHtml(uiLabel(step.conclusion || step.status || "")) + '</span></div>';
          }).join("") + '</div></div>';
      }).join("");
    }

    function renderCountryDevicePreflight(run) {
      const suite = run.generated_suite || {};
      const preflight = suite.country_device_preflight || run.country_device_preflight || null;
      if (!preflight) return "";
      const expected = preflight.expected_country || {};
      const profile = preflight.profile_country || {};
      const target = preflight.device_check_target || {};
      const check = preflight.device_check || {};
      const after = preflight.join_task_after_check || {};
      const outcome = after.outcome || (preflight.join_task_before_check || {}).outcome || {};
      const countryClick = profile.country_click || {};
      const countryPages = Array.isArray(profile.country_pages) ? profile.country_pages : [];
      const countryPageSummary = countryPages
        .slice(0, 5)
        .map((page) => {
          const sample = Array.isArray(page.sample) ? page.sample.slice(0, 5).join(", ") : "";
          return "стр. " + page.page + ": " + (sample || "нет стран");
        })
        .join("\\n");
      const lines = [
        "статус: " + uiLabel(preflight.status || "unknown"),
        expected.countryName || expected.countryCode ? "IP-страна: " + [expected.countryName, expected.countryCode].filter(Boolean).join(" / ") : "",
        expected.source ? "источник страны: " + expected.source : "",
        profile.selected_country_before ? "страна до: " + profile.selected_country_before : "",
        countryClick.button?.text ? "нажата страна: " + countryClick.button.text : "",
        profile.selected_country_after ? "страна после: " + profile.selected_country_after : "",
        profile.changed ? "страна изменена: да" : "",
        countryPageSummary ? "просмотренные страны:\\n" + countryPageSummary : "",
        target.url ? "check-link: " + target.url : "check-link: не найден",
        check.ok ? "check-page: открыта" : check.reason || check.json_error ? "check-page: " + (check.reason || check.json_error) : "",
        outcome.profile_country || outcome.detected_country
          ? "check country: " + [outcome.profile_country ? "profile " + outcome.profile_country : "", outcome.detected_country ? "detected " + outcome.detected_country : ""].filter(Boolean).join(" / ")
          : "",
        outcome.vpn ? "VPN: " + outcome.vpn : "",
        typeof outcome.country_match === "boolean" && (outcome.profile_country || outcome.detected_country) ? "country match: " + (outcome.country_match ? "да" : "нет") : "",
        typeof after.confirmation_blocker === "boolean" ? "join_task после проверки: " + (after.confirmation_blocker ? "всё ещё заблокирован" : "разблокирован") : "",
        preflight.error ? "ошибка preflight: " + preflight.error : "",
        profile.error ? "ошибка страны: " + profile.error : ""
      ].filter(Boolean);
      return '<div class="item"><b>Country/device preflight</b> ' +
        pill(preflight.status || "unknown", statusKind(preflight.status)) +
        '<pre>' + escapeHtml(lines.join("\\n")) + '</pre>' +
        renderScreenshotEvidence(check) +
        '</div>';
    }

    function renderExecutionDetails(run, github) {
      if (run.engine === "cloudflare") {
        const cf = run.cloudflare_run || {};
        const progress = run.cloudflare_progress || {};
        const lines = [
          run.workflow_instance_id ? "workflow: " + run.workflow_instance_id : "",
          run.workflow_status ? "workflow статус: " + uiLabel(run.workflow_status) : "",
          run.workflow_output_status ? "workflow output: " + uiLabel(run.workflow_output_status) : "",
          run.cloudflare_phase ? "этап: " + uiLabel(run.cloudflare_phase) : "",
          progress.message ? "сейчас: " + progress.message : "",
          cf.runner ? "runner: " + cf.runner : "runner: cloudflare-mtproto",
          Number.isFinite(Number(cf.node_count)) ? "узлов: " + cf.node_count : "",
          Number.isFinite(Number(cf.edge_count)) ? "переходов: " + cf.edge_count : "",
          Number.isFinite(Number(cf.webapp_screenshot_count)) ? "WebApp скриншотов: " + cf.webapp_screenshot_count : "",
          Number.isFinite(Number(cf.website_screenshot_count)) ? "скриншотов сайта: " + cf.website_screenshot_count : "",
          cf.target_url ? "url: " + cf.target_url : "",
          cf.browser_profile ? "устройство: " + uiLabel(cf.browser_profile) : "",
          typeof cf.auth_configured === "boolean" ? "auth настроен: " + (cf.auth_configured ? "да" : "нет") : "",
          typeof cf.auth_confirmed === "boolean" ? "auth подтвержден: " + (cf.auth_confirmed ? "да" : "нет") : "",
          Number.isFinite(Number((run.generated_suite || {}).coverage?.followedActions)) ? "выполнено действий: " + (run.generated_suite || {}).coverage.followedActions : "",
          Number.isFinite(Number((run.generated_suite || {}).coverage?.telegramClicks)) ? "Telegram кликов: " + (run.generated_suite || {}).coverage.telegramClicks : "",
          cf.ai_model ? "AI: " + cf.ai_model : "",
          run.error ? "ошибка: " + run.error : "",
          run.duration_sec ? "время: " + run.duration_sec + " сек." : ""
        ].filter(Boolean);
        return '<div class="item"><b>Cloudflare runner</b><pre>' + escapeHtml(lines.join("\\n") || "Выполняется в Cloudflare.") + '</pre></div>' +
          renderCountryDevicePreflight(run);
      }
      return renderJobs(github);
    }

    function renderDocuments(run) {
      const suite = run.generated_suite || {};
      const ai = run.generated_suite_ai_review || {};
      const isCloudflare = run.engine === "cloudflare";
      const docs = [];
      if (Array.isArray(suite.source_artifacts)) {
        suite.source_artifacts.forEach((name) => docs.push(name));
      }
      const requiredDocs = run.target_type === "website"
        ? ["website-audit-report.json", "website-ai-review.json", "website-homepage.png"]
        : isCloudflare
        ? ["bot-map.json", "bot-map.enriched.json", "generated-test-plan.json", "generated-scenarios.json", "cloudflare-mtproto-report.json"]
        : ["bot-map.json", "bot-map.enriched.json", "generated-test-plan.json", "generated-scenarios.json", "webapp-handoffs.json", "followed-actions.json", "generated-scenario-suite-report.json", "generated-scenario-ai-review.json"];
      requiredDocs.forEach((name) => {
        if (!docs.includes(name)) docs.push(name);
      });
      if (isCloudflare && ai && Object.keys(ai).length > 0 && !docs.includes("cloudflare-ai-review.json")) {
        docs.push("cloudflare-ai-review.json");
      }
      return '<h2>Документы</h2><div class="list">' + docs.map((name) => {
        const present = (Array.isArray(suite.source_artifacts) && suite.source_artifacts.includes(name)) ||
          suite.report_file === name || ai.report_file === name ||
          (name === "website-audit-report.json" && suite.website_audit) ||
          (name === "website-ai-review.json" && ai && Object.keys(ai).length > 0) ||
          (name === "website-homepage.png" && suite.website_audit?.screenshot) ||
          (name === "bot-map.json" && (suite.bot_map || run.bot_map)) ||
          (name === "webapp-handoffs.json" && Array.isArray(suite.webapp_handoffs) && suite.webapp_handoffs.length > 0) ||
          (name === "followed-actions.json" && Array.isArray(suite.followed_actions) && suite.followed_actions.length > 0) ||
          (name === "cloudflare-ai-review.json" && ai && Object.keys(ai).length > 0);
        return '<div class="item">' + pill(present ? "created" : "expected", present ? "ok" : "") +
          '<span class="mono">' + escapeHtml(name) + '</span></div>';
      }).join("") + '</div>';
    }

    function renderScreenshotEvidence(browser) {
      const shot = browser && browser.screenshot ? browser.screenshot : null;
      if (!shot) return "";
      if (shot.url) {
        const title = [
          shot.byte_length ? (shot.byte_length + " bytes") : "",
          shot.browser_ms_used ? ("browser " + shot.browser_ms_used + "ms") : ""
        ].filter(Boolean).join(" · ");
        return '<a class="artifact-link" href="' + escapeHtml(shot.url) + '" target="_blank" rel="noreferrer">Открыть скриншот</a>' +
          '<a href="' + escapeHtml(shot.url) + '" target="_blank" rel="noreferrer">' +
          '<img class="evidence-shot" src="' + escapeHtml(shot.url) + '" alt="' + escapeHtml(title || "WebApp screenshot") + '">' +
          '</a>';
      }
      return shot.reason ? '<div class="muted">' + escapeHtml(shot.reason) + '</div>' : "";
    }

    function renderTelegramClickEvidence(click) {
      if (!click || !click.enabled) return "";
      const result = click.click?.result || {};
      const lines = [
        "status: " + (click.ok ? "clicked" : click.cancelled ? "cancelled" : "failed"),
        click.button?.text ? "button: " + click.button.text : "",
        result.kind ? "result: " + result.kind : "",
        result.url ? "url: " + result.url : "",
        click.error ? "error: " + click.error : ""
      ].filter(Boolean);
      const messages = Array.isArray(click.new_messages) ? click.new_messages : [];
      return '<div class="item"><b>Действие по просьбе бота</b><pre>' + escapeHtml(lines.join("\\n")) + '</pre>' +
        (messages.length ? '<div class="muted">Новые сообщения после клика</div><pre>' +
          escapeHtml(messages.map((message) => compactUiText(message.text || "", 240)).join("\\n\\n")) + '</pre>' : '') +
        '</div>';
    }

    function renderBranches(run) {
      const suite = run.generated_suite || {};
      const drafts = run.drafts || [];
      const selectedIds = Array.isArray(suite.selected_ids) ? suite.selected_ids : [];
      const missingIds = Array.isArray(suite.missing_selected_ids) ? suite.missing_selected_ids : [];
      const reviews = Array.isArray((run.generated_suite_ai_review || {}).branch_reviews)
        ? run.generated_suite_ai_review.branch_reviews
        : [];
      const reviewByDraft = new Map(reviews.map((review) => [String(review.draft_id || ""), review]));
      if (!drafts.length) return '<h2>Ветки</h2><div class="muted">Сгенерированных веток пока нет. Дождись discovery/extraction.</div>';
      const selectorHtml = selectedIds.length || missingIds.length
        ? '<div class="item"><b>Явный выбор</b><pre>' + escapeHtml([
            selectedIds.length ? "выбрано: " + selectedIds.join(", ") : "",
            missingIds.length ? "не найдено: " + missingIds.join(", ") : ""
          ].filter(Boolean).join("\\n")) + '</pre></div>'
        : "";
      return '<h2>Ветки</h2>' + selectorHtml + drafts.map((draft) => {
        const review = reviewByDraft.get(String(draft.id || "")) || {};
        const meta = [
          uiLabel(draft.status),
          draft.source_type,
          draft.ai_severity,
          draft.step_count ? (draft.passed_steps + "/" + draft.step_count + " шагов") : ""
        ].filter(Boolean).join(" · ");
        return '<label class="branch"><input type="checkbox" value="' + escapeHtml(draft.id) + '">' +
          '<div><b class="mono">' + escapeHtml(draft.id) + '</b><div>' + escapeHtml(draft.scenario || "") +
          '</div><div class="muted">' + escapeHtml(meta) + '</div>' +
          (review.intended_behavior ? '<div><b>Ожидание:</b> ' + escapeHtml(review.intended_behavior) + '</div>' : '') +
          (review.observed_behavior ? '<div><b>Факт:</b> ' + escapeHtml(review.observed_behavior) + '</div>' : '') +
          (Array.isArray(review.defects) && review.defects.length ? '<div class="error">' + escapeHtml(review.defects.join(" | ")) + '</div>' : '') +
          (draft.first_error ? '<div class="error">' + escapeHtml(draft.first_error) + '</div>' : '') +
          '</div>' + pill(draft.status || "new", statusKind(draft.status)) + '</label>';
      }).join("");
    }

    function renderLogicTree(run) {
      const review = run.generated_suite_ai_review || {};
      const suite = run.generated_suite || {};
      const map = suite.bot_map || run.bot_map || {};
      const flows = Array.isArray(review.flow_map) ? review.flow_map : [];
      const nodes = Array.isArray(map.nodes) ? map.nodes : [];
      const webapps = Array.isArray(suite.webapp_handoffs) ? suite.webapp_handoffs : [];
      const website = suite.website_audit || null;
      const flowHtml = flows.length ? flows.map((flow) => {
        const branches = Array.isArray(flow.branches) ? flow.branches : [];
        return '<div class="item"><b>' + escapeHtml(flow.name || "flow") + '</b> ' +
          pill(flow.criticality || "medium", statusKind(flow.criticality)) +
          '<div>' + escapeHtml(flow.purpose || "") + '</div>' +
          '<div class="steps">' + branches.map((branch, index) => {
            return '<div class="step"><span class="mono">' + escapeHtml(index + 1) + '</span><span>' +
              escapeHtml(branch) + '</span><span>ветка</span></div>';
          }).join("") + '</div></div>';
      }).join("") : '<div class="muted">AI-карта flow пока недоступна.</div>';
      const rawHtml = nodes.length ? '<h2>Точная MTProto-карта</h2>' + nodes.map((node) => {
        const tail = Array.isArray(node.tail) ? node.tail.filter((message) => !message.outgoing).slice(-2) : [];
        const buttons = Array.isArray(node.buttons) ? node.buttons : [];
        const skipped = Array.isArray(node.skippedButtons) ? node.skippedButtons : [];
        const path = Array.isArray(node.path) && node.path.length ? node.path.join(" → ") : "/start";
        return '<div class="item"><b class="mono">' + escapeHtml(node.id || "node") + '</b> ' +
          pill("depth " + (node.depth || 0)) + '<div class="muted">' + escapeHtml(path) + '</div>' +
          '<pre>' + escapeHtml(tail.map((message) => compactUiText(message.text || "", 260)).join("\\n\\n") || "Нет текста в активном окне.") + '</pre>' +
          (buttons.length ? '<div><b>Кнопки:</b> ' + escapeHtml(buttons.map((button) => button.text).join(" | ")) + '</div>' : '') +
          (skipped.length ? '<div class="muted">Пропущено: ' + escapeHtml(skipped.map((button) => String(button.text || "") + " (" + String(button.skipReason || "") + ")").join(" | ")) + '</div>' : '') +
          '</div>';
      }).join("") : '<div class="muted">Точная MTProto-карта пока не создана.</div>';
      const webappHtml = webapps.length ? '<h2>WebApp/URL handoff-и</h2>' + webapps.map((handoff) => {
        const path = Array.isArray(handoff.path) && handoff.path.length ? handoff.path.join(" → ") : "/start";
        const browser = handoff.browser_run || {};
        const telegramClick = handoff.telegram_click || {};
        const result = browser.result || {};
        return '<div class="item"><b>' + escapeHtml(handoff.button_text || "URL/WebApp") + '</b> ' +
          pill(handoff.status || "pending_browser_run", statusKind(handoff.status)) +
          '<div class="muted">' + escapeHtml(path) + '</div>' +
          '<div class="mono">' + escapeHtml(handoff.url || "") + '</div>' +
          (result.title || result.visible_text_summary ? '<pre>' + escapeHtml([
            result.title ? "title: " + result.title : "",
            result.visible_text_summary ? "summary: " + result.visible_text_summary : "",
            Array.isArray(result.main_actions) && result.main_actions.length ? "actions: " + result.main_actions.join(" | ") : "",
            Array.isArray(result.errors_or_blockers) && result.errors_or_blockers.length ? "blockers: " + result.errors_or_blockers.join(" | ") : ""
          ].filter(Boolean).join("\\n")) + '</pre>' : '') +
          renderTelegramClickEvidence(telegramClick) +
          renderScreenshotEvidence(browser) +
          (browser.json_error ? '<div class="error">' + escapeHtml(browser.json_error) + '</div>' : '') +
          (browser.screenshot_error ? '<div class="error">' + escapeHtml(browser.screenshot_error) + '</div>' : '') +
          '</div>';
      }).join("") : '<h2>WebApp/URL handoff-и</h2><div class="muted">WebApp/URL переходов пока не найдено.</div>';
      const websiteHtml = website ? '<h2>Сайт / веб-приложение</h2><div class="item">' +
        '<b>' + escapeHtml(website.title || run.target_url || "Сайт") + '</b> ' +
        pill(website.authenticated ? "auth ok" : website.auth_configured ? "auth check" : "public") +
        '<div class="muted mono">' + escapeHtml(website.final_url || run.target_url || "") + '</div>' +
        '<pre>' + escapeHtml([
          website.visible_text_summary ? "summary: " + website.visible_text_summary : "",
          website.auth_status ? "auth: " + website.auth_status : "",
          Array.isArray(website.main_flows) && website.main_flows.length ? "flows: " + website.main_flows.join(" | ") : "",
          Array.isArray(website.forms) && website.forms.length ? "forms: " + website.forms.join(" | ") : "",
          Array.isArray(website.errors_or_blockers) && website.errors_or_blockers.length ? "blockers: " + website.errors_or_blockers.join(" | ") : ""
        ].filter(Boolean).join("\\n") || "Browser Run пока не вернул разбор сайта.") + '</pre>' +
        renderScreenshotEvidence(website) +
        '</div>' : "";
      return '<h2>Дерево логики</h2>' + flowHtml + websiteHtml + rawHtml + webappHtml;
    }

    function renderAi(run) {
      const review = run.generated_suite_ai_review || {};
      const suite = run.generated_suite || {};
      const aiMeta = review.ai || {};
      const overview = review.overview || {};
      const defects = Array.isArray(review.defects) ? review.defects : [];
      const gaps = Array.isArray(review.coverage_gaps) ? review.coverage_gaps : [];
      const next = review.next_run || {};
      const facts = review.coverage_facts || suite.coverage_facts || {};
      const website = suite.website_audit || null;
      const factLines = [
        facts.targetType ? "тип: " + uiLabel(facts.targetType) : "",
        facts.targetUrl ? "url: " + facts.targetUrl : "",
        facts.browserProfile ? "устройство: " + uiLabel(facts.browserProfile) : "",
        facts.selector ? "режим: " + uiLabel(facts.selector) : "",
        Number.isFinite(Number(facts.reachedDepth)) || Number.isFinite(Number(facts.maxDepth))
          ? "глубина: " + (facts.reachedDepth ?? "?") + "/" + (facts.maxDepth ?? "?")
          : "",
        Number.isFinite(Number(facts.nodeCount)) ? "узлов: " + facts.nodeCount : "",
        Number.isFinite(Number(facts.commandSeedsExploredCount)) ? "seed-команды: " + facts.commandSeedsExploredCount : "",
        typeof facts.countryChangeCovered === "boolean" ? "смена страны: " + (facts.countryChangeCovered ? "найдена" : "не найдена") : "",
        facts.expectedCountry ? "IP-страна: " + facts.expectedCountry : "",
        facts.selectedCountryAfter ? "страна профиля: " + facts.selectedCountryAfter : "",
        facts.countryDevicePreflightStatus ? "country/device preflight: " + uiLabel(facts.countryDevicePreflightStatus) : "",
        typeof facts.deviceCheckLinkFound === "boolean" ? "check-link: " + (facts.deviceCheckLinkFound ? "найден" : "не найден") : "",
        typeof facts.deviceCheckBrowserRun === "boolean" ? "check-page: " + (facts.deviceCheckBrowserRun ? "открыта" : "не открыта") : "",
        typeof facts.deviceCheckCountryMatch === "boolean" ? "check country: " + (facts.deviceCheckCountryMatch ? "совпал" : "не совпал") : "",
        typeof facts.deviceCheckVpnDetected === "boolean" ? "VPN: " + (facts.deviceCheckVpnDetected ? "обнаружен" : "не обнаружен") : "",
        typeof facts.joinTaskUnblocked === "boolean" ? "join_task: " + (facts.joinTaskUnblocked ? "разблокирован" : "заблокирован") : "",
        Number.isFinite(Number(facts.telegramClicks)) ? "Telegram кликов: " + facts.telegramClicks : "",
        Number.isFinite(Number(facts.webappScreenshots)) ? "WebApp скриншотов: " + facts.webappScreenshots : ""
      ].filter(Boolean);
      const webapps = Array.isArray(suite.webapp_handoffs) ? suite.webapp_handoffs : [];
      const webappHtml = webapps.length ? webapps.map((handoff) => {
        const browser = handoff.browser_run || {};
        const telegramClick = handoff.telegram_click || {};
        const result = browser.result || {};
        const fallbackText = browser.screenshot?.url
          ? "Текстовый Browser Run разбор не получен, скриншот сохранён."
          : "Browser Run ещё не дал данных по этому переходу.";
        const notes = [
          result.visible_text_summary,
          Array.isArray(result.qa_notes) && result.qa_notes.length ? result.qa_notes.join(" | ") : "",
          Array.isArray(result.errors_or_blockers) && result.errors_or_blockers.length ? "Блокеры: " + result.errors_or_blockers.join(" | ") : "",
          telegramClick.enabled ? "Telegram click: " + (telegramClick.ok ? "выполнен" : telegramClick.error || "не выполнен") : "",
          browser.json_error ? "JSON: " + browser.json_error : "",
          browser.screenshot_error ? "Скриншот: " + browser.screenshot_error : ""
        ].filter(Boolean).join("\\n");
        return '<div class="item">' + pill(handoff.status || "pending_browser_run", statusKind(handoff.status)) +
          '<b>' + escapeHtml(handoff.button_text || "WebApp/URL") + '</b>' +
          '<div class="muted mono">' + escapeHtml(handoff.url || "") + '</div>' +
          '<pre>' + escapeHtml(notes || fallbackText) + '</pre>' +
          renderScreenshotEvidence(browser) + '</div>';
      }).join("") : '<div class="muted">WebApp/URL переходов пока нет.</div>';
      const websiteHtml = website ? '<div class="item"><b>Сайт / приложение</b><pre>' + escapeHtml([
        website.title ? "title: " + website.title : "",
        website.final_url ? "url: " + website.final_url : "",
        typeof website.authenticated === "boolean" ? "авторизация: " + (website.authenticated ? "успешно/похоже авторизован" : "не подтверждена") : "",
        website.auth_status ? "auth status: " + website.auth_status : "",
        Array.isArray(website.qa_notes) && website.qa_notes.length ? "notes: " + website.qa_notes.join(" | ") : ""
      ].filter(Boolean).join("\\n")) + '</pre>' + renderScreenshotEvidence(website) + '</div>' : "";
      return '<h2>AI-разбор</h2>' +
        '<div class="item"><b>Статус AI</b><pre>' + escapeHtml([
          "enabled: " + Boolean(aiMeta.enabled),
          aiMeta.model ? "model: " + aiMeta.model : "",
          aiMeta.provider ? "provider: " + aiMeta.provider : "",
          aiMeta.error ? "error: " + aiMeta.error : ""
        ].filter(Boolean).join("\\n")) + '</pre></div>' +
        '<div class="item"><b>Общий взгляд</b><p>' + escapeHtml(overview.summary || "AI-разбора пока нет.") + '</p>' +
        '<div class="muted">' + escapeHtml(overview.business_purpose || overview.product_purpose || "") + '</div></div>' +
        '<div class="item"><b>Факты покрытия</b><pre>' + escapeHtml(factLines.join("\\n") || "Факты покрытия пока не сохранены.") + '</pre></div>' +
        websiteHtml +
        '<div class="item"><b>Дефекты</b>' + (defects.length ? defects.map((item) => {
          return '<div class="item">' + pill(item.severity || "unknown", statusKind(item.severity)) +
            '<b>' + escapeHtml(item.title || "") + '</b><div class="muted">' + escapeHtml((item.evidence || []).join(" | ")) +
            '</div><div>' + escapeHtml(item.next_check || "") + '</div></div>';
        }).join("") : '<div class="muted">Дефектов в callback пока нет.</div>') + '</div>' +
        '<div class="item"><b>Пробелы покрытия</b><pre>' + escapeHtml(gaps.join("\\n") || "Пробелов пока нет.") + '</pre></div>' +
        '<div class="item"><b>WebApp/URL</b>' + webappHtml + '</div>' +
        '<div class="item"><b>Следующий прогон</b><pre>' + escapeHtml(JSON.stringify(next, null, 2)) + '</pre></div>';
    }

    function renderRun(payload) {
      const run = mergeRunSnapshot(payload.run || {});
      const github = run.github_live || run.github || {};
      const status = github.conclusion || github.status || run.status || "queued";
      const target = run.target_url || run.bot_username || "";
      q("#runTitle").textContent = target ? target + " · " + uiLabel(status) : run.id || "Прогон";
      q("#runMeta").innerHTML = [
        pill(run.target_type || (run.target_url ? "website" : "telegram_bot")),
        pill(run.suite || "generated_scenarios"),
        run.browser_profile ? pill(run.browser_profile) : "",
        run.target_type === "website" ? "" : pill(run.selector || "smart"),
        pill(run.engine || "cloudflare"),
        pill(status, statusKind(status)),
        github.html_url ? '<a href="' + escapeHtml(github.html_url) + '" target="_blank" rel="noreferrer">Прогон в GitHub</a>' : ''
      ].join(" ");
      q("#tab-progress").innerHTML = '<h2>Прогресс</h2><div>' +
        pill(run.status || "queued", statusKind(run.status)) +
        (run.github_run_id ? pill("прогон " + run.github_run_id) : "") +
        '</div>' + (run.error ? '<div class="item error"><b>Ошибка</b><pre>' + escapeHtml(run.error) + '</pre></div>' : '') +
        '<div class="item"><b>События</b>' + ((run.events || []).length ? (run.events || []).map((event) => {
          return '<div class="item"><span class="mono">' + escapeHtml(event.time || "") + '</span> ' +
            escapeHtml([event.phase, uiLabel(event.status), event.message].filter(Boolean).join(" · ")) + '</div>';
        }).join("") : '<div class="muted">Событий пока нет.</div>') + '</div>' + renderExecutionDetails(run, github);
      q("#tab-documents").innerHTML = renderDocuments(run);
      q("#tab-tree").innerHTML = renderLogicTree(run);
      q("#tab-branches").innerHTML = renderBranches(run);
      q("#tab-ai").innerHTML = renderAi(run);
      q("#targetType").value = run.target_type === "website" || run.target_url ? "website" : "telegram_bot";
      toggleTargetFields();
      if (run.bot_username) q("#botUsername").value = run.bot_username;
      if (run.target_url) q("#targetUrl").value = run.target_url;
      if (run.browser_profile) q("#browserProfile").value = ["mobile", "tablet", "desktop"].includes(run.browser_profile) ? run.browser_profile : "mobile";
      if (run.test_objective) q("#testObjective").value = run.test_objective;
      q("#authInstructions").value = "";
      if (run.start_payload) q("#startPayload").value = run.start_payload;
      if (run.suite) q("#suite").value = run.suite;
      if (run.engine) q("#engine").value = run.engine === "github" ? "github" : "cloudflare";
      if (run.selector) q("#selector").value = ["smart", "safe", "all-safe", "runnable", "dev"].includes(run.selector) ? run.selector : "smart";
      if (run.max_drafts) q("#maxDrafts").value = run.max_drafts;
      const keepPolling = ["queued", "requested", "waiting", "pending", "in_progress", "running", "syncing_result", "cancel_requested"].includes(String(status).toLowerCase());
      const canCancel = state.runId && (isLiveStatus(status) || isLiveStatus(run.status));
      q("#cancelRun").hidden = !canCancel;
      q("#cancelRun").disabled = state.cancelling;
      if (keepPolling) schedulePoll();
    }

    async function loadRun() {
      if (!state.runId) return;
      setMessage("");
      const payload = await api("/api/runs/" + encodeURIComponent(state.runId));
      renderRun(payload);
    }

    function schedulePoll() {
      if (state.poll) clearTimeout(state.poll);
      state.poll = setTimeout(() => {
        loadRun().catch((error) => setMessage(error.message));
      }, 5000);
    }

    async function createRun(selectorOverride) {
      if (state.creating) return;
      setCreateBusy(true);
      setMessage("Запускаю прогон...");
      try {
        const body = {
          target_type: q("#targetType").value,
          bot_username: q("#botUsername").value.trim(),
          target_url: q("#targetUrl").value.trim(),
          browser_profile: q("#browserProfile").value,
          start_payload: q("#startPayload").value.trim(),
          test_objective: q("#testObjective").value.trim(),
          auth_instructions: q("#authInstructions").value.trim(),
          suite: q("#suite").value,
          engine: q("#engine").value,
          selector: selectorOverride || q("#selector").value,
          max_drafts: q("#maxDrafts").value
        };
        const payload = await api("/api/runs", { method: "POST", body: JSON.stringify(body) });
        state.runId = payload.run.id;
        state.latestRun = null;
        history.replaceState(null, "", "?run=" + encodeURIComponent(state.runId));
        await loadRuns();
        renderRun(payload);
        setMessage(payload.reused ? "Уже есть активный прогон для этого бота, открыл его." : "");
      } finally {
        setCreateBusy(false);
      }
    }

    async function cancelRun() {
      if (!state.runId || state.cancelling) return;
      setCancelBusy(true);
      setMessage("Отправляю отмену...");
      if (state.latestRun) {
        const optimistic = {
          ...state.latestRun,
          status: "cancel_requested",
          cloudflare_progress: {
            phase: "отмена",
            status: "cancel_requested",
            message: "Отмена отправляется..."
          },
          events: [
            ...(state.latestRun.events || []),
            {
              time: new Date().toISOString(),
              phase: "отмена",
              status: "cancel_requested",
              message: "Отмена отправляется..."
            }
          ].slice(-50)
        };
        renderRun(optimistic);
      }
      try {
        const payload = await api("/api/runs/" + encodeURIComponent(state.runId) + "/cancel", { method: "POST" });
        await loadRuns();
        renderRun(payload);
        setMessage("Отмена отправлена.");
      } finally {
        setCancelBusy(false);
      }
    }

    qa(".tab").forEach((button) => {
      button.addEventListener("click", () => {
        qa(".tab").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        const name = button.getAttribute("data-tab");
        ["progress", "documents", "tree", "branches", "ai"].forEach((tab) => {
          q("#tab-" + tab).hidden = tab !== name;
        });
      });
    });
    q("#targetType").addEventListener("change", toggleTargetFields);
    q("#suite").addEventListener("change", () => {
      if (q("#suite").value === "website_audit") {
        q("#targetType").value = "website";
      }
      toggleTargetFields();
    });
    q("#startRun").addEventListener("click", () => createRun().catch((error) => setMessage(error.message)));
    q("#refresh").addEventListener("click", () => Promise.all([loadRuns(), loadRun()]).catch((error) => setMessage(error.message)));
    q("#cancelRun").addEventListener("click", () => cancelRun().catch((error) => setMessage(error.message)));
    q("#runSelected").addEventListener("click", () => {
      if (isWebsiteTarget()) {
        setMessage("Для сайта запускается общий web-аудит, выбор веток не нужен.");
        return;
      }
      const ids = qa('#tab-branches input[type="checkbox"]:checked').map((input) => input.value).filter(Boolean);
      if (!ids.length) {
        setMessage("Выбери хотя бы одну ветку.");
        return;
      }
      q("#suite").value = "generated_scenarios";
      createRun(ids.join(",")).catch((error) => setMessage(error.message));
    });
    toggleTargetFields();
    loadRuns().catch((error) => setMessage(error.message));
    if (state.runId) loadRun().catch((error) => setMessage(error.message));
  </script>
</body>
</html>`;
}

async function handlePanelPage() {
  return htmlResponse(panelHtml());
}

async function handlePanelRunCreate(env, request, ctx) {
  const authResponse = requirePanelAuthorization(env, request);
  if (authResponse) {
    return authResponse;
  }
  if (!env.BOT_STATE_KV) {
    return jsonResponse({ error: "Не настроено хранилище BOT_STATE_KV" }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const requestedTargetType = normalizePanelTargetType(body.target_type, body.suite);
  const suite = requestedTargetType === "website" ? "website_audit" : normalizeSuite(body.suite, "generated_scenarios");
  const targetType = normalizePanelTargetType(body.target_type, suite);
  const botUsername = normalizeBotUsername(body.bot_username);
  const targetUrl = normalizeWebsiteUrl(body.target_url);
  if (targetType === "telegram_bot" && !botUsername) {
    return jsonResponse({ error: "Укажи корректный username бота" }, 400);
  }
  if (targetType === "website" && !targetUrl) {
    return jsonResponse({ error: "Укажи корректный URL сайта или веб-приложения" }, 400);
  }

  if (targetType === "telegram_bot" && !["generated_scenarios", "discover_mtproto"].includes(suite)) {
    return jsonResponse({ error: "Для Telegram панель поддерживает generated_scenarios и discover_mtproto" }, 400);
  }
  if (targetType === "website" && suite !== "website_audit") {
    return jsonResponse({ error: "Для сайта панель поддерживает только website_audit" }, 400);
  }
  const engine = normalizePanelEngine(body.engine, suite);
  if (targetType === "website" && engine !== "cloudflare") {
    return jsonResponse({ error: "Сайты и веб-приложения сейчас запускаются через Cloudflare Browser" }, 400);
  }
  if (engine === "cloudflare" && !isCloudflareNativeSuite(suite)) {
    return jsonResponse({ error: "Cloudflare runner пока поддерживает только generated_scenarios и discover_mtproto" }, 400);
  }
  const defaultSelector = engine === "cloudflare" ? "dev" : "smart";
  const selector = suite === "generated_scenarios" ? String(body.selector || defaultSelector).trim() || defaultSelector : "";
  const maxDrafts = clampNumber(body.max_drafts, engine === "cloudflare" ? 20 : 8, 1, 50);
  const testObjective = compactPanelText(body.test_objective || "", 1600);
  const browserProfile = targetType === "website" ? normalizeBrowserProfile(body.browser_profile) : "";
  const authInstructions = compactPanelText(body.auth_instructions || "", 2000);
  const activeRun = await findActivePanelRun(env, {
    targetType,
    botUsername,
    targetUrl,
    browserProfile,
    startPayload: body.start_payload,
    testObjective,
    suite,
    selector,
    engine
  });
  if (activeRun) {
    return jsonResponse({ run: activeRun, reused: true });
  }

  const panelRunId = crypto.randomUUID();
  const callbackUrl = String(env.REPORT_CALLBACK_URL || "").trim() || new URL("/github/report", request.url).toString();
  const createdAt = nowIso();
  let run = appendPanelEvent(
    {
      id: panelRunId,
      status: "queued",
      target_type: targetType,
      ...(botUsername ? { bot_username: `@${botUsername}` } : {}),
      ...(targetUrl ? { target_url: targetUrl } : {}),
      ...(browserProfile ? { browser_profile: browserProfile } : {}),
      start_payload: String(body.start_payload || "").trim(),
      test_objective: testObjective,
      auth_configured: Boolean(authInstructions),
      suite,
      engine,
      selector,
      max_drafts: maxDrafts,
      created_at: createdAt,
      updated_at: createdAt
    },
    { phase: "создание", status: "queued", message: "Прогон создан из панели" }
  );
  await savePanelRun(env, run);
  const executionRun = authInstructions ? { ...run, auth_instructions: authInstructions } : run;

  if (engine === "cloudflare") {
    if (env.PANEL_RUN_WORKFLOW && typeof env.PANEL_RUN_WORKFLOW.create === "function") {
      const workflowInstanceId = cloudflareWorkflowInstanceId(panelRunId);
      run = appendPanelEvent(
        {
          ...run,
          status: "running",
          workflow_instance_id: workflowInstanceId,
          workflow_status: "creating",
          updated_at: nowIso()
        },
        { phase: "workflow", status: "creating", message: "Cloudflare Workflow подготавливается" }
      );
      await savePanelRun(env, run);

      const workflowRun = await createCloudflarePanelWorkflow(env, panelRunId, executionRun);
      run = appendPanelEvent(
        {
          ...run,
          status: "running",
          workflow_instance_id: workflowRun.instanceId,
          workflow_status: workflowRun.status,
          updated_at: nowIso()
        },
        { phase: "workflow", status: workflowRun.status, message: "Cloudflare Workflow создан без GitHub Actions" }
      );
      await savePanelRun(env, run);
      return jsonResponse({ run });
    }

    run = appendPanelEvent(
      {
        ...run,
        status: "running",
        updated_at: nowIso()
      },
      { phase: "cloudflare", status: "running", message: "Workflow не настроен, fallback-прогон запущен через waitUntil" }
    );
    await savePanelRun(env, run);
    const promise = runCloudflarePanelRun(env, panelRunId, executionRun);
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(promise);
      return jsonResponse({ run });
    }
    await promise;
    return jsonResponse({ run: (await loadPanelRun(env, panelRunId)) || run });
  }

  try {
    const dispatch = await dispatchGithubRun(env, {
      chatId: "",
      lang: LANG_RU,
      scenarioKey: scenarioKeyForRun(suite, selector),
      suite,
      generatedScenarioDrafts: suite === "generated_scenarios" ? selector : "",
      botUsername,
      startPayload: run.start_payload,
      panelRunId,
      maxDrafts,
      reportCallbackUrlOverride: callbackUrl
    });
    const latestRun = await loadPanelRun(env, panelRunId);
    if (latestRun && ["cancelled", "cancel_requested"].includes(String(latestRun.status || "").toLowerCase())) {
      const githubRunId = dispatch.runId || runIdFromUrl(dispatch.runUrl);
      if (githubRunId) {
        await cancelGithubRun(env, githubRunId).catch(() => false);
      }
      run = appendPanelEvent(
        {
          ...latestRun,
          status: githubRunId ? "cancel_requested" : "cancelled",
          github_run_id: githubRunId,
          github_run_url: dispatch.runUrl,
          updated_at: nowIso()
        },
        {
          phase: "отмена",
          status: githubRunId ? "cancel_requested" : "cancelled",
          message: githubRunId ? "Прогон был отменён во время запуска, отмена отправлена в GitHub" : "Прогон отменён до запуска GitHub Actions"
        }
      );
      await savePanelRun(env, run);
      return jsonResponse({ run });
    }
    run = appendPanelEvent(
      {
        ...run,
        status: dispatch.status || "requested",
        engine: "github",
        github_run_id: dispatch.runId || runIdFromUrl(dispatch.runUrl),
        github_run_url: dispatch.runUrl,
        updated_at: nowIso()
      },
      { phase: "github", status: dispatch.status || "requested", message: "Прогон GitHub Actions запущен" }
    );
    await savePanelRun(env, run);
    return jsonResponse({ run });
  } catch (error) {
    run = appendPanelEvent(
      {
        ...run,
        status: "dispatch_failed",
        error: error instanceof Error ? error.message : String(error),
        updated_at: nowIso()
      },
      { phase: "github", status: "dispatch_failed", message: error instanceof Error ? error.message : String(error) }
    );
    await savePanelRun(env, run);
    return jsonResponse({ error: run.error, run }, 500);
  }
}

async function handlePanelRunCancel(env, request, id) {
  const authResponse = requirePanelAuthorization(env, request);
  if (authResponse) {
    return authResponse;
  }
  if (!env.BOT_STATE_KV) {
    return jsonResponse({ error: "Не настроено хранилище BOT_STATE_KV" }, 500);
  }
  const run = await loadPanelRun(env, id);
  if (!run) {
    return jsonResponse({ error: "Прогон не найден" }, 404);
  }

  const refreshed = await refreshPanelRunTerminalState(env, run);
  if (isTerminalPanelRun(refreshed)) {
    return jsonResponse({ run: refreshed, already_terminal: true });
  }

  if (normalizePanelEngine(refreshed.engine, refreshed.suite) === "cloudflare") {
    let terminated = false;
    let terminateError = "";
    try {
      terminated = await terminateCloudflarePanelWorkflow(env, refreshed);
    } catch (error) {
      terminateError = error instanceof Error ? error.message : String(error);
    }
    const next = appendPanelEvent(
      {
        ...refreshed,
        status: "cancelled",
        workflow_status: terminated ? "terminated" : refreshed.workflow_status,
        updated_at: nowIso(),
        completed_at: nowIso(),
        ...(terminateError ? { cancel_error: terminateError } : {})
      },
      {
        phase: "отмена",
        status: "cancelled",
        message: terminated
          ? "Cloudflare Workflow остановлен"
          : terminateError
            ? `Отмена сохранена; Cloudflare terminate вернул ошибку: ${terminateError}`
            : "Отмена сохранена, Cloudflare runner остановится при следующей проверке"
      }
    );
    await savePanelRun(env, next);
    return jsonResponse({ run: next });
  }

  const githubRunId = refreshed.github_run_id || runIdFromUrl(refreshed.github_run_url);
  if (!githubRunId) {
    const next = appendPanelEvent(
      {
        ...refreshed,
        status: "cancelled",
        updated_at: nowIso()
      },
      { phase: "отмена", status: "cancelled", message: "Прогон отменён до запуска GitHub Actions" }
    );
    await savePanelRun(env, next);
    return jsonResponse({ run: next });
  }

  try {
    await cancelGithubRun(env, githubRunId);
    const next = appendPanelEvent(
      {
        ...refreshed,
        status: "cancel_requested",
        github_run_id: githubRunId,
        updated_at: nowIso()
      },
      { phase: "отмена", status: "cancel_requested", message: "Отмена отправлена в GitHub Actions" }
    );
    await savePanelRun(env, next);
    return jsonResponse({ run: next });
  } catch (error) {
    const next = appendPanelEvent(
      {
        ...refreshed,
        updated_at: nowIso(),
        cancel_error: error instanceof Error ? error.message : String(error)
      },
      { phase: "отмена", status: "cancel_failed", message: error instanceof Error ? error.message : String(error) }
    );
    await savePanelRun(env, next);
    return jsonResponse({ error: next.cancel_error, run: next }, 500);
  }
}

async function handlePanelRunList(env, request) {
  const authResponse = requirePanelAuthorization(env, request);
  if (authResponse) {
    return authResponse;
  }
  return jsonResponse({ runs: await listPanelRuns(env) });
}

async function handlePanelRunGet(env, request, id) {
  const authResponse = requirePanelAuthorization(env, request);
  if (authResponse) {
    return authResponse;
  }
  let run = await loadPanelRun(env, id);
  if (!run) {
    return jsonResponse({ error: "Прогон не найден" }, 404);
  }
  run = await refreshPanelRunTerminalState(env, run);
  const responseRun = {
    ...run,
    drafts: compactPanelDrafts(run.generated_suite)
  };
  try {
    const runId = responseRun.github_run_id || runIdFromUrl(responseRun.github_run_url);
    const githubLive = await fetchGithubRunDetails(env, runId);
    if (githubLive) {
      responseRun.github_live = githubLive;
    }
  } catch (error) {
    responseRun.github_error = error instanceof Error ? error.message : String(error);
  }
  return jsonResponse({ run: responseRun });
}

async function handlePanelRunArtifactGet(env, request, id, rawArtifactName) {
  const authResponse = requirePanelAuthorization(env, request);
  if (authResponse) {
    return authResponse;
  }
  const artifactName = normalizePanelArtifactName(decodeURIComponent(String(rawArtifactName || "")));
  if (!artifactName || !env.BOT_STATE_KV) {
    return jsonResponse({ error: "Артефакт не найден" }, 404);
  }
  const run = await loadPanelRun(env, id);
  if (!run) {
    return jsonResponse({ error: "Прогон не найден" }, 404);
  }
  const bytes = await env.BOT_STATE_KV.get(panelArtifactKey(id, artifactName), { type: "arrayBuffer" });
  if (!bytes) {
    return jsonResponse({ error: "Артефакт не найден" }, 404);
  }
  const contentType = artifactName.toLowerCase().endsWith(".png") ? "image/png" : "application/octet-stream";
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store"
    }
  });
}

async function updatePanelRunFromReport(env, payload) {
  const panelRunId = String(payload.panel_run_id || "").trim();
  if (!panelRunId || !env.BOT_STATE_KV) {
    return;
  }
  const current = (await loadPanelRun(env, panelRunId)) || {
    id: panelRunId,
    status: "reported",
    created_at: nowIso(),
    events: []
  };
  const phase = String(payload.phase || "callback").trim() || "callback";
  const status = String(payload.status || current.status || "").trim() || "reported";
  let next = {
    ...current,
    status,
    updated_at: nowIso(),
    duration_sec: Number.isFinite(Number(payload.duration_sec)) ? Number(payload.duration_sec) : current.duration_sec,
    github_run_url: String(payload.run_url || current.github_run_url || ""),
    github_run_id: current.github_run_id || runIdFromUrl(payload.run_url),
    generated_suite: payload.generated_suite || current.generated_suite,
    generated_suite_ai_review: payload.generated_suite_ai_review || current.generated_suite_ai_review,
    screenshot_count: Number.isFinite(Number(payload.screenshot_count))
      ? Number(payload.screenshot_count)
      : current.screenshot_count
  };
  if (phase === "finish" || phase === "single") {
    next.completed_at = nowIso();
  }
  next = appendPanelEvent(next, {
    phase,
    status,
    message: payload.failure_message || (payload.generated_suite ? "Получен отчёт по веткам" : "Получен callback")
  });
  await savePanelRun(env, next);
}

async function handleGithubReport(env, request) {
  const tokenHeader = String(request.headers.get("x-report-token") || "").trim();
  if (!tokenHeader || tokenHeader !== String(env.REPORT_TOKEN || "").trim()) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return new Response("Invalid JSON", { status: 400 });
  }

  await updatePanelRunFromReport(env, payload);

  const chatId = normalizeChatId(payload.chat_id);
  const panelRunId = String(payload.panel_run_id || "").trim();
  if (!chatId && !panelRunId) {
    return new Response("chat_id is required", { status: 400 });
  }
  if (!chatId) {
    return new Response("ok");
  }

  const state = await loadState(env, chatId);
  const lang = normalizeLang(payload.lang || state.lang || LANG_RU);
  const scenarioKey = String(payload.scenario_key || SCENARIO_START_FINISH);
  const runUrl = String(payload.run_url || "");
  const duration = formatDuration(Number(payload.duration_sec || 0));
  const statusLine = runStatusText(lang, payload.status || "failure");
  const phase = String(payload.phase || "single").trim().toLowerCase();
  const failureReason = failureReasonText(lang, payload.failure_code, payload.failure_message);
  const generatedSuiteText = formatGeneratedSuiteText(lang, payload.generated_suite);
  const generatedSuiteAiReviewText = formatGeneratedSuiteAiReviewText(lang, payload.generated_suite_ai_review);

  const reportText = [
    t(lang, "reportTitle"),
    `${t(lang, "reportScenario")}: ${scenarioTitle(lang, scenarioKey)}`,
    `${t(lang, "reportStatus")}: ${statusLine}`,
    failureReason ? `${t(lang, "reportReason")}: ${failureReason}` : "",
    `${t(lang, "reportDuration")}: ${duration}`,
    runUrl ? `${t(lang, "reportLink")}: ${runUrl}` : "",
    generatedSuiteText,
    generatedSuiteAiReviewText
  ]
    .filter(Boolean)
    .join("\n");

  if (phase === "summary" || phase === "single") {
    await sendMessage(env, chatId, reportText);
  }
  if (phase === "summary") {
    return new Response("ok");
  }

  const screenshots = Array.isArray(payload.screenshots) ? payload.screenshots : [];
  if (phase === "screenshots" || phase === "single") {
    for (let i = 0; i < screenshots.length; i += 1) {
      const item = screenshots[i];
      const b64 = String(item?.data_base64 || "");
      if (!b64) {
        continue;
      }
      try {
        const bytes = decodeBase64(b64);
        if (bytes.length === 0) {
          continue;
        }
        const filename = String(item?.name || `screenshot-${i + 1}.png`);
        const caption = phase === "single" && i === 0 ? `${t(lang, "reportTitle")}: ${scenarioTitle(lang, scenarioKey)}` : "";
        await sendPhoto(env, chatId, bytes, filename, caption);
      } catch (error) {
        console.error("sendPhoto from report failed", error);
      }
    }
    if (phase === "screenshots") {
      return new Response("ok");
    }
  }

  if (phase === "finish" || phase === "single") {
    await sendMessage(env, chatId, t(lang, "askRunAgain"), rerunKeyboard(lang));
  }

  return new Response("ok");
}

async function handleTelegramWebhook(env, request) {
  const secret = String(request.headers.get("x-telegram-bot-api-secret-token") || "").trim();
  const expectedSecret = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!secret || !expectedSecret || secret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const update = await request.json().catch(() => null);
    if (!update || typeof update !== "object") {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (update.callback_query) {
      await handleCallbackQuery(env, update.callback_query);
      return new Response("ok");
    }

    const message = update.message;
    const chatId = normalizeChatId(message?.chat?.id);
    const text = String(message?.text || "").trim();

    if (!chatId || !text) {
      return new Response("ok");
    }

    if (!isChatAllowed(env, chatId)) {
      await sendMessage(env, chatId, t(LANG_RU, "ignoredChat"));
      return new Response("ok");
    }

    if (/^\/start\b/i.test(text)) {
      await handleStart(env, chatId);
      return new Response("ok");
    }

    if (/^\/language\b/i.test(text)) {
      await showLanguageMenu(env, chatId);
      return new Response("ok");
    }

    if (/^\/run\b/i.test(text)) {
      const state = await loadState(env, chatId);
      const parsed = parseRunText(text, state.lang || LANG_RU, env.DEFAULT_SUITE || "autorun");
      if (parsed.error) {
        await sendMessage(env, chatId, `${parsed.error}\nAllowed suites: ${Array.from(REQUIRED_SUITES).join(", ")}`);
        return new Response("ok");
      }
      await triggerScenarioRun(env, chatId, parsed.lang, parsed.scenarioKey, {
        suite: parsed.suite,
        generatedScenarioDraft: parsed.generatedScenarioDraft,
        generatedScenarioDrafts: parsed.generatedScenarioDrafts
      });
      return new Response("ok");
    }

    const state = await loadState(env, chatId);
    const lowered = text.toLowerCase();
    if (
      lowered === "ru" ||
      lowered === "russian" ||
      lowered === "\u0440\u0443\u0441\u0441\u043a\u0438\u0439"
    ) {
      await saveState(env, chatId, { lang: LANG_RU });
      await showScenarioMenu(env, chatId, LANG_RU, true);
      return new Response("ok");
    }
    if (lowered === "en" || lowered === "english") {
      await saveState(env, chatId, { lang: LANG_EN });
      await showScenarioMenu(env, chatId, LANG_EN, true);
      return new Response("ok");
    }
    if (!state.lang) {
      await showLanguageMenu(env, chatId);
      return new Response("ok");
    }
    if (lowered === t(LANG_RU, "runTestButton").toLowerCase() || lowered === t(LANG_EN, "runTestButton").toLowerCase()) {
      await triggerScenarioRun(env, chatId, normalizeLang(state.lang), SCENARIO_START_FINISH);
      return new Response("ok");
    }
    await triggerScenarioRun(env, chatId, normalizeLang(state.lang), SCENARIO_START_FINISH);
  } catch (error) {
    console.error("handleTelegramWebhook failed", error);
  }
  return new Response("ok");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/panel") {
      return handlePanelPage(env, request);
    }
    if (url.pathname === "/api/runs" && request.method === "GET") {
      return handlePanelRunList(env, request);
    }
    if (url.pathname === "/api/runs" && request.method === "POST") {
      return handlePanelRunCreate(env, request, ctx);
    }
    const panelRunCancelMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
    if (panelRunCancelMatch && request.method === "POST") {
      return handlePanelRunCancel(env, request, panelRunCancelMatch[1]);
    }
    const panelRunArtifactMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/artifacts\/([^/]+)$/);
    if (panelRunArtifactMatch && request.method === "GET") {
      return handlePanelRunArtifactGet(env, request, panelRunArtifactMatch[1], panelRunArtifactMatch[2]);
    }
    const panelRunMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (panelRunMatch && request.method === "GET") {
      return handlePanelRunGet(env, request, panelRunMatch[1]);
    }
    if (request.method === "POST" && url.pathname === "/telegram/webhook") {
      return handleTelegramWebhook(env, request);
    }
    if (request.method === "POST" && url.pathname === "/github/report") {
      return handleGithubReport(env, request);
    }
    if (request.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok");
    }
    return new Response("Not found", { status: 404 });
  }
};
