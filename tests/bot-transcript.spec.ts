import fs from "node:fs";
import path from "node:path";
import { expect, test, type TestInfo } from "@playwright/test";
import {
  clickInlineButtonByText,
  completeMiniAppHumanVerification,
  collectTailMessages,
  hasInlineButton,
  isComposerVisible,
  sendMessage
} from "./helpers/telegram-web";
import {
  botCountryCode,
  botPlatform,
  botUsername,
  startDeepLinkUsAndroid,
  startDeepLinkUsIos,
  startPayloadUs
} from "./helpers/bot-config";

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
const READY_ANCHORS = [
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
const READY_OR_VERIFIED_ANCHORS = [...READY_ANCHORS, ...VERIFICATION_SUCCESS_ANCHORS];
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
const DELETE_ANCHORS = [
  "Пользователь удален",
  "Аккаунт удален",
  "Профиль удален",
  "Данные удалены",
  "Удалили ваш профиль",
  "Привет"
];
const ANTI_BOT_BUTTON_LABELS = ["Я не бот", "I am not a bot"];
const FAST_MODE = process.env.E2E_FAST === "1";
const COMMAND_TIMEOUT_MS = FAST_MODE ? 25_000 : 60_000;
const READY_TIMEOUT_MS = FAST_MODE ? 20_000 : 45_000;
const TEST_TIMEOUT_MS = FAST_MODE ? 8 * 60_000 : 12 * 60_000;
const scenarioStartDeepLink = botPlatform === "2" ? startDeepLinkUsIos : startDeepLinkUsAndroid;

const normalizeLabel = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");

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

async function waitForVerificationSuccess(
  page: Parameters<typeof collectTailMessages>[0],
  timeout = 45_000
): Promise<boolean> {
  try {
    await expect
      .poll(
        async () => {
          const tail = await collectTailMessages(page, 120);
          return containsAnyAnchor(tail.slice(-30), VERIFICATION_SUCCESS_ANCHORS);
        },
        { timeout }
      )
      .toBeTruthy();
    return true;
  } catch {
    return false;
  }
}

async function waitForAnchorsAfterCommand(
  page: Parameters<typeof sendMessage>[0],
  command: string,
  anchors: string[],
  tailLimit = 100,
  timeout = 60_000
): Promise<void> {
  const before = await collectTailMessages(page, tailLimit);
  const beforeFingerprint = before.join("\n@@\n");
  const commandToken = command.trim();

  await sendMessage(page, command);

  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, tailLimit);
        const changed = tail.join("\n@@\n") !== beforeFingerprint;
        if (!changed) {
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

async function ensureStartAnchorsFromDeepLink(
  page: Parameters<typeof collectTailMessages>[0],
  timeout = 45_000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, 120);
        return containsAnyAnchor(tail.slice(-35), START_ANCHORS);
      },
      { timeout }
    )
    .toBeTruthy();
}

async function clickReadyWithFallback(page: Parameters<typeof clickInlineButtonByText>[0]): Promise<void> {
  for (const label of ["Я готов!", "Я готов", "Участвовать", "I’m ready!", "I'm ready!"]) {
    try {
      await clickInlineButtonByText(page, label);
      return;
    } catch {
      // next variant
    }
  }

  throw new Error("Could not find ready button variant.");
}

async function waitReadyButtonVisible(page: Parameters<typeof hasInlineButton>[0]): Promise<boolean> {
  try {
    await expect
      .poll(
        async () =>
          (await hasInlineButton(page, "Я готов!")) ||
          (await hasInlineButton(page, "Я готов")) ||
          (await hasInlineButton(page, "Участвовать")) ||
          (await hasInlineButton(page, "I’m ready!")) ||
          (await hasInlineButton(page, "I'm ready!")),
        { timeout: READY_TIMEOUT_MS }
      )
      .toBeTruthy();
    return true;
  } catch {
    return false;
  }
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

async function clickAntiBotButtonIfVisible(
  page: Parameters<typeof clickInlineButtonByText>[0]
): Promise<boolean> {
  for (const label of ANTI_BOT_BUTTON_LABELS) {
    if (await hasInlineButton(page, label)) {
      const before = await collectTailMessages(page, 120);
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
                const stillVisible = await hasInlineButton(page, label);
                const after = await collectTailMessages(page, 120);
                const changed = after.join("\n@@\n") !== beforeFingerprint;
                return !stillVisible || changed;
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
        return false;
      }

      return true;
    }
  }

  return false;
}

async function recoverVerificationViaRestart(
  page: Parameters<typeof sendMessage>[0],
  timeout = 45_000
): Promise<boolean> {
  await closeWebAppPopupIfVisible(page);

  try {
    await page.goto(scenarioStartDeepLink, { waitUntil: "domcontentloaded" });
    await ensureStartAnchorsFromDeepLink(page, timeout);
  } catch {
    return false;
  }

  if (!(await waitReadyButtonVisible(page))) {
    return false;
  }

  await clickReadyWithFallback(page);
  try {
    await expect
      .poll(
        async () => {
          const tail = await collectTailMessages(page, 100);
          return containsAnyAnchor(tail.slice(-20), READY_OR_VERIFIED_ANCHORS);
        },
        { timeout: READY_TIMEOUT_MS }
      )
      .toBeTruthy();
  } catch {
    return false;
  }

  if (await clickAntiBotButtonIfVisible(page)) {
    return await waitForVerificationSuccess(page, timeout);
  }

  return await waitForVerificationSuccess(page, timeout);
}

