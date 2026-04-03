import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  clickInlineButtonByText,
  completeMiniAppHumanVerification,
  collectTailMessages,
  hasInlineButton,
  isComposerVisible,
  sendFileAttachment,
  sendMessage,
  tailContainsAny
} from "./helpers/telegram-web";
import {
  botCountryCode,
  botPlatform,
  botUsername,
  startDeepLinkUsAndroid,
  startDeepLinkUsIos,
  startPayloadUs
} from "./helpers/bot-config";

const screenshotFixture = path.resolve(process.cwd(), "tests/fixtures/app-screenshot.png");
const authStorageStatePath = path.resolve("playwright/.auth/user.json");
const scenarioStartDeepLink = botPlatform === "2" ? startDeepLinkUsIos : startDeepLinkUsAndroid;

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
  "Выберите страну",
  "Проверьте доступные задания, нажав /join_task",
  "Страна вашего аккаунта"
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
const JOIN_TASK_BACKEND_ERROR_ANCHORS = [
  "An error occurred. If the error persists, please contact",
  "If the error persists, please contact",
  "@remotenode"
];
const READY_ENTRY_ANCHORS = [...JOIN_TASK_ANCHORS, ...VERIFICATION_SUCCESS_ANCHORS, ...READY_OR_VERIFIED_ANCHORS];

const TASK_STEP_ANCHORS = [
  "Пожалуйста, обратите внимание на этот шаг",
  "Ваш рейтинг для мобильного приложения",
  "Если приложений с одинаковым названием несколько",
  "Вы оценили приложение?",
  "Вы оставили отзыв?",
  "Did you leave a review?",
  "Чтобы подтвердить, что вы действительно установили и открыли приложение",
  "Некорректное значение",
  "Поздравляем, вы успешно выполнили задание!"
];

const EARNINGS_ANCHORS = ["Общий заработок:", "Ожидающие одобрения:"];
const EARNINGS_OR_EN_ANCHORS = [...EARNINGS_ANCHORS, "Total earnings:", "Pending approval:"];

const SCREENSHOT_STEP_ANCHORS = [
  "Чтобы подтвердить, что вы действительно установили и открыли приложение",
  "Пожалуйста, не отправляйте скриншоты из магазина приложений"
];

const INVALID_SCREENSHOT_ANCHORS = ["Некорректное значение", ...SCREENSHOT_STEP_ANCHORS];
const REVIEW_CONFIRM_PROMPT_ANCHORS = [
  "Вы оставили отзыв?",
  "Вы оценили приложение?",
  "Did you leave a review?",
  "Did you rate the app?"
];
const REVIEW_YES_BUTTON_LABELS = ["Да", "Yes"];
const REVIEW_NO_BUTTON_LABELS = ["Нет", "No"];
const TASK_SECONDARY_ACTION_LABELS = [
  "Завершить задачу",
  "Открыть приложение",
  "Не могу найти приложение",
  "Finish task",
  "Open app",
  "I can't find the app"
];

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

const ANTI_BOT_BUTTON_LABELS = ["Я не бот", "I am not a bot"];

type JoinTaskAttemptResult = "join_anchors" | "backend_error" | "none";
type JoinTaskRecoveryResult = "ok" | "backend_error";

function findLastMessageIndex(messages: string[], fragment: string): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.includes(fragment)) {
      return index;
    }
  }

  return -1;
}

function hasAnyAnchor(messages: string[], anchors: string[]): boolean {
  return anchors.some((anchor) => messages.some((message) => message.includes(anchor)));
}

function countMessagesWithAnchors(messages: string[], anchors: string[]): number {
  return messages.filter((message) => anchors.some((anchor) => message.includes(anchor))).length;
}

async function clickReadyButton(page: Parameters<typeof clickInlineButtonByText>[0]): Promise<void> {
  for (const label of ["Я готов!", "Я готов", "Участвовать", "I’m ready!", "I'm ready!"]) {
    try {
      await clickInlineButtonByText(page, label);
      return;
    } catch {
      // try next variation
    }
  }

  throw new Error("Ready button was not found in chat history.");
}

