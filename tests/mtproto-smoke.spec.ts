import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { botStartPayload, botUsername } from "./helpers/bot-config";
import {
  getMtprotoChatState,
  isMtprotoConfigured,
  sendMtprotoMessage,
  waitForMtprotoTextAny
} from "./helpers/mtproto-service";

const START_ANCHORS = [
  "Нажми \"Я готов\"",
  "Нажми \"Я готов!\"",
  "I’m ready",
  "I'm ready",
  "Выберите страну",
  "Проверьте доступные задания",
  "Страна вашего аккаунта"
];

test.describe.serial("MTProto bot smoke", () => {
  test("sends /start and reads bot state without Telegram Web", async ({}, testInfo) => {
    test.skip(!isMtprotoConfigured(), "MTPROTO_SERVICE_URL/MTPROTO_SERVICE_TOKEN are not configured.");
    test.setTimeout(90_000);

    const peer = { username: botUsername };
    const command = `/start ${process.env.MTPROTO_START_PAYLOAD || botStartPayload}`;

    await sendMtprotoMessage(peer, command);
    const state = await waitForMtprotoTextAny(peer, START_ANCHORS, {
      timeoutMs: Number(process.env.MTPROTO_WAIT_TIMEOUT_MS || "60000"),
      limit: 40
    });

    const evidenceDir = testInfo.outputPath("mtproto");
    fs.mkdirSync(evidenceDir, { recursive: true });
    const reportPath = path.join(evidenceDir, "chat-state.json");
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          bot: botUsername,
          command,
          state,
          latest: await getMtprotoChatState(peer, 40)
        },
        null,
        2
      ),
      "utf8"
    );

    await testInfo.attach("mtproto-chat-state", {
      path: reportPath,
      contentType: "application/json"
    });
  });
});
