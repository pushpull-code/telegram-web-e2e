import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  clickInlineButtonByText,
  completeMiniAppHumanVerification,
  collectTailMessages,
  hasInlineButton,
  isComposerVisible,
  sendMessage,
  tailContainsAny
} from "./helpers/telegram-web";
import { botUsername, startDeepLinkUsAndroid } from "./helpers/bot-config";

const authStorageStatePath = path.resolve("playwright/.auth/user.json");
const scenarioStartDeepLink = startDeepLinkUsAndroid;
const FAST_MODE = process.env.E2E_FREELANCER_FAST === "1";
const RECOVERY_ATTEMPTS = Math.max(
  0,
  Number.parseInt(process.env.E2E_RECOVERY_ATTEMPTS || "1", 10) || 1
);
const STEP_TIMEOUT_MS = FAST_MODE ? 30_000 : 60_000;
const READY_TIMEOUT_MS = FAST_MODE ? 20_000 : 45_000;
const TEST_TIMEOUT_MS = FAST_MODE ? 90_000 : 150_000;
const TAIL_LIMIT = 120;

const START_ANCHORS = [
  "Нажми \"Я готов\"",
  "Нажми \"Я готов!\"",
  "Hit “I’m ready”",
  "Hit \"I’m ready\"",
  "I’m ready",
  "готов начать",
  "Привет",
  "Hey, champion",
  "Select the country where your Google Play account was registered",
  "Выберите страну"
];
const READY_STEP_ANCHORS = [
  "Мы платим реальные деньги",
  "Я не бот",
  "проверки",
  "We pay real money",
  "I am not a bot",
  "verification"
];
const VERIFICATION_SUCCESS_ANCHORS = [
  "Всё готово",
  "Пожалуйста, проверьте правильность введенных данных",
  "Страна вашего аккаунта",
  "Проверьте доступные задания, нажав /join_task",
  "Полный список команд доступен в меню бота",
  "Участвовать",
  "Everything is ready",
  "Please verify the accuracy of the entered data",
  "Country of your account",
  "Please check available tasks by clicking on /join_task",
  "The full list of commands is available in the bot",
  "Join"
];
const READY_OR_VERIFIED_ANCHORS = [...READY_STEP_ANCHORS, ...VERIFICATION_SUCCESS_ANCHORS];
const JOIN_TASK_ANCHORS = [
  "Вы зарегистрировались для выполнения задания",
  "К сожалению, в данный момент нет доступных задач",
  "Сейчас нет доступных заданий",
  "Но они скоро появятся",
  "You have been registered for the task",
  "Unfortunately, there are currently no available tasks",
  "There are no tasks available now",
  "There are no available tasks",
  "Следующий шаг для выполнения задачи",
  "Следующий шаг для завершения задачи",
  "Next step to complete the task",
  "Next step to finish the task",
  "Заказ уже взят другим фрилансером или завершен",
  "Order has already been taken by another freelancer or completed",
  "Мы платим реальные деньги"
];
const NO_TASK_ANCHORS = [
  "К сожалению, в данный момент нет доступных задач",
  "Сейчас нет доступных заданий",
  "There are no tasks available now",
  "There are no available tasks"
];
const ASSIGNED_TASK_ANCHORS = [
  "Вы зарегистрировались для выполнения задания",
  "You have been registered for the task"
];
const TASK_STEP_ANCHORS = [
  "Следующий шаг для выполнения задачи",
  "Следующий шаг для завершения задачи",
  "Next step to complete the task",
  "Next step to finish the task",
  "Пожалуйста, обратите внимание на этот шаг",
  "Please pay attention to this step",
  "Чтобы подтвердить, что вы действительно установили и открыли приложение",
  "Вы оценили приложение?",
  "Вы оставили отзыв?",
  "Did you rate the app?",
  "Did you leave a review?"
];
const TASK_WARNING_ANCHORS = [
  "Пожалуйста, обратите внимание на этот шаг",
  "Please pay attention to this step",
  "Открыть приложение",
  "Open app"
];
const SCREENSHOT_OR_REVIEW_ANCHORS = [
  "Чтобы подтвердить, что вы действительно установили и открыли приложение",
  "Вы оценили приложение?",
  "Вы оставили отзыв?",
  "Did you rate the app?",
  "Did you leave a review?"
];
const EARNINGS_ANCHORS = ["Общий заработок:", "Ожидающие одобрения:", "Total earnings:", "Pending approval:"];
const WITHDRAW_ANCHORS = [
  "Минимальная сумма для вывода 20 USD",
  "Минимальная сумма для вывода 20 USD.",
  "Minimum withdrawal amount is 20 USD",
  "Minimum amount for withdrawal is 20 USD",
  "Введите сумму вывода",
  "Enter withdrawal amount",
  "Доступно для вывода"
];
const DELETE_ME_ANCHORS = [
  "Пользователь удален",
  "Аккаунт удален",
  "Профиль удален",
  "Данные удалены",
  "Удалили ваш профиль",
  "Привет"
];
const READY_BUTTON_LABELS = ["Я готов!", "Я готов", "Участвовать", "I’m ready!", "I'm ready!"];
const SUBMIT_BUTTON_LABELS = ["Завершить задачу", "Finish task"];
const CANCEL_BUTTON_LABELS = ["Отменить задачу", "Cancel task"];
const OPEN_APP_BUTTON_LABELS = ["Открыть приложение", "Open app"];
const ANTI_BOT_BUTTON_LABELS = ["Я не бот", "I am not a bot"];

