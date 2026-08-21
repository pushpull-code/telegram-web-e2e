import fs from "node:fs";
import path from "node:path";
import { test, type ConsoleMessage, type Page, type Request } from "@playwright/test";
import { botStartPayload, botUsername } from "./helpers/bot-config";
import {
  buildEnrichedBotMap,
  buildQaMarkdownReport,
  normalizeNodeIdPart,
  sanitizeReportUrl,
  type BotMap,
  type BotMapButton,
  type BotMapEdge,
  type BotMapMessage,
  type BotMapNode,
  type WebTargetAudit
} from "./helpers/mtproto-bot-map";
import {
  clickMtprotoButton,
  findLatestMtprotoButton,
  getMtprotoChatState,
  isMtprotoConfigured,
  sendMtprotoMessage,
  type MtprotoButton,
  type MtprotoMessage,
  type MtprotoPeer
} from "./helpers/mtproto-service";

const maxDepth = Number(process.env.MTPROTO_DISCOVERY_MAX_DEPTH || "2");
const maxNodes = Number(process.env.MTPROTO_DISCOVERY_MAX_NODES || "14");
const maxButtonsPerNode = Number(process.env.MTPROTO_DISCOVERY_MAX_BUTTONS_PER_NODE || "8");
const stateLimit = Number(process.env.MTPROTO_DISCOVERY_STATE_LIMIT || "50");
const settleMs = Number(process.env.MTPROTO_DISCOVERY_SETTLE_MS || "1400");
const clickTimeoutMs = Number(process.env.MTPROTO_DISCOVERY_CLICK_TIMEOUT_MS || "3500");
const webTargetsEnabled = process.env.MTPROTO_DISCOVERY_WEB_TARGETS !== "0";
const maxUrlAudits = Number(process.env.MTPROTO_DISCOVERY_MAX_URL_AUDITS || "5");
const webTargetTimeoutMs = Number(process.env.MTPROTO_DISCOVERY_WEB_TARGET_TIMEOUT_MS || "20000");
const startPayload = (process.env.MTPROTO_DISCOVERY_START_PAYLOAD || botStartPayload).trim();
const denyButtonRe = new RegExp(
  process.env.MTPROTO_DISCOVERY_DENY_BUTTON_RE ||
    "удал|delete|withdraw|вывод|cancel|отмен|заверш|finish|confirm|подтверд|оплат|pay|buy|purchase",
  "i"
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nodeId(pathParts: string[]): string {
  return pathParts.length === 0 ? "root" : pathParts.map(normalizeNodeIdPart).join("__");
}

function compactMessage(message: MtprotoMessage): BotMapMessage {
  return {
    id: message.id,
    dateIso: message.dateIso,
    outgoing: message.outgoing,
    text: message.text
  };
}

function buttonSkipReason(button: MtprotoButton): string | null {
  if (!button.text.trim()) {
    return "empty_text";
  }
  if (!button.clickable) {
    return "not_clickable";
  }
  if (button.url) {
    return "url_or_webapp_terminal";
  }
  if (denyButtonRe.test(button.text)) {
    return "safe_deny_rule";
  }
  return null;
}

function uniqueButtonKey(button: MtprotoButton): string {
  return [button.text.trim().toLowerCase(), button.url || "", button.type].join("|");
}

function collectCurrentButtons(messages: MtprotoMessage[]): { buttons: BotMapButton[]; skippedButtons: BotMapButton[] } {
  const result: BotMapButton[] = [];
  const seen = new Set<string>();

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.outgoing) {
      continue;
    }

    for (const row of message.buttons) {
      for (const button of row) {
        const key = uniqueButtonKey(button);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const skipReason = buttonSkipReason(button);
        result.push({
          ...button,
          messageId: message.id,
          queued: !skipReason,
          ...(skipReason ? { skipReason } : {})
        });

        if (result.length >= maxButtonsPerNode * 2) {
          break;
        }
      }
      if (result.length >= maxButtonsPerNode * 2) {
        break;
      }
    }
    if (result.length >= maxButtonsPerNode * 2) {
      break;
    }
  }

  const buttons = result.filter((button) => button.queued).slice(0, maxButtonsPerNode);
  const skippedButtons = result.filter((button) => !button.queued);
  return { buttons, skippedButtons };
}

async function startBot(peer: MtprotoPeer): Promise<void> {
  await sendMtprotoMessage(peer, `/start ${startPayload}`);
  await sleep(settleMs);
}

