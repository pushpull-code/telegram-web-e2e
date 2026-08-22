const DEFAULT_DISCOVERY_COMMANDS = "/join_task,/my_tasks,/settings,/view_earnings";
const DEFAULT_DENY_BUTTON_RE =
  "удал|delete|withdraw|вывод|cancel|отмен|заверш|finish|confirm|подтверд|оплат|pay|buy|purchase";

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    text: String(message?.text || "")
  };
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
  const result = [];
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

async function startBot(env, peer, options) {
  const before = await getMtprotoChatState(env, peer, options.stateLimit).catch(() => null);
  const activeAfterMessageId = before ? maxMessageId(before.messages || []) : null;
  const payload = String(options.startPayload || "").trim();
  await sendMtprotoMessage(env, peer, payload ? `/start ${payload}` : "/start");
  await sleep(options.settleMs);
  return activeAfterMessageId;
}

async function clickPathButton(env, peer, label, options) {
  const state = await getMtprotoChatState(env, peer, options.stateLimit);
  const currentMessages = messagesAfterLastOutgoing(state.messages || []);
  const found = findLatestMtprotoButton(currentMessages.length > 0 ? currentMessages : state.messages || [], [label]);
  if (!found) {
    throw new Error(`Button not found in latest chat state: ${label}`);
  }
  if (found.button?.url) {
    throw new Error(`URL/WebApp button is terminal in MTProto discovery: ${label}`);
  }

  await clickMtprotoButton(env, peer, found.message.id, {
    rowIndex: found.button.rowIndex,
    columnIndex: found.button.columnIndex,
    ...(found.button.dataBase64 ? { buttonDataBase64: found.button.dataBase64 } : {}),
    buttonText: found.button.text,
    allowTimeoutAsSuccess: true,
    clickTimeoutMs: options.clickTimeoutMs
  });
  await sleep(options.settleMs);
  return Number(found.message.id) - 1;
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
    maxDepth: clampNumber(devMode ? env.MTPROTO_DISCOVERY_DEV_MAX_DEPTH || 2 : env.MTPROTO_DISCOVERY_MAX_DEPTH, 1, 0, 4),
    maxNodes: clampNumber(devMode ? env.MTPROTO_DISCOVERY_DEV_MAX_NODES || 20 : env.MTPROTO_DISCOVERY_MAX_NODES, 8, 1, 40),
    maxButtonsPerNode: clampNumber(env.MTPROTO_DISCOVERY_MAX_BUTTONS_PER_NODE, 8, 1, 12),
    stateLimit: clampNumber(env.MTPROTO_DISCOVERY_STATE_LIMIT, 50, 10, 120),
    settleMs: clampNumber(env.MTPROTO_DISCOVERY_SETTLE_MS, 1400, 250, 7000),
    clickTimeoutMs: clampNumber(env.MTPROTO_DISCOVERY_CLICK_TIMEOUT_MS, 3500, 500, 20000),
    allowUnsafeButtons:
      devMode || /^(1|true|yes)$/i.test(String(env.MTPROTO_DISCOVERY_ALLOW_UNSAFE_BUTTONS || "")),
    denyButtonRe: new RegExp(String(env.MTPROTO_DISCOVERY_DENY_BUTTON_RE || DEFAULT_DENY_BUTTON_RE), "i"),
    commands: String(env.MTPROTO_DISCOVERY_COMMANDS || DEFAULT_DISCOVERY_COMMANDS)
      .split(/[,\n]+/g)
      .map((command) => command.trim())
      .filter(Boolean)
  };
}

