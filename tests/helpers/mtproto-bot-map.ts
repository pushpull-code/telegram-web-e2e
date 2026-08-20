import type { MtprotoButton, MtprotoMessage } from "./mtproto-service";

export type BotMapMessage = {
  id: number;
  dateIso: string | null;
  outgoing: boolean;
  text: string;
};

export type BotMapButton = MtprotoButton & {
  messageId: number;
  queued: boolean;
  skipReason?: string;
};

export type BotMapEdge = {
  from: string;
  to: string;
  buttonText: string;
  depth: number;
};

export type BotMapNode = {
  id: string;
  depth: number;
  path: string[];
  observedAtIso: string;
  messageWindow: {
    limit: number;
    count: number;
    firstId: number | null;
    lastId: number | null;
  };
  tail: BotMapMessage[];
  buttons: BotMapButton[];
  skippedButtons: BotMapButton[];
  error?: string;
};

export type BotMap = {
  schemaVersion: 1;
  runner: "mtproto-discovery";
  generatedAtIso: string;
  bot: string;
  startPayload: string;
  limits: {
    maxDepth: number;
    maxNodes: number;
    maxButtonsPerNode: number;
    stateLimit: number;
  };
  nodes: BotMapNode[];
  edges: BotMapEdge[];
};

export type NodeAnalysis = {
  stateType: string;
  purpose: string;
  expectedBehavior: string[];
  risks: string[];
  suggestedTests: string[];
  nextStepPriority: "low" | "medium" | "high";
};

export type BranchAnalysis = {
  nodeId: string;
  path: string[];
  purpose: string;
  expectedOutcome: string;
  criticality: "low" | "medium" | "high";
  suggestedChecks: string[];
};

export type ProductSummary = {
  overview: string;
  mainFlows: string[];
  criticalRisks: string[];
  recommendedNextSteps: string[];
};

export type HeuristicEnrichment = {
  mode: "heuristic";
  generatedAtIso: string;
  nodeAnalysis: Record<string, NodeAnalysis>;
  branchAnalysis: BranchAnalysis[];
  productSummary: ProductSummary;
};

export type AiReview = {
  enabled: boolean;
  provider: string;
  model: string;
  parsed?: unknown;
  rawText?: string;
  error?: string;
};

export type EnrichedBotMap = BotMap & {
  enrichment: HeuristicEnrichment & {
    ai: AiReview;
  };
};