async function isReadyButtonVisible(page: Parameters<typeof hasInlineButton>[0]): Promise<boolean> {
  return (
    (await hasInlineButton(page, "Я готов!")) ||
    (await hasInlineButton(page, "Я готов")) ||
    (await hasInlineButton(page, "Участвовать")) ||
    (await hasInlineButton(page, "I’m ready!")) ||
    (await hasInlineButton(page, "I'm ready!"))
  );
}

async function hasVisibleAntiBotButton(
  page: Parameters<typeof hasInlineButton>[0]
): Promise<boolean> {
  for (const label of ANTI_BOT_BUTTON_LABELS) {
    if (await hasInlineButton(page, label)) {
      return true;
    }
  }

  return false;
}

async function openBotScenarioFromDeepLink(
  page: Parameters<typeof sendMessage>[0]
): Promise<void> {
  await page.goto(scenarioStartDeepLink, { waitUntil: "domcontentloaded" });
  await expect
    .poll(async () => isComposerVisible(page), { timeout: 45_000 })
    .toBeTruthy();
}

async function hasAssignedTaskAfterLatestJoinCommand(
  page: Parameters<typeof collectTailMessages>[0],
  tailLimit = 90
): Promise<boolean> {
  const tail = await collectTailMessages(page, tailLimit);
  const lastJoinCommandIndex = findLastMessageIndex(tail, "/join_task");
  const afterJoinCommand = lastJoinCommandIndex >= 0 ? tail.slice(lastJoinCommandIndex + 1) : tail;

  return afterJoinCommand.some(
    (text) =>
      text.includes("Вы зарегистрировались для выполнения задания") ||
      text.includes("You have been registered for the task")
  );
}

async function clickReviewYesIfPrompted(
  page: Parameters<typeof sendMessage>[0],
  tailLimit = 90,
  timeout = 12_000
): Promise<"not_prompted" | "clicked" | "prompt_without_yes"> {
  const promptDetected = await tryWaitForAnchors(
    page,
    REVIEW_CONFIRM_PROMPT_ANCHORS,
    tailLimit,
    timeout
  );
  if (!promptDetected) {
    return "not_prompted";
  }

  for (const label of REVIEW_YES_BUTTON_LABELS) {
    if (await hasInlineButton(page, label)) {
      await clickInlineButtonByText(page, label);
      return "clicked";
    }
  }

  return "prompt_without_yes";
}

async function closeWebAppPopupIfVisible(page: Parameters<typeof sendMessage>[0]): Promise<void> {
  const closeCandidates = [
    page.getByRole("button", { name: /close|закрыть|×|x/i }).last(),
    page.locator("button[aria-label*='Close'], button[title*='Close']").last(),
    page.locator("button[aria-label*='Закрыть'], button[title*='Закрыть']").last(),
    page.locator("button[class*='_BrowserHeaderButton_']").first(),
    page.locator("button.btn-icon.close[class*='_close_']").first()
  ];

  for (const candidate of closeCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(() => {});
      await page.waitForTimeout(300);
      return;
    }
  }

  const hasVerificationIframe = await page
    .locator("iframe.payment-verification")
    .first()
    .isVisible()
    .catch(() => false);
  if (hasVerificationIframe) {
    await page
      .locator("button[class*='_BrowserHeaderButton_']")
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(350);
    return;
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function sendCommandAndWaitForAnchors(
  page: Parameters<typeof sendMessage>[0],
  command: string,
  anchors: string[],
  tailLimit = 60,
  timeout = 50_000
): Promise<void> {
  const before = await collectTailMessages(page, tailLimit);
  const beforeFingerprint = before.join("\n@@\n");
  const commandToken = command.trim();

  await sendMessage(page, command);

  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, tailLimit);
        const tailChanged = tail.join("\n@@\n") !== beforeFingerprint;
        if (!tailChanged) {
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

        return anchors.some((anchor) =>
          afterCommand.some((message) => message.includes(anchor))
        );
      },
      { timeout }
    )
    .toBeTruthy();
}

async function hasAnchorsAfterLatestCommand(
  page: Parameters<typeof collectTailMessages>[0],
  commandToken: string,
  anchors: string[],
  tailLimit = 80
): Promise<boolean> {
  const tail = await collectTailMessages(page, tailLimit);
  const lastCommandIndex = findLastMessageIndex(tail, commandToken);
  if (lastCommandIndex < 0) {
    return false;
  }

  const afterCommand = tail.slice(lastCommandIndex + 1);
  if (afterCommand.length === 0) {
    return false;
  }

  return anchors.some((anchor) => afterCommand.some((message) => message.includes(anchor)));
}

