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
const failureFile = (process.env.FAILURE_FILE || ".cloudflare-report-failure.json").trim();
const maxChunkBase64Chars = Number(process.env.REPORT_CALLBACK_CHUNK_BASE64_MAX || "1500000");
const maxChunkFiles = Number(process.env.REPORT_CALLBACK_CHUNK_FILE_MAX || "4");

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

let failureCode = "";
let failureMessage = "";
if (fs.existsSync(failureFile)) {
  try {
    const raw = fs.readFileSync(failureFile, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      failureCode = String(parsed.code || "").trim();
      failureMessage = String(parsed.message || "").trim();
    }
  } catch (error) {
    console.log(`Failed to parse ${failureFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function reportEnvelope(extra = {}) {
  return {
    chat_id: chatId,
    lang,
    scenario_key: scenarioKey,
    status,
    duration_sec: Number.isFinite(durationSec) && durationSec >= 0 ? Math.floor(durationSec) : 0,
    run_url: runUrl,
    failure_code: failureCode,
    failure_message: failureMessage,
    ...extra
  };
}

async function sendPayload(payload) {
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
}

function chunkScreenshots(items) {
  const chunks = [];
  let currentChunk = [];
  let currentBase64Chars = 0;

  for (const item of items) {
    const base64 = String(item?.data_base64 || "");
    if (!base64) {
      continue;
    }

    const nextFileCount = currentChunk.length + 1;
    const nextBase64Chars = currentBase64Chars + base64.length;
    if (
      currentChunk.length > 0 &&
      (nextFileCount > maxChunkFiles || nextBase64Chars > maxChunkBase64Chars)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBase64Chars = 0;
    }

    currentChunk.push(item);
    currentBase64Chars += base64.length;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

await sendPayload(
  reportEnvelope({
    phase: "summary",
    screenshot_count: screenshots.length
  })
);

const screenshotChunks = chunkScreenshots(screenshots);
for (let index = 0; index < screenshotChunks.length; index += 1) {
  await sendPayload(
    reportEnvelope({
      phase: "screenshots",
      chunk_index: index,
      chunk_count: screenshotChunks.length,
      screenshots: screenshotChunks[index]
    })
  );
}

await sendPayload(
  reportEnvelope({
    phase: "finish",
    screenshot_count: screenshots.length
  })
);

console.log(`Cloudflare report callback sent in ${screenshotChunks.length + 2} request(s).`);
