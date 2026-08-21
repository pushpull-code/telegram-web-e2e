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

export type WebTargetAudit = {
  id: string;
  nodeId: string;
  path: string[];
  buttonText: string;
  buttonType: string;
  url: string;
  finalUrl: string | null;
  title: string | null;
  status: number | null;
  ok: boolean;
  durationMs: number;
  screenshotFile: string | null;
  pageSnapshot: WebPageSnapshot | null;
  suggestedInteractions: string[];
  interactions: WebInteractionAudit[];
  consoleMessages: Array<{
    type: string;
    text: string;
  }>;
  failedRequests: Array<{
    method: string;
    url: string;
    errorText: string;
  }>;
  errors: string[];
};

export type WebPageSnapshot = {
  bodyTextSample: string;
  headings: string[];
  counts: {
    headings: number;
    links: number;
    buttons: number;
    inputs: number;
    forms: number;
  };
  elements: WebPageElementSummary[];
};

export type WebPageElementSummary = {
  kind: "heading" | "link" | "button" | "input" | "form";
  text: string;
  tagName: string;
  href?: string;
  inputType?: string;
  placeholder?: string;
  disabled?: boolean;
  domIndex?: number;
};

export type WebInteractionAudit = {
  action: "click";
  targetText: string;
  targetKind: string;
  beforeUrl: string | null;
  afterUrl: string | null;
  title: string | null;
  screenshotFile: string | null;
  ok: boolean;
  consoleMessages: Array<{
    type: string;
    text: string;
  }>;
  failedRequests: Array<{
    method: string;
    url: string;
    errorText: string;
  }>;
  errors: string[];
};

export type AiSeverity = "low" | "medium" | "high" | "critical";
export type AiConfidence = "low" | "medium" | "high";

export type AiQaReport = {
  schemaVersion: 2;
  analysisMode: "staged-telegram-bot-qa";
  botOverview: {
    summary: string;
    businessPurpose: string;
    knownScope: string[];
    mainFlows: string[];
    safetyBoundaries: string[];
    confidence: AiConfidence;
  };
  branchReviews: Array<{
    nodeId: string;
    path: string[];
    currentEvidence: string[];
    inferredPurpose: string;
    expectedBehavior: string[];
    observedBehavior: string[];
    risks: string[];
    tests: string[];
    missingEvidence: string[];
    severity: AiSeverity;
    confidence: AiConfidence;
  }>;
  scenarioPlan: Array<{
    name: string;
    why: string;
    priority: AiSeverity;
    steps: string[];
    evidence: string[];
  }>;
  defects: Array<{
    title: string;
    nodeIds: string[];
    evidence: string[];
    whyItMatters: string;
    severity: AiSeverity;
    reproSteps: string[];
    neededEvidence: string[];
  }>;
  coverageGaps: string[];
  questionsForProduct: string[];
  nextRun: {
    recommendedDepth: number;
    recommendedMaxNodes: number;
    focusBranches: string[];
    webAppChecks: string[];
  };
  telegramSummary: string[];
};

export type GeneratedQaPlan = {
  schemaVersion: 1;
  generatedAtIso: string;
  bot: string;
  startPayload: string;
  source: {
    runner: BotMap["runner"];
    aiEnabled: boolean;
    aiModel: string;
    aiPromptVersion: string | null;
    nodeCount: number;
    edgeCount: number;
    webTargetAuditCount: number;
  };
  scenarios: Array<{
    name: string;
    priority: AiSeverity;
    why: string;
    steps: string[];
    evidence: string[];
    runnableNow: boolean;
    blocker: string | null;
  }>;
  branchChecklist: Array<{
    nodeId: string;
    path: string[];
    priority: AiSeverity;
    checks: string[];
    missingEvidence: string[];
  }>;
  defects: AiQaReport["defects"];
  coverageGaps: string[];
  questionsForProduct: string[];
  webTargets: Array<{
    id: string;
    status: number | null;
    ok: boolean;
    title: string | null;
    url: string;
    finalUrl: string | null;
    screenshotFile: string | null;
    pageCounts: WebPageSnapshot["counts"] | null;
    suggestedInteractions: string[];
  }>;
  nextRun: AiQaReport["nextRun"] | null;
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
  schemaVersion?: 2;
  promptVersion?: string;
  report?: AiQaReport;
  parsed?: unknown;
  rawText?: string;
  parseError?: string;
  error?: string;
};

