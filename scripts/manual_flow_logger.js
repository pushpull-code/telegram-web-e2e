const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const BOT_USERNAME = process.env.BOT_USERNAME || "artp345_bot";
const POLL_MS = Number(process.env.MANUAL_LOG_POLL_MS || 1500);
const DURATION_SEC = Number(process.env.MANUAL_LOG_DURATION_SEC || 900);
const TELEGRAM_WEB_URL = process.env.TELEGRAM_WEB_URL || "https://web.telegram.org/k/";

const outDir = process.env.MANUAL_LOG_DIR
  ? path.resolve(process.cwd(), process.env.MANUAL_LOG_DIR)
  : path.resolve(process.cwd(), "output/playwright/manual-log");
const logPath = path.join(outDir, "timeline.jsonl");

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

async function collectState(page) {
  return await page.evaluate(() => {
    const msgNodes = Array.from(
      document.querySelectorAll(".bubbles .message-list-item, .bubbles .bubble")
    );
    const tail = msgNodes
      .slice(-12)
      .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(-8);

    const replyButtons = Array.from(document.querySelectorAll("button.reply-markup-button"))
      .filter((btn) => {
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((btn) => (btn.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const sendButtons = Array.from(
      document.querySelectorAll("button.btn-primary.btn-color-primary, button.btn-primary")
    )
      .filter((btn) => {
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        return text === "send" || text === "отправить";
      })
      .length;

    return {
      url: location.href,
      title: document.title,
      tail,
      replyButtons,
      sendButtonVisible: sendButtons > 0
    };
  });
}

async function main() {
  console.log(`[manual-flow] start bot=${BOT_USERNAME} pollMs=${POLL_MS} durationSec=${DURATION_SEC}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(logPath, "", "utf8");
  console.log(`[manual-flow] output=${outDir}`);

  const browser = await chromium.launch({ headless: false });
  console.log("[manual-flow] browser launched");
  const context = await browser.newContext({
    storageState: path.resolve(process.cwd(), "playwright/.auth/user.json"),
    viewport: { width: 1440, height: 900 }
  });
  console.log("[manual-flow] context created");
  const page = await context.newPage();
  const chatUrl = `${TELEGRAM_WEB_URL.replace(/\/+$/, "")}/#@${BOT_USERNAME.replace(/^@/, "")}`;
  try {
    await page.goto(chatUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });
  } catch (error) {
    console.error("[manual-flow] goto failed:", error);
    await page.goto(chatUrl, { waitUntil: "commit", timeout: 65_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  }
  await page.waitForTimeout(2000);
  console.log("[manual-flow] chat opened");

  let prevFingerprint = "";
  const startedAt = Date.now();
  let changeIndex = 0;

  while (Date.now() - startedAt < DURATION_SEC * 1000) {
    const rawState = await collectState(page);
    const state = {
      ts: nowIso(),
      url: rawState.url,
      title: rawState.title,
      tail: rawState.tail.map(normalizeText),
      replyButtons: rawState.replyButtons.map(normalizeText),
      sendButtonVisible: rawState.sendButtonVisible
    };
    const fingerprint = JSON.stringify({
      tail: state.tail,
      replyButtons: state.replyButtons,
      sendButtonVisible: state.sendButtonVisible
    });

    if (fingerprint !== prevFingerprint) {
      prevFingerprint = fingerprint;
      changeIndex += 1;
      fs.appendFileSync(logPath, `${JSON.stringify(state)}\n`, "utf8");
      const shotName = `change-${String(changeIndex).padStart(4, "0")}.png`;
      await page.screenshot({ path: path.join(outDir, shotName), fullPage: true }).catch(() => {});
      console.log(`[manual-flow] change=${changeIndex}`);
    }

    await page.waitForTimeout(POLL_MS);
  }

  await browser.close();
  console.log("[manual-flow] browser closed");
  console.log(`manual flow log saved: ${logPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
