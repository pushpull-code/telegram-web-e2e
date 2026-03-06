const REQUIRED_SUITES = new Set(["bot", "autorun", "freelancer", "settings", "all"]);

const BOT_TOKEN = (process.env.TG_BOT_TOKEN || "").trim();
const ALLOWED_CHAT_ID = (process.env.TG_ALLOWED_CHAT_ID || "").trim();
const BOT_USERNAME = (process.env.TG_BOT_USERNAME || "autotesttgbot").trim().replace(/^@/, "");
const DEFAULT_SUITE = (process.env.E2E_DEFAULT_SUITE || "autorun").trim().toLowerCase();
const WORKFLOW_FILE = (process.env.E2E_WORKFLOW_FILE || "telegram-web-e2e.yml").trim();
const REPO = (process.env.GITHUB_REPOSITORY || "").trim();

if (!BOT_TOKEN) {
  console.log("TG_BOT_TOKEN is not set. Skip polling.");
  process.exit(0);
}

if (!REPO) {
  console.log("GITHUB_REPOSITORY is not set. Skip polling.");
  process.exit(0);
}

const [owner, repo] = REPO.split("/");
if (!owner || !repo) {
  console.log(`Invalid GITHUB_REPOSITORY: ${REPO}`);
  process.exit(1);
}

const GH_TOKEN = (process.env.GITHUB_TOKEN || "").trim();
if (!GH_TOKEN) {
  console.log("GITHUB_TOKEN is missing.");
  process.exit(1);
}

const tgApiBase = `https://api.telegram.org/bot${BOT_TOKEN}`;

function stripCommandMention(text) {
  return text.replace(/^(\/\w+)@\w+/, "$1");
}

function parseRunCommand(text) {
  const normalized = stripCommandMention(text.trim());
  const match = normalized.match(/^\/run(?:\s+([a-z_]+))?$/i);
  if (!match) {
    return null;
  }

  const requested = (match[1] || DEFAULT_SUITE).toLowerCase();
  if (!REQUIRED_SUITES.has(requested)) {
    return { error: `Неизвестный сценарий: ${requested}` };
  }
  return { suite: requested };
}

async function tgGet(path, searchParams = {}) {
  const query = new URLSearchParams(searchParams).toString();
  const url = `${tgApiBase}/${path}${query ? `?${query}` : ""}`;
  const response = await fetch(url, { method: "GET" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`Telegram ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.result;
}

async function tgPost(path, body) {
  const response = await fetch(`${tgApiBase}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`Telegram ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.result;
}

async function sendMessage(chatId, text) {
  await tgPost("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function ackUpdate(updateId) {
  try {
    await tgGet("getUpdates", {
      offset: String(updateId + 1),
      limit: "1",
      timeout: "0",
      allowed_updates: JSON.stringify(["message"])
    });
  } catch (error) {
    console.log(`Ack failed for update ${updateId}:`, error instanceof Error ? error.message : String(error));
  }
}

async function triggerWorkflow(suite) {
  const dispatchResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${GH_TOKEN}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { suite }
      })
    }
  );

  if (!dispatchResponse.ok) {
    const text = await dispatchResponse.text().catch(() => "");
    throw new Error(`GitHub dispatch failed: ${dispatchResponse.status} ${text}`);
  }

  // The dispatch endpoint returns no run ID. Fetch latest workflow run after a short delay.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const runsResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/runs?event=workflow_dispatch&branch=main&per_page=5`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${GH_TOKEN}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28"
      }
    }
  );

  if (!runsResponse.ok) {
    const text = await runsResponse.text().catch(() => "");
    throw new Error(`GitHub runs lookup failed: ${runsResponse.status} ${text}`);
  }

  const runsPayload = await runsResponse.json();
  const run = Array.isArray(runsPayload.workflow_runs) ? runsPayload.workflow_runs[0] : null;
  return run?.html_url || `https://github.com/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}`;
}

async function main() {
  let updates = [];
  try {
    updates = await tgGet("getUpdates", {
      offset: "-1",
      limit: "1",
      timeout: "0",
      allowed_updates: JSON.stringify(["message"])
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("can't use getUpdates method while webhook is active")) {
      console.log("Telegram webhook is active. Skip polling workflow.");
      return;
    }
    throw error;
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    console.log("No new Telegram messages.");
    return;
  }

  const update = updates[0];
  const updateId = update.update_id;
  const message = update.message;
  const chatId = message?.chat?.id != null ? String(message.chat.id) : "";
  const text = typeof message?.text === "string" ? message.text.trim() : "";

  try {
    if (!text) {
      return;
    }

    if (ALLOWED_CHAT_ID && chatId !== ALLOWED_CHAT_ID) {
      console.log(`Ignore message from unauthorized chat_id=${chatId}`);
      return;
    }

    const normalized = stripCommandMention(text);

    if (/^\/help$/i.test(normalized) || /^\/start$/i.test(normalized)) {
      await sendMessage(
        chatId,
        [
          "Команды:",
          `/run <suite> — запуск GitHub Actions (${Array.from(REQUIRED_SUITES).join(" | ")})`,
          `/run — запуск default suite (${DEFAULT_SUITE})`,
          "",
          `Бот: @${BOT_USERNAME}`
        ].join("\n")
      );
      return;
    }

    const parsed = parseRunCommand(normalized);
    if (!parsed) {
      return;
    }

    if (parsed.error) {
      await sendMessage(chatId, `${parsed.error}\nДопустимо: ${Array.from(REQUIRED_SUITES).join(", ")}`);
      return;
    }

    const suite = parsed.suite;
    await sendMessage(chatId, `Запускаю прогон: ${suite}`);
    const runUrl = await triggerWorkflow(suite);
    await sendMessage(chatId, `Прогон запущен: ${suite}\n${runUrl}`);
  } finally {
    if (typeof updateId === "number") {
      await ackUpdate(updateId);
    }
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
