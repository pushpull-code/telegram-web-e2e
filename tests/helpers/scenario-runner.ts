import fs from "node:fs";
import path from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  clickInlineButtonByText,
  collectTailMessages,
  hasInlineButton,
  isComposerVisible,
  openBotChat,
  sendFileAttachment,
  sendMessage,
  type AttachmentMode
} from "./telegram-web";
import { botUsername } from "./bot-config";
import { EvidenceRecorder } from "./evidence";

export type ScenarioAttachment = {
  path: string;
  mode?: AttachmentMode;
};

export type ScenarioStep = {
  name: string;
  openBot?: boolean;
  openStartPayload?: string;
  send?: string;
  clickButton?: string;
  clickButtonAny?: string[];
  sendAttachment?: ScenarioAttachment;
  waitMs?: number;
  expectComposer?: boolean;
  expectTextAny?: string[];
  expectButtonAny?: string[];
  timeoutMs?: number;
  optional?: boolean;
  requireFreshResponse?: boolean;
};

export type ScenarioDefinition = {
  name: string;
  bot?: string;
  continueOnFailure?: boolean;
  tailLimit?: number;
  timeoutMs?: number;
  steps: ScenarioStep[];
};

export type ScenarioRunResult = {
  scenario: string;
  failures: string[];
};

const TELEGRAM_WEB_DEFAULT_URL = "https://web.telegram.org/k/";

function resolveScenarioPath(input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
}

function expandEnvString(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_, name: string, fallback = "") => {
    const envValue = process.env[name];
    return envValue && envValue.length > 0 ? envValue : fallback;
  });
}

function expandEnv(value: unknown): unknown {
  if (typeof value === "string") {
    return expandEnvString(value);
  }
  if (Array.isArray(value)) {
    return value.map(expandEnv);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, expandEnv(entry)])
    );
  }
  return value;
}

export function expandScenarioEnv<T>(value: T): T {
  return expandEnv(value) as T;
}

function assertScenario(value: unknown): asserts value is ScenarioDefinition {
  if (!value || typeof value !== "object") {
    throw new Error("Scenario file must contain a JSON object.");
  }

  const candidate = value as Partial<ScenarioDefinition>;
  if (!candidate.name || typeof candidate.name !== "string") {
    throw new Error("Scenario must contain string field: name.");
  }
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) {
    throw new Error("Scenario must contain non-empty array field: steps.");
  }

  for (const [index, step] of candidate.steps.entries()) {
    if (!step || typeof step !== "object" || !step.name || typeof step.name !== "string") {
      throw new Error(`Scenario step #${index + 1} must contain string field: name.`);
    }
  }
}

export function loadScenarioFromEnv(): ScenarioDefinition {
  const scenarioPath = resolveScenarioPath(
    process.env.SCENARIO_FILE || path.join("scenarios", "rate2cash-basic.json")
  );
  const raw = fs.readFileSync(scenarioPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const expanded = expandEnv(parsed);
  assertScenario(expanded);
  return expanded;
}

export function buildTelegramWebStartLink(bot: string, payload: string): string {
  const webBase = (process.env.TELEGRAM_WEB_URL || TELEGRAM_WEB_DEFAULT_URL)
    .trim()
    .replace(/\/+$/, "");
  const username = bot.replace(/^@/, "");
  const tMeLink = `https://t.me/${username}?start=${payload}`;

  return `${webBase}/#?tgaddr=${encodeURIComponent(tMeLink)}`;
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function waitForTailTextAny(
  page: Page,
  anchors: string[],
  options: {
    beforeFingerprint?: string;
    requireFreshResponse: boolean;
    tailLimit: number;
    timeoutMs: number;
  }
): Promise<void> {
  const normalizedAnchors = anchors.map(normalizeForMatch).filter(Boolean);

  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, options.tailLimit);
        const fingerprint = tail.join("\n@@\n");
        if (options.requireFreshResponse && fingerprint === options.beforeFingerprint) {
          return false;
        }

        return normalizedAnchors.some((anchor) =>
          tail.some((message) => normalizeForMatch(message).includes(anchor))
        );
      },
      { timeout: options.timeoutMs }
    )
    .toBeTruthy();
}

