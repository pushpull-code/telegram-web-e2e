import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  clickInlineButtonByText,
  collectTailMessages,
  hasInlineButton,
  openBotChat,
  sendFileAttachment,
  sendMessage
} from "./helpers/telegram-web";
import { botUsername } from "./helpers/bot-config";

const screenshotFixture = (() => {
  const makeTempUploadCopy = (sourcePath: string) => {
    const extension = path.extname(sourcePath) || ".png";
    const tempPath = path.join(os.tmpdir(), `telegram-e2e-upload${extension}`);
    fs.copyFileSync(sourcePath, tempPath);
    return tempPath;
  };

  const fromEnv = (process.env.E2E_APP_SCREENSHOT_PATH || "").trim();
  if (fromEnv) {
    const resolvedFromEnv = path.resolve(process.cwd(), fromEnv);
    if (!fs.existsSync(resolvedFromEnv)) {
      throw new Error(`Screenshot file from E2E_APP_SCREENSHOT_PATH was not found: ${resolvedFromEnv}`);
    }
    return makeTempUploadCopy(resolvedFromEnv);
  }

  const fallbackCandidates = [
    path.resolve(process.cwd(), "tests/fixtures/Screenshot_1.png"),
    path.resolve(process.cwd(), "tests/fixtures/app-screenshot.png"),
    path.resolve(process.cwd(), "tests/fixtures/white-1x1.png")
  ];

  const firstExisting = fallbackCandidates.find((candidate) => fs.existsSync(candidate));
  if (!firstExisting) {
    throw new Error(`Screenshot file not found. Checked: ${fallbackCandidates.join(", ")}`);
  }

  return makeTempUploadCopy(firstExisting);
})();

const skipFinalDelete = process.env.E2E_SKIP_DELETE_ME === "1";

const TAIL_LIMIT = 160;
const STEP_TIMEOUT_MS = 70_000;
const JOIN_TASK_ERROR_RETRY_COUNT = 2;
const JOIN_TASK_NO_TASK_RETRY_COUNT = 2;
const JOIN_TASK_NO_TASK_RETRY_DELAY_MS = 5_000;
const MAX_PHOTO_CYCLES = 1;

const START_ANCHORS = [
  'Нажми "Я готов"',
  'Нажми "Я готов!"',
  "Привет",
  "Проверьте доступные задания",
  "Выберите страну",
  "Какой у вас телефон",
  "Hey, champion!",
  "Hit \"I’m ready\" to start!",
  "Hit \"I'm ready\" to start!",
  "Earn up to $7 in 10 minutes"
];

const READY_BUTTON_LABELS = ["Я готов!", "Я готов", "Участвовать", "I'm ready!", "I’m ready!"];
const AFTER_READY_ANCHORS = [
  "Мы платим реальные деньги",
  "Я не бот",
  "Проверьте доступные задания",
  "/join_task",
  "Настройки профиля"
];
const READY_TO_JOIN_ANCHORS = [
  "/join_task",
  "Проверьте доступные задания",
  "Please check available tasks by clicking on /join_task"
];

const SETTINGS_MENU_ANCHORS = ["Изменить страну", "Сменить платформу", "Настройки профиля", "Страна:"];
const CHANGE_COUNTRY_BUTTON_LABELS = ["Изменить страну", "Change country"];
const CHANGE_PLATFORM_BUTTON_LABELS = ["Сменить платформу", "Change platform"];

const COUNTRY_CONFIRM_ANCHORS = ["Ваша страна Belarus", "Страна: 🇧🇾 Belarus", "Belarus"];
const PLATFORM_CONFIRM_ANCHORS = ["Платформа: Android", "Platform: Android", "Android"];