const STATE_KEYWORDS: Array<{
  stateType: string;
  pattern: RegExp;
  purpose: string;
  expectedBehavior: string[];
  risks: string[];
  suggestedTests: string[];
  priority: NodeAnalysis["nextStepPriority"];
}> = [
  {
    stateType: "onboarding",
    pattern: /я готов|i.?m ready|ready|начать|start/i,
    purpose: "Подвести пользователя к старту сценария и первому действию.",
    expectedBehavior: ["Пользователь понимает следующий шаг.", "Кнопка продолжения переводит в следующий экран."],
    risks: ["Текст не объясняет, что будет после нажатия.", "Кнопка не меняет состояние бота."],
    suggestedTests: ["Нажать основную кнопку готовности.", "Проверить повторный /start после уже начатого сценария."],
    priority: "high"
  },
  {
    stateType: "country_or_device_check",
    pattern: /страна|country|vpn|device|устройств|гео|geo|провер/i,
    purpose: "Проверить страну, устройство или антифрод-условия перед выдачей задания.",
    expectedBehavior: ["Проверка завершается понятным результатом.", "Пользователь не застревает без инструкции."],
    risks: ["Статус проверки не меняется.", "Ошибка VPN/гео объясняется слишком общо.", "Пользователь не понимает, что делать дальше."],
    suggestedTests: ["Проверить успешный и неуспешный device/country flow.", "Сверить Telegram transcript с backend/admin статусом."],
    priority: "high"
  },
  {
    stateType: "task_search",
    pattern: /задан|task|join_task|available|доступн|активн|проверка/i,
    purpose: "Найти, назначить или показать текущее задание пользователю.",
    expectedBehavior: ["Пользователь получает задачу или честное сообщение, что задач нет.", "Статус задачи меняется синхронно с действием."],
    risks: ["Задача визуально есть, но статус не меняется.", "Бот показывает устаревшее состояние.", "Нет объяснения, почему задач нет."],
    suggestedTests: ["Запустить сценарий с доступной задачей.", "Запустить сценарий без задач.", "Проверить переход активная -> проверка после отправки proof."],
    priority: "high"
  },
  {
    stateType: "proof_upload",
    pattern: /скрин|screenshot|upload|загруз|proof|отправ/i,
    purpose: "Собрать доказательства выполнения задания и отправить их на проверку.",
    expectedBehavior: ["Бот принимает нужный тип файла.", "После загрузки меняется статус задачи.", "Ошибки формата объясняются конкретно."],
    risks: ["Файл дошёл в чат, но не дошёл в admin/backend.", "PNG/JPG обрабатываются по-разному.", "Пользователь не видит финальный статус."],
    suggestedTests: ["Загрузить валидный PNG.", "Загрузить валидный JPG.", "Проверить неверный формат и повторную отправку."],
    priority: "high"
  },
  {
    stateType: "money_or_withdrawal",
    pattern: /баланс|balance|withdraw|вывод|earnings|деньг|оплат|pay/i,
    purpose: "Показать деньги, выплаты или финансовое действие.",
    expectedBehavior: ["Суммы и статусы понятны.", "Опасные действия требуют подтверждения."],
    risks: ["Автотест может случайно нажать финансовое действие.", "Не хватает подтверждения перед выводом."],
    suggestedTests: ["Проверить read-only просмотр баланса.", "Не автокликать подтверждение вывода без отдельного safe-сценария."],
    priority: "high"
  },
  {
    stateType: "error_or_empty_state",
    pattern: /ошиб|error|failed|не удалось|нет доступ|no available|try again|попроб/i,
    purpose: "Показать ошибку, пустое состояние или временное ограничение.",
    expectedBehavior: ["Причина понятна.", "Есть безопасный следующий шаг."],
    risks: ["Сообщение слишком общее.", "Нет действия для восстановления.", "Состояние может быть временным, но выглядит как поломка."],
    suggestedTests: ["Проверить текст ошибки.", "Проверить повтор команды после ожидания.", "Сверить с логами backend."],
    priority: "medium"
  }
];

function compactText(value: string, maxLength = 500): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function nodeText(node: BotMapNode): string {
  return [
    ...node.path,
    ...node.tail.map((message) => message.text),
    ...node.buttons.map((button) => button.text)
  ].join("\n");
}

function classifyNode(node: BotMapNode): NodeAnalysis {
  if (node.error) {
    return {
      stateType: "runner_error",
      purpose: "Ветка не была корректно воспроизведена runner'ом.",
      expectedBehavior: ["Runner должен стабильно дойти до этого узла."],
      risks: [node.error],
      suggestedTests: ["Повторить ветку отдельно.", "Проверить, не изменился ли текст кнопки или состояние бота."],
      nextStepPriority: "high"
    };
  }

  const text = nodeText(node);
  const matched = STATE_KEYWORDS.find((item) => item.pattern.test(text));
  const urlButtons = node.buttons.filter((button) => button.url);
  const hasTerminalButtons = node.buttons.length === 0 && node.skippedButtons.length === 0;

  if (urlButtons.length > 0 && !matched) {
    return {
      stateType: "webapp_handoff",
      purpose: "Передать пользователя из Telegram-бота во внешний сайт или Mini App.",
      expectedBehavior: ["Ссылка открывается.", "WebApp показывает понятный следующий шаг.", "Telegram-состояние синхронизируется с WebApp."],
      risks: ["MTProto видит ссылку, но не проверяет UI внутри WebApp.", "Нужен отдельный Playwright-прогон с network/console логами."],
      suggestedTests: ["Открыть URL/WebApp через Playwright.", "Снять screenshot и network log.", "Проверить callback/status после действия в WebApp."],
      nextStepPriority: "high"
    };
  }

  if (matched) {
    return {
      stateType: matched.stateType,
      purpose: matched.purpose,
      expectedBehavior: matched.expectedBehavior,
      risks: matched.risks,
      suggestedTests: matched.suggestedTests,
      nextStepPriority: matched.priority
    };
  }

  if (hasTerminalButtons) {
    return {
      stateType: "terminal_or_text_only",
      purpose: "Текстовое состояние без найденных inline-кнопок.",
      expectedBehavior: ["Пользователь понимает, завершён ли сценарий или какую команду отправить дальше."],
      risks: ["Сценарий может быть тупиком.", "Runner не знает, какую команду проверить дальше."],
      suggestedTests: ["Проверить наличие явной инструкции.", "Добавить известные команды в сценарный тест."],
      nextStepPriority: "medium"
    };
  }

  return {
    stateType: "unknown_interactive_state",
    purpose: "Интерактивное состояние, смысл которого нужно подтвердить по тексту и кнопкам.",
    expectedBehavior: ["Каждая кнопка должна вести к понятному следующему состоянию."],
    risks: ["Назначение ветки неочевидно.", "Можно пропустить бизнес-ошибку, если смотреть только на факт ответа."],
    suggestedTests: ["Разобрать ветку AI-анализом.", "Пройти все безопасные кнопки на глубину 2-3."],
    nextStepPriority: "medium"
  };
}

