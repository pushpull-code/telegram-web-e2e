const BOT_PAYLOAD_PREFIX = "adexium";
const TELEGRAM_WEB_DEFAULT_URL = "https://web.telegram.org/k/";
const START_DEEPLINK_US_ANDROID =
  "https://web.telegram.org/k/#?tgaddr=https%3A%2F%2Ft.me%2Fartp345_bot%3Fstart%3Dadexium_us_1";
const START_DEEPLINK_US_IOS =
  "https://web.telegram.org/k/#?tgaddr=https%3A%2F%2Ft.me%2Fartp345_bot%3Fstart%3Dadexium_us_2";

const normalizeCountryCode = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const resolvePlatform = (value: string): "1" | "2" => {
  const normalized = value.trim();
  if (normalized === "1" || normalized === "2") {
    return normalized;
  }

  return "1";
};

const normalizeTelegramWebBase = (value: string): string =>
  value
    .trim()
    .replace(/\/+$/, "");

export const botUsername = process.env.BOT_USERNAME || "artp345_bot";

export const botCountryCode = normalizeCountryCode(process.env.BOT_COUNTRY_CODE || "us") || "us";
export const botPlatform = resolvePlatform(process.env.BOT_PLATFORM || "1");

export const botStartPayload =
  (process.env.BOT_START_PAYLOAD || "").trim() ||
  `${BOT_PAYLOAD_PREFIX}_${botCountryCode}_${botPlatform}`;

export const startCommand = `/start ${botStartPayload}`;
export const startPayloadUs = `${BOT_PAYLOAD_PREFIX}_us_${botPlatform}`;
export const startCommandUs = `/start ${startPayloadUs}`;

export const expectNoWebAppAntiBot = process.env.BOT_EXPECT_NO_WEBAPP_ANTIBOT !== "0";

const buildTelegramWebStartLink = (payload: string): string => {
  const webBase = normalizeTelegramWebBase(
    process.env.TELEGRAM_WEB_URL || TELEGRAM_WEB_DEFAULT_URL
  );
  const domain = botUsername.replace(/^@/, "");
  const tMeLink = `https://t.me/${domain}?start=${payload}`;

  return `${webBase}/#?tgaddr=${encodeURIComponent(tMeLink)}`;
};

export const startDeepLink = buildTelegramWebStartLink(botStartPayload);
export const startDeepLinkUsAndroid = START_DEEPLINK_US_ANDROID;
export const startDeepLinkUsIos = START_DEEPLINK_US_IOS;
