import fs from "node:fs";

const callbackUrl = (process.env.CALLBACK_URL || process.env.CALLBACK_URL_FALLBACK || "").trim();
const callbackToken = (process.env.CALLBACK_TOKEN || "").trim();
const chatId = (process.env.CHAT_ID || "").trim();
const lang = (process.env.RUN_LANG || "ru").trim();
const scenarioKey = (process.env.RUN_SCENARIO_KEY || "start_finish").trim();
const status = (process.env.RUN_STATUS || "failure").trim();
const durationSec = Number(process.env.RUN_DURATION_SEC || "0");
const runUrl = (process.env.RUN_URL || "").trim();
const screenshotsFile = (process.env.SCREENSHOTS_FILE || ".cloudflare-report-screenshots.json").trim();

if (!chatId) {
  console.log("CHAT_ID is empty. Skip callback.");
  process.exit(0);
}

if (!callbackUrl || !callbackToken) {
  console.log("CALLBACK_URL or CALLBACK_TOKEN is missing. Skip callback.");
  process.exit(0);
}

let screenshots = [];
if (fs.existsSync(screenshotsFile)) {
  try {
    const raw = fs.readFileSync(screenshotsFile, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      screenshots = parsed;
    }
  } catch (error) {
    console.log(`Failed to parse ${screenshotsFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const payload = {
  chat_id: chatId,
  lang,
  scenario_key: scenarioKey,
  status,
  duration_sec: Number.isFinite(durationSec) && durationSec >= 0 ? Math.floor(durationSec) : 0,
  run_url: runUrl,
  screenshots
};

const response = await fetch(callbackUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-report-token": callbackToken
  },
  body: JSON.stringify(payload)
});

if (!response.ok) {
  const text = await response.text().catch(() => "");
  throw new Error(`Cloudflare report callback failed: ${response.status} ${text}`);
}

console.log("Cloudflare report callback sent.");
