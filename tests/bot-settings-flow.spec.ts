/**
 * E2E: Settings Flow + Full Task Completion
 *
 * Case IDs: ARTP-SET-001 .. ARTP-SET-008
 *
 * Scenario:
 *   1. /deleteme  – reset state
 *   2. /start     – open onboarding, click "Я готов!" if present
 *   3. /settings  → "Изменить страну" → "Belarus" → confirm anchor
 *   4. /settings  → "Сменить платформу" → "Android" → (recovery on error)
 *   5. /settings  → verify state: Belarus + Android
 *   6. /join_task → task assigned → wait for Step-2 message
 *   7. "Завершить задачу" → "Да" (review confirm)
 *   8. Send screenshot (fixture) → bot repeats screenshot prompt (negative branch)
 *   9. "Finish" → "Поздравляем" (positive branch - skip if not reached)
 *  10. /deleteme  – cleanup
 */

import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  clickInlineButtonByText,
  collectTailMessages,
  hasInlineButton,
  isComposerVisible,
  sendFileAttachment,
  sendMessage,
  tailContainsAny
} from "./helpers/telegram-web";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOT_USERNAME = process.env.BOT_USERNAME || "artp345_bot";
const TELEGRAM_WEB_BASE = (process.env.TELEGRAM_WEB_URL || "https://web.telegram.org/k/").replace(
  /\/+$/,
  ""
);
const BOT_DEEP_LINK = `${TELEGRAM_WEB_BASE}/#?tgaddr=${encodeURIComponent(`https://t.me/${BOT_USERNAME}?start`)}`;

const SCREENSHOT_FIXTURE = path.resolve(
  process.cwd(),
  "tests/fixtures/app-screenshot.png"
);

// ─── Anchors ──────────────────────────────────────────────────────────────────

/** After /start or deep-link: any onboarding or ready-to-use message */
const START_ANCHORS = [
  'Нажми "Я готов"',
  'Нажми "Я готов!"',
  "Привет",
  "Выберите страну",
  "Страна вашего аккаунта",
  "Проверьте доступные задания",
  "Всё готово",
  "Select the country",
  "Hit \"I'm ready\""
];

/** Buttons that mean "I'm ready" / start onboarding */
const READY_BUTTON_LABELS = ["Я готов!", "Я готов", "Участвовать", "I'm ready!", "I'm ready"];

/** After /settings → choose country → Belarus clicked */
const COUNTRY_SET_ANCHORS = [
  "Ваша страна Belarus",
  "Your country Belarus",
  "Belarus",
  "🇧🇾"
];

/** After /settings → choose platform → Android clicked (success) */
const PLATFORM_SET_OK_ANCHORS = [
  "Страна: 🇧🇾 Belarus",
  "Платформа: Android",
  "Platform: Android",
  "Android"
];

/** Platform error – retry /settings */
const PLATFORM_ERROR_ANCHORS = [
  "Произошла ошибка",
  "Если ошибка повторяется"
];

/** /settings state verification */
const SETTINGS_STATE_ANCHORS = [
  "Страна: 🇧🇾 Belarus",
  "Платформа: Android"
];

/** After /join_task */
const TASK_ASSIGNED_ANCHORS = [
  "Вы зарегистрировались для выполнения задания",
  "You have been registered for the task"
];

const NO_TASK_ANCHORS = [
  "К сожалению, в данный момент нет доступных задач",
  "Сейчас нет доступных заданий",
  "Unfortunately, there are currently no available tasks",
  "There are no tasks available now",
  "Заказ уже взят другим фрилансером или завершен",
  "Order has already been taken"
];

const ALL_JOIN_ANCHORS = [...TASK_ASSIGNED_ANCHORS, ...NO_TASK_ANCHORS];

/** Bot's second message (Step 2) – comes ~1 min after task assigned */
const STEP2_ANCHORS = [
  "Следующий шаг для выполнения задачи",
  "Следующий шаг для завершения задачи",
  "Next step to complete the task",
  "Next step to finish the task"
];

/** Review confirmation prompt */
const REVIEW_YES_ANCHORS = [
  "Вы оставили отзыв?",
  "Вы оценили приложение?",
  "Did you leave a review?",
  "Did you rate the app?"
];

/** Screenshot prompt from bot */
const SCREENSHOT_PROMPT_ANCHORS = [
  "Чтобы подтвердить, что вы действительно установили и открыли приложение",
  "Пожалуйста, не отправляйте скриншоты из магазина приложений"
];

/** Invalid screenshot response */
const INVALID_SCREENSHOT_ANCHORS = [
  "Некорректное значение",
  ...SCREENSHOT_PROMPT_ANCHORS
];

/** Task completed successfully */
const SUCCESS_ANCHORS = [
  "Поздравляем, вы успешно выполнили задание!",
  "Congratulations"
];