async function clickPathButton(peer: MtprotoPeer, label: string): Promise<void> {
  const state = await getMtprotoChatState(peer, stateLimit);
  const found = findLatestMtprotoButton(state.messages, [label]);
  if (!found) {
    throw new Error(`Button not found in latest chat state: ${label}`);
  }
  if (found.button.url) {
    throw new Error(`URL/WebApp button is terminal in MTProto discovery: ${label}`);
  }

  const selector = {
    rowIndex: found.button.rowIndex,
    columnIndex: found.button.columnIndex,
    ...(found.button.dataBase64 ? { buttonDataBase64: found.button.dataBase64 } : {}),
    buttonText: found.button.text,
    allowTimeoutAsSuccess: true,
    clickTimeoutMs
  };

  await clickMtprotoButton(peer, found.message.id, selector);
  await sleep(settleMs);
}

async function replayPath(peer: MtprotoPeer, buttonPath: string[]): Promise<string | undefined> {
  await startBot(peer);
  for (const label of buttonPath) {
    try {
      await clickPathButton(peer, label);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return undefined;
}

function buildNode(id: string, currentPath: string[], messages: MtprotoMessage[], error?: string): BotMapNode {
  const { buttons, skippedButtons } = collectCurrentButtons(messages);
  const first = messages[0] || null;
  const last = messages[messages.length - 1] || null;

  return {
    id,
    depth: currentPath.length,
    path: currentPath,
    observedAtIso: new Date().toISOString(),
    messageWindow: {
      limit: stateLimit,
      count: messages.length,
      firstId: first?.id ?? null,
      lastId: last?.id ?? null
    },
    tail: messages.slice(-12).map(compactMessage),
    buttons: error ? [] : buttons,
    skippedButtons: error ? [] : skippedButtons,
    ...(error ? { error } : {})
  };
}

function addEdge(edges: BotMapEdge[], from: string, to: string, buttonText: string, depth: number): void {
  if (edges.some((edge) => edge.from === from && edge.to === to && edge.buttonText === buttonText)) {
    return;
  }
  edges.push({ from, to, buttonText, depth });
}

type WebTarget = {
  id: string;
  nodeId: string;
  path: string[];
  buttonText: string;
  buttonType: string;
  url: string;
};

function collectWebTargets(map: BotMap): WebTarget[] {
  const targets: WebTarget[] = [];
  const seen = new Set<string>();

  for (const node of map.nodes) {
    for (const button of node.skippedButtons) {
      if (!button.url || button.skipReason !== "url_or_webapp_terminal") {
        continue;
      }

      const key = `${button.text.trim().toLowerCase()}|${button.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      targets.push({
        id: `${node.id}__${normalizeNodeIdPart(button.text)}`,
        nodeId: node.id,
        path: node.path,
        buttonText: button.text,
        buttonType: button.type,
        url: button.url
      });
    }
  }

  return targets.slice(0, maxUrlAudits);
}

function compactEventText(value: string, maxLength = 500): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

async function auditWebTargets(page: Page, map: BotMap, outputDir: string): Promise<WebTargetAudit[]> {
  if (!webTargetsEnabled) {
    return [];
  }

  const targets = collectWebTargets(map);
  if (targets.length === 0) {
    return [];
  }

  const screenshotDir = path.join(outputDir, "web-targets");
  fs.mkdirSync(screenshotDir, { recursive: true });

  const audits: WebTargetAudit[] = [];
  for (const target of targets) {
    const startedAt = Date.now();
    const consoleMessages: WebTargetAudit["consoleMessages"] = [];
    const failedRequests: WebTargetAudit["failedRequests"] = [];
    const errors: string[] = [];
    let finalUrl: string | null = null;
    let title: string | null = null;
    let status: number | null = null;
    let screenshotFile: string | null = null;

    const onConsole = (message: ConsoleMessage): void => {
      if (consoleMessages.length >= 30) {
        return;
      }
      consoleMessages.push({
        type: message.type(),
        text: compactEventText(message.text(), 700)
      });
    };
    const onRequestFailed = (request: Request): void => {
      if (failedRequests.length >= 30) {
        return;
      }
      failedRequests.push({
        method: request.method(),
        url: sanitizeReportUrl(request.url()),
        errorText: compactEventText(request.failure()?.errorText || "unknown_error", 300)
      });
    };
    const onPageError = (error: Error): void => {
      if (errors.length < 20) {
        errors.push(compactEventText(error.message, 700));
      }
    };

    page.on("console", onConsole);
    page.on("requestfailed", onRequestFailed);
    page.on("pageerror", onPageError);

    try {
      const response = await page.goto(target.url, {
        waitUntil: "domcontentloaded",
        timeout: webTargetTimeoutMs
      });
      status = response?.status() ?? null;
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      finalUrl = sanitizeReportUrl(page.url());
      title = await page.title().catch(() => null);
    } catch (error) {
      errors.push(error instanceof Error ? compactEventText(error.message, 700) : compactEventText(String(error), 700));
      finalUrl = page.url() ? sanitizeReportUrl(page.url()) : null;
      title = await page.title().catch(() => null);
    }

    try {
      const screenshotPath = path.join(screenshotDir, `${target.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10_000 });
      screenshotFile = path.relative(outputDir, screenshotPath).replace(/\\/g, "/");
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `screenshot failed: ${compactEventText(error.message, 500)}`
          : `screenshot failed: ${compactEventText(String(error), 500)}`
      );
    } finally {
      page.off("console", onConsole);
      page.off("requestfailed", onRequestFailed);
      page.off("pageerror", onPageError);
    }

    audits.push({
      id: target.id,
      nodeId: target.nodeId,
      path: target.path,
      buttonText: target.buttonText,
      buttonType: target.buttonType,
      url: sanitizeReportUrl(target.url),
      finalUrl,
      title,
      status,
      ok: errors.length === 0 && status !== null && status < 400,
      durationMs: Date.now() - startedAt,
      screenshotFile,
      consoleMessages,
      failedRequests,
      errors
    });
  }

  return audits;
}