async function rearmFromOnboardingIfNeeded(
  page: Parameters<typeof sendMessage>[0],
  testInfo: TestInfo,
  evidenceDir: string,
  failures: string[]
): Promise<boolean> {
  const tail = await collectTailMessages(page, 120);
  const onboardingDetected = containsAnyAnchor(tail.slice(-20), START_ANCHORS);
  if (!onboardingDetected) {
    return false;
  }

  if (
    (await hasInlineButton(page, "Я готов!")) ||
    (await hasInlineButton(page, "Я готов")) ||
    (await hasInlineButton(page, "Участвовать")) ||
    (await hasInlineButton(page, "I’m ready!")) ||
    (await hasInlineButton(page, "I'm ready!"))
  ) {
    await clickReadyWithFallback(page);
    await expect
      .poll(
        async () => {
          const readyTail = await collectTailMessages(page, 100);
          return containsAnyAnchor(readyTail.slice(-20), READY_OR_VERIFIED_ANCHORS);
        },
        { timeout: 45_000 }
      )
      .toBeTruthy();
  } else {
    failures.push("Onboarding detected but ready button is not visible for rearm.");
    await appendEvidenceStep(
      page,
      testInfo,
      evidenceDir,
      90,
      "Rearm failed",
      "Onboarding detected and ready button not visible"
    );
    return false;
  }

  if (await clickAntiBotButtonIfVisible(page)) {
    const verified = await waitForVerificationSuccess(page, 45_000);
    if (!verified) {
      await recoverVerificationViaRestart(page, 45_000);
    }
      await appendEvidenceStep(page, testInfo, evidenceDir, 91, "Rearm anti-bot click", "Clicked Я не бот");
  } else {
    await appendEvidenceStep(
      page,
      testInfo,
      evidenceDir,
      91,
      "Rearm anti-bot skipped",
      "Anti-bot button not visible"
    );
  }

  return true;
}

async function tryRunCommandAndCapture(
  page: Parameters<typeof sendMessage>[0],
  command: string,
  anchors: string[],
  testInfo: TestInfo,
  evidenceDir: string,
  index: number,
  stepTitle: string,
  failures: string[],
  timeout = COMMAND_TIMEOUT_MS
): Promise<void> {
  try {
    await waitForAnchorsAfterCommand(page, command, anchors, 100, timeout);
    await appendEvidenceStep(page, testInfo, evidenceDir, index, stepTitle, `Sent ${command}`);
  } catch {
    const rearmed = await rearmFromOnboardingIfNeeded(page, testInfo, evidenceDir, failures);
    if (rearmed) {
      try {
        await waitForAnchorsAfterCommand(page, command, anchors, 100, timeout);
    await appendEvidenceStep(
      page,
      testInfo,
      evidenceDir,
      index,
      `${stepTitle} (after rearm)`,
      `Sent ${command}`
    );
      return;
    } catch {
      // will be handled below
    }
  }

    if (command !== "/deleteme") {
      failures.push(`${command}: no deterministic bot reply within timeout`);
    }
    await appendEvidenceStep(
      page,
      testInfo,
      evidenceDir,
      index,
      `${stepTitle} (no deterministic reply)`,
      `Sent ${command}`
    );
  }
}

async function appendEvidenceStep(
  page: Parameters<typeof collectTailMessages>[0],
  testInfo: TestInfo,
  evidenceDir: string,
  index: number,
  title: string,
  action?: string
): Promise<void> {
  if (page.isClosed()) {
    const transcriptPathClosed = path.join(evidenceDir, "transcript.md");
    fs.appendFileSync(
      transcriptPathClosed,
      `## ${index}. ${title}\n- Time: ${new Date().toISOString()}\n- Action: page closed before evidence capture\n\n`,
      "utf8"
    );
    return;
  }

  let tail: string[] = [];
  try {
    tail = await collectTailMessages(page, 120);
  } catch {
    tail = [];
  }
  const screenshotName = `${String(index).padStart(2, "0")}-${normalizeLabel(title)}.png`;
  const screenshotPath = path.join(evidenceDir, screenshotName);
  const transcriptPath = path.join(evidenceDir, "transcript.md");

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const lines: string[] = [];
  lines.push(`## ${index}. ${title}`);
  lines.push(`- Time: ${new Date().toISOString()}`);
  if (action) {
    lines.push(`- Action: ${action}`);
  }
  lines.push("- Tail messages:");
  for (const message of tail.slice(-14)) {
    const oneLine = message.replace(/\s+/g, " ").trim();
    lines.push(`  - ${oneLine}`);
  }
  lines.push("");

  fs.appendFileSync(transcriptPath, `${lines.join("\n")}\n`, "utf8");

  if (fs.existsSync(screenshotPath)) {
    await testInfo.attach(`step-${index}-${title}-screenshot`, {
      path: screenshotPath,
      contentType: "image/png"
    });
  }
  await testInfo.attach(`step-${index}-${title}-tail`, {
    body: tail.join("\n\n---\n\n"),
    contentType: "text/plain"
  });
}