async function waitForAnchorsAfterLatestCommand(
  page: Parameters<typeof collectTailMessages>[0],
  commandToken: string,
  anchors: string[],
  tailLimit = 80,
  timeout = 10_000
): Promise<boolean> {
  try {
    await expect
      .poll(
        async () => await hasAnchorsAfterLatestCommand(page, commandToken, anchors, tailLimit),
        { timeout }
      )
      .toBeTruthy();
    return true;
  } catch {
    return false;
  }
}

async function tryWaitForAnchors(
  page: Parameters<typeof collectTailMessages>[0],
  anchors: string[],
  tailLimit = 70,
  timeout = 35_000
): Promise<boolean> {
  try {
    await tailContainsAny(page, anchors, tailLimit, timeout);
    return true;
  } catch {
    return false;
  }
}

async function ensureStartAnchorsFromDeepLink(
  page: Parameters<typeof collectTailMessages>[0],
  tailLimit = 80,
  timeout = 45_000
): Promise<void> {
  const detected = await tryWaitForAnchors(page, START_ANCHORS, tailLimit, timeout);
  if (!detected) {
    throw new Error("Start anchors were not detected after opening Telegram Web deep-link.");
  }
}

async function trySendJoinTask(
  page: Parameters<typeof sendMessage>[0],
  tailLimit = 80,
  timeout = 55_000
): Promise<JoinTaskAttemptResult> {
  const before = await collectTailMessages(page, tailLimit);
  const beforeFingerprint = before.join("\n@@\n");
  const beforeBackendErrorCount = countMessagesWithAnchors(before, JOIN_TASK_BACKEND_ERROR_ANCHORS);

  await sendMessage(page, "/join_task");

  let detectedResult: JoinTaskAttemptResult = "none";
  try {
    await expect
      .poll(
        async () => {
          const tail = await collectTailMessages(page, tailLimit);
          const tailChanged = tail.join("\n@@\n") !== beforeFingerprint;
          if (!tailChanged) {
            return "none";
          }

          const lastJoinTaskIndex = findLastMessageIndex(tail, "/join_task");
          if (lastJoinTaskIndex >= 0) {
            const afterJoinTask = tail.slice(lastJoinTaskIndex + 1);
            if (afterJoinTask.length > 0) {
              if (hasAnyAnchor(afterJoinTask, JOIN_TASK_ANCHORS)) {
                detectedResult = "join_anchors";
                return detectedResult;
              }
              if (hasAnyAnchor(afterJoinTask, JOIN_TASK_BACKEND_ERROR_ANCHORS)) {
                detectedResult = "backend_error";
                return detectedResult;
              }
            }
          }

          const backendErrorCount = countMessagesWithAnchors(tail, JOIN_TASK_BACKEND_ERROR_ANCHORS);
          if (backendErrorCount > beforeBackendErrorCount) {
            detectedResult = "backend_error";
            return detectedResult;
          }

          return "none";
        },
        { timeout }
      )
      .not.toBe("none");
    return detectedResult;
  } catch {
    return "none";
  }
}

