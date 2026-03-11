const LANG_RU = "ru";
const LANG_EN = "en";
const SCENARIO_START_FINISH = "start_finish";

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

function normalizeChatId(chatId) {
  if (chatId === null || chatId === undefined) {
    return "";
  }
  return String(chatId).trim();
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

async function dispatchGithubRun(env, { chatId, lang, scenarioKey }) {
  const owner = String(env.GITHUB_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO || "").trim();
  const workflowFile = String(env.GITHUB_WORKFLOW_FILE || "telegram-web-e2e.yml").trim();
  const suite = String(env.DEFAULT_SUITE || "autorun").trim();
  const ref = String(env.GITHUB_REF || "main").trim();
  const reportCallbackUrl = String(env.REPORT_CALLBACK_URL || "").trim();
  const githubToken = String(env.GITHUB_PAT || "").trim();

  if (!owner || !repo || !githubToken) {
    throw new Error("Missing GITHUB_OWNER/GITHUB_REPO/GITHUB_PAT");
  }

  const startedAtIso = new Date().toISOString();

  const dispatchBody = {
    ref,
    inputs: {
      suite,
      chat_id: String(chatId),
      lang: String(lang),
      bot_lang: LANG_RU,
      scenario_key: String(scenarioKey),
      report_callback_url: reportCallbackUrl
    }
  };

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
      break;
    }
  }

  return runUrl;
}

async function triggerScenarioRun(env, chatId, lang, scenarioKey) {
  try {
    const runUrl = await dispatchGithubRun(env, { chatId, lang, scenarioKey });
    const messageText = [
      t(lang, "launchStarted"),
      `${t(lang, "launchLink")} ${runUrl}`,
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

async function handleGithubReport(env, request) {
  const tokenHeader = String(request.headers.get("x-report-token") || "").trim();
  if (!tokenHeader || tokenHeader !== String(env.REPORT_TOKEN || "").trim()) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return new Response("Invalid JSON", { status: 400 });
  }

  const chatId = normalizeChatId(payload.chat_id);
  if (!chatId) {
    return new Response("chat_id is required", { status: 400 });
  }

  const state = await loadState(env, chatId);
  const lang = normalizeLang(payload.lang || state.lang || LANG_RU);
  const scenarioKey = String(payload.scenario_key || SCENARIO_START_FINISH);
  const runUrl = String(payload.run_url || "");
  const duration = formatDuration(Number(payload.duration_sec || 0));
  const statusLine = runStatusText(lang, payload.status || "failure");
  const phase = String(payload.phase || "single").trim().toLowerCase();
  const failureReason = failureReasonText(lang, payload.failure_code, payload.failure_message);

  const reportText = [
    t(lang, "reportTitle"),
    `${t(lang, "reportScenario")}: ${scenarioTitle(lang, scenarioKey)}`,
    `${t(lang, "reportStatus")}: ${statusLine}`,
    failureReason ? `${t(lang, "reportReason")}: ${failureReason}` : "",
    `${t(lang, "reportDuration")}: ${duration}`,
    runUrl ? `${t(lang, "reportLink")}: ${runUrl}` : ""
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
      const parts = text.split(/\s+/).filter(Boolean);
      const requestedLang = normalizeLang(parts[1] || state.lang || LANG_RU);
      await triggerScenarioRun(env, chatId, requestedLang, SCENARIO_START_FINISH);
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
  async fetch(request, env) {
    const url = new URL(request.url);
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