const JOIN_TASK_ANCHORS = [
  "Вы зарегистрировались для выполнения задания",
  "You have been registered for the task",
  "Следующий шаг для выполнения задачи",
  "К сожалению, в данный момент нет доступных задач",
  "Сейчас нет доступных заданий",
  "There are no tasks available now"
];
const JOIN_TASK_ERROR_ANCHORS = ["Произошла ошибка", "Если ошибка повторяется", "@remotenode"];
const NO_TASK_ANCHORS = [
  "К сожалению, в данный момент нет доступных задач",
  "Сейчас нет доступных заданий",
  "There are no tasks available now"
];

const SUBMIT_BUTTON_LABELS = ["Завершить задачу", "Finish task"];
const ACTIVE_TASK_ANCHORS = [
  "Вы зарегистрировались для выполнения задания",
  "You have been registered for the task",
  "ID:",
  "Статус: В процессе",
  "Статус:В процессе",
  "Status: In progress",
  "Этапы выполнения"
];
const ACTIVE_TASK_BUTTON_LABELS = [
  "Не могу найти приложение",
  "I can't find the app",
  "Отменить задачу",
  "Cancel task",
  ...SUBMIT_BUTTON_LABELS
];
const REVIEW_PROMPT_ANCHORS = ["Вы оставили отзыв?", "Вы оценили приложение?", "Did you leave a review?"];
const YES_BUTTON_LABELS = ["Да", "Yes"];
const NEXT_BUTTON_LABELS = ["Дальше", "Next"];

const SCREENSHOT_PROMPT_ANCHORS = [
  "Чтобы подтвердить, что вы действительно установили и открыли приложение",
  "Пожалуйста, не отправляйте скриншоты из магазина приложений"
];
const INVALID_SCREENSHOT_ANCHORS = ["Некорректное значение"];
const REVIEW_NOT_VISIBLE_ANCHORS = ["Твой отзыв на приложение", "пока не отображается в Google Play"];
const FINISH_BUTTON_LABELS = ["✅ Finish", "Finish", "Готово", "Завершить"];
const COMPLETION_ANCHORS = [
  "Поздравляем, вы успешно выполнили задание",
  "Как только наша система автоматически подтвердит"
];

const DELETE_ME_ANCHORS = ["Пользователь удален", "Аккаунт удален", "Данные удалены", "Deleted"];

const POST_PHOTO_ANCHORS = [
  ...SCREENSHOT_PROMPT_ANCHORS,
  ...INVALID_SCREENSHOT_ANCHORS,
  ...REVIEW_NOT_VISIBLE_ANCHORS,
  ...REVIEW_PROMPT_ANCHORS,
  ...COMPLETION_ANCHORS
];

const RESET_RELEVANT_ANCHORS = [
  ...ACTIVE_TASK_ANCHORS,
  ...SCREENSHOT_PROMPT_ANCHORS,
  ...REVIEW_PROMPT_ANCHORS,
  ...COMPLETION_ANCHORS,
  "Deleted"
];

function containsAny(messages: string[], anchors: string[]): boolean {
  return anchors.some((anchor) => messages.some((message) => message.includes(anchor)));
}

function findLastMessageIndex(messages: string[], fragment: string): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.includes(fragment)) {
      return index;
    }
  }
  return -1;
}

async function waitTailContainsAny(page: Page, anchors: string[], timeout = STEP_TIMEOUT_MS): Promise<string[]> {
  let matchedTail: string[] = [];
  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, TAIL_LIMIT);
        if (containsAny(tail, anchors)) {
          matchedTail = tail;
          return true;
        }
        return false;
      },
      { timeout }
    )
    .toBeTruthy();
  return matchedTail;
}

async function sendCommandAndWaitForAnchors(
  page: Page,
  command: string,
  anchors: string[],
  timeout = STEP_TIMEOUT_MS
): Promise<string[]> {
  const before = await collectTailMessages(page, TAIL_LIMIT);
  const beforeFingerprint = before.join("\n@@\n");
  const commandToken = command.trim();
  let matchedAfter: string[] = [];

  await sendMessage(page, command);

  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, TAIL_LIMIT);
        if (tail.join("\n@@\n") === beforeFingerprint) {
          return false;
        }

        const commandIndex = findLastMessageIndex(tail, commandToken);
        if (commandIndex < 0) {
          return false;
        }

        const afterCommand = tail.slice(commandIndex + 1);
        if (afterCommand.length === 0) {
          return false;
        }

        const matched = containsAny(afterCommand, anchors);
        if (matched) {
          matchedAfter = afterCommand;
        }
        return matched;
      },
      { timeout }
    )
    .toBeTruthy();

  return matchedAfter;
}