function branchCriticality(analysis: NodeAnalysis): BranchAnalysis["criticality"] {
  if (
    analysis.nextStepPriority === "high" ||
    /money|withdrawal|proof|task|country|device|runner_error/.test(analysis.stateType)
  ) {
    return "high";
  }
  if (analysis.nextStepPriority === "medium") {
    return "medium";
  }
  return "low";
}

function analyzeBranch(node: BotMapNode, nodeAnalysis: NodeAnalysis): BranchAnalysis {
  const lastAction = node.path[node.path.length - 1] || "/start";
  return {
    nodeId: node.id,
    path: node.path,
    purpose:
      node.path.length === 0
        ? "Корневое состояние после старта бота."
        : `Ветка после действия "${lastAction}": ${nodeAnalysis.purpose}`,
    expectedOutcome: nodeAnalysis.expectedBehavior.join(" "),
    criticality: branchCriticality(nodeAnalysis),
    suggestedChecks: nodeAnalysis.suggestedTests
  };
}

function summarizeProduct(map: BotMap, nodeAnalysis: Record<string, NodeAnalysis>): ProductSummary {
  const stateTypes = unique(Object.values(nodeAnalysis).map((analysis) => analysis.stateType));
  const highRiskNodes = map.nodes.filter((node) => nodeAnalysis[node.id]?.nextStepPriority === "high");
  const urlCount = map.nodes.reduce(
    (count, node) => count + node.buttons.filter((button) => button.url).length,
    0
  );
  const skippedCount = map.nodes.reduce((count, node) => count + node.skippedButtons.length, 0);

  const criticalRisks = unique([
    ...highRiskNodes.flatMap((node) => nodeAnalysis[node.id]?.risks || []),
    ...(urlCount > 0 ? ["Есть переходы в WebApp/URL: их нужно проверять Playwright'ом отдельно от MTProto."] : []),
    ...(skippedCount > 0 ? ["Часть кнопок намеренно не автокликалась из-за safe-deny правил."] : [])
  ]).slice(0, 12);

  return {
    overview: `Обнаружено ${map.nodes.length} узлов и ${map.edges.length} безопасных переходов для @${map.bot}. Основные типы состояний: ${stateTypes.join(", ") || "не определены"}.`,
    mainFlows: stateTypes.map((stateType) => {
      const count = Object.values(nodeAnalysis).filter((analysis) => analysis.stateType === stateType).length;
      return `${stateType}: ${count} узл.`;
    }),
    criticalRisks,
    recommendedNextSteps: [
      "Запустить discovery с большей глубиной только после проверки deny-правил.",
      "Для URL/WebApp веток добавить Playwright-прогон со screenshot, console и network evidence.",
      "Собрать эталонные expected states для критических веток: старт, задача, proof upload, проверка, выплаты.",
      "Подключить AI review, чтобы он объяснял назначение каждой ветки и собирал тест-план из карты."
    ]
  };
}