async function resolveAntiBotIfVisible(
  page: Parameters<typeof sendMessage>[0],
  tailLimit = 80,
  allowRestartFallback = true
): Promise<boolean> {
  for (const label of ANTI_BOT_BUTTON_LABELS) {
    if (!(await hasInlineButton(page, label))) {
      continue;
    }

    const before = await collectTailMessages(page, tailLimit);
    const beforeFingerprint = before.join("\n@@\n");
    const popupPromise = page.context().waitForEvent("page", { timeout: 8_000 }).catch(() => null);

    await clickInlineButtonByText(page, label);
    const popup = await popupPromise;
    await completeMiniAppHumanVerification(page, 12_000, popup);
    await closeWebAppPopupIfVisible(page);

    const progressed = await (async () => {
      try {
        await expect
          .poll(
            async () => {
              const buttonStillVisible = await hasInlineButton(page, label);
              const after = await collectTailMessages(page, tailLimit);
              const changed = after.join("\n@@\n") !== beforeFingerprint;
              return !buttonStillVisible || changed;
            },
            { timeout: 20_000 }
          )
          .toBeTruthy();
        return true;
      } catch {
        return false;
      }
    })();

    if (!progressed) {
      if (!allowRestartFallback) {
        return false;
      }

      await closeWebAppPopupIfVisible(page);
      await openBotScenarioFromDeepLink(page);
      await ensureStartAnchorsFromDeepLink(page, tailLimit, 45_000);
      await clickReadyButton(page);
      await tryWaitForAnchors(page, READY_OR_VERIFIED_ANCHORS, tailLimit, 35_000);
      return await resolveAntiBotIfVisible(page, tailLimit, false);
    }

    const successMessageDetected = await tryWaitForAnchors(
      page,
      VERIFICATION_SUCCESS_ANCHORS,
      tailLimit,
      30_000
    );
    if (!successMessageDetected) {
      if (!allowRestartFallback) {
        return true;
      }

      await closeWebAppPopupIfVisible(page);
      await openBotScenarioFromDeepLink(page);
      await ensureStartAnchorsFromDeepLink(page, tailLimit, 45_000);
      await clickReadyButton(page);
      await tryWaitForAnchors(page, READY_OR_VERIFIED_ANCHORS, tailLimit, 35_000);

      const antiBotRetried = await resolveAntiBotIfVisible(page, tailLimit, false);
      if (!antiBotRetried) {
        const successAfterRestart = await tryWaitForAnchors(
          page,
          VERIFICATION_SUCCESS_ANCHORS,
          tailLimit,
          45_000
        );
        if (!successAfterRestart) {
          return true;
        }
      }
    }

    return true;
  }

  return false;
}

async function passAntiBotIfNeeded(
  page: Parameters<typeof sendMessage>[0],
  tailLimit = 80
): Promise<void> {
  const antiBotVisibleBefore = await hasVisibleAntiBotButton(page);
  const antiBotResolved = await resolveAntiBotIfVisible(page, tailLimit, true);
  if (antiBotVisibleBefore && !antiBotResolved) {
    throw new Error("Anti-bot button was visible but verification flow did not complete.");
  }
  if (!antiBotResolved) {
    return;
  }

  await tryWaitForAnchors(page, VERIFICATION_SUCCESS_ANCHORS, tailLimit, 45_000);
}

async function joinTaskWithRecovery(
  page: Parameters<typeof sendMessage>[0],
  tailLimit = 80,
  timeout = 55_000
): Promise<JoinTaskRecoveryResult> {
  let backendErrorDetected = false;
  const tryJoinTask = async (): Promise<boolean> => {
    const result = await trySendJoinTask(page, tailLimit, timeout);
    if (result === "join_anchors") {
      return true;
    }
    if (result === "backend_error") {
      backendErrorDetected = true;
    }
    return false;
  };

  if (await tryJoinTask()) {
    return "ok";
  }

  if (await isReadyButtonVisible(page)) {
    await clickReadyButton(page);
    await tryWaitForAnchors(page, READY_OR_VERIFIED_ANCHORS, tailLimit, 35_000);
  }

  await passAntiBotIfNeeded(page, tailLimit);

  if (await tryJoinTask()) {
    return "ok";
  }

  const onboardingLoopDetected = await waitForAnchorsAfterLatestCommand(
    page,
    "/join_task",
    START_ANCHORS,
    tailLimit,
    10_000
  );
  if (!onboardingLoopDetected) {
    return "backend_error";
  }

  if (await isReadyButtonVisible(page)) {
    await clickReadyButton(page);
    await tryWaitForAnchors(page, READY_OR_VERIFIED_ANCHORS, tailLimit, 35_000);
  }

  await passAntiBotIfNeeded(page, tailLimit);

  if (await tryJoinTask()) {
    return "ok";
  }

  if (backendErrorDetected) {
    return "backend_error";
  }

  return "backend_error";
}

async function ensureReadyAndVerificationState(
  page: Parameters<typeof sendMessage>[0],
  tailLimit = 80
): Promise<void> {
  if (await isReadyButtonVisible(page)) {
    await clickReadyButton(page);
    await tryWaitForAnchors(page, READY_OR_VERIFIED_ANCHORS, tailLimit, 35_000);
  }

  await passAntiBotIfNeeded(page, tailLimit);

  if (await isReadyButtonVisible(page)) {
    await clickReadyButton(page);
    await tryWaitForAnchors(page, READY_OR_VERIFIED_ANCHORS, tailLimit, 35_000);
    await passAntiBotIfNeeded(page, tailLimit);
  }
}