async function waitForTailChangeAndAnchors(
  page: Page,
  beforeFingerprint: string,
  anchors: string[],
  timeout = STEP_TIMEOUT_MS
): Promise<string[]> {
  let matchedTail: string[] = [];
  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, TAIL_LIMIT);
        if (tail.join("\n@@\n") === beforeFingerprint) {
          return false;
        }
        if (containsAny(tail, anchors)) {
          matchedTail = tail;
          return true;
        }
        return false;
      },
      { timeout }
    )
    .toBeTruthy();
  return matchedTail;
}

async function clickAnyInlineButton(page: Page, labels: string[]): Promise<string> {
  for (const label of labels) {
    if (await hasInlineButton(page, label)) {
      await clickInlineButtonByText(page, label);
      return label;
    }
  }
  throw new Error(`None of inline buttons is visible: ${labels.join(", ")}`);
}

async function waitAnyInlineButton(page: Page, labels: string[], timeout = 30_000): Promise<string> {
  let matched = "";
  await expect
    .poll(
      async () => {
        for (const label of labels) {
          if (await hasInlineButton(page, label)) {
            matched = label;
            return true;
          }
        }
        return false;
      },
      { timeout }
    )
    .toBeTruthy();
  return matched;
}

async function hasAnyInlineButton(page: Page, labels: string[]): Promise<boolean> {
  for (const label of labels) {
    if (await hasInlineButton(page, label)) {
      return true;
    }
  }
  return false;
}

async function hasActiveTaskCard(page: Page): Promise<boolean> {
  if (await hasAnyInlineButton(page, ACTIVE_TASK_BUTTON_LABELS)) {
    return true;
  }

  const tail = await collectTailMessages(page, TAIL_LIMIT);
  return containsAny(tail, ACTIVE_TASK_ANCHORS);
}

async function sendJoinTaskWithRecovery(page: Page): Promise<string[]> {
  const anchors = [...JOIN_TASK_ANCHORS, ...JOIN_TASK_ERROR_ANCHORS];
  let lastAfterJoin: string[] = [];
  let errorRetriesLeft = JOIN_TASK_ERROR_RETRY_COUNT - 1;
  let noTaskRetriesLeft = JOIN_TASK_NO_TASK_RETRY_COUNT;

  for (let attempt = 1; attempt <= JOIN_TASK_ERROR_RETRY_COUNT + JOIN_TASK_NO_TASK_RETRY_COUNT + 1; attempt++) {
    if (await hasActiveTaskCard(page)) {
      return await collectTailMessages(page, TAIL_LIMIT);
    }

    lastAfterJoin = await sendCommandAndWaitForAnchors(page, "/join_task", anchors, 80_000);
    const hasError = containsAny(lastAfterJoin, JOIN_TASK_ERROR_ANCHORS);
    if (hasError) {
      if (errorRetriesLeft > 0) {
        errorRetriesLeft -= 1;
        await page.waitForTimeout(1_500);
        continue;
      }
      return lastAfterJoin;
    }

    const hasNoTask = containsAny(lastAfterJoin, NO_TASK_ANCHORS);
    if (hasNoTask) {
      if (await hasActiveTaskCard(page)) {
        return lastAfterJoin;
      }
      if (noTaskRetriesLeft > 0) {
        noTaskRetriesLeft -= 1;
        await page.waitForTimeout(JOIN_TASK_NO_TASK_RETRY_DELAY_MS);
        continue;
      }
      return lastAfterJoin;
    }

    return lastAfterJoin;
  }

  return lastAfterJoin;
}

