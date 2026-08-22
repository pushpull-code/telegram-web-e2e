const DEFAULT_DISCOVERY_COMMANDS = "/join_task,/my_tasks,/settings,/view_earnings";
const DEFAULT_DENY_BUTTON_RE =
  "удал|delete|withdraw|вывод|cancel|отмен|заверш|finish|aufgabe abschlie|abschlie(?:ss|ß)en|beenden|fertig|оплат|pay|buy|purchase";
const DEFAULT_COUNTRY_LOOKUP_URLS = "https://ipapi.co/json/,https://ipwho.is/";
const ARTIFACT_TTL_SECONDS = 60 * 60 * 24 * 14;
const SETTINGS_COMMAND = "/settings";
const JOIN_TASK_COMMAND = "/join_task";
const CHANGE_COUNTRY_RE = /land ändern|change country|изменить стран|сменить стран|страна ändern|country ändern/i;
const COUNTRY_PROFILE_RE =
  /(?:land ihres kontos|land|country|страна(?: аккаунта)?|account country)\s*[:：-]\s*([^\n\r]+)/i;
const DEVICE_CHECK_CONTEXT_RE =
  /check device|device info|gerät|device|überprüfung|pr[üu]fung|fortzufahren|continue|vpn|ip|geo|bestätigen|confirm|link/i;
const CONFIRMATION_BLOCKER_RE =
  /land bestätigen|country.*confirm|confirm.*country|страна.*подтвержд|подтвержд.*стран|vpn|geolokalisierung|geo/i;

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyProgress(onProgress, event) {
  if (typeof onProgress !== "function") {
    return;
  }
  try {
    await onProgress({
      status: "running",
      ...event
    });
  } catch (_) {
    // Progress updates are best effort; the runner result must not depend on KV writes.
  }
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function compactText(value, maxLength = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeNodeIdPart(value) {
  const normalized = normalizeText(value)
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "node";
}

function nodeId(pathParts) {
  return pathParts.length === 0 ? "root" : pathParts.map(normalizeNodeIdPart).join("__");
}

function isCommandAction(value) {
  return String(value || "").trim().startsWith("/");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeBotUsername(value) {
  return String(value || "").trim().replace(/^@+/, "");
}

function normalizeCountryText(value) {
  return String(value || "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countryCompareKey(value) {
  return normalizeCountryText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function countryNameFromCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return "";
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) || "";
  } catch (_) {
    return "";
  }
}

function countryDisplayNamesFromCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return [];
  }
  return unique(
    ["en", "de", "ru", "es", "fr", "it", "pt", "nl", "pl", "uk"].map((locale) => {
      try {
        return new Intl.DisplayNames([locale], { type: "region" }).of(normalized) || "";
      } catch (_) {
        return "";
      }
    })
  );
}

function countryAliasCandidates(country) {
  const code = String(country?.countryCode || "").trim().toUpperCase();
  const name = normalizeCountryText(country?.countryName || country?.country || "");
  return unique([
    name,
    ...countryDisplayNamesFromCode(code),
    code === "US" ? "United States" : "",
    code === "US" ? "USA" : "",
    code === "US" ? "United States of America" : "",
    code === "GB" ? "United Kingdom" : "",
    code === "GB" ? "Great Britain" : "",
    code === "DE" ? "Germany" : "",
    code === "DE" ? "Deutschland" : "",
    code === "RU" ? "Russia" : "",
    code === "RU" ? "Россия" : "",
    code === "PL" ? "Poland" : "",
    code === "PL" ? "Polen" : "",
    code === "PL" ? "Polska" : "",
    code === "PL" ? "Польша" : ""
  ]).filter(Boolean);
}

function countriesMatch(left, right) {
  const leftKey = countryCompareKey(left);
  const rightKeys = countryAliasCandidates(typeof right === "object" ? right : { countryName: right }).map(countryCompareKey);
  return Boolean(leftKey && rightKeys.some((rightKey) => rightKey && leftKey === rightKey));
}

function parseProfileCountry(text) {
  const match = String(text || "").match(COUNTRY_PROFILE_RE);
  if (!match) {
    return "";
  }
  return normalizeCountryText(match[1]);
}

function profileCountryFromMessages(messages) {
  for (let index = (messages || []).length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.outgoing) {
      continue;
    }
    const country = parseProfileCountry(message?.text);
    if (country) {
      return country;
    }
  }
  return "";
}

function countryButtonMatches(button, expectedCountry) {
  const textKey = countryCompareKey(button?.text);
  if (!textKey) {
    return false;
  }
  return countryAliasCandidates(expectedCountry).some((candidate) => {
    const key = countryCompareKey(candidate);
    return key && (textKey === key || textKey.includes(key));
  });
}

function isCountryOptionButton(button) {
  return /[\u{1F1E6}-\u{1F1FF}]/u.test(String(button?.text || "")) && !button?.url;
}

function isCountryPagerButton(button) {
  if (!String(button?.text || "").trim() || button?.url || isCountryOptionButton(button)) {
    return false;
  }
  const raw = String(button.text || "").trim();
  const text = normalizeText(raw);
  return (
    /^(>|>>|›|»|➡|➡️|⏭|⏭️)$/.test(raw) ||
    /next|weiter|vorwärts|следующ|далее|впер[её]д|mehr|more/.test(text)
  );
}

function isCountrySelectionContext(messages, buttons) {
  const text = normalizeText((messages || []).map((message) => message?.text || "").join("\n"));
  const countryButtonCount = (buttons || []).filter(isCountryOptionButton).length;
  return countryButtonCount >= 5 || (countryButtonCount > 0 && /land|country|страна|select|choose|wählen|auswählen/.test(text));
}

function sampleCountryButtons(buttons, options) {
  if (!isCountrySelectionContext(options.currentMessages || [], buttons)) {
    return buttons;
  }
  const countryButtons = buttons.filter(isCountryOptionButton);
  if (countryButtons.length < 6) {
    return buttons;
  }

  const expected = { countryName: options.expectedCountryName, countryCode: options.expectedCountryCode };
  let sampledCountryCount = 0;
  return buttons.map((button) => {
    if (!isCountryOptionButton(button)) {
      return button;
    }
    const keepExpected = countryButtonMatches(button, expected);
    const keepSample = sampledCountryCount < 2;
    sampledCountryCount += 1;
    if (keepExpected || keepSample) {
      return button;
    }
    return {
      ...button,
      queued: false,
      skipReason: "long_country_list_sampled"
    };
  });
}

function latestButtonSearchMessages(messages) {
  const currentMessages = messagesAfterLastOutgoing(messages || []);
  return currentMessages.length > 0 ? currentMessages : messages || [];
}

function visibleCountryButtons(messages) {
  const result = [];
  for (let messageIndex = (messages || []).length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.outgoing) {
      continue;
    }
    for (const row of messageButtonRows(message)) {
      for (const button of row) {
        if (isCountryOptionButton(button)) {
          result.push({ ...button, messageId: Number(message.id) || 0 });
        }
      }
    }
  }
  return result;
}

function visibleButtonTexts(messages, limit = 12) {
  const texts = [];
  for (let messageIndex = (messages || []).length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.outgoing) {
      continue;
    }
    for (const row of messageButtonRows(message)) {
      for (const button of row) {
        const text = compactText(button?.text || "", 80);
        if (text) {
          texts.push(text);
        }
        if (texts.length >= limit) {
          return texts;
        }
      }
    }
  }
  return texts;
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function countryLookupSchema() {
  return {
    type: "json_schema",
    json_schema: {
      type: "object",
      properties: {
        countryName: { type: "string" },
        countryCode: { type: "string" },
        ip: { type: "string" },
        evidence: { type: "string" }
      },
      required: ["countryName", "countryCode", "ip", "evidence"]
    }
  };
}