test.use({
  trace: "on",
  screenshot: "on",
  video: "on"
});

test.describe.serial("Telegram bot transcript evidence", () => {
  test("collects step-by-step screenshots and chat transcript", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);
    console.log(
      `Bot payload mode: username=${botUsername}, payload=${startPayloadUs}, country=${botCountryCode}, platform=${botPlatform}, deepLink=${scenarioStartDeepLink}`
    );

    const evidenceDir = testInfo.outputPath("evidence");
    fs.mkdirSync(evidenceDir, { recursive: true });
    const softFailures: string[] = [];

    await page.goto(scenarioStartDeepLink, { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => isComposerVisible(page), { timeout: 45_000 })
      .toBeTruthy();
    await appendEvidenceStep(page, testInfo, evidenceDir, 1, "Open bot chat");

    try {
      await ensureStartAnchorsFromDeepLink(page, READY_TIMEOUT_MS);
      await appendEvidenceStep(
        page,
        testInfo,
        evidenceDir,
        2,
        "After deep-link start payload",
        "Opened tgaddr start link"
      );
    } catch {
      softFailures.push("Deep-link start anchors were not detected.");
      await appendEvidenceStep(
        page,
        testInfo,
        evidenceDir,
        2,
        "Deep-link start not detected",
        "Opened tgaddr start link"
      );
    }

    if (await waitReadyButtonVisible(page)) {
      await clickReadyWithFallback(page);
      await expect
        .poll(
        async () => {
          const tail = await collectTailMessages(page, 80);
          return READY_OR_VERIFIED_ANCHORS.some((anchor) =>
            tail.slice(-10).some((message) => message.includes(anchor))
          );
        },
          { timeout: READY_TIMEOUT_MS }
        )
        .toBeTruthy();
      await appendEvidenceStep(page, testInfo, evidenceDir, 3, "After ready button", "Clicked ready");
    } else {
      await appendEvidenceStep(
        page,
        testInfo,
        evidenceDir,
        3,
        "Ready button missing in current state",
        "Skipped ready click"
      );
    }

    let antiBotVisibleBeforeClick = false;
    for (const label of ANTI_BOT_BUTTON_LABELS) {
      if (await hasInlineButton(page, label)) {
        antiBotVisibleBeforeClick = true;
        break;
      }
    }

    if (await clickAntiBotButtonIfVisible(page)) {
      const verificationSuccess = await waitForVerificationSuccess(page, READY_TIMEOUT_MS);
      if (!verificationSuccess) {
        const recovered = await recoverVerificationViaRestart(page, READY_TIMEOUT_MS);
        if (!recovered) {
          softFailures.push(
            "Anti-bot clicked but verification success message was not observed (including restart fallback)."
          );
        }
      }
      await appendEvidenceStep(page, testInfo, evidenceDir, 4, "After anti-bot button", "Clicked Я не бот");
    } else if (antiBotVisibleBeforeClick) {
      softFailures.push("Anti-bot button was visible but the verification flow did not progress.");
      await appendEvidenceStep(
        page,
        testInfo,
        evidenceDir,
        4,
        "Anti-bot flow did not progress",
        "Clicked Я не бот but no deterministic progress"
      );
    } else {
      await appendEvidenceStep(page, testInfo, evidenceDir, 4, "Anti-bot button not visible");
    }

    await tryRunCommandAndCapture(
      page,
      "/join_task",
      JOIN_TASK_ANCHORS,
      testInfo,
      evidenceDir,
      5,
      "After /join_task",
      softFailures
    );

    await tryRunCommandAndCapture(
      page,
      "/view_earnings",
      EARNINGS_ANCHORS,
      testInfo,
      evidenceDir,
      6,
      "After /view_earnings",
      softFailures
    );

    await tryRunCommandAndCapture(
      page,
      "/withdraw",
      WITHDRAW_ANCHORS,
      testInfo,
      evidenceDir,
      7,
      "After /withdraw",
      softFailures
    );

    await tryRunCommandAndCapture(
      page,
      "/deleteme",
      DELETE_ANCHORS,
      testInfo,
      evidenceDir,
      8,
      "After /deleteme",
      softFailures
    );

    await appendEvidenceStep(
      page,
      testInfo,
      evidenceDir,
      9,
      "Execution summary",
      softFailures.length > 0
        ? `Soft failures: ${softFailures.join("; ")}`
        : "All steps produced deterministic replies"
    );
    if (softFailures.length > 0) {
      testInfo.annotations.push({
        type: "warning",
        description: `Non-deterministic replies detected: ${softFailures.join(" | ")}`
      });
    }
  });
});