async function reachScreenshotPrompt(page: Page, timeout = 120_000): Promise<void> {
  const startedAt = Date.now();
  let lastAction: "submit" | "yes" | "next" | "belarus" | null = null;
  let lastActionFingerprint = "";

  while (Date.now() - startedAt < timeout) {
    const tail = await collectTailMessages(page, TAIL_LIMIT);
    const fingerprint = tail.slice(-8).join("\n@@\n");

    if (containsAny(tail, SCREENSHOT_PROMPT_ANCHORS) || containsAny(tail, INVALID_SCREENSHOT_ANCHORS)) {
      return;
    }

    const canClickSubmit = await hasAnyInlineButton(page, SUBMIT_BUTTON_LABELS);
    const canClickYes = await hasAnyInlineButton(page, YES_BUTTON_LABELS);
    const hasReviewNotVisibleText = containsAny(tail, REVIEW_NOT_VISIBLE_ANCHORS);
    const hasReviewPromptText = containsAny(tail, REVIEW_PROMPT_ANCHORS);

    if (
      canClickSubmit &&
      (hasReviewNotVisibleText || !canClickYes) &&
      !(lastAction === "submit" && lastActionFingerprint === fingerprint)
    ) {
      await clickAnyInlineButton(page, SUBMIT_BUTTON_LABELS);
      lastAction = "submit";
      lastActionFingerprint = fingerprint;
      await page.waitForTimeout(2_000);
      continue;
    }

    if (
      canClickYes &&
      (hasReviewPromptText || !canClickSubmit) &&
      !(lastAction === "yes" && lastActionFingerprint === fingerprint)
    ) {
      await clickAnyInlineButton(page, YES_BUTTON_LABELS);
      lastAction = "yes";
      lastActionFingerprint = fingerprint;
      await page.waitForTimeout(2_000);
      continue;
    }

    if (
      await hasInlineButton(page, "Belarus") &&
      !(lastAction === "belarus" && lastActionFingerprint === fingerprint)
    ) {
      await clickInlineButtonByText(page, "Belarus");
      lastAction = "belarus";
      lastActionFingerprint = fingerprint;
      await page.waitForTimeout(800);
      continue;
    }

    if (
      await hasAnyInlineButton(page, NEXT_BUTTON_LABELS) &&
      !(lastAction === "next" && lastActionFingerprint === fingerprint)
    ) {
      await clickAnyInlineButton(page, NEXT_BUTTON_LABELS);
      lastAction = "next";
      lastActionFingerprint = fingerprint;
      await page.waitForTimeout(1_200);
      continue;
    }

    lastAction = null;
    lastActionFingerprint = fingerprint;
    await page.waitForTimeout(800);
  }

  throw new Error("Could not reach screenshot prompt in time.");
}

async function waitForCompletionOrFinish(page: Page, timeout = 45_000): Promise<boolean> {
  const startedAt = Date.now();
  let lastFinishFingerprint = "";

  while (Date.now() - startedAt < timeout) {
    const tail = await collectTailMessages(page, TAIL_LIMIT);
    if (containsAny(tail, COMPLETION_ANCHORS)) {
      return true;
    }

    const fingerprint = tail.slice(-10).join("\n@@\n");
    const finishVisible = await hasAnyInlineButton(page, FINISH_BUTTON_LABELS);
    if (finishVisible && lastFinishFingerprint !== fingerprint) {
      await clickAnyInlineButton(page, FINISH_BUTTON_LABELS);
      lastFinishFingerprint = fingerprint;
      await page.waitForTimeout(1_500);
      continue;
    }

    await page.waitForTimeout(900);
  }

  return false;
}

async function shouldSendReset(page: Page): Promise<boolean> {
  const tail = await collectTailMessages(page, TAIL_LIMIT);
  return containsAny(tail, RESET_RELEVANT_ANCHORS);
}

test.use({
  trace: "on",
  screenshot: "on",
  video: "on"
});