export type EnrichedBotMap = BotMap & {
  webTargetAudits?: WebTargetAudit[];
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

const AI_PROMPT_VERSION = "telegram-bot-qa-v2";

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

export function sanitizeReportUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search ? "?…" : ""}${url.hash ? "#…" : ""}`;
  } catch {
    return compactText(value, 180);
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSeverity(value: unknown): value is AiSeverity {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}

function isConfidence(value: unknown): value is AiConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function isAiQaBranchReview(value: unknown): value is AiQaReport["branchReviews"][number] {
  return (
    isRecord(value) &&
    typeof value.nodeId === "string" &&
    isStringArray(value.path) &&
    isStringArray(value.currentEvidence) &&
    typeof value.inferredPurpose === "string" &&
    isStringArray(value.expectedBehavior) &&
    isStringArray(value.observedBehavior) &&
    isStringArray(value.risks) &&
    isStringArray(value.tests) &&
    isStringArray(value.missingEvidence) &&
    isSeverity(value.severity) &&
    isConfidence(value.confidence)
  );
}

function isAiQaScenario(value: unknown): value is AiQaReport["scenarioPlan"][number] {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.why === "string" &&
    isSeverity(value.priority) &&
    isStringArray(value.steps) &&
    isStringArray(value.evidence)
  );
}

function isAiQaDefect(value: unknown): value is AiQaReport["defects"][number] {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    isStringArray(value.nodeIds) &&
    isStringArray(value.evidence) &&
    typeof value.whyItMatters === "string" &&
    isSeverity(value.severity) &&
    isStringArray(value.reproSteps) &&
    isStringArray(value.neededEvidence)
  );
}

function isAiQaReport(value: unknown): value is AiQaReport {
  if (!isRecord(value) || !isRecord(value.botOverview) || !isRecord(value.nextRun)) {
    return false;
  }

  return (
    value.schemaVersion === 2 &&
    value.analysisMode === "staged-telegram-bot-qa" &&
    typeof value.botOverview.summary === "string" &&
    typeof value.botOverview.businessPurpose === "string" &&
    isStringArray(value.botOverview.knownScope) &&
    isStringArray(value.botOverview.mainFlows) &&
    isStringArray(value.botOverview.safetyBoundaries) &&
    isConfidence(value.botOverview.confidence) &&
    Array.isArray(value.branchReviews) &&
    value.branchReviews.every(isAiQaBranchReview) &&
    Array.isArray(value.scenarioPlan) &&
    value.scenarioPlan.every(isAiQaScenario) &&
    Array.isArray(value.defects) &&
    value.defects.every(isAiQaDefect) &&
    isStringArray(value.coverageGaps) &&
    isStringArray(value.questionsForProduct) &&
    typeof value.nextRun.recommendedDepth === "number" &&
    typeof value.nextRun.recommendedMaxNodes === "number" &&
    isStringArray(value.nextRun.focusBranches) &&
    isStringArray(value.nextRun.webAppChecks) &&
    isStringArray(value.telegramSummary)
  );
}

function compactMapForAi(
  map: BotMap,
  heuristic: HeuristicEnrichment,
  webTargetAudits: WebTargetAudit[] = []
): unknown {
  const terminalUrlButtons = map.nodes.flatMap((node) =>
    node.skippedButtons
      .filter((button) => button.skipReason === "url_or_webapp_terminal")
      .map((button) => ({
        nodeId: node.id,
        path: node.path,
        text: button.text,
        type: button.type,
        url: button.url ? sanitizeReportUrl(button.url) : null
      }))
  );
  const safeDeniedButtons = map.nodes.flatMap((node) =>
    node.skippedButtons
      .filter((button) => button.skipReason === "safe_deny_rule")
      .map((button) => ({
        nodeId: node.id,
        path: node.path,
        text: button.text,
        type: button.type
      }))
  );

  return {
    schemaVersion: "compact-map-v2",
    bot: map.bot,
    startPayload: map.startPayload,
    limits: map.limits,
    graphStats: {
      nodeCount: map.nodes.length,
      edgeCount: map.edges.length,
      terminalUrlButtonCount: terminalUrlButtons.length,
      safeDeniedButtonCount: safeDeniedButtons.length
    },
    nodes: map.nodes.map((node) => ({
      id: node.id,
      path: node.path,
      depth: node.depth,
      messageWindow: node.messageWindow,
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
    terminalUrlButtons,
    safeDeniedButtons,
    webTargetAudits: webTargetAudits.map((audit) => ({
      id: audit.id,
      nodeId: audit.nodeId,
      path: audit.path,
      buttonText: audit.buttonText,
      buttonType: audit.buttonType,
      url: audit.url,
      finalUrl: audit.finalUrl,
      title: audit.title,
      status: audit.status,
      ok: audit.ok,
      durationMs: audit.durationMs,
      screenshotFile: audit.screenshotFile,
      pageSnapshot: audit.pageSnapshot
        ? {
            bodyTextSample: audit.pageSnapshot.bodyTextSample,
            headings: audit.pageSnapshot.headings,
            counts: audit.pageSnapshot.counts,
            elements: audit.pageSnapshot.elements.slice(0, 25)
          }
        : null,
      suggestedInteractions: audit.suggestedInteractions,
      interactions: audit.interactions.map((interaction) => ({
        action: interaction.action,
        targetText: interaction.targetText,
        targetKind: interaction.targetKind,
        beforeUrl: interaction.beforeUrl,
        afterUrl: interaction.afterUrl,
        title: interaction.title,
        screenshotFile: interaction.screenshotFile,
        ok: interaction.ok,
        consoleMessages: interaction.consoleMessages,
        failedRequests: interaction.failedRequests,
        errors: interaction.errors
      })),
      consoleMessages: audit.consoleMessages,
      failedRequests: audit.failedRequests,
      errors: audit.errors
    })),
    heuristicProductSummary: heuristic.productSummary
  };
}

function buildAiQaPrompt(
  map: BotMap,
  heuristic: HeuristicEnrichment,
  webTargetAudits: WebTargetAudit[] = []
): string {
  return [
    "Ты senior QA architect для Telegram-ботов, Telegram Mini Apps и backend-integrated flows.",
    "Нужно сделать staged QA analysis по карте бота.",
    "",
    "Жесткие правила:",
    "- сначала дай общий взгляд на бота целиком, потом разбор каждой ветки;",
    "- отделяй observed evidence от inference: не выдавай догадки за факт;",
    "- каждую branchReview привязывай к nodeId и path из карты;",
    "- если ветка не покрыта из-за лимита или safe-deny, добавь это в missingEvidence/coverageGaps;",
    "- не предлагай автокликать оплату, вывод денег, delete/cancel/confirm без отдельного безопасного сценария;",
    "- WebApp/URL ветки помечай как требующие Playwright-проверки со screenshot, console и network evidence;",
    "- пиши по-русски, коротко и конкретно, без markdown;",
    "- верни только валидный JSON.",
    "",
    "Верни JSON строго такой формы:",
    "{",
    '  "schemaVersion": 2,',
    '  "analysisMode": "staged-telegram-bot-qa",',
    '  "botOverview": {',
    '    "summary": "...",',
    '    "businessPurpose": "...",',
    '    "knownScope": ["что реально покрыто картой"],',
    '    "mainFlows": ["..."],',
    '    "safetyBoundaries": ["..."],',
    '    "confidence": "low|medium|high"',
    "  },",
    '  "branchReviews": [{',
    '    "nodeId": "...",',
    '    "path": ["..."],',
    '    "currentEvidence": ["что видно в transcript/buttons"],',
    '    "inferredPurpose": "...",',
    '    "expectedBehavior": ["..."],',
    '    "observedBehavior": ["..."],',
    '    "risks": ["..."],',
    '    "tests": ["..."],',
    '    "missingEvidence": ["..."],',
    '    "severity": "low|medium|high|critical",',
    '    "confidence": "low|medium|high"',
    "  }],",
    '  "scenarioPlan": [{',
    '    "name": "...",',
    '    "why": "...",',
    '    "priority": "low|medium|high|critical",',
    '    "steps": ["..."],',
    '    "evidence": ["..."]',
    "  }],",
    '  "defects": [{',
    '    "title": "...",',
    '    "nodeIds": ["..."],',
    '    "evidence": ["..."],',
    '    "whyItMatters": "...",',
    '    "severity": "low|medium|high|critical",',
    '    "reproSteps": ["..."],',
    '    "neededEvidence": ["..."]',
    "  }],",
    '  "coverageGaps": ["..."],',
    '  "questionsForProduct": ["..."],',
    '  "nextRun": {',
    '    "recommendedDepth": 2,',
    '    "recommendedMaxNodes": 25,',
    '    "focusBranches": ["..."],',
    '    "webAppChecks": ["..."]',
    "  },",
    '  "telegramSummary": ["короткие строки для Telegram"]',
    "}",
    "",
    "Карта бота:",
    JSON.stringify(compactMapForAi(map, heuristic, webTargetAudits))
  ].join("\n");
}

export async function requestAiReview(
  map: BotMap,
  heuristic: HeuristicEnrichment,
  webTargetAudits: WebTargetAudit[] = []
): Promise<AiReview> {
  const apiKey = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const provider = (process.env.AI_PROVIDER || "openai-compatible").trim();
  const model = (process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const baseUrl = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
    .trim()
    .replace(/\/+$/, "");

  if (!apiKey) {
    return {
      enabled: false,
      provider,
      model,
      error: "AI_API_KEY/OPENAI_API_KEY is not configured; heuristic enrichment was used."
    };
  }

  const prompt = buildAiQaPrompt(map, heuristic, webTargetAudits);

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
              "You analyze Telegram bot QA maps in staged mode. Be concrete, conservative, and return valid JSON only."
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
    const parsed = extractJsonObject(rawText) || undefined;
    const report = isAiQaReport(parsed) ? parsed : undefined;

    return {
      enabled: true,
      provider,
      model,
      schemaVersion: 2,
      promptVersion: AI_PROMPT_VERSION,
      rawText,
      parsed,
      ...(report ? { report } : {}),
      ...(!report
        ? {
            parseError: parsed
              ? "AI response JSON does not match staged QA schema."
              : "AI response did not contain parseable JSON."
          }
        : {})
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

function markdownList(values: string[] | undefined, fallback = "нет данных"): string[] {
  if (!values || values.length === 0) {
    return [`- ${fallback}`];
  }
  return values.map((value) => `- ${value}`);
}

export function buildQaMarkdownReport(enriched: EnrichedBotMap): string {
  const report = enriched.enrichment.ai.report;
  const lines: string[] = [
    `# QA report: @${enriched.bot}`,
    "",
    `Generated: ${enriched.generatedAtIso}`,
    `Start payload: ${enriched.startPayload || "-"}`,
    `Nodes: ${enriched.nodes.length}`,
    `Edges: ${enriched.edges.length}`,
    `AI: ${
      enriched.enrichment.ai.enabled
        ? `${enriched.enrichment.ai.model}${enriched.enrichment.ai.error ? ` (${enriched.enrichment.ai.error})` : ""}`
        : "disabled"
    }`,
    ""
  ];

  if (enriched.webTargetAudits?.length) {
    lines.push("## Web/URL checks", "");
    for (const audit of enriched.webTargetAudits) {
      lines.push(
        `### ${audit.id} (${audit.ok ? "ok" : "failed"})`,
        `Path: ${audit.path.join(" > ") || "/start"}`,
        `Button: ${audit.buttonText}`,
        `URL: ${audit.url}`,
        `Final URL: ${audit.finalUrl || "-"}`,
        `Status: ${audit.status ?? "-"}`,
        `Title: ${audit.title || "-"}`,
        `Screenshot: ${audit.screenshotFile || "-"}`,
        "",
        "Page snapshot:",
        ...(audit.pageSnapshot
          ? [
              `- headings: ${audit.pageSnapshot.counts.headings}`,
              `- links: ${audit.pageSnapshot.counts.links}`,
              `- buttons: ${audit.pageSnapshot.counts.buttons}`,
              `- inputs: ${audit.pageSnapshot.counts.inputs}`,
              `- forms: ${audit.pageSnapshot.counts.forms}`,
              ...markdownList(
                audit.pageSnapshot.headings.map((heading) => `heading: ${heading}`),
                "нет headings"
              ),
              ...markdownList(
                audit.pageSnapshot.elements
                  .slice(0, 12)
                  .map((element) =>
                    `${element.kind}: ${element.text || element.placeholder || element.href || element.tagName}`
                  ),
                "нет visible elements"
              )
            ]
          : ["- snapshot не собран"]),
        "",
        "Suggested interactions:",
        ...markdownList(audit.suggestedInteractions, "нет suggested interactions"),
        "",
        "Safe interactions:",
        ...markdownList(
          audit.interactions.map(
            (interaction) =>
              `${interaction.ok ? "ok" : "failed"} click ${interaction.targetKind} "${interaction.targetText}" -> ${
                interaction.afterUrl || "-"
              }`
          ),
          "не запускались"
        ),
        "",
        "Console:",
        ...markdownList(
          audit.consoleMessages.map((message) => `${message.type}: ${message.text}`),
          "нет сообщений"
        ),
        "",
        "Failed requests:",
        ...markdownList(
          audit.failedRequests.map((request) => `${request.method} ${request.url}: ${request.errorText}`),
          "нет failed requests"
        ),
        "",
        "Errors:",
        ...markdownList(audit.errors, "нет ошибок"),
        ""
      );
    }
  }

  if (report) {
    lines.push("## Overall view", "", report.botOverview.summary, "");
    lines.push("### Business purpose", "", report.botOverview.businessPurpose, "");
    lines.push("### Main flows", ...markdownList(report.botOverview.mainFlows), "");
    lines.push("### Safety boundaries", ...markdownList(report.botOverview.safetyBoundaries), "");
    lines.push("## Branch reviews", "");

    for (const branch of report.branchReviews) {
      lines.push(
        `### ${branch.nodeId} (${branch.severity}, confidence: ${branch.confidence})`,
        `Path: ${branch.path.join(" > ") || "/start"}`,
        "",
        `Purpose: ${branch.inferredPurpose}`,
        "",
        "Observed:",
        ...markdownList(branch.observedBehavior),
        "",
        "Risks:",
        ...markdownList(branch.risks),
        "",
        "Tests:",
        ...markdownList(branch.tests),
        "",
        "Missing evidence:",
        ...markdownList(branch.missingEvidence),
        ""
      );
    }

    lines.push("## Defects", "");
    if (report.defects.length === 0) {
      lines.push("- явных дефектов по карте не выделено", "");
    } else {
      for (const defect of report.defects) {
        lines.push(
          `### ${defect.title} (${defect.severity})`,
          `Nodes: ${defect.nodeIds.join(", ") || "-"}`,
          "",
          "Evidence:",
          ...markdownList(defect.evidence),
          "",
          `Impact: ${defect.whyItMatters}`,
          "",
          "Repro:",
          ...markdownList(defect.reproSteps),
          ""
        );
      }
    }

    lines.push("## Scenario plan", "");
    for (const scenario of report.scenarioPlan) {
      lines.push(
        `### ${scenario.name} (${scenario.priority})`,
        scenario.why,
        "",
        "Steps:",
        ...markdownList(scenario.steps),
        "",
        "Evidence:",
        ...markdownList(scenario.evidence),
        ""
      );
    }

    lines.push("## Coverage gaps", ...markdownList(report.coverageGaps), "");
    lines.push("## Questions for product", ...markdownList(report.questionsForProduct), "");
    lines.push("## Next run", "");
    lines.push(`- depth: ${report.nextRun.recommendedDepth}`);
    lines.push(`- maxNodes: ${report.nextRun.recommendedMaxNodes}`);
    lines.push(...markdownList(report.nextRun.focusBranches.map((branch) => `focus: ${branch}`), "нет focus branches"));
    lines.push(...markdownList(report.nextRun.webAppChecks.map((check) => `webapp: ${check}`), "нет webapp checks"));
    lines.push("");
    lines.push("## Telegram summary", ...markdownList(report.telegramSummary), "");
  } else {
    lines.push("## Overall view", "", enriched.enrichment.productSummary.overview, "");
    lines.push("## Main flows", ...markdownList(enriched.enrichment.productSummary.mainFlows), "");
    lines.push("## Critical risks", ...markdownList(enriched.enrichment.productSummary.criticalRisks), "");
    lines.push("## Recommended next steps", ...markdownList(enriched.enrichment.productSummary.recommendedNextSteps), "");
    if (enriched.enrichment.ai.parseError) {
      lines.push(`AI parse error: ${enriched.enrichment.ai.parseError}`, "");
    }
  }

  return `${lines.join("\n")}\n`;
}

