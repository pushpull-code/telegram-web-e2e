import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { isComposerVisible, openBotChat } from "./helpers/telegram-web";
import { botUsername } from "./helpers/bot-config";

const authFile = path.resolve("playwright/.auth/user.json");

test("authenticate telegram web and save session", async ({ page, baseURL }) => {
  if (fs.existsSync(authFile)) {
    return;
  }

  await page.goto(baseURL || "https://web.telegram.org/k/", { waitUntil: "domcontentloaded" });

  const loggedIn = await isComposerVisible(page);
  if (!loggedIn) {
    console.log("Telegram Web login is required. Complete login in the opened browser window.");
    await expect
      .poll(async () => isComposerVisible(page), {
        timeout: 240_000
      })
      .toBeTruthy();
  }

  await openBotChat(page, botUsername);
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