async function waitForButtonAny(page: Page, labels: string[], timeoutMs: number): Promise<string> {
  let found = "";

  await expect
    .poll(
      async () => {
        for (const label of labels) {
          if (await hasInlineButton(page, label)) {
            found = label;
            return true;
          }
        }
        return false;
      },
      { timeout: timeoutMs }
    )
    .toBeTruthy();

  return found;
}

async function clickButtonAny(page: Page, labels: string[], timeoutMs: number): Promise<string> {
  const label = await waitForButtonAny(page, labels, timeoutMs);
  await clickInlineButtonByText(page, label);
  return label;
}

function resolveAttachmentPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function actionSummary(step: ScenarioStep, bot: string): string {
  const actions: string[] = [];
  if (step.openBot) {
    actions.push(`open @${bot.replace(/^@/, "")}`);
  }
  if (step.openStartPayload) {
    actions.push(`open start payload ${step.openStartPayload}`);
  }
  if (step.send) {
    actions.push(`send ${step.send}`);
  }
  if (step.clickButton) {
    actions.push(`click ${step.clickButton}`);
  }
  if (step.clickButtonAny?.length) {
    actions.push(`click any: ${step.clickButtonAny.join(" | ")}`);
  }
  if (step.sendAttachment) {
    actions.push(`attach ${step.sendAttachment.path}`);
  }
  if (step.waitMs) {
    actions.push(`wait ${step.waitMs}ms`);
  }
  return actions.join("; ") || "assert current state";
}

async function runStep(
  page: Page,
  step: ScenarioStep,
  bot: string,
  tailLimit: number
): Promise<void> {
  const timeoutMs = step.timeoutMs ?? 45_000;
  const tailBefore = await collectTailMessages(page, tailLimit).catch(() => []);
  const beforeFingerprint = tailBefore.join("\n@@\n");
  let hasActionThatCanChangeChat = false;

  if (step.openBot) {
    await openBotChat(page, bot);
  }

  if (step.openStartPayload) {
    await page.goto(buildTelegramWebStartLink(bot, step.openStartPayload), {
      waitUntil: "domcontentloaded"
    });
    hasActionThatCanChangeChat = true;
  }

  if (step.send) {
    await sendMessage(page, step.send);
    hasActionThatCanChangeChat = true;
  }

  if (step.clickButton) {
    await clickInlineButtonByText(page, step.clickButton);
    hasActionThatCanChangeChat = true;
  }

  if (step.clickButtonAny?.length) {
    await clickButtonAny(page, step.clickButtonAny, timeoutMs);
    hasActionThatCanChangeChat = true;
  }

  if (step.sendAttachment) {
    await sendFileAttachment(page, resolveAttachmentPath(step.sendAttachment.path), {
      mode: step.sendAttachment.mode
    });
    hasActionThatCanChangeChat = true;
  }

  if (step.waitMs && step.waitMs > 0) {
    await page.waitForTimeout(step.waitMs);
  }

  if (step.expectComposer) {
    await expect.poll(async () => isComposerVisible(page), { timeout: timeoutMs }).toBeTruthy();
  }

  if (step.expectTextAny?.length) {
    await waitForTailTextAny(page, step.expectTextAny, {
      beforeFingerprint,
      requireFreshResponse: step.requireFreshResponse ?? hasActionThatCanChangeChat,
      tailLimit,
      timeoutMs
    });
  }

  if (step.expectButtonAny?.length) {
    await waitForButtonAny(page, step.expectButtonAny, timeoutMs);
  }
}

export async function runScenario(
  page: Page,
  testInfo: TestInfo,
  scenario: ScenarioDefinition
): Promise<ScenarioRunResult> {
  const bot = scenario.bot || botUsername;
  const tailLimit = scenario.tailLimit ?? 120;
  const evidence = new EvidenceRecorder(testInfo, `scenario-${scenario.name}`);
  const failures: string[] = [];

  for (const [index, step] of scenario.steps.entries()) {
    const stepIndex = index + 1;
    const action = actionSummary(step, bot);
    try {
      await runStep(page, step, bot, tailLimit);
      await evidence.append(page, stepIndex, step.name, "passed", action);
    } catch (error) {
      await evidence.append(page, stepIndex, step.name, "failed", action, error);
      if (!step.optional) {
        failures.push(`${step.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!scenario.continueOnFailure) {
        break;
      }
    }
  }

  evidence.flush();
  return { scenario: scenario.name, failures };
}