type TaskContext = {
  assigned: boolean;
  noTask: boolean;
  afterJoin: string[];
};

function findLastMessageIndex(messages: string[], fragment: string): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.includes(fragment)) {
      return index;
    }
  }
  return -1;
}

function containsAnyAnchor(messages: string[], anchors: string[]): boolean {
  return anchors.some((anchor) => messages.some((message) => message.includes(anchor)));
}

async function hasAnyInlineButton(page: Page, labels: string[]): Promise<boolean> {
  for (const label of labels) {
    if (await hasInlineButton(page, label)) {
      return true;
    }
  }
  return false;
}

async function clickAnyInlineButton(page: Page, labels: string[]): Promise<boolean> {
  for (const label of labels) {
    if (!(await hasInlineButton(page, label))) {
      continue;
    }
    await clickInlineButtonByText(page, label);
    return true;
  }
  return false;
}

async function openScenarioFromDeepLink(page: Page): Promise<void> {
  await page.goto(scenarioStartDeepLink, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => isComposerVisible(page), { timeout: READY_TIMEOUT_MS }).toBeTruthy();
}

async function closeWebAppPopupIfVisible(page: Page): Promise<void> {
  const closeCandidates = [
    page.getByRole("button", { name: /close|закрыть|×|x/i }).last(),
    page.locator("button[aria-label*='Close'], button[title*='Close']").last(),
    page.locator("button[aria-label*='Закрыть'], button[title*='Закрыть']").last(),
    page.locator("button[class*='_BrowserHeaderButton_']").first(),
    page.locator("button.btn-icon.close[class*='_close_']").first()
  ];

  for (const candidate of closeCandidates) {
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }
    await candidate.click().catch(() => {});
    await expect.poll(async () => candidate.isVisible().catch(() => false), { timeout: 2_000 }).toBeFalsy();
    return;
  }

  const hasVerificationIframe = await page
    .locator("iframe.payment-verification")
    .first()
    .isVisible()
    .catch(() => false);
  if (hasVerificationIframe) {
    const headerCloseButton = page.locator("button[class*='_BrowserHeaderButton_']").first();
    if (await headerCloseButton.isVisible().catch(() => false)) {
      await headerCloseButton.click().catch(() => {});
      await expect
        .poll(
          async () =>
            page.locator("iframe.payment-verification").first().isVisible().catch(() => false),
          { timeout: 2_000 }
        )
        .toBeFalsy();
    }
  }
}