test("strict text-guard autorun (fails on scenario drift)", async ({ page }) => {
  test.setTimeout(12 * 60_000);
  let completionReached = false;

  try {
    await openBotChat(page, botUsername);

    // Reset only if chat context indicates previous bot flow state.
    if (await shouldSendReset(page)) {
      await sendCommandAndWaitForAnchors(page, "/deleteme", DELETE_ME_ANCHORS, 40_000).catch(() => {});
      await page.waitForTimeout(1_200);
    }

    await sendCommandAndWaitForAnchors(page, "/start", START_ANCHORS, 45_000);

    if (await hasAnyInlineButton(page, READY_BUTTON_LABELS)) {
      await clickAnyInlineButton(page, READY_BUTTON_LABELS);
      await waitTailContainsAny(page, AFTER_READY_ANCHORS, 45_000);
    }

    let taskAlreadyActive = await hasActiveTaskCard(page);

    if (!taskAlreadyActive) {
      await sendCommandAndWaitForAnchors(page, "/settings", SETTINGS_MENU_ANCHORS, 45_000);
      await clickAnyInlineButton(page, CHANGE_COUNTRY_BUTTON_LABELS);
      await waitAnyInlineButton(page, ["Belarus"], 20_000);
      await clickInlineButtonByText(page, "Belarus");
      await waitTailContainsAny(page, COUNTRY_CONFIRM_ANCHORS, 45_000);

      await sendCommandAndWaitForAnchors(page, "/settings", SETTINGS_MENU_ANCHORS, 45_000);
      await clickAnyInlineButton(page, CHANGE_PLATFORM_BUTTON_LABELS);
      await waitAnyInlineButton(page, ["Android"], 20_000);
      await clickInlineButtonByText(page, "Android");
      await waitTailContainsAny(page, PLATFORM_CONFIRM_ANCHORS, 45_000);

      taskAlreadyActive = await hasActiveTaskCard(page);
    }

    if (!taskAlreadyActive) {
      await waitTailContainsAny(page, READY_TO_JOIN_ANCHORS, 45_000);
      const afterJoin = await sendJoinTaskWithRecovery(page);
      if (containsAny(afterJoin, JOIN_TASK_ERROR_ANCHORS)) {
        throw new Error("Scenario stopped: /join_task returned error branch after retry.");
      }
      if (containsAny(afterJoin, NO_TASK_ANCHORS)) {
        throw new Error(
          "Scenario stopped: /join_task returned no-task branch after country/platform were selected."
        );
      }
    }

    let photoResponseObserved = false;

    for (let cycle = 1; cycle <= MAX_PHOTO_CYCLES && !completionReached; cycle++) {
      await reachScreenshotPrompt(page);

      const before = await collectTailMessages(page, TAIL_LIMIT);
      const beforeFingerprint = before.join("\n@@\n");

      await sendFileAttachment(page, screenshotFixture, { mode: "photo" });

      let afterPhoto: string[] = [];
      try {
        afterPhoto = await waitForTailChangeAndAnchors(page, beforeFingerprint, POST_PHOTO_ANCHORS, STEP_TIMEOUT_MS);
        photoResponseObserved = true;
      } catch {
        afterPhoto = await collectTailMessages(page, TAIL_LIMIT);
      }

      if (containsAny(afterPhoto, COMPLETION_ANCHORS)) {
        completionReached = true;
        break;
      }

      const completionAfterFinish = await waitForCompletionOrFinish(page, 45_000);
      if (completionAfterFinish) {
        completionReached = true;
        break;
      }

      await page.waitForTimeout(1_500);
    }

    expect(photoResponseObserved, "Photo upload response was not observed in bot messages.").toBeTruthy();
    expect(completionReached, "Task did not reach completion branch after photo retries.").toBeTruthy();
  } finally {
    // Strict text-driven cleanup: send /deleteme only after confirmed completion branch.
    if (!skipFinalDelete && completionReached) {
      await sendCommandAndWaitForAnchors(page, "/deleteme", DELETE_ME_ANCHORS, 40_000).catch(() => {});
    }
  }
});
