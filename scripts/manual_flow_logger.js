const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const BOT_USERNAME = process.env.BOT_USERNAME || "artp345_bot";
const POLL_MS = Number(process.env.MANUAL_LOG_POLL_MS || 1500);
const DURATION_SEC = Number(process.env.MANUAL_LOG_DURATION_SEC || 900);

const outDir = path.resolve(process.cwd(), "output/playwright/manual-log");
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
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(logPath, "", "utf8");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: path.resolve(process.cwd(), "playwright/.auth/user.json"),
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  await page.goto(`https://web.telegram.org/k/#@${BOT_USERNAME.replace(/^@/, "")}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(2000);

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
    }

    await page.waitForTimeout(POLL_MS);
  }

  await browser.close();
  console.log(`manual flow log saved: ${logPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