async function dismissOpenLinkModalIfVisible(page: Page): Promise<void> {
  const cancelButton = page.getByRole("button", { name: /cancel|отмена/i }).first();
  if (await cancelButton.isVisible().catch(() => false)) {
    await cancelButton.click().catch(() => {});
    await expect
      .poll(async () => cancelButton.isVisible().catch(() => false), { timeout: 2_000 })
      .toBeFalsy();
  }
}

async function waitForAnyAnchors(
  page: Page,
  anchors: string[],
  tailLimit = TAIL_LIMIT,
  timeout = STEP_TIMEOUT_MS
): Promise<boolean> {
  try {
    await tailContainsAny(page, anchors, tailLimit, timeout);
    return true;
  } catch {
    return false;
  }
}

async function sendCommandAndWaitForAnchors(
  page: Page,
  command: string,
  anchors: string[],
  tailLimit = TAIL_LIMIT,
  timeout = STEP_TIMEOUT_MS
): Promise<string[]> {
  const before = await collectTailMessages(page, tailLimit);
  const beforeFingerprint = before.join("\n@@\n");
  const commandToken = command.trim();
  let matchedAfter: string[] = [];

  await sendMessage(page, command);

  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, tailLimit);
        if (tail.join("\n@@\n") === beforeFingerprint) {
          return false;
        }

        const lastCommandIndex = findLastMessageIndex(tail, commandToken);
        if (lastCommandIndex < 0) {
          return false;
        }

        const afterCommand = tail.slice(lastCommandIndex + 1);
        if (afterCommand.length === 0) {
          return false;
        }

        const matched = containsAnyAnchor(afterCommand, anchors);
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

async function waitForReadyOrVerified(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, TAIL_LIMIT);
        return containsAnyAnchor(tail.slice(-30), READY_OR_VERIFIED_ANCHORS);
      },
      { timeout: READY_TIMEOUT_MS }
    )
    .toBeTruthy();
}

async function isAntiBotStepDetected(page: Page): Promise<boolean> {
  const tail = await collectTailMessages(page, TAIL_LIMIT).catch(() => []);
  return containsAnyAnchor(tail.slice(-30), READY_STEP_ANCHORS);
}

async function isTaskStateActive(page: Page): Promise<boolean> {
  const tail = await collectTailMessages(page, TAIL_LIMIT).catch(() => []);
  if (containsAnyAnchor(tail.slice(-30), TASK_STEP_ANCHORS)) {
    return true;
  }

  return await hasAnyInlineButton(page, [...SUBMIT_BUTTON_LABELS, ...CANCEL_BUTTON_LABELS, ...OPEN_APP_BUTTON_LABELS]);
}