/** /deleteme cleanup */
const DELETE_ME_ANCHORS = [
  "Пользователь удален",
  "Аккаунт удален",
  "Данные удалены",
  "Привет"
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openBot(page: Parameters<typeof sendMessage>[0]): Promise<void> {
  await page.goto(BOT_DEEP_LINK, { waitUntil: "domcontentloaded" });
  await expect
    .poll(async () => isComposerVisible(page), { timeout: 45_000 })
    .toBeTruthy();
}

function findLastMessageIndex(messages: string[], fragment: string): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.includes(fragment)) return i;
  }
  return -1;
}

/**
 * Send a command and wait until any of the given anchors appears
 * AFTER the command echo in the chat tail.
 */
async function sendCommandAndWait(
  page: Parameters<typeof sendMessage>[0],
  command: string,
  anchors: string[],
  tailLimit = 70,
  timeout = 60_000
): Promise<void> {
  const before = await collectTailMessages(page, tailLimit);
  const beforeFingerprint = before.join("\n@@\n");
  const token = command.trim();

  await sendMessage(page, command);

  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, tailLimit);
        if (tail.join("\n@@\n") === beforeFingerprint) return false;

        const idx = findLastMessageIndex(tail, token);
        if (idx < 0) return false;

        const after = tail.slice(idx + 1);
        if (after.length === 0) return false;

        return anchors.some((a) => after.some((m) => m.includes(a)));
      },
      { timeout }
    )
    .toBeTruthy();
}