async function buildBotMap(env, run, shouldStop = async () => false) {
  const peer = peerForRun(run);
  const options = discoveryOptions(env, run);
  const nodes = [];
  const edges = [];
  const queue = [[], ...options.commands.map((command) => [command])];
  const visited = new Set();

  while (queue.length > 0 && nodes.length < options.maxNodes) {
    if (await shouldStop()) {
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
      return { cancelled: true, map: null };
    }

    const state = await getMtprotoChatState(env, peer, options.stateLimit);
    const node = buildNode(currentId, currentPath, state.messages || [], replay.activeAfterMessageId, replay.error, options);
    nodes.push(node);

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
        stateLimit: options.stateLimit
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

function buildGeneratedSuite(map, run) {
  const allDrafts = map.nodes.map(draftFromNode);
  const selector = String(run.selector || "smart").trim().toLowerCase();
  const maxDrafts = clampNumber(run.max_drafts, 8, 1, 50);
  const drafts = selector && selector !== "all-safe" && selector !== "runnable" && selector !== "dev"
    ? allDrafts.slice(0, maxDrafts)
    : allDrafts.slice(0, selector === "dev" ? Math.min(20, maxDrafts) : maxDrafts);
  const failed = drafts.filter((draft) => draft.status === "failed").length;

  return {
    runner: "cloudflare-mtproto",
    report_file: "cloudflare-mtproto-report.json",
    source_artifacts: [
      "bot-map.json",
      "bot-map.enriched.json",
      "generated-test-plan.json",
      "generated-scenarios.json",
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
      limitedOut: Math.max(0, allDrafts.length - drafts.length)
    },
    draft_count: drafts.length,
    drafts,
    bot_map: map
  };
}

function fallbackAiReview(map, suite, aiMeta = {}) {
  const branchReviews = (suite.drafts || []).map((draft) => {
    const node = map.nodes.find((item) => item.id === draft.node_id);
    const analysis = node ? classifyNode(node) : classifyNode({ path: draft.path || [], tail: [], buttons: [], skippedButtons: [] });
    return {
      draft_id: draft.id,
      node_id: draft.node_id,
      path: draft.path || [],
      intended_behavior: analysis.purpose,
      observed_behavior: node?.error
        ? `Ошибка воспроизведения: ${node.error}`
        : `Ветка достигнута через MTProto, сообщений: ${node?.messageWindow?.activeCount ?? 0}, кнопок: ${(node?.buttons || []).length}`,
      defects: node?.error ? [node.error] : [],
      severity: analysis.severity,
      missing_evidence: (node?.skippedButtons || []).some((button) => button.skipReason === "url_or_webapp_terminal")
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

  return {
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
    temperature: 0.2,
    max_tokens: clampNumber(env.AI_MAX_TOKENS, 4000, 800, 8000),
    messages: [
      {
        role: "system",
        content:
          "You are a senior QA analyst for Telegram bots. Return only compact valid JSON. Explain the whole bot, every branch purpose, expected behavior, defects, risks, and next run."
      },
      {
        role: "user",
        content: JSON.stringify({
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
            drafts: (suite.drafts || []).map((draft) => ({
              id: draft.id,
              status: draft.status,
              scenario: draft.scenario,
              path: draft.path,
              first_error: draft.first_error
            }))
          }
        })
      }
    ]
  };

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
    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonObject(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned non-JSON review.");
    }
    return {
      ...fallbackAiReview(map, suite, { model }),
      ...parsed,
      ai: {
        enabled: true,
        provider: baseUrl,
        model
      }
    };
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
  const discovery = await buildBotMap(env, run, shouldStop);
  if (discovery.cancelled) {
    return {
      status: "cancelled",
      completed_at: nowIso(),
      duration_sec: Math.round((Date.now() - startedAt) / 1000),
      cloudflare_run: {
        runner: "cloudflare-mtproto",
        cancelled: true
      }
    };
  }

  const generatedSuite = buildGeneratedSuite(discovery.map, run);
  const generatedSuiteAiReview = await aiReview(env, discovery.map, generatedSuite);
  return {
    status: generatedSuite.summary.failed > 0 ? "failure" : "success",
    completed_at: nowIso(),
    duration_sec: Math.round((Date.now() - startedAt) / 1000),
    generated_suite: generatedSuite,
    generated_suite_ai_review: generatedSuiteAiReview,
    screenshot_count: 0,
    cloudflare_run: {
      runner: "cloudflare-mtproto",
      node_count: discovery.map.nodes.length,
      edge_count: discovery.map.edges.length,
      ai_enabled: Boolean(generatedSuiteAiReview?.ai?.enabled),
      ai_model: generatedSuiteAiReview?.ai?.model || ""
    }
  };
}