test.describe.serial("MTProto bot discovery with branch analysis", () => {
  test("builds raw and enriched bot maps", async ({ page }, testInfo) => {
    test.skip(!isMtprotoConfigured(), "MTPROTO_SERVICE_URL/MTPROTO_SERVICE_TOKEN are not configured.");
    test.setTimeout(12 * 60_000);

    const peer = { username: botUsername };
    const outputDir = testInfo.outputPath("mtproto-discovery");
    fs.mkdirSync(outputDir, { recursive: true });

    const nodes: BotMapNode[] = [];
    const edges: BotMapEdge[] = [];
    const queue: string[][] = [[]];
    const visited = new Set<string>();

    while (queue.length > 0 && nodes.length < maxNodes) {
      const currentPath = queue.shift() || [];
      const currentId = nodeId(currentPath);
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const replayError = await replayPath(peer, currentPath);
      const state = await getMtprotoChatState(peer, stateLimit);
      const node = buildNode(currentId, currentPath, state.messages, replayError);
      nodes.push(node);

      if (!replayError && currentPath.length < maxDepth) {
        for (const button of node.buttons) {
          const nextPath = [...currentPath, button.text];
          const nextId = nodeId(nextPath);
          addEdge(edges, currentId, nextId, button.text, nextPath.length);
          if (!visited.has(nextId) && queue.length + nodes.length < maxNodes) {
            queue.push(nextPath);
          }
        }
      }
    }

    const map: BotMap = {
      schemaVersion: 1,
      runner: "mtproto-discovery",
      generatedAtIso: new Date().toISOString(),
      bot: botUsername,
      startPayload,
      limits: {
        maxDepth,
        maxNodes,
        maxButtonsPerNode,
        stateLimit
      },
      nodes,
      edges
    };

    const rawPath = path.join(outputDir, "bot-map.json");
    fs.writeFileSync(rawPath, JSON.stringify(map, null, 2), "utf8");

    const webTargetAudits = await auditWebTargets(page, map, outputDir);
    const webTargetAuditsPath = path.join(outputDir, "web-target-audits.json");
    fs.writeFileSync(webTargetAuditsPath, JSON.stringify(webTargetAudits, null, 2), "utf8");

    const enriched = await buildEnrichedBotMap(map, webTargetAudits);
    const enrichedPath = path.join(outputDir, "bot-map.enriched.json");
    fs.writeFileSync(enrichedPath, JSON.stringify(enriched, null, 2), "utf8");

    const qaReportPath = path.join(outputDir, "qa-report.md");
    fs.writeFileSync(qaReportPath, buildQaMarkdownReport(enriched), "utf8");

    await testInfo.attach("mtproto-bot-map", {
      path: rawPath,
      contentType: "application/json"
    });
    await testInfo.attach("mtproto-bot-map-enriched", {
      path: enrichedPath,
      contentType: "application/json"
    });
    await testInfo.attach("mtproto-web-target-audits", {
      path: webTargetAuditsPath,
      contentType: "application/json"
    });
    await testInfo.attach("mtproto-qa-report", {
      path: qaReportPath,
      contentType: "text/markdown"
    });
  });
});