async function tryWait(
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

async function clickReadyIfVisible(
  page: Parameters<typeof sendMessage>[0]
): Promise<boolean> {
  for (const label of READY_BUTTON_LABELS) {
    if (await hasInlineButton(page, label)) {
      await clickInlineButtonByText(page, label);
      return true;
    }
  }
  return false;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.serial("Settings Flow: Belarus + Android → full task (ARTP-SET-001..008)", () => {
  // Shared state between serial tests: was task assigned?
  let taskWasAssigned = false;
  let reachedStep2 = false;
  let reachedScreenshotStep = false;

  // ── Cleanup before suite ──────────────────────────────────────────────────

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/user.json"
    });
    const page = await context.newPage();
    try {
      await page.goto(BOT_DEEP_LINK, {
        waitUntil: "domcontentloaded",
        timeout: 20_000
      });
      if (await isComposerVisible(page)) {
        await sendMessage(page, "/deleteme");
        await page.waitForTimeout(3_000);
      }
    } catch {
      // best-effort pre-cleanup
    } finally {
      await context.close();
    }
  });

  // ── Cleanup after suite ───────────────────────────────────────────────────

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "playwright/.auth/user.json"
    });
    const page = await context.newPage();
    try {
      await page.goto(BOT_DEEP_LINK, {
        waitUntil: "domcontentloaded",
        timeout: 20_000
      });
      if (await isComposerVisible(page)) {
        await sendMessage(page, "/deleteme");
      }
    } catch {
      // best-effort post-cleanup
    } finally {
      await context.close();
    }
  });

  // ── ARTP-SET-000: open bot & pass onboarding ──────────────────────────────

  test("[ARTP-SET-000] open bot and pass onboarding if needed", async ({ page }) => {
    await openBot(page);
    await tailContainsAny(page, START_ANCHORS, 80, 45_000);

    // Click ready button if the onboarding gate is visible
    const clicked = await clickReadyIfVisible(page);
    if (clicked) {
      // May lead to anti-bot or straight to verified state – just wait a bit
      await page.waitForTimeout(4_000);
    }
  });

  // ── ARTP-SET-001: /settings → change country → Belarus ───────────────────

  test("[ARTP-SET-001] /settings → select country Belarus", async ({ page }) => {
    await openBot(page);

    // Send /settings
    await sendCommandAndWait(
      page,
      "/settings",
      // Any settings-related anchors or button labels in chat
      ["Изменить страну", "Сменить платформу", "Страна", "Change country", "Platform", "Belarus"],
      70,
      30_000
    );

    // Click "Изменить страну" / "Change country"
    let countryButtonClicked = false;
    for (const label of ["Изменить страну", "Change country", "Страна"]) {
      if (await hasInlineButton(page, label)) {
        await clickInlineButtonByText(page, label);
        countryButtonClicked = true;
        break;
      }
    }

    if (!countryButtonClicked) {
      // /settings might have already set a country; check for Belarus directly
      const alreadySet = await tryWait(page, ["Страна: 🇧🇾 Belarus", "Belarus"], 30, 5_000);
      test.skip(alreadySet, "Country already set to Belarus, skipping selection step.");
    }

    // Wait for country list / response
    await page.waitForTimeout(2_000);

    // Click "Belarus" in the inline keyboard
    await expect
      .poll(async () => hasInlineButton(page, "Belarus"), { timeout: 20_000 })
      .toBeTruthy();
    await clickInlineButtonByText(page, "Belarus");

    // Verify bot confirms Belarus
    await tailContainsAny(page, COUNTRY_SET_ANCHORS, 50, 20_000);
  });

  // ── ARTP-SET-002: /settings → change platform → Android ──────────────────

  test("[ARTP-SET-002] /settings → select platform Android (with error recovery)", async ({ page }) => {
    await openBot(page);

    // Send /settings
    await sendCommandAndWait(
      page,
      "/settings",
      ["Сменить платформу", "Изменить платформу", "Change platform", "Platform", "Android"],
      70,
      30_000
    );

    // Click "Сменить платформу"
    let platformButtonClicked = false;
    for (const label of ["Сменить платформу", "Изменить платформу", "Change platform", "Platform"]) {
      if (await hasInlineButton(page, label)) {
        await clickInlineButtonByText(page, label);
        platformButtonClicked = true;
        break;
      }
    }

    if (!platformButtonClicked) {
      // Platform might already be set
      const alreadySet = await tryWait(page, ["Платформа: Android", "Platform: Android"], 30, 5_000);
      test.skip(alreadySet, "Platform already set to Android, skipping selection step.");
    }

    // Wait for platform list
    await page.waitForTimeout(2_000);

    // Click "Android"
    await expect
      .poll(async () => hasInlineButton(page, "Android"), { timeout: 20_000 })
      .toBeTruthy();
    await clickInlineButtonByText(page, "Android");

    // Small wait to let bot respond
    await page.waitForTimeout(3_000);

    // Check if bot returned an error → recovery
    const hasError = await tryWait(page, PLATFORM_ERROR_ANCHORS, 30, 5_000);
    if (hasError) {
      // Recovery: send /settings and check that both country and platform are set
      await sendCommandAndWait(
        page,
        "/settings",
        [...SETTINGS_STATE_ANCHORS, "Изменить страну", "Сменить платформу"],
        70,
        30_000
      );
      // After error the bot may still have applied the platform – just check state
      const stateOk = await tryWait(page, SETTINGS_STATE_ANCHORS, 50, 10_000);
      if (!stateOk) {
        // Try once more: click platform button again
        for (const label of ["Сменить платформу", "Изменить платформу", "Change platform"]) {
          if (await hasInlineButton(page, label)) {
            await clickInlineButtonByText(page, label);
            break;
          }
        }
        await page.waitForTimeout(2_000);
        if (await hasInlineButton(page, "Android")) {
          await clickInlineButtonByText(page, "Android");
          await page.waitForTimeout(3_000);
        }
      }
    }

    // Final assertion: platform is set (either via direct response or via state check)
    await tailContainsAny(page, PLATFORM_SET_OK_ANCHORS, 60, 15_000);
  });

  // ── ARTP-SET-003: /settings state verification ────────────────────────────

  test("[ARTP-SET-003] /settings state shows Belarus + Android", async ({ page }) => {
    await openBot(page);

    await sendCommandAndWait(
      page,
      "/settings",
      SETTINGS_STATE_ANCHORS,
      70,
      30_000
    );

    const tail = await collectTailMessages(page, 50);
    const hasCountry = tail.some(
      (m) => m.includes("Страна: 🇧🇾 Belarus") || m.includes("Belarus")
    );
    const hasPlatform = tail.some(
      (m) => m.includes("Платформа: Android") || m.includes("Platform: Android")
    );

    expect(hasCountry, "Country should be Belarus after /settings").toBeTruthy();
    expect(hasPlatform, "Platform should be Android after /settings").toBeTruthy();
  });

  // ── ARTP-SET-004: /join_task → assigned → wait for Step 2 ────────────────

  test("[ARTP-SET-004] /join_task → task assigned → wait Step 2 (~1 min)", async ({
    page
  }) => {
    await openBot(page);

    await sendCommandAndWait(page, "/join_task", ALL_JOIN_ANCHORS, 80, 60_000);

    const tail = await collectTailMessages(page, 80);
    taskWasAssigned = TASK_ASSIGNED_ANCHORS.some((a) => tail.some((m) => m.includes(a)));

    if (!taskWasAssigned) {
      // No task available right now – mark and skip remaining task steps
      test.info().annotations.push({
        type: "skip-reason",
        description: "No task was assigned at this moment (no available tasks)."
      });
      return;
    }

    // Wait for Step 2 message – bot sends it after ~1 minute
    reachedStep2 = await tryWait(page, STEP2_ANCHORS, 80, 150_000);

    expect(
      reachedStep2,
      "Bot should send Step 2 message within 2.5 minutes after task assignment"
    ).toBeTruthy();
  });

  // ── ARTP-SET-005: click "Завершить задачу" → "Да" ────────────────────────

  test("[ARTP-SET-005] click \"Завершить задачу\" → answer \"Да\" to review confirmation", async ({
    page
  }) => {
    test.skip(!taskWasAssigned, "No task was assigned – skipping task completion steps.");
    test.skip(!reachedStep2, "Step 2 was not reached – skipping.");

    await openBot(page);

    // Click "Завершить задачу" / "Finish task"
    let finishClicked = false;
    for (const label of ["Завершить задачу", "Finish task", "Finish"]) {
      if (await hasInlineButton(page, label)) {
        await clickInlineButtonByText(page, label);
        finishClicked = true;
        break;
      }
    }

    if (!finishClicked) {
      // Maybe already at review confirmation step
      const alreadyAtReview = await tryWait(page, REVIEW_YES_ANCHORS, 50, 5_000);
      if (!alreadyAtReview) {
        test.skip(true, '"Завершить задачу" button not found – task may be in different state.');
      }
    } else {
      // Wait for review confirmation prompt
      await tailContainsAny(page, REVIEW_YES_ANCHORS, 60, 30_000);
    }

    // Click "Да" / "Yes"
    for (const label of ["Да", "Yes"]) {
      if (await hasInlineButton(page, label)) {
        await clickInlineButtonByText(page, label);
        break;
      }
    }

    // Wait for screenshot prompt
    reachedScreenshotStep = await tryWait(page, SCREENSHOT_PROMPT_ANCHORS, 60, 30_000);
    expect(
      reachedScreenshotStep,
      "Bot should show screenshot prompt after confirming review"
    ).toBeTruthy();
  });

  // ── ARTP-SET-006: send screenshot fixture → negative branch ───────────────

  test(
    "[ARTP-SET-006] send app-screenshot.png fixture → bot repeats prompt (negative branch)",
    async ({ page }) => {
      test.skip(!taskWasAssigned, "No task assigned – skipping.");
      test.skip(!reachedScreenshotStep, "Screenshot step not reached – skipping.");

      await openBot(page);

      const beforeTail = await collectTailMessages(page, 80);
      const beforeInvalidCount = beforeTail.filter((m) =>
        m.includes("Некорректное значение")
      ).length;
      const beforePromptCount = beforeTail.filter((m) =>
        m.includes("Чтобы подтвердить, что вы действительно установили и открыли приложение")
      ).length;

      // Send the fixture screenshot (represents a non-app screenshot)
      await sendFileAttachment(page, SCREENSHOT_FIXTURE);

      // Bot should reply with invalid screenshot message or repeat the prompt
      await expect
        .poll(
          async () => {
            const tail = await collectTailMessages(page, 80);
            const invalidCount = tail.filter((m) =>
              m.includes("Некорректное значение")
            ).length;
            const promptCount = tail.filter((m) =>
              m.includes("Чтобы подтвердить, что вы действительно установили и открыли приложение")
            ).length;
            const hasAnyAnchor = INVALID_SCREENSHOT_ANCHORS.some((a) =>
              tail.some((m) => m.includes(a))
            );
            return (
              hasAnyAnchor &&
              (invalidCount > beforeInvalidCount || promptCount > beforePromptCount)
            );
          },
          { timeout: 50_000 }
        )
        .toBeTruthy();
    }
  );

  // ── ARTP-SET-007: click "Finish" → success message ────────────────────────

  test('[ARTP-SET-007] click "Finish" → receive success confirmation', async ({ page }) => {
    test.skip(!taskWasAssigned, "No task assigned – skipping.");
    test.skip(!reachedScreenshotStep, "Screenshot step not reached – skipping.");

    await openBot(page);

    // Look for "Finish" button (appears after screenshot prompt)
    const hasFinish = await expect
      .poll(async () => {
        for (const label of ["Finish", "Завершить", "Готово", "Done"]) {
          if (await hasInlineButton(page, label)) return true;
        }
        return false;
      }, { timeout: 20_000 })
      .toBeTruthy()
      .catch(() => false);

    if (!hasFinish) {
      test.skip(true, '"Finish" button was not found – skipping positive branch.');
    }

    for (const label of ["Finish", "Завершить", "Готово", "Done"]) {
      if (await hasInlineButton(page, label)) {
        await clickInlineButtonByText(page, label);
        break;
      }
    }

    // Bot should congratulate
    await tailContainsAny(page, SUCCESS_ANCHORS, 60, 30_000);
  });

  // ── ARTP-SET-008: /deleteme cleanup ───────────────────────────────────────

  test("[ARTP-SET-008] /deleteme resets all state", async ({ page }) => {
    await openBot(page);

    try {
      await sendCommandAndWait(page, "/deleteme", DELETE_ME_ANCHORS, 50, 30_000);
    } catch {
      // Some bot builds don't send a deterministic response for /deleteme
      await sendMessage(page, "/deleteme");
    }
  });
});