async function detectBrowserCountry(env, lookupUrls, timeoutMs) {
  if (!env.BROWSER || typeof env.BROWSER.quickAction !== "function") {
    return null;
  }
  let lastError = "";
  for (const url of lookupUrls) {
    try {
      const response = await env.BROWSER.quickAction("json", {
        url,
        prompt: [
          "Read this IP/country diagnostic page.",
          "Return countryName, two-letter countryCode if visible/inferable, ip if visible, and short evidence.",
          "If the page is raw JSON, parse the JSON values."
        ].join(" "),
        response_format: countryLookupSchema(),
        gotoOptions: {
          waitUntil: "load",
          timeout: timeoutMs
        }
      });
      const payload = await response
        .clone()
        .json()
        .catch(async () => ({ raw: compactText(await response.text().catch(() => ""), 400) }));
      if (!response.ok || payload?.success === false) {
        throw new Error(`Browser country lookup failed: ${response.status}`);
      }
      const result = payload?.result || payload;
      const countryCode = String(result.countryCode || result.country_code || "").trim().toUpperCase();
      const countryName = normalizeCountryText(result.countryName || result.country_name || countryNameFromCode(countryCode));
      if (countryName || /^[A-Z]{2}$/.test(countryCode)) {
        return {
          countryName: countryName || countryNameFromCode(countryCode),
          countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "",
          ip: result.ip || "",
          source: `browser:${url}`,
          evidence: compactText(result.evidence || "", 180)
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return lastError ? { error: lastError } : null;
}

async function detectExpectedCountry(env) {
  const overrideCode = String(env.MTPROTO_DEVICE_COUNTRY_CODE || env.MTPROTO_DISCOVERY_EXPECTED_COUNTRY_CODE || "").trim().toUpperCase();
  const overrideName = normalizeCountryText(env.MTPROTO_DEVICE_COUNTRY_NAME || env.MTPROTO_DISCOVERY_EXPECTED_COUNTRY_NAME || "");
  if (overrideName || overrideCode) {
    return {
      countryName: overrideName || countryNameFromCode(overrideCode),
      countryCode: overrideCode,
      source: "env"
    };
  }

  const lookupUrls = String(env.MTPROTO_DEVICE_COUNTRY_LOOKUP_URLS || DEFAULT_COUNTRY_LOOKUP_URLS)
    .split(/[,\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const timeoutMs = clampNumber(env.MTPROTO_DEVICE_COUNTRY_LOOKUP_TIMEOUT_MS, 5000, 1000, 20000);
  let lastError = "";
  for (const url of lookupUrls) {
    try {
      const payload = await fetchJsonWithTimeout(url, timeoutMs);
      const countryCode = String(payload.country_code || payload.countryCode || payload.country || "").trim().toUpperCase();
      const countryName = normalizeCountryText(
        payload.country_name || payload.countryName || payload.country || countryNameFromCode(countryCode)
      );
      if (countryName || /^[A-Z]{2}$/.test(countryCode)) {
        return {
          countryName: countryName || countryNameFromCode(countryCode),
          countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "",
          ip: payload.ip || payload.query || "",
          source: url
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  const browserCountry = await detectBrowserCountry(env, lookupUrls, timeoutMs);
  if (browserCountry?.countryName || browserCountry?.countryCode) {
    return browserCountry;
  }
  if (browserCountry?.error) {
    lastError = lastError ? `${lastError}; ${browserCountry.error}` : browserCountry.error;
  }
  const fallbackCode = String(env.MTPROTO_DEVICE_COUNTRY_FALLBACK_CODE || "").trim().toUpperCase();
  const fallbackName = normalizeCountryText(env.MTPROTO_DEVICE_COUNTRY_FALLBACK_NAME || "");
  if (fallbackName || fallbackCode) {
    return {
      countryName: fallbackName || countryNameFromCode(fallbackCode),
      countryCode: fallbackCode,
      source: "fallback",
      error: lastError
    };
  }
  return {
    countryName: "",
    countryCode: "",
    source: "unavailable",
    error: lastError || "country lookup did not return a country"
  };
}

function maxMessageId(messages) {
  const ids = messages.map((message) => Number(message.id)).filter((id) => Number.isFinite(id));
  return ids.length > 0 ? Math.max(...ids) : null;
}

function messagesAfterLastOutgoing(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.outgoing) {
      return messages.slice(index + 1);
    }
  }
  return messages;
}

function activeMessages(messages, activeAfterMessageId) {
  if (activeAfterMessageId !== undefined && activeAfterMessageId !== null) {
    const filtered = messages.filter((message) => Number(message.id) > Number(activeAfterMessageId));
    if (filtered.length > 0) {
      return filtered;
    }
  }
  return messagesAfterLastOutgoing(messages);
}

function compactMessage(message) {
  return {
    id: Number(message?.id) || 0,
    dateIso: message?.dateIso || null,
    outgoing: Boolean(message?.outgoing),
    text: String(message?.text || ""),
    links: compactLinks(message?.links),
    buttons: compactButtons(message?.buttons)
  };
}

function compactLinks(links) {
  return (Array.isArray(links) ? links : [])
    .map((link) => ({
      text: compactText(link?.text || link?.url || "", 120),
      url: compactText(link?.url || "", 500),
      type: String(link?.type || "")
    }))
    .filter((link) => link.url);
}

function compactButtons(rows) {
  return (Array.isArray(rows) ? rows : [])
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .map((button) => ({
      text: compactText(button?.text || "", 120),
      type: String(button?.type || ""),
      rowIndex: Number.isFinite(Number(button?.rowIndex)) ? Number(button.rowIndex) : null,
      columnIndex: Number.isFinite(Number(button?.columnIndex)) ? Number(button.columnIndex) : null,
      url: button?.url ? compactText(button.url, 500) : ""
    }))
    .filter((button) => button.text || button.url);
}

function uniqueButtonKey(button) {
  return [String(button?.text || "").trim().toLowerCase(), button?.url || "", button?.type || ""].join("|");
}

function buttonSkipReason(button, denyButtonRe, allowUnsafeButtons) {
  if (!String(button?.text || "").trim()) {
    return "empty_text";
  }
  if (!button?.clickable) {
    return "not_clickable";
  }
  if (button?.url) {
    return "url_or_webapp_terminal";
  }
  if (!allowUnsafeButtons && denyButtonRe.test(String(button.text || ""))) {
    return "safe_deny_rule";
  }
  return null;
}

function messageButtonRows(message) {
  const rawButtons = message?.buttons;
  if (!Array.isArray(rawButtons)) {
    return [];
  }

  const rows = rawButtons.some((item) => Array.isArray(item)) ? rawButtons : [rawButtons];
  return rows.map((row, rowIndex) => {
    const buttons = Array.isArray(row) ? row : [row];
    return buttons
      .filter((button) => button && typeof button === "object")
      .map((button, columnIndex) => ({
        ...button,
        rowIndex: Number.isFinite(Number(button.rowIndex)) ? Number(button.rowIndex) : rowIndex,
        columnIndex: Number.isFinite(Number(button.columnIndex)) ? Number(button.columnIndex) : columnIndex
      }));
  });
}

function collectCurrentButtons(messages, activeAfterMessageId, options) {
  let result = [];
  const seen = new Set();
  const currentMessages = activeMessages(messages, activeAfterMessageId);

  for (let messageIndex = currentMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = currentMessages[messageIndex];
    if (message?.outgoing) {
      continue;
    }

    for (const row of messageButtonRows(message)) {
      for (const button of row) {
        const key = uniqueButtonKey(button);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const skipReason = buttonSkipReason(button, options.denyButtonRe, options.allowUnsafeButtons);
        result.push({
          ...button,
          messageId: Number(message.id) || 0,
          queued: !skipReason,
          ...(skipReason ? { skipReason } : {})
        });

        if (result.length >= options.maxButtonsPerNode * 2) {
          break;
        }
      }
      if (result.length >= options.maxButtonsPerNode * 2) {
        break;
      }
    }
    if (result.length >= options.maxButtonsPerNode * 2) {
      break;
    }
  }

  result = sampleCountryButtons(result, {
    currentMessages,
    expectedCountryName: options.expectedCountryName,
    expectedCountryCode: options.expectedCountryCode
  });

  return {
    buttons: result.filter((button) => button.queued).slice(0, options.maxButtonsPerNode),
    skippedButtons: result.filter((button) => !button.queued)
  };
}

function buildNode(id, currentPath, messages, activeAfterMessageId, error, options) {
  const currentMessages = activeMessages(messages, activeAfterMessageId);
  const { buttons, skippedButtons } = collectCurrentButtons(messages, activeAfterMessageId, options);
  const first = messages[0] || null;
  const last = messages[messages.length - 1] || null;

  return {
    id,
    depth: currentPath.length,
    path: currentPath,
    observedAtIso: nowIso(),
    messageWindow: {
      limit: options.stateLimit,
      count: messages.length,
      firstId: first?.id ?? null,
      lastId: last?.id ?? null,
      activeAfterMessageId: activeAfterMessageId ?? null,
      activeCount: currentMessages.length
    },
    tail: currentMessages.slice(-12).map(compactMessage),
    buttons: error ? [] : buttons,
    skippedButtons: error ? [] : skippedButtons,
    ...(error ? { error } : {})
  };
}

function addEdge(edges, from, to, buttonText, depth) {
  if (edges.some((edge) => edge.from === from && edge.to === to && edge.buttonText === buttonText)) {
    return;
  }
  edges.push({ from, to, buttonText, depth });
}

function mtprotoConfig(env) {
  const url = String(env.MTPROTO_SERVICE_URL || "").trim().replace(/\/+$/, "");
  const token = String(env.MTPROTO_SERVICE_TOKEN || "").trim();
  if (!url || !token) {
    throw new Error("MTPROTO_SERVICE_URL and MTPROTO_SERVICE_TOKEN are required in Cloudflare Worker.");
  }
  return { url, token };
}

async function mtprotoRequest(env, path, body) {
  const config = mtprotoConfig(env);
  const timeoutMs = clampNumber(env.MTPROTO_SERVICE_REQUEST_TIMEOUT_MS, 20000, 3000, 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "AbortError"
        ? `MTProto ${path} timed out after ${timeoutMs}ms`
        : `MTProto ${path} request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`MTProto ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function peerForRun(run) {
  return { username: normalizeBotUsername(run.bot_username) };
}

async function sendMtprotoMessage(env, peer, message) {
  return mtprotoRequest(env, "/api/send-message", { ...peer, message });
}

async function getMtprotoChatState(env, peer, limit) {
  return mtprotoRequest(env, "/api/chat-state", { ...peer, limit });
}

async function clickMtprotoButton(env, peer, messageId, selector) {
  return mtprotoRequest(env, "/api/click-button", { ...peer, messageId, ...selector });
}

function serializeClickEvidence(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return {
    success: Boolean(payload.success),
    message_id: Number(payload.messageId) || null,
    row_index: Number.isFinite(Number(payload.rowIndex)) ? Number(payload.rowIndex) : null,
    column_index: Number.isFinite(Number(payload.columnIndex)) ? Number(payload.columnIndex) : null,
    button_text: String(payload.buttonText || ""),
    result: payload.result && typeof payload.result === "object"
      ? {
          kind: String(payload.result.kind || ""),
          message: compactText(payload.result.message || "", 180),
          url: payload.result.url ? compactText(payload.result.url, 300) : "",
          alert: typeof payload.result.alert === "boolean" ? payload.result.alert : undefined
        }
      : null
  };
}

function findLatestMtprotoButton(messages, labels) {
  const normalizedLabels = labels.map(normalizeText);
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    for (const row of messageButtonRows(message)) {
      for (const button of row) {
        if (normalizedLabels.includes(normalizeText(button?.text))) {
          return { message, button };
        }
      }
    }
  }
  return null;
}

function findLatestMtprotoButtonWhere(messages, predicate) {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    for (const row of messageButtonRows(message)) {
      for (const button of row) {
        if (predicate(button, message)) {
          return { message, button };
        }
      }
    }
  }
  return null;
}

async function startBot(env, peer, options) {
  const before = await getMtprotoChatState(env, peer, options.stateLimit).catch(() => null);
  const activeAfterMessageId = before ? maxMessageId(before.messages || []) : null;
  const payload = String(options.startPayload || "").trim();
  await sendMtprotoMessage(env, peer, payload ? `/start ${payload}` : "/start");
  await sleep(options.settleMs);
  return activeAfterMessageId;
}

async function clickLatestButton(env, peer, label, options, clickOptions = {}) {
  const state = await getMtprotoChatState(env, peer, options.stateLimit);
  const currentMessages = messagesAfterLastOutgoing(state.messages || []);
  const found = findLatestMtprotoButton(currentMessages.length > 0 ? currentMessages : state.messages || [], [label]);
  if (!found) {
    throw new Error(`Button not found in latest chat state: ${label}`);
  }
  if (found.button?.url && !clickOptions.allowUrl) {
    throw new Error(`URL/WebApp button is terminal in MTProto discovery: ${label}`);
  }

  const click = await clickMtprotoButton(env, peer, found.message.id, {
    rowIndex: found.button.rowIndex,
    columnIndex: found.button.columnIndex,
    ...(found.button.dataBase64 ? { buttonDataBase64: found.button.dataBase64 } : {}),
    buttonText: found.button.text,
    allowTimeoutAsSuccess: true,
    clickTimeoutMs: options.clickTimeoutMs
  });
  await sleep(options.settleMs);
  return {
    activeAfterMessageId: Number(found.message.id) - 1,
    message: compactMessage(found.message),
    button: {
      text: String(found.button.text || ""),
      url: found.button.url || "",
      type: found.button.type || "",
      rowIndex: found.button.rowIndex,
      columnIndex: found.button.columnIndex
    },
    click: serializeClickEvidence(click)
  };
}

async function clickLatestButtonWhere(env, peer, predicate, options, description, clickOptions = {}) {
  const state = await getMtprotoChatState(env, peer, options.stateLimit);
  const currentMessages = messagesAfterLastOutgoing(state.messages || []);
  const found = findLatestMtprotoButtonWhere(currentMessages.length > 0 ? currentMessages : state.messages || [], predicate);
  if (!found) {
    throw new Error(`Button not found in latest chat state: ${description}`);
  }
  if (found.button?.url && !clickOptions.allowUrl) {
    throw new Error(`URL/WebApp button is terminal in MTProto discovery: ${found.button.text || description}`);
  }

  const click = await clickMtprotoButton(env, peer, found.message.id, {
    rowIndex: found.button.rowIndex,
    columnIndex: found.button.columnIndex,
    ...(found.button.dataBase64 ? { buttonDataBase64: found.button.dataBase64 } : {}),
    buttonText: found.button.text,
    allowTimeoutAsSuccess: true,
    clickTimeoutMs: options.clickTimeoutMs
  });
  await sleep(options.settleMs);
  return {
    activeAfterMessageId: Number(found.message.id) - 1,
    message: compactMessage(found.message),
    button: {
      text: String(found.button.text || ""),
      url: found.button.url || "",
      type: found.button.type || "",
      rowIndex: found.button.rowIndex,
      columnIndex: found.button.columnIndex
    },
    click: serializeClickEvidence(click)
  };
}

async function clickPathButton(env, peer, label, options) {
  const result = await clickLatestButton(env, peer, label, options);
  return result.activeAfterMessageId;
}

async function performPathAction(env, peer, label, options) {
  if (isCommandAction(label)) {
    const before = await getMtprotoChatState(env, peer, options.stateLimit).catch(() => null);
    const activeAfterMessageId = before ? maxMessageId(before.messages || []) : null;
    await sendMtprotoMessage(env, peer, label);
    await sleep(options.settleMs);
    return activeAfterMessageId;
  }
  return clickPathButton(env, peer, label, options);
}

async function replayPath(env, peer, buttonPath, options, shouldStop) {
  let activeAfterMessageId = await startBot(env, peer, options);
  for (const label of buttonPath) {
    if (await shouldStop()) {
      return { cancelled: true, activeAfterMessageId };
    }
    try {
      activeAfterMessageId = await performPathAction(env, peer, label, options);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        activeAfterMessageId
      };
    }
  }
  return { activeAfterMessageId };
}

function discoveryOptions(env, run) {
  const selector = String(run.selector || "").trim().toLowerCase();
  const devMode = ["dev", "unsafe", "runnable"].includes(selector);
  return {
    startPayload: String(run.start_payload || "").trim(),
    maxDepth: clampNumber(devMode ? env.MTPROTO_DISCOVERY_DEV_MAX_DEPTH || 4 : env.MTPROTO_DISCOVERY_MAX_DEPTH, 1, 0, 8),
    maxNodes: clampNumber(devMode ? env.MTPROTO_DISCOVERY_DEV_MAX_NODES || 60 : env.MTPROTO_DISCOVERY_MAX_NODES, 8, 1, 120),
    maxButtonsPerNode: clampNumber(env.MTPROTO_DISCOVERY_MAX_BUTTONS_PER_NODE, 8, 1, 20),
    stateLimit: clampNumber(env.MTPROTO_DISCOVERY_STATE_LIMIT, 50, 10, 200),
    settleMs: clampNumber(env.MTPROTO_DISCOVERY_SETTLE_MS, 1400, 250, 7000),
    deviceCheckSettleMs: clampNumber(env.MTPROTO_DEVICE_CHECK_SETTLE_MS, 7000, 1000, 30000),
    clickTimeoutMs: clampNumber(env.MTPROTO_DISCOVERY_CLICK_TIMEOUT_MS, 3500, 500, 20000),
    allowUnsafeButtons:
      devMode || /^(1|true|yes)$/i.test(String(env.MTPROTO_DISCOVERY_ALLOW_UNSAFE_BUTTONS || "")),
    clickWebappHandoffs: !/^(0|false|no)$/i.test(String(env.MTPROTO_DISCOVERY_CLICK_WEBAPP_HANDOFFS || "1")),
    denyButtonRe: new RegExp(String(env.MTPROTO_DISCOVERY_DENY_BUTTON_RE || DEFAULT_DENY_BUTTON_RE), "i"),
    commands: String(env.MTPROTO_DISCOVERY_COMMANDS || DEFAULT_DISCOVERY_COMMANDS)
      .split(/[,\n]+/g)
      .map((command) => command.trim())
      .filter(Boolean),
    countryPageLimit: clampNumber(env.MTPROTO_DEVICE_COUNTRY_PAGE_LIMIT, 12, 1, 40),
    expectedCountryName: normalizeCountryText(env.MTPROTO_DEVICE_COUNTRY_NAME || env.MTPROTO_DISCOVERY_EXPECTED_COUNTRY_NAME || ""),
    expectedCountryCode: String(env.MTPROTO_DEVICE_COUNTRY_CODE || env.MTPROTO_DISCOVERY_EXPECTED_COUNTRY_CODE || "").trim().toUpperCase()
  };
}

async function buildBotMap(env, run, shouldStop = async () => false, onProgress = null) {
  const peer = peerForRun(run);
  const options = discoveryOptions(env, run);
  const nodes = [];
  const edges = [];
  const queue = [[], ...options.commands.map((command) => [command])];
  const visited = new Set();
  await notifyProgress(onProgress, {
    phase: "discovery",
    message: `Строю карту Telegram: глубина ${options.maxDepth}, лимит ${options.maxNodes} узл.`
  });

  while (queue.length > 0 && nodes.length < options.maxNodes) {
    if (await shouldStop()) {
      await notifyProgress(onProgress, {
        phase: "discovery",
        status: "cancelled",
        message: "Построение карты остановлено"
      });
      return { cancelled: true, map: null };
    }

    const currentPath = queue.shift() || [];
    const currentId = nodeId(currentPath);
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    const replay = await replayPath(env, peer, currentPath, options, shouldStop);
    if (replay.cancelled) {
      await notifyProgress(onProgress, {
        phase: "discovery",
        status: "cancelled",
        message: "Построение карты остановлено"
      });
      return { cancelled: true, map: null };
    }

    const state = await getMtprotoChatState(env, peer, options.stateLimit);
    const node = buildNode(currentId, currentPath, state.messages || [], replay.activeAfterMessageId, replay.error, options);
    nodes.push(node);
    await notifyProgress(onProgress, {
      phase: "discovery",
      message: `Найден узел ${nodes.length}/${options.maxNodes}: ${compactText(currentPath.join(" > ") || "/start", 120)}`,
      node_count: nodes.length,
      edge_count: edges.length,
      queue_count: queue.length
    });

    if (currentPath.length > 0) {
      addEdge(edges, nodeId(currentPath.slice(0, -1)), currentId, currentPath.at(-1) || "", currentPath.length);
    }

    if (!replay.error && currentPath.length < options.maxDepth) {
      for (const button of node.buttons) {
        const nextPath = [...currentPath, button.text];
        const nextId = nodeId(nextPath);
        addEdge(edges, currentId, nextId, button.text, nextPath.length);
        if (!visited.has(nextId) && queue.length + nodes.length < options.maxNodes) {
          queue.push(nextPath);
        }
      }
    }
  }

  await notifyProgress(onProgress, {
    phase: "discovery",
    status: "success",
    message: `Карта готова: ${nodes.length} узл., ${edges.length} переходов`,
    node_count: nodes.length,
    edge_count: edges.length
  });

  return {
    cancelled: false,
    map: {
      schemaVersion: 1,
      runner: "cloudflare-mtproto-discovery",
      generatedAtIso: nowIso(),
      bot: normalizeBotUsername(run.bot_username),
      startPayload: options.startPayload,
      limits: {
        maxDepth: options.maxDepth,
        maxNodes: options.maxNodes,
        maxButtonsPerNode: options.maxButtonsPerNode,
        stateLimit: options.stateLimit,
        commands: options.commands
      },
      nodes,
      edges
    }
  };
}

function messageAnchors(node) {
  return unique(
    (node?.tail || [])
      .flatMap((message) => String(message.text || "").split(/\n+/g))
      .map((line) => compactText(line, 90))
      .filter((line) => line.length >= 4 && !/^https?:\/\//i.test(line))
  ).slice(-8);
}

function buttonAnchors(node) {
  return unique([...(node?.buttons || []), ...(node?.skippedButtons || [])].map((button) => String(button.text || "").trim()))
    .filter(Boolean)
    .slice(0, 10);
}

function classifyNode(node) {
  const text = normalizeText([
    ...node.path,
    ...(node.tail || []).map((message) => message.text),
    ...(node.buttons || []).map((button) => button.text),
    ...(node.skippedButtons || []).map((button) => button.text)
  ].join("\n"));

  if (node.error) {
    return {
      stateType: "runner_error",
      purpose: "Ветка не была корректно воспроизведена runner'ом.",
      risks: [node.error],
      tests: ["Повторить ветку отдельно.", "Проверить текст кнопки и состояние бота."],
      severity: "high"
    };
  }
  if (/task|задач|aufgabe|join_task|my_tasks|скрин|screenshot/.test(text)) {
    return {
      stateType: "task_flow",
      purpose: "Выдача, выполнение или проверка задания.",
      risks: ["Статус задания может не синхронизироваться после действия пользователя."],
      tests: ["Проверить переход статусов и требования к proof/screenshot."],
      severity: "high"
    };
  }
  if (/earning|balance|withdraw|payment|выплат|баланс|кошел|money/.test(text)) {
    return {
      stateType: "money_flow",
      purpose: "Баланс, заработок или выплаты.",
      risks: ["Ошибки в деньгах критичны и требуют отдельной проверки."],
      tests: ["Проверить отображение сумм, валюту и недоступность опасных действий без подтверждения."],
      severity: "high"
    };
  }
  if (/settings|country|language|device|настрой|страна|язык|gerät/.test(text)) {
    return {
      stateType: "settings_flow",
      purpose: "Настройки пользователя: страна, язык, устройство или профиль.",
      risks: ["Настройки могут влиять на доступность заданий и локализацию."],
      tests: ["Проверить сохранение настроек и обратную навигацию."],
      severity: "medium"
    };
  }
  if ((node.skippedButtons || []).some((button) => button.skipReason === "url_or_webapp_terminal")) {
    return {
      stateType: "webapp_handoff",
      purpose: "Переход из Telegram в WebApp/URL.",
      risks: ["MTProto видит ссылку, но не проверяет UI и network внутри WebApp."],
      tests: ["Следующим этапом открыть URL через Browser Run/Playwright."],
      severity: "high"
    };
  }
  return {
    stateType: "interactive_state",
    purpose: node.path.length ? `Состояние после "${node.path.at(-1)}".` : "Стартовое состояние бота.",
    risks: ["Назначение ветки нужно подтвердить по бизнес-логике."],
    tests: ["Проверить текст, кнопки и ожидаемый следующий шаг."],
    severity: "medium"
  };
}

function draftFromNode(node, index) {
  const analysis = classifyNode(node);
  const id = node.path.length ? `branch-${normalizeNodeIdPart(node.path.join("-"))}` : "start-smoke";
  const steps = [
    { name: "open start payload", openBot: true, expectTextAny: messageAnchors(node), expectButtonAny: buttonAnchors(node) },
    ...node.path.map((label) => ({
      name: isCommandAction(label) ? `send ${label}` : `click ${label}`,
      ...(isCommandAction(label) ? { send: label } : { clickButton: label })
    }))
  ];

  return {
    id,
    status: node.error ? "failed" : "passed",
    scenario: node.path.length ? node.path.join(" > ") : "/start",
    source_type: "cloudflare-mtproto",
    ai_severity: analysis.severity,
    first_error: node.error || "",
    step_count: Math.max(1, steps.length),
    passed_steps: node.error ? Math.max(0, steps.length - 1) : steps.length,
    warning_steps: 0,
    failed_steps: node.error ? 1 : 0,
    attempts: 1,
    node_id: node.id,
    path: node.path,
    safety: "cloudflare-mtproto",
    reason: analysis.purpose,
    scenario_definition: {
      name: `cloudflare-mtproto-${id || index + 1}`,
      steps
    }
  };
}

function selectedDraftIds(selector) {
  const normalized = String(selector || "").trim();
  const lower = normalized.toLowerCase();
  if (!lower || ["smart", "safe", "all-safe", "runnable", "dev", "unsafe"].includes(lower)) {
    return [];
  }
  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function draftMatchesSelectedId(draft, selectedId) {
  const normalizedSelected = normalizeText(selectedId);
  if (!normalizedSelected) {
    return false;
  }
  const candidates = [
    draft.id,
    draft.node_id,
    draft.scenario,
    Array.isArray(draft.path) ? draft.path.join(">") : ""
  ].map((value) => normalizeText(value));
  return candidates.includes(normalizedSelected);
}

function collectWebappHandoffs(map) {
  const byKey = new Map();
  for (const node of map.nodes || []) {
    const skippedButtons = Array.isArray(node.skippedButtons) ? node.skippedButtons : [];
    for (const button of skippedButtons) {
      if (button.skipReason !== "url_or_webapp_terminal" || !button.url) {
        continue;
      }
      const key = [normalizeText(button.text), button.url].join("|");
      const existing = byKey.get(key);
      if (existing) {
        existing.source_nodes = unique([...(existing.source_nodes || []), node.id]);
        existing.paths = [...(existing.paths || []), node.path || []];
        continue;
      }
      byKey.set(key, {
        node_id: node.id,
        source_nodes: [node.id],
        path: node.path || [],
        paths: [node.path || []],
        button_text: button.text || "",
        button_type: button.type || "",
        message_id: Number(button.messageId) || null,
        row_index: Number.isFinite(Number(button.rowIndex)) ? Number(button.rowIndex) : null,
        column_index: Number.isFinite(Number(button.columnIndex)) ? Number(button.columnIndex) : null,
        button_data_base64: button.dataBase64 || "",
        url: button.url,
        recommended_engine: "cloudflare-browser-run",
        status: "pending_browser_run"
      });
    }
  }
  return Array.from(byKey.values());
}

function safeArtifactName(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return normalized || "artifact";
}

function webappScreenshotName(handoff, index) {
  return `webapp-${String(index + 1).padStart(2, "0")}-${safeArtifactName(handoff.button_text || handoff.node_id)}.png`;
}

function panelArtifactKey(runId, artifactName) {
  return `panel-artifact:${safeArtifactName(runId)}:${safeArtifactName(artifactName)}`;
}

function panelArtifactUrl(runId, artifactName) {
  return `/api/runs/${encodeURIComponent(String(runId || ""))}/artifacts/${encodeURIComponent(artifactName)}`;
}

function shouldCaptureWebappScreenshots(env) {
  return !/^(0|false|no)$/i.test(String(env.BROWSER_RUN_CAPTURE_SCREENSHOTS || "1"));
}

function webappAuditSchema() {
  return {
    type: "json_schema",
    json_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        visible_text_summary: { type: "string" },
        main_actions: { type: "array", items: { type: "string" } },
        forms: { type: "array", items: { type: "string" } },
        errors_or_blockers: { type: "array", items: { type: "string" } },
        qa_notes: { type: "array", items: { type: "string" } }
      },
      required: ["title", "visible_text_summary", "main_actions", "forms", "errors_or_blockers", "qa_notes"]
    }
  };
}

async function captureWebappScreenshot(env, run, handoff, url, index) {
  return captureUrlScreenshot(env, run, webappScreenshotName(handoff, index), url, {
    kind: "webapp-screenshot",
    buttonText: compactText(handoff.button_text, 80)
  });
}

async function captureUrlScreenshot(env, run, artifactName, url, metadata = {}) {
  if (!shouldCaptureWebappScreenshots(env)) {
    return {
      enabled: false,
      reason: "BROWSER_RUN_CAPTURE_SCREENSHOTS is disabled."
    };
  }
  if (!env.BOT_STATE_KV || !run?.id) {
    return {
      enabled: false,
      reason: "BOT_STATE_KV or run id is not available."
    };
  }

  const response = await env.BROWSER.quickAction("screenshot", {
    url,
    screenshotOptions: {
      fullPage: true
    },
    viewport: {
      width: 1280,
      height: 900
    },
    gotoOptions: {
      waitUntil: "networkidle2",
      timeout: 20000
    }
  });
  const bytes = await response.arrayBuffer();
  if (!response.ok || bytes.byteLength === 0) {
    throw new Error(`Browser Run screenshot failed: ${response.status}, bytes=${bytes.byteLength}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  await env.BOT_STATE_KV.put(panelArtifactKey(run.id, artifactName), bytes, {
    expirationTtl: ARTIFACT_TTL_SECONDS,
    metadata: {
      contentType,
      kind: metadata.kind || "browser-screenshot",
      ...(metadata.buttonText ? { buttonText: metadata.buttonText } : {}),
      url: compactText(url, 240)
    }
  });
  return {
    enabled: true,
    ok: true,
    artifact_name: artifactName,
    url: panelArtifactUrl(run.id, artifactName),
    content_type: contentType,
    byte_length: bytes.byteLength,
    browser_ms_used: response.headers.get("X-Browser-Ms-Used") || ""
  };
}

function shouldRunCountryDevicePreflight(env, run) {
  if (/^(0|false|no)$/i.test(String(env.MTPROTO_DEVICE_PREFLIGHT || "1"))) {
    return false;
  }
  if (String(run?.suite || "generated_scenarios").trim() !== "generated_scenarios") {
    return false;
  }
  const bot = normalizeBotUsername(run?.bot_username).toLowerCase();
  const allowedBots = String(env.MTPROTO_DEVICE_PREFLIGHT_BOTS || "artp345_bot")
    .split(/[,\n]+/g)
    .map((item) => normalizeBotUsername(item).toLowerCase())
    .filter(Boolean);
  return allowedBots.includes("all") || allowedBots.includes(bot);
}

function messageText(messages) {
  return (messages || [])
    .filter((message) => !message?.outgoing)
    .map((message) => String(message?.text || ""))
    .filter(Boolean)
    .join("\n\n");
}

function activeIncomingMessages(messages, activeAfterMessageId) {
  return activeMessages(messages || [], activeAfterMessageId).filter((message) => !message?.outgoing);
}

function isSupportTarget(text, url) {
  const joined = normalizeText(`${text || ""} ${url || ""}`);
  return /support|kontakt|contact|remotenode|t\.me\/remotenode/.test(joined);
}

function isDeviceCheckTarget(text, url, contextText) {
  const normalizedUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return false;
  }
  const joined = normalizeText(`${contextText || ""} ${text || ""} ${normalizedUrl}`);
  if (isSupportTarget(text, normalizedUrl) && !/device|check|verify|geo|ip|vpn|prüf|pruf/.test(joined)) {
    return false;
  }
  return DEVICE_CHECK_CONTEXT_RE.test(joined) || (/^https?:\/\//i.test(normalizedUrl) && DEVICE_CHECK_CONTEXT_RE.test(contextText || ""));
}

function findDeviceCheckTarget(messages, activeAfterMessageId = null) {
  const currentMessages = activeIncomingMessages(messages, activeAfterMessageId);
  for (let messageIndex = currentMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = currentMessages[messageIndex];
    const contextText = String(message?.text || "");
    for (const link of message?.links || []) {
      if (isDeviceCheckTarget(link.text, link.url, contextText)) {
        return {
          type: "message_link",
          message_id: Number(message.id) || null,
          text: String(link.text || "Link"),
          url: String(link.url || "")
        };
      }
    }
    for (const row of messageButtonRows(message)) {
      for (const button of row) {
        if (button?.url && isDeviceCheckTarget(button.text, button.url, contextText)) {
          return {
            type: "url_button",
            message_id: Number(message.id) || null,
            text: String(button.text || "Link"),
            url: String(button.url || ""),
            row_index: Number.isFinite(Number(button.rowIndex)) ? Number(button.rowIndex) : null,
            column_index: Number.isFinite(Number(button.columnIndex)) ? Number(button.columnIndex) : null
          };
        }
      }
    }
  }
  return null;
}

function confirmationStillBlocked(messages, activeAfterMessageId = null) {
  return CONFIRMATION_BLOCKER_RE.test(messageText(activeIncomingMessages(messages || [], activeAfterMessageId)));
}

function parseLabeledValue(text, labels) {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?:${escapedLabels.join("|")})\\s*[:：-]\\s*([^\\n\\r]+)`, "i");
  const match = String(text || "").match(re);
  return match ? normalizeCountryText(match[1]) : "";
}

function parseDeviceCheckOutcome(messages, activeAfterMessageId = null) {
  const text = messageText(activeIncomingMessages(messages || [], activeAfterMessageId));
  const profileCountry = parseLabeledValue(text, ["Land im Profil", "Profile country", "Страна в профиле"]);
  const detectedCountry = parseLabeledValue(text, ["Erkanntes Land", "Detected country", "Определенная страна", "Определённая страна"]);
  const vpnRaw = parseLabeledValue(text, ["VPN"]);
  const vpnValue = normalizeText(vpnRaw);
  const vpnDetected = /^(an|on|yes|ja|да|вкл|true|enabled|ein)$/.test(vpnValue);
  const vpnDisabled = /^(aus|off|no|nein|нет|выкл|false|disabled)$/.test(vpnValue);
  return {
    profile_country: profileCountry,
    detected_country: detectedCountry,
    vpn: vpnRaw,
    vpn_detected: vpnDetected,
    vpn_disabled: vpnDisabled,
    country_match: Boolean(profileCountry && detectedCountry && countryCompareKey(profileCountry) === countryCompareKey(detectedCountry)),
    text_sample: compactText(text, 700)
  };
}

async function auditDeviceCheckUrl(env, run, target) {
  const url = String(target?.url || "").trim();
  const browserRun = {
    enabled: Boolean(env.BROWSER),
    ok: false,
    url
  };
  if (!env.BROWSER || typeof env.BROWSER.quickAction !== "function") {
    return {
      ...browserRun,
      reason: "BROWSER binding is not configured."
    };
  }

  try {
    const response = await env.BROWSER.quickAction("json", {
      url,
      prompt: [
        "Открой страницу проверки устройства как QA.",
        "Коротко верни видимый статус проверки, найденную страну/IP/устройство, ошибки и подтверждает ли экран прохождение проверки.",
        "Если страница ничего явно не показывает, верни видимый текст и возможный next step."
      ].join(" "),
      response_format: webappAuditSchema(),
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 30000
      }
    });
    const payload = await response
      .clone()
      .json()
      .catch(async () => ({ raw: compactText(await response.text().catch(() => ""), 400) }));
    if (!response.ok || payload?.success === false) {
      throw new Error(`Browser Run json failed: ${response.status} ${JSON.stringify(payload).slice(0, 600)}`);
    }
    browserRun.result = payload?.result || payload;
    browserRun.json_browser_ms_used = response.headers.get("X-Browser-Ms-Used") || "";
  } catch (error) {
    browserRun.json_error = error instanceof Error ? error.message : String(error);
  }

  try {
    browserRun.screenshot = await captureUrlScreenshot(env, run, "device-check-01.png", url, {
      kind: "device-check-screenshot",
      buttonText: compactText(target?.text || "device-check", 80)
    });
  } catch (error) {
    browserRun.screenshot_error = error instanceof Error ? error.message : String(error);
  }

  browserRun.ok = Boolean(browserRun.result || browserRun.screenshot?.ok);
  return browserRun;
}

async function readProfileState(env, peer, options) {
  await sendMtprotoMessage(env, peer, SETTINGS_COMMAND);
  await sleep(options.settleMs);
  const state = await getMtprotoChatState(env, peer, options.stateLimit);
  return {
    state,
    country: profileCountryFromMessages(state.messages || [])
  };
}

async function clickCountryButtonWithPaging(env, peer, options, expectedCountry, onProgress) {
  const maxPages = clampNumber(options.countryPageLimit, 12, 1, 40);
  const pages = [];
  const visited = new Set();
  const expectedLabel = expectedCountry.countryName || expectedCountry.countryCode || "country";

  for (let page = 1; page <= maxPages; page += 1) {
    const state = await getMtprotoChatState(env, peer, options.stateLimit);
    const messages = latestButtonSearchMessages(state.messages || []);
    const countryButtons = visibleCountryButtons(messages);
    const visible = countryButtons.map((button) => compactText(button.text || "", 80));
    const signature = visible.join("|") || visibleButtonTexts(messages, 20).join("|");
    pages.push({
      page,
      country_count: countryButtons.length,
      sample: visible.slice(0, 12)
    });

    await notifyProgress(onProgress, {
      phase: "country",
      message: countryButtons.length
        ? `Страны на странице ${page}: ${visible.slice(0, 6).join(", ")}`
        : `Страница ${page}: кнопки ${visibleButtonTexts(messages, 6).join(", ") || "не найдены"}`
    });

    const foundCountry = findLatestMtprotoButtonWhere(messages, (button) => countryButtonMatches(button, expectedCountry));
    if (foundCountry) {
      const click = await clickMtprotoButton(env, peer, foundCountry.message.id, {
        rowIndex: foundCountry.button.rowIndex,
        columnIndex: foundCountry.button.columnIndex,
        ...(foundCountry.button.dataBase64 ? { buttonDataBase64: foundCountry.button.dataBase64 } : {}),
        buttonText: foundCountry.button.text,
        allowTimeoutAsSuccess: true,
        clickTimeoutMs: options.clickTimeoutMs
      });
      await sleep(options.settleMs);
      return {
        status: "success",
        pages,
        activeAfterMessageId: Number(foundCountry.message.id) - 1,
        message: compactMessage(foundCountry.message),
        button: {
          text: String(foundCountry.button.text || ""),
          url: foundCountry.button.url || "",
          type: foundCountry.button.type || "",
          rowIndex: foundCountry.button.rowIndex,
          columnIndex: foundCountry.button.columnIndex
        },
        click: serializeClickEvidence(click)
      };
    }

    if (signature && visited.has(signature)) {
      return {
        status: "blocked",
        pages,
        error: `Country list repeated before finding ${expectedLabel}.`
      };
    }
    if (signature) {
      visited.add(signature);
    }

    const pager = findLatestMtprotoButtonWhere(messages, isCountryPagerButton);
    if (!pager) {
      return {
        status: "blocked",
        pages,
        error: `Country ${expectedLabel} was not found in visible country buttons.`
      };
    }

    await notifyProgress(onProgress, {
      phase: "country",
      message: `Листаю список стран: ${compactText(pager.button.text || "", 40)}`
    });
    await clickMtprotoButton(env, peer, pager.message.id, {
      rowIndex: pager.button.rowIndex,
      columnIndex: pager.button.columnIndex,
      ...(pager.button.dataBase64 ? { buttonDataBase64: pager.button.dataBase64 } : {}),
      buttonText: pager.button.text,
      allowTimeoutAsSuccess: true,
      clickTimeoutMs: options.clickTimeoutMs
    });
    await sleep(options.settleMs);
  }

  return {
    status: "blocked",
    pages,
    error: `Country ${expectedLabel} was not found after ${maxPages} country pages.`
  };
}

async function ensureProfileCountry(env, peer, options, expectedCountry, onProgress) {
  const before = await readProfileState(env, peer, options);
  const result = {
    selected_country_before: before.country,
    selected_country_after: before.country,
    changed: false
  };

  if (!expectedCountry.countryName && !expectedCountry.countryCode) {
    result.status = "warning";
    result.error = "Expected country could not be detected.";
    return result;
  }
  await notifyProgress(onProgress, {
    phase: "country",
    message: before.country
      ? `Страна профиля сейчас: ${before.country}`
      : "Страна профиля сейчас не найдена в /settings"
  });
  if (before.country && countriesMatch(before.country, expectedCountry)) {
    result.status = "success";
    return result;
  }

  await notifyProgress(onProgress, {
    phase: "country",
    message: `Выбираю страну профиля: ${expectedCountry.countryName || expectedCountry.countryCode}`
  });
  let changeClick;
  try {
    changeClick = await clickLatestButtonWhere(
      env,
      peer,
      (button) => CHANGE_COUNTRY_RE.test(String(button?.text || "")),
      options,
      "change country"
    );
  } catch (error) {
    result.status = "blocked";
    result.error = `Country change button was not found: ${error instanceof Error ? error.message : String(error)}`;
    return result;
  }
  await notifyProgress(onProgress, {
    phase: "country",
    message: `Открыл выбор страны: ${compactText(changeClick.button?.text || "", 80)}`
  });

  const countryClick = await clickCountryButtonWithPaging(env, peer, options, expectedCountry, onProgress);
  if (countryClick.status !== "success") {
    result.status = "blocked";
    result.change_country_click = changeClick;
    result.country_click = countryClick;
    result.country_pages = countryClick.pages || [];
    result.error = countryClick.error || `Country ${expectedCountry.countryName || expectedCountry.countryCode} was not found.`;
    return result;
  }
  const after = await readProfileState(env, peer, options);
  result.changed = true;
  result.change_country_click = changeClick;
  result.country_click = countryClick;
  result.country_pages = countryClick.pages || [];
  result.selected_country_after = after.country;
  result.status = after.country && countriesMatch(after.country, expectedCountry) ? "success" : "blocked";
  await notifyProgress(onProgress, {
    phase: "country",
    status: result.status === "success" ? "success" : "failure",
    message: after.country
      ? `Страна после выбора: ${after.country}`
      : "После выбора страна в /settings не найдена"
  });
  if (result.status !== "success") {
    result.error = `Selected country after change is "${after.country || "unknown"}".`;
  }
  return result;
}

async function runCountryDevicePreflight(env, run, shouldStop, onProgress = null) {
  const peer = peerForRun(run);
  const options = discoveryOptions(env, run);
  const result = {
    enabled: true,
    status: "running",
    expected_country: null,
    profile_country: null,
    device_check_target: null,
    device_check: null,
    join_task_after_check: null
  };

  await notifyProgress(onProgress, {
    phase: "country",
    message: "Определяю страну IP для проверки устройства"
  });
  const expectedCountry = await detectExpectedCountry(env);
  result.expected_country = expectedCountry;
  options.expectedCountryName = expectedCountry.countryName || options.expectedCountryName;
  options.expectedCountryCode = expectedCountry.countryCode || options.expectedCountryCode;

  if (await shouldStop()) {
    return { ...result, status: "cancelled" };
  }

  await notifyProgress(onProgress, {
    phase: "country",
    message: expectedCountry.countryName
      ? `IP-страна для preflight: ${expectedCountry.countryName}`
      : "IP-страну определить не удалось"
  });

  await startBot(env, peer, options);
  await notifyProgress(onProgress, {
    phase: "country",
    message: "Проверяю /join_task перед сменой страны"
  });
  await sendMtprotoMessage(env, peer, JOIN_TASK_COMMAND);
  await sleep(options.settleMs);
  let joinState = await getMtprotoChatState(env, peer, options.stateLimit);
  let deviceTarget = findDeviceCheckTarget(joinState.messages || []);
  result.device_check_target = deviceTarget;
  result.join_task_before_check = {
    confirmation_blocker: confirmationStillBlocked(joinState.messages || []),
    outcome: parseDeviceCheckOutcome(joinState.messages || []),
    tail: activeIncomingMessages(joinState.messages || null, null).slice(-4).map(compactMessage)
  };

  if (!result.join_task_before_check.confirmation_blocker && !deviceTarget) {
    result.profile_country = {
      status: "success",
      selected_country_before: "",
      selected_country_after: "",
      changed: false,
      reason: "/join_task already unblocked; country was not changed."
    };
    result.device_check = {
      enabled: false,
      reason: "/join_task already unblocked; device-check was not requested."
    };
    result.status = "success";
    await notifyProgress(onProgress, {
      phase: "country",
      status: "success",
      message: "/join_task уже доступен, страну не меняю"
    });
    return result;
  }

  if (!deviceTarget) {
    try {
      result.profile_country = await ensureProfileCountry(env, peer, options, expectedCountry, onProgress);
    } catch (error) {
      return {
        ...result,
        status: "blocked",
        profile_country: {
          status: "blocked",
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }

    if (result.profile_country.status !== "success") {
      result.error = result.profile_country.error || "Profile country does not match current IP country.";
      await notifyProgress(onProgress, {
        phase: "country",
        status: "failure",
        message: `Страна не подтверждена: ${result.error}`
      });
      return {
        ...result,
        status: "blocked"
      };
    }
    if (await shouldStop()) {
      return { ...result, status: "cancelled" };
    }

    await notifyProgress(onProgress, {
      phase: "country",
      message: "Ищу check-device ссылку через /join_task"
    });
    await sendMtprotoMessage(env, peer, JOIN_TASK_COMMAND);
    await sleep(options.settleMs);
    joinState = await getMtprotoChatState(env, peer, options.stateLimit);
    deviceTarget = findDeviceCheckTarget(joinState.messages || []);
    result.device_check_target = deviceTarget;
    result.join_task_before_check = {
      confirmation_blocker: confirmationStillBlocked(joinState.messages || []),
      outcome: parseDeviceCheckOutcome(joinState.messages || []),
      tail: activeIncomingMessages(joinState.messages || null, null).slice(-4).map(compactMessage)
    };
  } else {
    result.profile_country = {
      status: "success",
      selected_country_before: "",
      selected_country_after: "",
      changed: false,
      reason: "/join_task requested device-check directly; country was not changed before check."
    };
  }

  if (!deviceTarget) {
    result.status = result.join_task_before_check.confirmation_blocker ? "blocked" : "success";
    result.device_check = {
      enabled: false,
      reason: "Device-check link was not found in Telegram message links/buttons."
    };
    if (result.status === "blocked") {
      result.error = result.device_check.reason;
    }
    return result;
  }

  await notifyProgress(onProgress, {
    phase: "country",
    message: `Открываю check-device ссылку: ${compactText(deviceTarget.text || deviceTarget.url, 100)}`
  });
  result.device_check = await auditDeviceCheckUrl(env, run, deviceTarget);
  await notifyProgress(onProgress, {
    phase: "country",
    message: "Жду результат device-check перед повторным /join_task"
  });
  await sleep(options.deviceCheckSettleMs);

  await sendMtprotoMessage(env, peer, JOIN_TASK_COMMAND);
  await sleep(options.deviceCheckSettleMs);
  const finalState = await getMtprotoChatState(env, peer, options.stateLimit);
  const finalBlocked = confirmationStillBlocked(finalState.messages || []);
  const finalOutcome = parseDeviceCheckOutcome(finalState.messages || []);
  result.join_task_after_check = {
    confirmation_blocker: finalBlocked,
    outcome: finalOutcome,
    tail: activeIncomingMessages(finalState.messages || null, null).slice(-4).map(compactMessage)
  };
  result.status = result.device_check.ok && !finalBlocked ? "success" : "blocked";
  if (result.status === "blocked") {
    result.error = finalOutcome.vpn_detected
      ? `Device-check detected VPN (${[
          finalOutcome.profile_country ? `profile ${finalOutcome.profile_country}` : "",
          finalOutcome.detected_country ? `detected ${finalOutcome.detected_country}` : ""
        ].filter(Boolean).join(", ") || "country unknown"}).`
      : finalBlocked
      ? "/join_task is still blocked after device check."
      : "Device-check page was not opened successfully.";
  }
  await notifyProgress(onProgress, {
    phase: "country",
    status: result.status === "success" ? "success" : "failure",
    message: result.status === "success"
      ? "/join_task разблокирован после device-check"
      : `Device-check не разблокировал задачи: ${result.error}`
  });
  return result;
}

async function clickWebappHandoffButton(env, run, handoff, options, shouldStop = async () => false) {
  if (!options.clickWebappHandoffs) {
    return {
      enabled: false,
      reason: "MTPROTO_DISCOVERY_CLICK_WEBAPP_HANDOFFS is disabled."
    };
  }

  const peer = peerForRun(run);
  const path = Array.isArray(handoff.path) ? handoff.path : [];
  const label = String(handoff.button_text || "").trim();
  if (!label) {
    return {
      enabled: true,
      ok: false,
      error: "WebApp/URL button text is missing."
    };
  }

  const replay = await replayPath(env, peer, path, options, shouldStop);
  if (replay.cancelled) {
    return {
      enabled: true,
      cancelled: true,
      ok: false,
      path,
      error: "Cancelled while replaying handoff path."
    };
  }
  if (replay.error) {
    return {
      enabled: true,
      ok: false,
      path,
      error: replay.error
    };
  }

  const clicked = await clickLatestButton(env, peer, label, options, { allowUrl: true });
  const afterState = await getMtprotoChatState(env, peer, options.stateLimit).catch(() => null);
  const afterMessages = afterState?.messages || [];
  const newMessages = activeMessages(afterMessages, clicked.activeAfterMessageId)
    .filter((message) => !message.outgoing)
    .slice(-8)
    .map(compactMessage);

  return {
    enabled: true,
    ok: true,
    path,
    button: clicked.button,
    click: clicked.click,
    active_after_message_id: clicked.activeAfterMessageId,
    new_messages: newMessages
  };
}

async function auditSingleWebappHandoff(env, run, handoff, index, options, shouldStop = async () => false) {
  if (!env.BROWSER || typeof env.BROWSER.quickAction !== "function") {
    return {
      ...handoff,
      status: "pending_browser_run",
      browser_run: {
        enabled: false,
        reason: "BROWSER binding is not configured."
      }
    };
  }

  let url;
  try {
    url = new URL(String(handoff.url || "")).toString();
  } catch (_) {
    return {
      ...handoff,
      status: "browser_run_failed",
      browser_run: {
        enabled: true,
        ok: false,
        error: "Invalid WebApp/URL handoff URL."
      }
    };
  }

  const browserRun = {
    enabled: true,
    ok: false
  };
  let telegramClick = null;

  try {
    telegramClick = await clickWebappHandoffButton(env, run, handoff, options, shouldStop);
  } catch (error) {
    telegramClick = {
      enabled: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  try {
    const response = await env.BROWSER.quickAction("json", {
      url,
      prompt: [
        "Проанализируй эту Telegram WebApp/URL страницу как QA.",
        "Коротко верни назначение экрана, видимые основные действия, формы, ошибки/блокеры и что проверять дальше.",
        "Если страница требует Telegram-контекст или авторизацию и поэтому не раскрылась, явно укажи это как blocker."
      ].join(" "),
      response_format: webappAuditSchema(),
      gotoOptions: {
        waitUntil: "load",
        timeout: 30000
      }
    });
    const payload = await response
      .clone()
      .json()
      .catch(async () => ({ raw: compactText(await response.text().catch(() => ""), 400) }));
    if (!response.ok || payload?.success === false) {
      throw new Error(`Browser Run json failed: ${response.status} ${JSON.stringify(payload).slice(0, 600)}`);
    }
    browserRun.result = payload?.result || payload;
    browserRun.json_browser_ms_used = response.headers.get("X-Browser-Ms-Used") || "";
  } catch (error) {
    browserRun.json_error = error instanceof Error ? error.message : String(error);
  }

  try {
    browserRun.screenshot = await captureWebappScreenshot(env, run, handoff, url, index);
  } catch (error) {
    browserRun.screenshot_error = error instanceof Error ? error.message : String(error);
  }

  browserRun.ok = Boolean(browserRun.result || browserRun.screenshot?.ok);

  return {
    ...handoff,
    status: browserRun.ok ? "browser_run_complete" : "browser_run_failed",
    telegram_click: telegramClick,
    browser_run: browserRun
  };
}

async function auditWebappHandoffs(env, run, handoffs, shouldStop, onProgress = null) {
  const maxAudits = clampNumber(env.BROWSER_RUN_MAX_WEBAPP_HANDOFFS, 8, 0, 20);
  const options = discoveryOptions(env, run);
  const results = [];
  if (!handoffs.length) {
    await notifyProgress(onProgress, {
      phase: "webapp",
      status: "success",
      message: "WebApp/URL переходов не найдено"
    });
    return { cancelled: false, handoffs: results };
  }
  await notifyProgress(onProgress, {
    phase: "webapp",
    message: `Проверяю WebApp/URL через Browser Run: ${Math.min(handoffs.length, maxAudits)} из ${handoffs.length}`
  });
  for (const [index, handoff] of handoffs.entries()) {
    if (await shouldStop()) {
      await notifyProgress(onProgress, {
        phase: "webapp",
        status: "cancelled",
        message: "Проверка WebApp/URL остановлена"
      });
      return { cancelled: true, handoffs: results };
    }
    if (index >= maxAudits) {
      results.push({
        ...handoff,
        status: "limited_out",
        browser_run: {
          enabled: Boolean(env.BROWSER),
          reason: `Skipped by BROWSER_RUN_MAX_WEBAPP_HANDOFFS=${maxAudits}.`
        }
      });
      await notifyProgress(onProgress, {
        phase: "webapp",
        status: "warning",
        message: `Пропустил WebApp/URL сверх лимита: ${compactText(handoff.button_text || handoff.url, 120)}`
      });
      continue;
    }
    try {
      await notifyProgress(onProgress, {
        phase: "webapp",
        message: `Кликаю Telegram WebApp/URL кнопку и запускаю Browser Run ${index + 1}/${Math.min(handoffs.length, maxAudits)}: ${compactText(handoff.button_text || handoff.url, 120)}`
      });
      const audited = await auditSingleWebappHandoff(env, run, handoff, index, options, shouldStop);
      results.push(audited);
      await notifyProgress(onProgress, {
        phase: "webapp",
        status: audited.status === "browser_run_complete" ? "success" : "warning",
        message: `WebApp/URL ${index + 1}: ${audited.telegram_click?.ok ? "Telegram кнопка нажата, " : ""}${audited.status}`,
        handoff_status: audited.status
      });
    } catch (error) {
      results.push({
        ...handoff,
        status: "browser_run_failed",
        browser_run: {
          enabled: Boolean(env.BROWSER),
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      await notifyProgress(onProgress, {
        phase: "webapp",
        status: "warning",
        message: `Browser Run ${index + 1} завершился ошибкой: ${compactText(error instanceof Error ? error.message : String(error), 180)}`
      });
    }
  }
  return { cancelled: false, handoffs: results };
}

function followedActionsFromHandoffs(handoffs) {
  return (handoffs || []).flatMap((handoff) => {
    const actions = [];
    if (handoff.telegram_click?.enabled) {
      actions.push({
        type: "telegram_button_click",
        status: handoff.telegram_click.ok ? "success" : handoff.telegram_click.cancelled ? "cancelled" : "failure",
        node_id: handoff.node_id,
        path: handoff.path || [],
        button_text: handoff.button_text || "",
        url: handoff.url || "",
        result: handoff.telegram_click.click?.result || null,
        new_messages: handoff.telegram_click.new_messages || [],
        error: handoff.telegram_click.error || ""
      });
    }
    if (handoff.browser_run?.enabled) {
      actions.push({
        type: "browser_webapp_audit",
        status: handoff.browser_run.ok ? "success" : "failure",
        node_id: handoff.node_id,
        path: handoff.path || [],
        button_text: handoff.button_text || "",
        url: handoff.url || "",
        screenshot: handoff.browser_run.screenshot?.artifact_name || "",
        error: handoff.browser_run.json_error || handoff.browser_run.screenshot_error || ""
      });
    }
    return actions;
  });
}

function nodeEvidenceText(node) {
  return [
    ...(Array.isArray(node?.path) ? node.path : []),
    ...(Array.isArray(node?.tail) ? node.tail.map((message) => message.text) : []),
    ...(Array.isArray(node?.buttons) ? node.buttons.map((button) => button.text) : []),
    ...(Array.isArray(node?.skippedButtons) ? node.skippedButtons.map((button) => button.text) : [])
  ].join("\n");
}

function buildCoverageFacts(map, { selector, allDrafts, drafts, webappHandoffs }) {
  const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
  const edges = Array.isArray(map?.edges) ? map.edges : [];
  const limits = map?.limits || {};
  const commandsConfigured = Array.isArray(limits.commands) ? limits.commands : [];
  const commandSeedsExplored = unique(
    nodes
      .map((node) => (Array.isArray(node.path) ? node.path[0] : ""))
      .filter((label) => commandsConfigured.includes(label))
  );
  const reachedDepth = nodes.reduce((max, node) => Math.max(max, Number(node.depth) || 0), 0);
  const countryRe = /land ändern|country|страна|стран|подтвержд.*стран|confirm.*country|afghanistan|albania|algeria|andorra|germany|deutschland|🇦🇫|🇩🇪/i;
  const countryChangeNodes = nodes.filter((node) => countryRe.test(nodeEvidenceText(node))).length;

  return {
    selector: selector || "",
    nodeCount: nodes.length,
    edgeCount: edges.length,
    allDrafts: Array.isArray(allDrafts) ? allDrafts.length : 0,
    selectedDrafts: Array.isArray(drafts) ? drafts.length : 0,
    maxDepth: Number(limits.maxDepth) || 0,
    maxNodes: Number(limits.maxNodes) || 0,
    reachedDepth,
    commandsConfigured,
    commandSeedsExplored,
    commandSeedsExploredCount: commandSeedsExplored.length,
    menuCommandsCovered: commandSeedsExplored.length > 0,
    countryChangeNodes,
    countryChangeCovered: countryChangeNodes > 0,
    webappHandoffs: Array.isArray(webappHandoffs) ? webappHandoffs.length : 0
  };
}

function buildGeneratedSuite(map, run) {
  const allDrafts = map.nodes.map(draftFromNode);
  const rawSelector = String(run.selector || "smart").trim() || "smart";
  const selector = rawSelector.toLowerCase();
  const maxDrafts = clampNumber(run.max_drafts, 8, 1, 50);
  const selectedIds = selectedDraftIds(rawSelector);
  const selectedDrafts = selectedIds.length
    ? allDrafts.filter((draft) => selectedIds.some((selectedId) => draftMatchesSelectedId(draft, selectedId)))
    : [];
  const drafts = selectedIds.length
    ? selectedDrafts
    : allDrafts.slice(0, selector === "dev" ? Math.min(20, maxDrafts) : maxDrafts);
  const missingSelectedIds = selectedIds.filter(
    (selectedId) => !selectedDrafts.some((draft) => draftMatchesSelectedId(draft, selectedId))
  );
  const webappHandoffs = collectWebappHandoffs(map);
  const failed = drafts.filter((draft) => draft.status === "failed").length;
  const coverageFacts = buildCoverageFacts(map, { selector: rawSelector, allDrafts, drafts, webappHandoffs });

  return {
    runner: "cloudflare-mtproto",
    report_file: "cloudflare-mtproto-report.json",
    source_artifacts: [
      "bot-map.json",
      "bot-map.enriched.json",
      "generated-test-plan.json",
      "generated-scenarios.json",
      ...(webappHandoffs.length ? ["webapp-handoffs.json"] : []),
      "cloudflare-mtproto-report.json"
    ],
    summary: {
      total: drafts.length,
      passed: drafts.length - failed,
      failed,
      warning: 0,
      flaky: 0,
      notRun: 0
    },
    coverage: {
      discovered: map.nodes.length,
      selected: drafts.length,
      manual: map.nodes.reduce((count, node) => count + (node.skippedButtons || []).length, 0),
      runnableTestAccount: drafts.length,
      limitedOut: selectedIds.length ? 0 : Math.max(0, allDrafts.length - drafts.length),
      webappHandoffs: webappHandoffs.length,
      maxDepth: coverageFacts.maxDepth,
      reachedDepth: coverageFacts.reachedDepth,
      commandsExplored: coverageFacts.commandSeedsExploredCount,
      countryChangeNodes: coverageFacts.countryChangeNodes
    },
    coverage_facts: coverageFacts,
    selector: rawSelector,
    selected_ids: selectedIds,
    missing_selected_ids: missingSelectedIds,
    webapp_handoffs: webappHandoffs,
    followed_actions: [],
    draft_count: drafts.length,
    drafts,
    bot_map: map
  };
}

function gapContradictedByFacts(gap, facts) {
  const text = normalizeText(gap);
  if (!text) {
    return true;
  }
  if ((/смен|стран|country|land/.test(text)) && facts.countryChangeCovered) {
    return true;
  }
  if ((/стран|country|land|device|устройств|vpn|ip|geo|подтвержд|confirm/.test(text)) &&
    facts.countryDevicePreflightStatus === "success") {
    return true;
  }
  if ((/команд|меню|command|menu/.test(text)) && facts.menuCommandsCovered) {
    return true;
  }
  if ((/глубин|depth|уров/.test(text)) && (Number(facts.maxDepth) > 1 || Number(facts.reachedDepth) > 1)) {
    return true;
  }
  return false;
}

function normalizeAiReviewResult(review, map, suite) {
  const fallbackFacts = buildCoverageFacts(map, {
    selector: suite.selector,
    allDrafts: suite.drafts || [],
    drafts: suite.drafts || [],
    webappHandoffs: suite.webapp_handoffs || []
  });
  const facts = suite.coverage_facts || fallbackFacts;
  const coverageGaps = Array.isArray(review.coverage_gaps) ? review.coverage_gaps : [];
  const cleanGaps = unique(coverageGaps.filter((gap) => !gapContradictedByFacts(gap, facts)));
  const nextRun = review.next_run && typeof review.next_run === "object" ? review.next_run : {};
  return {
    ...review,
    coverage_gaps: cleanGaps,
    next_run: {
      ...nextRun,
      recommended_depth: Math.max(
        Number(nextRun.recommended_depth) || 0,
        Math.min(8, Math.max(Number(facts.maxDepth) || 0, Number(facts.reachedDepth) || 0))
      ),
      recommended_max_nodes: Math.max(Number(nextRun.recommended_max_nodes) || 0, Number(facts.maxNodes) || 0)
    },
    coverage_facts: facts
  };
}

function fallbackAiReview(map, suite, aiMeta = {}) {
  const branchReviews = (suite.drafts || []).map((draft) => {
    const node = map.nodes.find((item) => item.id === draft.node_id);
    const analysis = node ? classifyNode(node) : classifyNode({ path: draft.path || [], tail: [], buttons: [], skippedButtons: [] });
    const followedActions = (suite.followed_actions || []).filter((action) => action.node_id === draft.node_id);
    return {
      draft_id: draft.id,
      node_id: draft.node_id,
      path: draft.path || [],
      intended_behavior: analysis.purpose,
      observed_behavior: node?.error
        ? `Ошибка воспроизведения: ${node.error}`
        : followedActions.length
          ? `Ветка достигнута через MTProto; выполнено действий по просьбе бота: ${followedActions.length}.`
          : `Ветка достигнута через MTProto, сообщений: ${node?.messageWindow?.activeCount ?? 0}, кнопок: ${(node?.buttons || []).length}`,
      defects: node?.error ? [node.error] : [],
      severity: analysis.severity,
      missing_evidence: (node?.skippedButtons || []).some((button) => button.skipReason === "url_or_webapp_terminal") &&
        !followedActions.some((action) => action.type === "browser_webapp_audit" && action.status === "success")
        ? ["Нужен Browser Run/Playwright для WebApp/URL."]
        : []
    };
  });

  const defects = branchReviews
    .filter((review) => review.defects.length > 0)
    .map((review) => ({
      title: `Ошибка ветки ${review.draft_id}`,
      evidence: review.defects,
      severity: review.severity
    }));

  return normalizeAiReviewResult({
    overview: {
      summary: `Cloudflare MTProto runner прошел ${map.nodes.length} узл. и ${map.edges.length} переходов для @${map.bot}.`,
      business_purpose: "Определяется по Telegram transcript и кнопкам.",
      main_flows: unique(branchReviews.map((review) => review.intended_behavior)).slice(0, 8),
      risks: unique(branchReviews.flatMap((review) => review.missing_evidence || [])).slice(0, 8),
      next_steps: [
        "Для WebApp/URL веток подключить Cloudflare Browser Run.",
        "Для опасных кнопок использовать только dev/test аккаунт.",
        "Увеличивать глубину постепенно, чтобы не мутировать состояние случайно."
      ]
    },
    flow_map: map.nodes.map((node) => ({
      name: node.path.length ? node.path.join(" > ") : "/start",
      purpose: classifyNode(node).purpose,
      criticality: classifyNode(node).severity,
      branches: [...(node.buttons || []).map((button) => button.text), ...(node.skippedButtons || []).map((button) => `${button.text} (${button.skipReason})`)]
    })),
    branch_reviews: branchReviews,
    defects,
    coverage_gaps: unique(branchReviews.flatMap((review) => review.missing_evidence || [])),
    next_run: {
      recommended_depth: Math.min(4, Math.max(2, Number(map.limits?.maxDepth || 1) + 1)),
      recommended_max_nodes: Math.min(40, Math.max(12, Number(map.limits?.maxNodes || 8) + 4)),
      focus_branches: branchReviews.filter((review) => review.severity === "high").slice(0, 6).map((review) => review.draft_id),
      engine: "cloudflare-browser-run"
    },
    ai: {
      enabled: false,
      provider: aiMeta.provider || "fallback",
      model: aiMeta.model || "heuristic",
      error: aiMeta.error || ""
    }
  }, map, suite);
}

function countryPreflightFailureReason(preflight) {
  if (!preflight) {
    return "Country/device preflight did not run.";
  }
  const profile = preflight.profile_country || {};
  const check = preflight.device_check || {};
  if (preflight.error) {
    return preflight.error;
  }
  if (profile.error) {
    return profile.error;
  }
  if (check.json_error) {
    return check.json_error;
  }
  if (check.screenshot_error) {
    return check.screenshot_error;
  }
  const outcome = preflight.join_task_after_check?.outcome || preflight.join_task_before_check?.outcome || {};
  if (outcome.vpn_detected) {
    return `Device-check detected VPN (${[
      outcome.profile_country ? `profile ${outcome.profile_country}` : "",
      outcome.detected_country ? `detected ${outcome.detected_country}` : ""
    ].filter(Boolean).join(", ") || "country unknown"}).`;
  }
  if (preflight.join_task_after_check?.confirmation_blocker) {
    return "/join_task is still blocked after device check.";
  }
  if (!preflight.device_check_target && preflight.join_task_before_check?.confirmation_blocker) {
    return "Device-check link was not found while /join_task is blocked.";
  }
  return "Country/device preflight did not confirm access to tasks.";
}

function buildCountryPreflightBlockedResult(run, preflight, startedAt) {
  const reason = countryPreflightFailureReason(preflight);
  const bot = normalizeBotUsername(run.bot_username);
  const tail = [
    ...(preflight?.join_task_before_check?.tail || []),
    ...(preflight?.join_task_after_check?.tail || [])
  ].slice(-8);
  const map = {
    schemaVersion: 1,
    runner: "cloudflare-mtproto-preflight",
    generatedAtIso: nowIso(),
    bot,
    startPayload: String(run.start_payload || "").trim(),
    limits: {
      maxDepth: 0,
      maxNodes: 1,
      preflight: "country_device"
    },
    nodes: [
      {
        id: "country-device-preflight",
        depth: 0,
        path: ["country/device preflight"],
        observedAtIso: nowIso(),
        messageWindow: {
          limit: 0,
          count: tail.length,
          firstId: tail[0]?.id ?? null,
          lastId: tail.at(-1)?.id ?? null,
          activeAfterMessageId: null,
          activeCount: tail.length
        },
        tail,
        buttons: [],
        skippedButtons: [],
        error: reason
      }
    ],
    edges: []
  };
  const screenshotArtifact = preflight?.device_check?.screenshot?.artifact_name || "";
  const suite = {
    runner: "cloudflare-mtproto",
    report_file: "cloudflare-mtproto-report.json",
    source_artifacts: unique([
      "country-device-preflight.json",
      ...(screenshotArtifact ? [screenshotArtifact] : []),
      "cloudflare-mtproto-report.json"
    ]),
    summary: {
      total: 1,
      passed: 0,
      failed: 1,
      warning: 0,
      flaky: 0,
      notRun: 0
    },
    coverage: {
      discovered: 1,
      selected: 1,
      manual: 0,
      runnableTestAccount: 0,
      limitedOut: 0,
      webappHandoffs: 0,
      maxDepth: 0,
      reachedDepth: 0,
      commandsExplored: 0,
      countryChangeNodes: preflight?.profile_country?.changed ? 1 : 0,
      countryDevicePreflight: 0,
      deviceCheckLinkFound: preflight?.device_check_target ? 1 : 0,
      deviceCheckBrowserRuns: preflight?.device_check?.ok ? 1 : 0
    },
    coverage_facts: {
      maxDepth: 0,
      reachedDepth: 0,
      maxNodes: 1,
      commandSeedsExploredCount: 0,
      commandSeedsExplored: [],
      menuCommandsCovered: false,
      countryChangeNodes: preflight?.profile_country?.changed ? 1 : 0,
      countryChangeCovered: Boolean(preflight?.profile_country?.changed),
      webappHandoffs: 0,
      expectedCountry: preflight?.expected_country?.countryName || "",
      expectedCountryCode: preflight?.expected_country?.countryCode || "",
      selectedCountryBefore: preflight?.profile_country?.selected_country_before || "",
      selectedCountryAfter: preflight?.profile_country?.selected_country_after || "",
      countryDevicePreflightStatus: preflight?.status || "blocked",
      deviceCheckLinkFound: Boolean(preflight?.device_check_target),
      deviceCheckBrowserRun: Boolean(preflight?.device_check?.ok),
      deviceCheckVpnDetected: Boolean(
        preflight?.join_task_after_check?.outcome?.vpn_detected ||
        preflight?.join_task_before_check?.outcome?.vpn_detected
      ),
      deviceCheckCountryMatch: Boolean(
        preflight?.join_task_after_check?.outcome?.country_match ||
        preflight?.join_task_before_check?.outcome?.country_match
      ),
      joinTaskUnblocked: preflight?.join_task_after_check
        ? !preflight.join_task_after_check.confirmation_blocker
        : false
    },
    selector: String(run.selector || "smart").trim() || "smart",
    selected_ids: [],
    missing_selected_ids: [],
    webapp_handoffs: [],
    followed_actions: [],
    draft_count: 1,
    drafts: [
      {
        id: "country-device-preflight",
        status: "failed",
        scenario: "country/device preflight",
        source_type: "cloudflare-mtproto",
        ai_severity: "high",
        first_error: reason,
        step_count: 1,
        passed_steps: 0,
        warning_steps: 0,
        failed_steps: 1,
        attempts: 1,
        node_id: "country-device-preflight",
        path: ["country/device preflight"],
        safety: "cloudflare-mtproto",
        reason: "Перед выдачей задачи бот требует совпадение страны профиля и IP проверки устройства.",
        scenario_definition: {
          name: "country-device-preflight",
          steps: [
            {
              name: "confirm profile country by current IP",
              expectTextAny: [reason]
            }
          ]
        }
      }
    ],
    bot_map: map,
    country_device_preflight: preflight
  };
  const review = fallbackAiReview(map, suite, { error: reason });
  return {
    status: "failure",
    error: reason,
    completed_at: nowIso(),
    duration_sec: Math.round((Date.now() - startedAt) / 1000),
    bot_map: map,
    generated_suite: suite,
    generated_suite_ai_review: review,
    country_device_preflight: preflight,
    screenshot_count: screenshotArtifact ? 1 : 0,
    cloudflare_run: {
      runner: "cloudflare-mtproto",
      node_count: 1,
      edge_count: 0,
      webapp_screenshot_count: screenshotArtifact ? 1 : 0,
      device_preflight_status: preflight?.status || "blocked",
      blocked_by: "country_device_preflight",
      ai_enabled: false
    }
  };
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch (_) {
        return null;
      }
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

async function aiReview(env, map, suite) {
  const apiKey = String(env.AI_API_KEY || "").trim();
  const baseUrl = String(env.AI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  const model = String(env.AI_MODEL || "gpt-4.1-mini").trim();
  if (!apiKey) {
    return fallbackAiReview(map, suite, { error: "AI_API_KEY is not configured in Cloudflare Worker.", model });
  }

  const body = {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: clampNumber(env.AI_MAX_TOKENS, 8000, 800, 16000),
    messages: [
      {
        role: "system",
        content:
          [
            "You are a senior QA analyst for Telegram bots.",
            "Return only valid compact json. Do not include markdown, prose, code fences, or comments.",
            "Keep each string under 180 characters, arrays under 5 items, and avoid long paragraphs.",
            "Use webapp_handoffs as evidence for URL/WebApp branches. If Browser Run could not inspect a handoff, mark it as missing evidence.",
            "Use followed_actions as evidence of what the QA runner actually clicked/opened. Distinguish Telegram button click from Browser-only WebApp inspection.",
            "Use country_device_preflight as evidence for selected country, IP country, device-check link, and whether /join_task became unblocked.",
            "Use coverage_facts as truth. Do not list gaps contradicted by coverage_facts.",
            "Do not say country change was untested when coverage_facts.countryChangeCovered is true.",
            "Do not say country/device verification is untested when coverage_facts.countryDevicePreflightStatus is success.",
            "Do not say menu commands were unexplored when coverage_facts.menuCommandsCovered is true.",
            "Do not say depth is limited to one level when coverage_facts.maxDepth or reachedDepth is greater than 1.",
            "Use this json shape exactly:",
            '{"overview":{"summary":"строка","business_purpose":"строка","main_flows":["строка"],"risks":["строка"],"next_steps":["строка"]},"flow_map":[{"name":"строка","purpose":"строка","criticality":"low","branches":["строка"]}],"branch_reviews":[{"draft_id":"строка","node_id":"строка","path":["строка"],"intended_behavior":"строка","observed_behavior":"строка","defects":["строка"],"severity":"low","missing_evidence":["строка"]}],"defects":[{"title":"строка","evidence":["строка"],"severity":"low"}],"coverage_gaps":["строка"],"next_run":{"recommended_depth":2,"recommended_max_nodes":12,"focus_branches":["строка"],"engine":"cloudflare-browser-run"}}'
          ].join(" ")
      },
      {
        role: "user",
        content: `Return valid json for this Telegram bot audit payload:\n${JSON.stringify(
          {
            outputSchema: {
              overview: {
                summary: "short Russian summary",
                business_purpose: "inferred purpose",
                main_flows: ["flow"],
                risks: ["risk"],
                next_steps: ["step"]
              },
              flow_map: [{ name: "flow", purpose: "purpose", criticality: "low|medium|high|critical", branches: ["branch"] }],
              branch_reviews: [
                {
                  draft_id: "id",
                  node_id: "node",
                  path: ["action"],
                  intended_behavior: "what should happen",
                  observed_behavior: "what was observed",
                  defects: ["defect"],
                  severity: "low|medium|high|critical",
                  missing_evidence: ["gap"]
                }
              ],
              defects: [{ title: "defect", evidence: ["evidence"], severity: "low|medium|high|critical" }],
              coverage_gaps: ["gap"],
              next_run: {
                recommended_depth: 2,
                recommended_max_nodes: 12,
                focus_branches: ["draft id"],
                engine: "cloudflare-browser-run|github-full|manual"
              }
            },
            botMap: map,
            generatedSuite: {
              summary: suite.summary,
              coverage: suite.coverage,
              coverage_facts: suite.coverage_facts,
              country_device_preflight: suite.country_device_preflight,
              webapp_handoffs: suite.webapp_handoffs,
              followed_actions: suite.followed_actions,
              missing_selected_ids: suite.missing_selected_ids,
              drafts: (suite.drafts || []).map((draft) => ({
                id: draft.id,
                status: draft.status,
                scenario: draft.scenario,
                path: draft.path,
                first_error: draft.first_error
              }))
            }
          }
        )}`
      }
    ]
  };
  if (baseUrl.includes("deepseek.com")) {
    body.thinking = { type: "disabled" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), clampNumber(env.AI_REQUEST_TIMEOUT_MS, 60000, 5000, 120000));
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    }).finally(() => clearTimeout(timeout));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`AI failed: ${response.status} ${JSON.stringify(payload).slice(0, 800)}`);
    }
    const rawContent = payload?.choices?.[0]?.message?.content || "";
    const content = Array.isArray(rawContent)
      ? rawContent.map((part) => part?.text || part?.content || "").join("")
      : String(rawContent || "");
    const parsed = extractJsonObject(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`AI returned non-JSON review: ${compactText(content || "[empty]", 300)}`);
    }
    return normalizeAiReviewResult({
      ...fallbackAiReview(map, suite, { model }),
      ...parsed,
      ai: {
        enabled: true,
        provider: baseUrl,
        model
      }
    }, map, suite);
  } catch (error) {
    return fallbackAiReview(map, suite, {
      provider: baseUrl,
      model,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function isCloudflareNativeSuite(suite) {
  return ["discover_mtproto", "generated_scenarios"].includes(String(suite || "").trim());
}

export async function executeCloudflareNativeRun(env, run, options = {}) {
  const startedAt = Date.now();
  const shouldStop = typeof options.shouldStop === "function" ? options.shouldStop : async () => false;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  await notifyProgress(onProgress, {
    phase: "start",
    message: "Cloudflare runner готовит прогон"
  });
  let countryDevicePreflight = null;
  if (shouldRunCountryDevicePreflight(env, run)) {
    countryDevicePreflight = await runCountryDevicePreflight(env, run, shouldStop, onProgress);
    if (countryDevicePreflight.status === "cancelled") {
      return {
        status: "cancelled",
        completed_at: nowIso(),
        duration_sec: Math.round((Date.now() - startedAt) / 1000),
        country_device_preflight: countryDevicePreflight,
        cloudflare_run: {
          runner: "cloudflare-mtproto",
          cancelled: true
        }
      };
    }
    await notifyProgress(onProgress, {
      phase: "country",
      status: countryDevicePreflight.status === "success" ? "success" : "warning",
      message: countryDevicePreflight.status === "success"
        ? "Country/device preflight пройден"
        : "Country/device preflight не подтвердил доступ к задачам"
    });
    if (countryDevicePreflight.status === "blocked") {
      const blockedResult = buildCountryPreflightBlockedResult(run, countryDevicePreflight, startedAt);
      await notifyProgress(onProgress, {
        phase: "country",
        status: "failure",
        message: `Прогон остановлен: ${blockedResult.error}`
      });
      return blockedResult;
    }
  }
  const discovery = await buildBotMap(env, run, shouldStop, onProgress);
  if (discovery.cancelled) {
    return {
      status: "cancelled",
      completed_at: nowIso(),
      duration_sec: Math.round((Date.now() - startedAt) / 1000),
      country_device_preflight: countryDevicePreflight,
      cloudflare_run: {
        runner: "cloudflare-mtproto",
        cancelled: true
      }
    };
  }

  await notifyProgress(onProgress, {
    phase: "suite",
    message: "Собираю ветки и ожидаемое поведение"
  });
  const generatedSuite = buildGeneratedSuite(discovery.map, run);
  generatedSuite.country_device_preflight = countryDevicePreflight;
  if (countryDevicePreflight) {
    generatedSuite.source_artifacts = unique([
      ...(generatedSuite.source_artifacts || []),
      "country-device-preflight.json",
      ...(countryDevicePreflight.device_check?.screenshot?.artifact_name
        ? [countryDevicePreflight.device_check.screenshot.artifact_name]
        : [])
    ]);
    generatedSuite.coverage = {
      ...generatedSuite.coverage,
      countryDevicePreflight: countryDevicePreflight.status === "success" ? 1 : 0,
      deviceCheckLinkFound: countryDevicePreflight.device_check_target ? 1 : 0,
      deviceCheckBrowserRuns: countryDevicePreflight.device_check?.ok ? 1 : 0
    };
    generatedSuite.coverage_facts = {
      ...generatedSuite.coverage_facts,
      expectedCountry: countryDevicePreflight.expected_country?.countryName || "",
      expectedCountryCode: countryDevicePreflight.expected_country?.countryCode || "",
      selectedCountryBefore: countryDevicePreflight.profile_country?.selected_country_before || "",
      selectedCountryAfter: countryDevicePreflight.profile_country?.selected_country_after || "",
      countryDevicePreflightStatus: countryDevicePreflight.status,
      deviceCheckLinkFound: Boolean(countryDevicePreflight.device_check_target),
      deviceCheckBrowserRun: Boolean(countryDevicePreflight.device_check?.ok),
      deviceCheckVpnDetected: Boolean(
        countryDevicePreflight.join_task_after_check?.outcome?.vpn_detected ||
        countryDevicePreflight.join_task_before_check?.outcome?.vpn_detected
      ),
      deviceCheckCountryMatch: Boolean(
        countryDevicePreflight.join_task_after_check?.outcome?.country_match ||
        countryDevicePreflight.join_task_before_check?.outcome?.country_match
      ),
      joinTaskUnblocked: countryDevicePreflight.join_task_after_check
        ? !countryDevicePreflight.join_task_after_check.confirmation_blocker
        : null
    };
  }
  await notifyProgress(onProgress, {
    phase: "suite",
    status: "success",
    message: `Ветки готовы: ${generatedSuite.draft_count} выбрано из ${discovery.map.nodes.length} узл.`
  });
  const auditedWebapps = await auditWebappHandoffs(env, run, generatedSuite.webapp_handoffs || [], shouldStop, onProgress);
  if (auditedWebapps.cancelled) {
    return {
      status: "cancelled",
      completed_at: nowIso(),
      duration_sec: Math.round((Date.now() - startedAt) / 1000),
      country_device_preflight: countryDevicePreflight,
      cloudflare_run: {
        runner: "cloudflare-mtproto",
        cancelled: true
      }
    };
  }
  generatedSuite.webapp_handoffs = auditedWebapps.handoffs;
  generatedSuite.followed_actions = followedActionsFromHandoffs(auditedWebapps.handoffs);
  const webappScreenshots = auditedWebapps.handoffs
    .map((handoff) => handoff.browser_run?.screenshot?.artifact_name)
    .filter(Boolean);
  generatedSuite.source_artifacts = unique([
    ...(generatedSuite.source_artifacts || []),
    ...(generatedSuite.followed_actions.length ? ["followed-actions.json"] : []),
    ...webappScreenshots
  ]);
  generatedSuite.coverage = {
    ...generatedSuite.coverage,
    webappHandoffsAudited: auditedWebapps.handoffs.filter((handoff) => handoff.status === "browser_run_complete").length,
    webappScreenshots: webappScreenshots.length,
    followedActions: generatedSuite.followed_actions.length,
    telegramClicks: generatedSuite.followed_actions.filter((action) => action.type === "telegram_button_click").length
  };
  generatedSuite.coverage_facts = {
    ...generatedSuite.coverage_facts,
    webappHandoffsAudited: generatedSuite.coverage.webappHandoffsAudited,
    webappScreenshots: generatedSuite.coverage.webappScreenshots,
    followedActions: generatedSuite.coverage.followedActions,
    telegramClicks: generatedSuite.coverage.telegramClicks
  };
  await notifyProgress(onProgress, {
    phase: "ai",
    message: "Отправляю карту, ветки и WebApp evidence в AI-разбор"
  });
  const generatedSuiteAiReview = await aiReview(env, discovery.map, generatedSuite);
  await notifyProgress(onProgress, {
    phase: "ai",
    status: generatedSuiteAiReview?.ai?.enabled ? "success" : "warning",
    message: generatedSuiteAiReview?.ai?.enabled
      ? `AI-разбор готов: ${generatedSuiteAiReview.ai.model || "model"}`
      : "AI-разбор недоступен, использован локальный fallback"
  });
  await notifyProgress(onProgress, {
    phase: "finish",
    status: generatedSuite.summary.failed > 0 ? "failure" : "success",
    message: `Прогон завершён: ${generatedSuite.summary.failed > 0 ? "есть ошибки" : "без ошибок"}, скриншотов ${webappScreenshots.length}`
  });
  return {
    status: generatedSuite.summary.failed > 0 ? "failure" : "success",
    completed_at: nowIso(),
    duration_sec: Math.round((Date.now() - startedAt) / 1000),
    bot_map: discovery.map,
    generated_suite: generatedSuite,
    generated_suite_ai_review: generatedSuiteAiReview,
    country_device_preflight: countryDevicePreflight,
    screenshot_count: webappScreenshots.length,
    cloudflare_run: {
      runner: "cloudflare-mtproto",
      node_count: discovery.map.nodes.length,
      edge_count: discovery.map.edges.length,
      webapp_screenshot_count: webappScreenshots.length,
      device_preflight_status: countryDevicePreflight?.status || "",
      ai_enabled: Boolean(generatedSuiteAiReview?.ai?.enabled),
      ai_model: generatedSuiteAiReview?.ai?.model || ""
    }
  };
}
