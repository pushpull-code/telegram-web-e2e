import { expect } from "@playwright/test";

export type MtprotoPeer = {
  chatId?: string;
  username?: string;
  accessHash?: string;
};

export type MtprotoButton = {
  rowIndex: number;
  columnIndex: number;
  text: string;
  type: string;
  clickable: boolean;
  dataBase64?: string;
  url?: string;
  inlineQuery?: string;
};

export type MtprotoMessage = {
  id: number;
  date: number | null;
  dateIso: string | null;
  outgoing: boolean;
  text: string;
  buttons: MtprotoButton[][];
};

export type MtprotoChatState = {
  success: true;
  resolveStrategy: string;
  messages: MtprotoMessage[];
};

type MtprotoConfig = {
  url: string;
  token: string;
};

export function getMtprotoConfig(): MtprotoConfig | null {
  const url = (process.env.MTPROTO_SERVICE_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.MTPROTO_SERVICE_TOKEN || "").trim();
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

export function isMtprotoConfigured(): boolean {
  return getMtprotoConfig() !== null;
}

async function mtprotoRequest<T>(path: string, body: unknown): Promise<T> {
  const config = getMtprotoConfig();
  if (!config) {
    throw new Error("MTPROTO_SERVICE_URL and MTPROTO_SERVICE_TOKEN are required.");
  }

  const timeoutMs = Number(process.env.MTPROTO_SERVICE_REQUEST_TIMEOUT_MS || "20000");
  const timeoutLabel = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutLabel);

  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "AbortError"
        ? `MTProto ${path} timed out after ${timeoutLabel}ms`
        : `MTProto ${path} request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`MTProto ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

export async function sendMtprotoMessage(
  peer: MtprotoPeer,
  message: string
): Promise<{ success: true; sendStrategy: string }> {
  return mtprotoRequest("/api/send-message", { ...peer, message });
}

export async function getMtprotoChatState(
  peer: MtprotoPeer,
  limit = 20
): Promise<MtprotoChatState> {
  return mtprotoRequest("/api/chat-state", { ...peer, limit });
}

export async function clickMtprotoButton(
  peer: MtprotoPeer,
  messageId: number,
  selector: {
    buttonText?: string;
    rowIndex?: number;
    columnIndex?: number;
    buttonDataBase64?: string;
    allowTimeoutAsSuccess?: boolean;
    clickTimeoutMs?: number;
  }
): Promise<unknown> {
  return mtprotoRequest("/api/click-button", { ...peer, messageId, ...selector });
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function waitForMtprotoTextAny(
  peer: MtprotoPeer,
  anchors: string[],
  options: { timeoutMs?: number; limit?: number } = {}
): Promise<MtprotoChatState> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const limit = options.limit ?? 30;
  const normalized = anchors.map(normalizeForMatch);
  let lastState: MtprotoChatState | null = null;

  await expect
    .poll(
      async () => {
        lastState = await getMtprotoChatState(peer, limit);
        return normalized.some((anchor) =>
          lastState?.messages.some((message) => normalizeForMatch(message.text).includes(anchor))
        );
      },
      { timeout: timeoutMs }
    )
    .toBeTruthy();

  return lastState || getMtprotoChatState(peer, limit);
}

export function findLatestMtprotoButton(
  messages: MtprotoMessage[],
  labels: string[]
): { message: MtprotoMessage; button: MtprotoButton } | null {
  const normalizedLabels = labels.map(normalizeForMatch);

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    for (const row of message.buttons) {
      for (const button of row) {
        if (normalizedLabels.includes(normalizeForMatch(button.text))) {
          return { message, button };
        }
      }
    }
  }

  return null;
}