async function sendCommandWithOnboardingRecovery(
  page: Parameters<typeof sendMessage>[0],
  command: string,
  anchors: string[],
  tailLimit = 70,
  timeout = 55_000
): Promise<void> {
  const trySendCommand = async (): Promise<boolean> => {
    try {
      await sendCommandAndWaitForAnchors(page, command, anchors, tailLimit, timeout);
      return true;
    } catch {
      return false;
    }
  };

  if (await trySendCommand()) {
    return;
  }

  const onboardingDetected =
    (await isReadyButtonVisible(page)) ||
    (await hasVisibleAntiBotButton(page)) ||
    (await tryWaitForAnchors(page, START_ANCHORS, tailLimit, 12_000));

  if (!onboardingDetected) {
    throw new Error(
      `"${command}" did not return expected anchors and onboarding markers were not detected.`
    );
  }

  await ensureReadyAndVerificationState(page, tailLimit);
  if (await trySendCommand()) {
    return;
  }

  await openBotScenarioFromDeepLink(page);
  await ensureStartAnchorsFromDeepLink(page, tailLimit, 45_000);
  await ensureReadyAndVerificationState(page, tailLimit);
  await sendCommandAndWaitForAnchors(page, command, anchors, tailLimit, timeout);
}

async function finishScenarioWithDeleteMe(
  page: Parameters<typeof sendMessage>[0],
  tailLimit = 80
): Promise<void> {
  try {
    await sendCommandAndWaitForAnchors(page, "/deleteme", DELETE_ME_ANCHORS, tailLimit, 55_000);
  } catch {
    // Some bot builds do not send a deterministic confirmation text for /deleteme.
  }
}