function heuristicPriorityToSeverity(priority: NodeAnalysis["nextStepPriority"]): AiSeverity {
  if (priority === "high") {
    return "high";
  }
  if (priority === "medium") {
    return "medium";
  }
  return "low";
}

export function buildTelegramSummaryText(enriched: EnrichedBotMap): string {
  const report = enriched.enrichment.ai.report;
  const lines = [`QA @${enriched.bot}`];

  if (report?.telegramSummary.length) {
    lines.push(...report.telegramSummary.map((line) => `- ${line}`));
  } else {
    lines.push(`- ${enriched.enrichment.productSummary.overview}`);
    lines.push(
      ...enriched.enrichment.productSummary.criticalRisks
        .slice(0, 4)
        .map((risk) => `- риск: ${risk}`)
    );
    if (enriched.enrichment.ai.error || enriched.enrichment.ai.parseError) {
      lines.push(`- AI: ${enriched.enrichment.ai.error || enriched.enrichment.ai.parseError}`);
    }
  }

  if (enriched.webTargetAudits?.length) {
    const okCount = enriched.webTargetAudits.filter((audit) => audit.ok).length;
    lines.push(`- web/url: ${okCount}/${enriched.webTargetAudits.length} открылись, snapshots собраны`);
  }

  return `${lines.join("\n")}\n`;
}