async function resolveAntiBotIfVisible(page: Page): Promise<boolean> {
  for (const label of ANTI_BOT_BUTTON_LABELS) {
    if (!(await hasInlineButton(page, label))) {
      continue;
    }

    try {
      const before = await collectTailMessages(page, TAIL_LIMIT);
      const beforeFingerprint = before.join("\n@@\n");
      const popupPromise = page.context().waitForEvent("page", { timeout: 8_000 }).catch(() => null);

      await clickInlineButtonByText(page, label);
      const popup = await popupPromise;
      await completeMiniAppHumanVerification(page, 12_000, popup);
      await closeWebAppPopupIfVisible(page);

      await expect
        .poll(
          async () => {
            const stillVisible = await hasInlineButton(page, label);
            const tail = await collectTailMessages(page, TAIL_LIMIT);
            const changed = tail.join("\n@@\n") !== beforeFingerprint;
            return !stillVisible || changed;
          },
          { timeout: 20_000 }
        )
        .toBeTruthy();
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function ensureReadyAndVerificationState(page: Page): Promise<void> {
  if (await isTaskStateActive(page)) {
    return;
  }

  const readyVisible = await hasAnyInlineButton(page, READY_BUTTON_LABELS);
  if (readyVisible) {
    const clicked = await clickAnyInlineButton(page, READY_BUTTON_LABELS);
    if (!clicked) {
      throw new Error("Ready button was visible but could not be clicked.");
    }
    await waitForReadyOrVerified(page);
  }

  if (await isTaskStateActive(page)) {
    return;
  }

  const antiBotStepDetected = await isAntiBotStepDetected(page);
  const antiBotVisible = await hasAnyInlineButton(page, ANTI_BOT_BUTTON_LABELS);
  if (!antiBotStepDetected || !antiBotVisible) {
    return;
  }

  const antiBotResolved = await resolveAntiBotIfVisible(page);
  if (!antiBotResolved) {
    if (await isTaskStateActive(page)) {
      return;
    }
    const verifiedAfterAttempt = await waitForAnyAnchors(
      page,
      VERIFICATION_SUCCESS_ANCHORS,
      TAIL_LIMIT,
      8_000
    );
    if (verifiedAfterAttempt) {
      return;
    }
    return;
  }

  if (antiBotResolved) {
    await waitForAnyAnchors(page, VERIFICATION_SUCCESS_ANCHORS, TAIL_LIMIT, 45_000);
  }
}

async function attachDiagnostics(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const screenshotPath = testInfo.outputPath(`${safeLabel}.png`);
  const tail = await collectTailMessages(page, TAIL_LIMIT).catch(() => []);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await testInfo.attach(`${safeLabel}-tail`, {
    body: tail.join("\n\n---\n\n"),
    contentType: "text/plain"
  });
  await testInfo.attach(`${safeLabel}-url`, {
    body: page.url(),
    contentType: "text/plain"
  });
  if (await page.locator("body").isVisible().catch(() => false)) {
    await testInfo.attach(`${safeLabel}-screenshot`, {
      path: screenshotPath,
      contentType: "image/png"
    });
  }
}

async function recoverScenarioState(page: Page, testInfo: TestInfo, label: string): Promise<boolean> {
  await attachDiagnostics(page, testInfo, `${label}-before-recover`);
  await dismissOpenLinkModalIfVisible(page);
  await closeWebAppPopupIfVisible(page);

  try {
    await openScenarioFromDeepLink(page);
    const stateDetected = await waitForAnyAnchors(
      page,
      [...START_ANCHORS, ...VERIFICATION_SUCCESS_ANCHORS, ...TASK_STEP_ANCHORS],
      TAIL_LIMIT,
      READY_TIMEOUT_MS
    );
    if (!stateDetected) {
      return false;
    }
    await ensureReadyAndVerificationState(page);
    await dismissOpenLinkModalIfVisible(page);
    return true;
  } catch {
    return false;
  }
}

async function runWithRecovery(
  page: Page,
  testInfo: TestInfo,
  label: string,
  action: () => Promise<void>
): Promise<void> {
  let attempt = 0;

  while (true) {
    try {
      await action();
      return;
    } catch (error) {
      await attachDiagnostics(page, testInfo, `${label}-attempt-${attempt + 1}-failed`);
      if (attempt >= RECOVERY_ATTEMPTS) {
        throw error;
      }

      attempt += 1;
      const recovered = await recoverScenarioState(page, testInfo, `${label}-recover-${attempt}`);
      if (!recovered) {
        throw error;
      }
    }
  }
}

async function getTaskContext(page: Page): Promise<TaskContext> {
  const afterJoin = await sendCommandAndWaitForAnchors(page, "/join_task", JOIN_TASK_ANCHORS, TAIL_LIMIT, STEP_TIMEOUT_MS);
  const noTask = containsAnyAnchor(afterJoin, NO_TASK_ANCHORS);
  const assigned =
    containsAnyAnchor(afterJoin, ASSIGNED_TASK_ANCHORS) || containsAnyAnchor(afterJoin, TASK_STEP_ANCHORS);

  return { assigned, noTask, afterJoin };
}

test.use({
  trace: "on",
  screenshot: "on",
  video: "on"
});

test.describe.serial("Telegram freelancer-like flow (us_1)", () => {
  let latestTaskContext: TaskContext = { assigned: false, noTask: false, afterJoin: [] };

  test.beforeAll(async ({ browser }) => {
    console.log(
      `Freelancer mode: username=${botUsername}, deepLink=${scenarioStartDeepLink}, fast=${FAST_MODE ? "1" : "0"}, recoveryAttempts=${RECOVERY_ATTEMPTS}`
    );

    let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
    try {
      context = await browser.newContext({ storageState: authStorageStatePath });
    } catch {
      context = await browser.newContext();
    }

    const page = await context.newPage();
    try {
      await openScenarioFromDeepLink(page);
      await sendMessage(page, "/deleteme");
    } catch {
      // best-effort reset only
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
    try {
      context = await browser.newContext({ storageState: authStorageStatePath });
    } catch {
      context = await browser.newContext();
    }

    const page = await context.newPage();
    try {
      await openScenarioFromDeepLink(page);
      await sendMessage(page, "/deleteme");
    } catch {
      // best-effort reset only
    } finally {
      await context.close();
    }
  });

  test("freelancer-001: deep-link opens onboarding or verified state", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await runWithRecovery(page, testInfo, "freelancer-001", async () => {
      await openScenarioFromDeepLink(page);
      const stateDetected = await waitForAnyAnchors(
        page,
        [...START_ANCHORS, ...VERIFICATION_SUCCESS_ANCHORS],
        TAIL_LIMIT,
        READY_TIMEOUT_MS
      );
      expect(stateDetected).toBeTruthy();
    });
  });

  test("freelancer-002: ready and anti-bot branch when present", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await runWithRecovery(page, testInfo, "freelancer-002", async () => {
      await openScenarioFromDeepLink(page);
      if (await isTaskStateActive(page)) {
        return;
      }

      const readyVisible = await hasAnyInlineButton(page, READY_BUTTON_LABELS);
      if (readyVisible) {
        const clickedReady = await clickAnyInlineButton(page, READY_BUTTON_LABELS);
        expect(clickedReady).toBeTruthy();
        await waitForReadyOrVerified(page);
      }

      if (await isTaskStateActive(page)) {
        return;
      }

      const antiBotStepDetected = await isAntiBotStepDetected(page);
      const antiBotVisible = await hasAnyInlineButton(page, ANTI_BOT_BUTTON_LABELS);
      if (antiBotStepDetected && antiBotVisible) {
        const antiBotResolved = await resolveAntiBotIfVisible(page);
        if (!antiBotResolved) {
          await waitForAnyAnchors(
            page,
            VERIFICATION_SUCCESS_ANCHORS,
            TAIL_LIMIT,
            10_000
          );
        }
      }

      const stableStateDetected = await waitForAnyAnchors(
        page,
        [...START_ANCHORS, ...READY_OR_VERIFIED_ANCHORS, ...TASK_STEP_ANCHORS],
        TAIL_LIMIT,
        15_000
      );
      expect(stableStateDetected).toBeTruthy();
    });
  });

  test("freelancer-003: /join_task returns task or no-task state", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await runWithRecovery(page, testInfo, "freelancer-003", async () => {
      await openScenarioFromDeepLink(page);
      await ensureReadyAndVerificationState(page);
      latestTaskContext = await getTaskContext(page);
      expect(latestTaskContext.assigned || latestTaskContext.noTask).toBeTruthy();
    });
  });

  test("freelancer-004: active task shows instruction/buttons and open-app modal branch", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await runWithRecovery(page, testInfo, "freelancer-004", async () => {
      await openScenarioFromDeepLink(page);
      await ensureReadyAndVerificationState(page);
      latestTaskContext = await getTaskContext(page);

      test.skip(latestTaskContext.noTask, "No active task is available in current bot state.");

      const hasTaskStep = await waitForAnyAnchors(page, TASK_STEP_ANCHORS, TAIL_LIMIT, STEP_TIMEOUT_MS);
      expect(hasTaskStep).toBeTruthy();

      const hasCancelButton = await hasAnyInlineButton(page, CANCEL_BUTTON_LABELS);
      expect(hasCancelButton).toBeTruthy();

      const hasSubmitButton = await hasAnyInlineButton(page, SUBMIT_BUTTON_LABELS);
      expect(hasSubmitButton).toBeTruthy();

      const hasOpenAppButton = await hasAnyInlineButton(page, OPEN_APP_BUTTON_LABELS);
      const warningInTail = containsAnyAnchor(await collectTailMessages(page, TAIL_LIMIT), TASK_WARNING_ANCHORS);
      if (warningInTail) {
        expect(hasOpenAppButton).toBeTruthy();
      }

      if (hasOpenAppButton) {
        const clicked = await clickAnyInlineButton(page, OPEN_APP_BUTTON_LABELS);
        expect(clicked).toBeTruthy();

        await expect
          .poll(
            async () =>
              (await page.getByRole("button", { name: /open|открыть/i }).first().isVisible().catch(() => false)) ||
              (await page.getByRole("button", { name: /cancel|отмена/i }).first().isVisible().catch(() => false)),
            { timeout: 10_000 }
          )
          .toBeTruthy();

        await dismissOpenLinkModalIfVisible(page);
        await expect.poll(async () => isComposerVisible(page), { timeout: 8_000 }).toBeTruthy();
      }
    });
  });

  test("freelancer-005: submit can loop warning/open-app or move to review/screenshot", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await runWithRecovery(page, testInfo, "freelancer-005", async () => {
      await openScenarioFromDeepLink(page);
      await ensureReadyAndVerificationState(page);
      latestTaskContext = await getTaskContext(page);

      test.skip(latestTaskContext.noTask, "No active task is available in current bot state.");

      const clickedSubmit = await clickAnyInlineButton(page, SUBMIT_BUTTON_LABELS);
      expect(clickedSubmit).toBeTruthy();

      const submitOutcomeDetected = await waitForAnyAnchors(
        page,
        [...SCREENSHOT_OR_REVIEW_ANCHORS, ...TASK_WARNING_ANCHORS, ...TASK_STEP_ANCHORS],
        TAIL_LIMIT,
        STEP_TIMEOUT_MS
      );
      expect(submitOutcomeDetected).toBeTruthy();
    });
  });

  test("freelancer-006: /view_earnings, /withdraw and final /deleteme", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    await runWithRecovery(page, testInfo, "freelancer-006", async () => {
      await openScenarioFromDeepLink(page);
      await ensureReadyAndVerificationState(page);

      await sendCommandAndWaitForAnchors(page, "/view_earnings", EARNINGS_ANCHORS, TAIL_LIMIT, STEP_TIMEOUT_MS);
      await sendCommandAndWaitForAnchors(page, "/withdraw", WITHDRAW_ANCHORS, TAIL_LIMIT, STEP_TIMEOUT_MS);

      try {
        await sendCommandAndWaitForAnchors(page, "/deleteme", DELETE_ME_ANCHORS, TAIL_LIMIT, STEP_TIMEOUT_MS);
      } catch {
        await sendMessage(page, "/deleteme");
      }
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== "passed") {
      await attachDiagnostics(page, testInfo, `${testInfo.title}-final-diagnostics`);
    }
    await dismissOpenLinkModalIfVisible(page);
    await closeWebAppPopupIfVisible(page);
  });
});