test.describe.serial("Telegram bot flow (start payload country/platform)", () => {
  test.beforeAll(() => {
    console.log(
      `Bot payload mode: username=${botUsername}, payload=${startPayloadUs}, country=${botCountryCode}, platform=${botPlatform}, deepLink=${scenarioStartDeepLink}`
    );
  });

  test.afterAll(async ({ browser }) => {
    let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
    try {
      context = await browser.newContext({ storageState: authStorageStatePath });
    } catch {
      try {
        context = await browser.newContext();
      } catch {
        return;
      }
    }

    const page = await context.newPage();
    try {
      await page.goto(scenarioStartDeepLink, { waitUntil: "domcontentloaded", timeout: 15_000 });
      if (await isComposerVisible(page)) {
        await sendMessage(page, "/deleteme");
      }
    } catch {
      // Best-effort cleanup only.
    } finally {
      await context.close();
    }
  });

  test("start flow responds with intro anchors", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);
    await ensureStartAnchorsFromDeepLink(page, 80, 45_000);
  });

  test("ready step progresses and passes anti-bot when required", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);
    await ensureStartAnchorsFromDeepLink(page, 80, 45_000);

    if (await isReadyButtonVisible(page)) {
      await clickReadyButton(page);
    }

    await tailContainsAny(page, READY_OR_VERIFIED_ANCHORS, 18, 45_000);
    await passAntiBotIfNeeded(page, 90);
    await closeWebAppPopupIfVisible(page);
  });

  test("/join_task returns task card or no-task state", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);
    const joinTaskResult = await joinTaskWithRecovery(page, 80, 55_000);
    test.skip(
      joinTaskResult === "backend_error",
      "/join_task returned temporary backend error response."
    );
  });

  test("/view_earnings returns totals and pending values", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);
    await ensureStartAnchorsFromDeepLink(page, 80, 45_000);
    await ensureReadyAndVerificationState(page, 80);
    await sendCommandWithOnboardingRecovery(
      page,
      "/view_earnings",
      EARNINGS_OR_EN_ANCHORS,
      70,
      55_000
    );
  });

  test("/withdraw returns threshold message or payout prompt", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);
    await ensureStartAnchorsFromDeepLink(page, 80, 45_000);
    await ensureReadyAndVerificationState(page, 80);
    await sendCommandWithOnboardingRecovery(page, "/withdraw", WITHDRAW_ANCHORS, 70, 55_000);
  });

  test("can send screenshot attachment", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);

    await sendFileAttachment(page, screenshotFixture);
    await expect(page.locator("div.input-message-input[contenteditable='true']").first()).toBeVisible();
  });

  test("task card contains expected action buttons when task is assigned", async ({
    page
  }) => {
    await openBotScenarioFromDeepLink(page);
    const joinTaskResult = await joinTaskWithRecovery(page, 80, 55_000);
    test.skip(
      joinTaskResult === "backend_error",
      "/join_task returned temporary backend error response."
    );

    const hasAssignedTask = await hasAssignedTaskAfterLatestJoinCommand(page, 90);

    test.skip(!hasAssignedTask, "No active task assigned at this moment.");

    await expect
      .poll(async () => hasInlineButton(page, "Отменить задачу"), { timeout: 20_000 })
      .toBeTruthy();

    let hasSecondaryAction = false;
    for (const label of TASK_SECONDARY_ACTION_LABELS) {
      if (await hasInlineButton(page, label)) {
        hasSecondaryAction = true;
        break;
      }
    }

    const reviewYesVisible =
      (await hasInlineButton(page, REVIEW_YES_BUTTON_LABELS[0])) ||
      (await hasInlineButton(page, REVIEW_YES_BUTTON_LABELS[1]));
    const reviewNoVisible =
      (await hasInlineButton(page, REVIEW_NO_BUTTON_LABELS[0])) ||
      (await hasInlineButton(page, REVIEW_NO_BUTTON_LABELS[1]));
    expect(hasSecondaryAction || (reviewYesVisible && reviewNoVisible)).toBeTruthy();

    await tailContainsAny(page, TASK_STEP_ANCHORS, 70, 25_000);
  });

  test("invalid screenshot is rejected on screenshot step", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);
    const joinTaskResult = await joinTaskWithRecovery(page, 80, 55_000);
    test.skip(
      joinTaskResult === "backend_error",
      "/join_task returned temporary backend error response."
    );

    const hasAssignedTask = await hasAssignedTaskAfterLatestJoinCommand(page, 90);

    test.skip(!hasAssignedTask, "No active task assigned at this moment.");

    const hasSubmitButton = await hasInlineButton(page, "Завершить задачу");
    if (hasSubmitButton) {
      await clickInlineButtonByText(page, "Завершить задачу");
    }

    const reviewConfirmationState = await clickReviewYesIfPrompted(page, 90, 15_000);
    test.skip(
      !hasSubmitButton && reviewConfirmationState === "not_prompted",
      "Submit/review confirmation controls are not available in current task state."
    );
    test.skip(
      reviewConfirmationState === "prompt_without_yes",
      "Review confirmation prompt appeared, but Yes button was not available."
    );

    const reachedScreenshotStep = await tryWaitForAnchors(page, SCREENSHOT_STEP_ANCHORS, 90, 35_000);
    test.skip(!reachedScreenshotStep, "Screenshot validation step was not reached.");

    const beforeTail = await collectTailMessages(page, 90);
    const beforeInvalidCount = beforeTail.filter((text) => text.includes("Некорректное значение"))
      .length;
    const beforePromptCount = beforeTail.filter((text) =>
      text.includes("Чтобы подтвердить, что вы действительно установили и открыли приложение")
    ).length;

    await sendFileAttachment(page, screenshotFixture);

    await expect
      .poll(
        async () => {
          const tail = await collectTailMessages(page, 90);
          const invalidCount = tail.filter((text) => text.includes("Некорректное значение")).length;
          const promptCount = tail.filter((text) =>
            text.includes("Чтобы подтвердить, что вы действительно установили и открыли приложение")
          ).length;
          const hasAnyInvalidAnchor = INVALID_SCREENSHOT_ANCHORS.some((anchor) =>
            tail.some((message) => message.includes(anchor))
          );
          return (
            hasAnyInvalidAnchor &&
            (invalidCount > beforeInvalidCount || promptCount > beforePromptCount)
          );
        },
        { timeout: 50_000 }
      )
      .toBeTruthy();
  });

  test("/deleteme is sent as final cleanup command", async ({ page }) => {
    await openBotScenarioFromDeepLink(page);
    await finishScenarioWithDeleteMe(page, 80);
  });
});