export function buildGeneratedQaPlan(enriched: EnrichedBotMap): GeneratedQaPlan {
  const report = enriched.enrichment.ai.report;
  const heuristic = enriched.enrichment;

  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    bot: enriched.bot,
    startPayload: enriched.startPayload,
    source: {
      runner: enriched.runner,
      aiEnabled: enriched.enrichment.ai.enabled,
      aiModel: enriched.enrichment.ai.model,
      aiPromptVersion: enriched.enrichment.ai.promptVersion || null,
      nodeCount: enriched.nodes.length,
      edgeCount: enriched.edges.length,
      webTargetAuditCount: enriched.webTargetAudits?.length || 0
    },
    scenarios: report
      ? report.scenarioPlan.map((scenario) => ({
          name: scenario.name,
          priority: scenario.priority,
          why: scenario.why,
          steps: scenario.steps,
          evidence: scenario.evidence,
          runnableNow: false,
          blocker: "AI test plan is not yet converted to executable scenario JSON."
        }))
      : heuristic.branchAnalysis.map((branch) => ({
          name: `branch_${branch.nodeId}`,
          priority: branch.criticality,
          why: branch.purpose,
          steps: branch.suggestedChecks,
          evidence: ["bot-map.json", "bot-map.enriched.json", "qa-report.md"],
          runnableNow: false,
          blocker: "Heuristic plan needs AI review or explicit scenario mapping."
        })),
    branchChecklist: report
      ? report.branchReviews.map((branch) => ({
          nodeId: branch.nodeId,
          path: branch.path,
          priority: branch.severity,
          checks: branch.tests,
          missingEvidence: branch.missingEvidence
        }))
      : enriched.nodes.map((node) => {
          const analysis = heuristic.nodeAnalysis[node.id];
          return {
            nodeId: node.id,
            path: node.path,
            priority: heuristicPriorityToSeverity(analysis.nextStepPriority),
            checks: analysis.suggestedTests,
            missingEvidence: node.error ? [node.error] : []
          };
        }),
    defects: report?.defects || [],
    coverageGaps: report?.coverageGaps || heuristic.productSummary.criticalRisks,
    questionsForProduct: report?.questionsForProduct || [],
    webTargets: (enriched.webTargetAudits || []).map((audit) => ({
      id: audit.id,
      status: audit.status,
      ok: audit.ok,
      title: audit.title,
      url: audit.url,
      finalUrl: audit.finalUrl,
      screenshotFile: audit.screenshotFile,
      pageCounts: audit.pageSnapshot?.counts || null,
      suggestedInteractions: audit.suggestedInteractions
    })),
    nextRun: report?.nextRun || null
  };
}

export async function buildEnrichedBotMap(
  map: BotMap,
  webTargetAudits: WebTargetAudit[] = []
): Promise<EnrichedBotMap> {
  const heuristic = buildHeuristicEnrichment(map);
  const ai = process.env.MTPROTO_DISCOVERY_AI === "0" ? {
    enabled: false,
    provider: "disabled",
    model: "",
    error: "MTPROTO_DISCOVERY_AI=0"
  } : await requestAiReview(map, heuristic, webTargetAudits);

  return {
    ...map,
    ...(webTargetAudits.length > 0 ? { webTargetAudits } : {}),
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