export function buildHeuristicEnrichment(map: BotMap): HeuristicEnrichment {
  const nodeAnalysis: Record<string, NodeAnalysis> = {};
  for (const node of map.nodes) {
    nodeAnalysis[node.id] = classifyNode(node);
  }

  return {
    mode: "heuristic",
    generatedAtIso: new Date().toISOString(),
    nodeAnalysis,
    branchAnalysis: map.nodes.map((node) => analyzeBranch(node, nodeAnalysis[node.id])),
    productSummary: summarizeProduct(map, nodeAnalysis)
  };
}

function extractJsonObject(text: string): unknown | null {
  const direct = tryParseJson(text);
  if (direct !== null) {
    return direct;
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseJson(fenced);
    if (parsed !== null) {
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

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function compactMapForAi(map: BotMap, heuristic: HeuristicEnrichment): unknown {
  return {
    bot: map.bot,
    startPayload: map.startPayload,
    limits: map.limits,
    nodes: map.nodes.map((node) => ({
      id: node.id,
      path: node.path,
      depth: node.depth,
      tail: node.tail.slice(-6).map((message) => ({
        outgoing: message.outgoing,
        text: compactText(message.text, 360)
      })),
      buttons: node.buttons.map((button) => ({
        text: button.text,
        type: button.type,
        hasUrl: Boolean(button.url),
        queued: button.queued,
        skipReason: button.skipReason
      })),
      skippedButtons: node.skippedButtons.map((button) => ({
        text: button.text,
        type: button.type,
        skipReason: button.skipReason
      })),
      heuristic: heuristic.nodeAnalysis[node.id]
    })),
    edges: map.edges,
    heuristicProductSummary: heuristic.productSummary
  };
}

export async function requestAiReview(map: BotMap, heuristic: HeuristicEnrichment): Promise<AiReview> {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "").trim();
  const provider = (process.env.AI_PROVIDER || "openai-compatible").trim();
  const model = (process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4.1-mini").trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || "https://api.openai.com/v1")
    .trim()
    .replace(/\/+$/, "");

  if (!apiKey) {
    return {
      enabled: false,
      provider,
      model,
      error: "OPENAI_API_KEY/AI_API_KEY is not configured; heuristic enrichment was used."
    };
  }

  const prompt = [
    "Ты senior QA architect для Telegram-ботов и webapp flows.",
    "Проанализируй карту бота целиком, потом каждую ветку отдельно.",
    "Не ограничивайся найденными ошибками: объясни назначение веток, ожидаемую бизнес-логику, риски и тесты.",
    "Верни строго JSON без markdown в форме:",
    "{",
    '  "overallView": "...",',
    '  "branchReviews": [{"nodeId":"...","purpose":"...","expectedBehavior":["..."],"risks":["..."],"tests":["..."],"severity":"low|medium|high"}],',
    '  "scenarioPlan": [{"name":"...","why":"...","steps":["..."],"evidence":["..."]}],',
    '  "coverageGaps": ["..."],',
    '  "questionsForProduct": ["..."]',
    "}",
    "",
    "Карта бота:",
    JSON.stringify(compactMapForAi(map, heuristic))
  ].join("\n");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You analyze Telegram bot QA maps. Be concrete, conservative, and return valid JSON only."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        enabled: true,
        provider,
        model,
        error: `AI request failed: ${response.status} ${payload.error?.message || "unknown_error"}`
      };
    }

    const rawText = String(payload.choices?.[0]?.message?.content || "").trim();
    return {
      enabled: true,
      provider,
      model,
      rawText,
      parsed: extractJsonObject(rawText) || undefined
    };
  } catch (error) {
    return {
      enabled: true,
      provider,
      model,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function buildEnrichedBotMap(map: BotMap): Promise<EnrichedBotMap> {
  const heuristic = buildHeuristicEnrichment(map);
  const ai = process.env.MTPROTO_DISCOVERY_AI === "0" ? {
    enabled: false,
    provider: "disabled",
    model: "",
    error: "MTPROTO_DISCOVERY_AI=0"
  } : await requestAiReview(map, heuristic);

  return {
    ...map,
    enrichment: {
      ...heuristic,
      ai
    }
  };
}

export function normalizeNodeIdPart(value: string): string {
  return (
    normalizeText(value)
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "root"
  );
}
