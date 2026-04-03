import { expect, type Frame, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const COMPOSER_SELECTORS = [
  ".chat-input-container div.input-message-input[contenteditable='true']",
  ".input-message-container div.input-message-input[contenteditable='true']",
  "div.input-message-input[contenteditable='true']",
  "div[contenteditable='true'][class*='input-message']"
];

const MESSAGE_SELECTORS = [
  ".bubbles .Message.message-list-item",
  ".bubbles .message-list-item",
  ".bubbles .bubble"
];
const MINI_APP_HUMAN_BUTTON_RE = /yes,\s*i['’`]?m\s*human/i;
const MINI_APP_CONFIRM_BUTTON_RE = /^confirm$/i;
const MINI_APP_CONTINUE_BUTTON_RE = /^(continue|next|verify|done)$/i;
const TELEGRAM_WEBAPP_LAUNCH_RE = /^(launch|open|открыть|запустить)$/i;
const TELEGRAM_BUTTON_TEXT_SELECTORS =
  "span.inline-button-text, span.reply-markup-button-text, .inline-button-text, .reply-markup-button-text";
const TELEGRAM_BUTTON_SELECTORS =
  "button, [role='button'], .btn, .reply-markup-button, .inline-button, .reply-markup-button-text, .inline-button-text";

const normalize = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeForMatch = (value: string) =>
  normalize(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const botChatUrl = (botUsername: string) =>
  `https://web.telegram.org/k/#@${botUsername.replace(/^@/, "")}`;

export async function openBotChat(page: Page, botUsername: string): Promise<void> {
  const url = botChatUrl(botUsername);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch {
    await page.goto(url, { waitUntil: "commit", timeout: 65_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  }

  try {
    await waitForComposer(page, 8_000);
    return;
  } catch {
    // fallback to selecting chat from list by title/username
  }

  const username = botUsername.replace(/^@/, "");
  const chatTitleCandidates = [
    process.env.BOT_CHAT_TITLE || "",
    "Applications Reviews Test Performer",
    username
  ]
    .map((value) => value.trim())
    .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

  for (const candidate of chatTitleCandidates) {
    const titleRe = new RegExp(escapeRegex(candidate), "i");
    const chatCandidate = page
      .locator("a, .ListItem, .chatlist-chat, .ChatInfo, .chatlist .chatlist-item")
      .filter({ hasText: titleRe })
      .first();

    if (await chatCandidate.isVisible().catch(() => false)) {
      await chatCandidate.click();
      try {
        await waitForComposer(page, 6_000);
        return;
      } catch {
        // try next candidate
      }
    }
  }

  await waitForComposer(page, 45_000);
}

export async function sendMessage(page: Page, message: string): Promise<void> {
  const composer = await waitForComposer(page, 30_000);

  try {
    await composer.fill(message);
  } catch {
    await composer
      .evaluate((el) => {
        (el as HTMLElement).focus();
      })
      .catch(() => {});

    try {
      await composer.fill(message);
    } catch {
      await composer.click({ timeout: 3_000 }).catch(() => {});
      await composer.click({ timeout: 3_000, force: true }).catch(() => {});
      await page.keyboard.press("Control+A").catch(() => {});
      await page.keyboard.type(message);
    }
  }

  await composer.press("Enter").catch(async () => {
    await page.keyboard.press("Enter");
  });
}

export type AttachmentMode = "any" | "photo" | "document";

type SendFileAttachmentOptions = {
  mode?: AttachmentMode;
};

const PHOTO_MENU_ITEM_RE = /Photo or Video|Фото|Видео/i;
const DOCUMENT_MENU_ITEM_RE = /Document|Документ|Файл/i;
const ATTACHMENT_SEND_RE = /^Send$|^Отправить$/i;
const ATTACH_BUTTON_SELECTORS = [
  "attach-menu-button.attach-file",
  "button.attach-file",
  ".attach-file",
  "button:has(.tgico-attach)",
  "button.btn-icon:has(.tgico-attach)",
  "button[aria-label*='Attach' i]",
  "button[title*='Attach' i]",
  "button[aria-label*='Прикреп' i]",
  "button[title*='Прикреп' i]"
].join(", ");
const ATTACH_MENU_ITEM_SELECTORS = [
  ".btn-menu.active .btn-menu-item",
  ".btn-menu.was-open .btn-menu-item",
  ".btn-menu .btn-menu-item",
  "[role='menuitem']"
].join(", ");
const ATTACH_SEND_BUTTON_SELECTORS = [
  "button.btn-primary.btn-color-primary",
  "button.btn-primary",
  ".popup button.btn-primary",
  ".popup button.btn-color-primary",
  ".media-editor button.btn-primary",
  ".media-editor-container button.btn-primary",
  "button[aria-label='Send']",
  "button[title='Send']",
  "button[aria-label='Отправить']",
  "button[title='Отправить']"
].join(", ");
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const ATTACH_DEBUG = process.env.E2E_DEBUG_ATTACH === "1";

const logAttach = (...values: unknown[]) => {
  if (ATTACH_DEBUG) {
    // eslint-disable-next-line no-console
    console.log("[attach]", ...values);
  }
};

function guessImageMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".bmp")) {
    return "image/bmp";
  }
  return "image/png";
}

async function dumpFileInputs(page: Page, stage: string): Promise<void> {
  if (!ATTACH_DEBUG) {
    return;
  }

  const entries = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']")).map((node, index) => ({
        index,
        accept: node.accept || "",
        multiple: node.multiple,
        disabled: node.disabled,
        className: node.className || "",
        inChatComposer: Boolean(node.closest(".chat-input-container, .input-message-container, .chat-input, .composer"))
      }))
    )
    .catch(() => []);
  logAttach(`file inputs @${stage}:`, entries);
}

async function setInputFilesWithEvents(input: Locator, filePath: string): Promise<void> {
  await input.setInputFiles(filePath);
  await input
    .evaluate((node) => {
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    })
    .catch(() => {});
}

async function countMessageNodes(page: Page): Promise<number> {
  return await page.evaluate(({ selectors }) => {
    const unionSelector = selectors.join(", ");
    return document.querySelectorAll<HTMLElement>(unionSelector).length;
  }, { selectors: MESSAGE_SELECTORS });
}

async function countOutgoingMediaBubbles(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const bubbles = Array.from(
      document.querySelectorAll<HTMLElement>(".bubbles .bubble.is-out, .bubbles .message-list-item.is-out")
    );
    let count = 0;
    for (const bubble of bubbles) {
      if (
        bubble.classList.contains("photo") ||
        bubble.querySelector(
          ".attachment.media-container, .media-container, img.media-photo, canvas.media-photo, video, .document"
        )
      ) {
        count++;
      }
    }
    return count;
  });
}

async function didOutgoingMediaIncrease(
  page: Page,
  beforeOutgoingMediaCount: number,
  timeoutMs = 4_000
): Promise<boolean> {
  try {
    await expect
      .poll(async () => await countOutgoingMediaBubbles(page), { timeout: timeoutMs })
      .toBeGreaterThan(beforeOutgoingMediaCount);
    return true;
  } catch {
    return false;
  }
}

async function isLikelyVoiceControl(control: Locator): Promise<boolean> {
  return await control
    .evaluate((node) => {
      const el = node as HTMLElement;
      const text = (el.innerText || el.textContent || "").toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();
      const className = (el.className || "").toLowerCase();

      const hasMicIcon = Boolean(
        el.querySelector(
          ".tgico-microphone, .tgico-mic, [class*='microphone'], [class*='mic'], [data-icon*='micro']"
        )
      );

      const meta = `${text} ${aria} ${title} ${className}`;
      if (hasMicIcon) {
        return true;
      }

      return (
        meta.includes("microphone") ||
        meta.includes("voice") ||
        meta.includes("record") ||
        meta.includes("микрофон") ||
        meta.includes("голос")
      );
    })
    .catch(() => false);
}

async function scrollChatToBottom(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const selectors = [
        ".bubbles",
        ".bubbles-inner",
        ".chat-history",
        ".chat",
        ".Scrollable",
        ".scrollable-y"
      ];
      for (const selector of selectors) {
        const nodes = document.querySelectorAll<HTMLElement>(selector);
        for (const node of nodes) {
          if (node.scrollHeight > node.clientHeight) {
            node.scrollTop = node.scrollHeight;
          }
        }
      }
    })
    .catch(() => {});
}

async function waitForAttachmentSendButton(page: Page, timeoutMs = 6_000): Promise<Locator | null> {
  let resolved: Locator | null = null;

  try {
    await expect
      .poll(
        async () => {
          const allCandidates = page.locator(ATTACH_SEND_BUTTON_SELECTORS);
          const count = await allCandidates.count().catch(() => 0);
          if (count === 0) {
            return false;
          }

          const textMatched = allCandidates.filter({ hasText: ATTACHMENT_SEND_RE }).last();
          if (await textMatched.isVisible().catch(() => false)) {
            resolved = textMatched;
            return true;
          }

          for (let index = count - 1; index >= 0; index--) {
            const candidate = allCandidates.nth(index);
            if (await candidate.isVisible().catch(() => false)) {
              resolved = candidate;
              return true;
            }
          }

          return false;
        },
        { timeout: timeoutMs }
      )
      .toBeTruthy();
    return resolved;
  } catch {
    return null;
  }
}

function putWindowsImageToClipboard(filePath: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const normalizedPath = filePath.replace(/\\/g, "\\\\").replace(/'/g, "''");
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    `$p = '${normalizedPath}'`,
    "if (!(Test-Path -LiteralPath $p)) { throw \"Image file not found: $p\" }",
    "$img = [System.Drawing.Image]::FromFile($p)",
    "try { [System.Windows.Forms.Clipboard]::SetImage($img) } finally { $img.Dispose() }"
  ].join("; ");

  try {
    execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function putLinuxImageToClipboard(filePath: string): boolean {
  if (process.platform !== "linux") {
    return false;
  }

  const mimeType = guessImageMimeType(filePath);
  try {
    execFileSync(
      "bash",
      ["-lc", "xclip -selection clipboard -t \"$MIME_TYPE\" -i \"$FILE_PATH\""],
      {
        env: {
          ...process.env,
          FILE_PATH: filePath,
          MIME_TYPE: mimeType
        },
        stdio: "ignore"
      }
    );
    return true;
  } catch {
    return false;
  }
}

function putImageToClipboard(filePath: string): boolean {
  return putWindowsImageToClipboard(filePath) || putLinuxImageToClipboard(filePath);
}

async function chooseViaClipboardPaste(
  page: Page,
  filePath: string,
  mode: AttachmentMode
): Promise<boolean> {
  if (mode === "document" || !IMAGE_EXT_RE.test(filePath)) {
    return false;
  }

  if (!putImageToClipboard(filePath)) {
    return false;
  }

  const composer = await waitForComposer(page, 6_000).catch(() => null);
  if (!composer) {
    return false;
  }

  await composer.click({ timeout: 2_000 }).catch(() => {});
  await composer.click({ timeout: 2_000, force: true }).catch(() => {});
  await composer
    .evaluate((el) => {
      (el as HTMLElement).focus();
    })
    .catch(() => {});

  const pasteShortcut = process.platform === "darwin" ? "Meta+V" : "Control+V";
  await page.keyboard.press(pasteShortcut).catch(() => {});

  return (await waitForAttachmentSendButton(page, 8_000)) !== null;
}

export async function sendFileAttachment(
  page: Page,
  filePath: string,
  options: SendFileAttachmentOptions = {}
): Promise<void> {
  const mode = options.mode ?? "any";
  await waitForComposer(page, 30_000);
  const beforeOutgoingMediaCount = await countOutgoingMediaBubbles(page);

  let selected = false;
  let sentAutomatically = false;

  const markAutoSendIfDetected = async (source: string, timeoutMs = 3_000): Promise<boolean> => {
    const autoSent = await didOutgoingMediaIncrease(page, beforeOutgoingMediaCount, timeoutMs);
    logAttach(source, "auto-sent =", autoSent);
    if (autoSent) {
      selected = true;
      sentAutomatically = true;
    }
    return autoSent;
  };

  const trySubmitByEnter = async (source: string, timeoutMs = 3_000): Promise<boolean> => {
    await page.keyboard.press("Enter").catch(() => {});
    const submitted = await didOutgoingMediaIncrease(page, beforeOutgoingMediaCount, timeoutMs);
    logAttach(source, "submit-by-enter =", submitted);
    if (submitted) {
      selected = true;
      sentAutomatically = true;
    }
    return submitted;
  };

  const trySubmitViaKnownSendControls = async (source: string, timeoutMs = 3_000): Promise<boolean> => {
    const candidates = page.locator(
      [
        ".chat-input-container button.send",
        ".chat-input-container .btn-send",
        ".input-message-container button.send",
        ".input-message-container .btn-send",
        ".chat-input-container button[aria-label*='Send' i]",
        ".chat-input-container button[title*='Send' i]",
        ".input-message-container button[aria-label*='Send' i]",
        ".input-message-container button[title*='Send' i]",
        ".chat-input-container button[aria-label*='Отправ' i]",
        ".chat-input-container button[title*='Отправ' i]",
        ".input-message-container button[aria-label*='Отправ' i]",
        ".input-message-container button[title*='Отправ' i]"
      ].join(", ")
    );
    const count = await candidates.count().catch(() => 0);
    logAttach(source, "known send controls =", count);
    if (count === 0) {
      return false;
    }

    for (let index = count - 1; index >= 0; index--) {
      const candidate = candidates.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }
      if (await isLikelyVoiceControl(candidate)) {
        logAttach(source, "skip voice-like control index =", index);
        continue;
      }

      await candidate.click({ timeout: 1_500 }).catch(async () => {
        await candidate.click({ timeout: 1_000, force: true }).catch(() => {});
      });

      const submitted = await didOutgoingMediaIncrease(page, beforeOutgoingMediaCount, timeoutMs);
      logAttach(source, "submit-via-known-send index =", index, "submitted =", submitted);
      if (submitted) {
        selected = true;
        sentAutomatically = true;
        return true;
      }
    }

    return false;
  };

  const chooseViaDirectChatInput = async (): Promise<boolean> => {
    const directInputs = page.locator(
      ".chat-input-container input[type='file'], .input-message-container input[type='file'], input[type='file']"
    );
    const count = await directInputs.count().catch(() => 0);
    logAttach("pre-direct input count =", count);
    if (count === 0) {
      return false;
    }

    for (let index = 0; index < count; index++) {
      try {
        await setInputFilesWithEvents(directInputs.nth(index), filePath);
        const sendReady = (await waitForAttachmentSendButton(page, 3_500)) !== null;
        logAttach("pre-direct index =", index, "sendReady =", sendReady);
        if (sendReady) {
          return true;
        }
        if (await markAutoSendIfDetected(`pre-direct index=${index}`)) {
          return true;
        }
        if (await trySubmitByEnter(`pre-direct index=${index}`)) {
          return true;
        }
        if (await trySubmitViaKnownSendControls(`pre-direct index=${index}`)) {
          return true;
        }
      } catch {
        // try next input
      }
    }

    return false;
  };

  selected = await chooseViaDirectChatInput();

  const chooseViaAttachMenu = async (): Promise<boolean> => {
    const attachButtons = page.locator(ATTACH_BUTTON_SELECTORS);
    const attachCount = await attachButtons.count().catch(() => 0);
    logAttach("attach button candidates =", attachCount);
    if (attachCount === 0) {
      return false;
    }

    for (let buttonIndex = attachCount - 1; buttonIndex >= 0; buttonIndex--) {
      const attachButton = attachButtons.nth(buttonIndex);
      const attachVisible = await attachButton.isVisible().catch(() => false);
      if (!attachVisible) {
        continue;
      }

      await attachButton.click({ timeout: 2_000 }).catch(async () => {
        await attachButton.click({ force: true, timeout: 1_500 }).catch(() => {});
      });

      const menuItems = page.locator(ATTACH_MENU_ITEM_SELECTORS);
      const menuItem =
        mode === "photo"
          ? menuItems.filter({ hasText: PHOTO_MENU_ITEM_RE }).first()
          : mode === "document"
            ? menuItems.filter({ hasText: DOCUMENT_MENU_ITEM_RE }).first()
            : menuItems
                .filter({ hasText: /Photo or Video|Document|Фото|Видео|Файл|Документ/i })
                .first();

      const menuVisible = await menuItem.isVisible().catch(() => false);
      logAttach("menu item visible =", menuVisible, "mode =", mode, "buttonIndex =", buttonIndex);
      if (!menuVisible) {
        continue;
      }

      try {
        const chooserPromise = page.waitForEvent("filechooser", { timeout: 5_000 }).catch(() => null);
        await menuItem.click({ timeout: 3_000 }).catch(async () => {
          await menuItem.click({ force: true, timeout: 1_500 }).catch(() => {});
        });
        await dumpFileInputs(page, "after-menu-click");
        const chooser = await chooserPromise;
        logAttach("filechooser opened =", Boolean(chooser));

        if (chooser) {
          await chooser.setFiles(filePath);
        } else {
          const fileInputs = page.locator("input[type='file']");
          const count = await fileInputs.count().catch(() => 0);
          logAttach("fallback file input count =", count);
          if (count === 0) {
            continue;
          }

          let applied = false;
          for (let index = 0; index < count; index++) {
            try {
              await setInputFilesWithEvents(fileInputs.nth(index), filePath);
              logAttach("setInputFiles applied on index =", index);
              const sendReady = (await waitForAttachmentSendButton(page, 4_000)) !== null;
              if (sendReady) {
                return true;
              }
              if (await markAutoSendIfDetected(`menu setInput index=${index}`, 4_000)) {
                return true;
              }
              if (await trySubmitByEnter(`menu setInput index=${index}`, 4_000)) {
                return true;
              }
              if (await trySubmitViaKnownSendControls(`menu setInput index=${index}`, 4_000)) {
                return true;
              }
              applied = true;
            } catch {
              // try next input
            }
          }

          if (!applied) {
            continue;
          }
        }

        const sendReady = (await waitForAttachmentSendButton(page, 15_000)) !== null;
        logAttach("send button visible after menu flow =", sendReady);
        if (sendReady) {
          return true;
        }
        if (await markAutoSendIfDetected(`menu buttonIndex=${buttonIndex}`, 5_000)) {
          return true;
        }
        if (await trySubmitByEnter(`menu buttonIndex=${buttonIndex}`, 5_000)) {
          return true;
        }
        if (await trySubmitViaKnownSendControls(`menu buttonIndex=${buttonIndex}`, 5_000)) {
          return true;
        }
      } catch {
        logAttach("chooseViaAttachMenu crashed at buttonIndex =", buttonIndex);
      }
    }

    return false;
  };

  for (let attempt = 0; attempt < 3 && !selected; attempt++) {
    selected = await chooseViaAttachMenu();
    if (!selected) {
      await page.waitForTimeout(300);
    }
  }

  if (!selected) {
    const inputSelectors =
      mode === "photo"
        ? [
            "input[type='file'][accept*='image']",
            "input[type='file'][accept*='video']",
            "input[type='file']"
          ]
        : mode === "document"
          ? ["input[type='file']:not([accept*='image'])", "input[type='file']"]
          : ["input[type='file']"];

    for (const selector of inputSelectors) {
      const fileInputs = page.locator(selector);
      const count = await fileInputs.count().catch(() => 0);
      logAttach("direct selector =", selector, "count =", count);
      if (count === 0) {
        continue;
      }

      for (let index = 0; index < count; index++) {
        try {
          await setInputFilesWithEvents(fileInputs.nth(index), filePath);
          const sendReady = (await waitForAttachmentSendButton(page, 2_500)) !== null;
          logAttach("direct setInputFiles index =", index, "sendReady =", sendReady);
          if (sendReady) {
            selected = true;
            break;
          }
          if (await markAutoSendIfDetected(`direct selector=${selector} index=${index}`)) {
            selected = true;
            break;
          }
          if (await trySubmitByEnter(`direct selector=${selector} index=${index}`)) {
            selected = true;
            break;
          }
          if (await trySubmitViaKnownSendControls(`direct selector=${selector} index=${index}`)) {
            selected = true;
            break;
          }
        } catch {
          // try next input
        }
      }

      if (selected) {
        break;
      }
    }
  }

  const chooseViaProgrammaticInputClick = async (): Promise<boolean> => {
    const fileInputs = page.locator("input[type='file']");
    const count = await fileInputs.count().catch(() => 0);
    logAttach("programmatic input-click count =", count);
    if (count === 0) {
      return false;
    }

    for (let index = 0; index < count; index++) {
      try {
        const chooserPromise = page.waitForEvent("filechooser", { timeout: 2_500 }).catch(() => null);
        await fileInputs
          .nth(index)
          .evaluate((node) => {
            (node as HTMLInputElement).click();
          })
          .catch(() => {});
        const chooser = await chooserPromise;
        logAttach("programmatic chooser opened on index =", index, "opened =", Boolean(chooser));
        if (!chooser) {
          continue;
        }

        await chooser.setFiles(filePath);

        const sendReady = (await waitForAttachmentSendButton(page, 6_000)) !== null;
        if (sendReady) {
          return true;
        }
        if (await markAutoSendIfDetected(`programmatic chooser index=${index}`, 4_000)) {
          return true;
        }
        if (await trySubmitByEnter(`programmatic chooser index=${index}`, 4_000)) {
          return true;
        }
        if (await trySubmitViaKnownSendControls(`programmatic chooser index=${index}`, 4_000)) {
          return true;
        }
      } catch {
        // try next input
      }
    }

    return false;
  };

  if (!selected) {
    selected = await chooseViaProgrammaticInputClick();
  }

  if (!selected) {
    logAttach("trying clipboard fallback");
    selected = await chooseViaClipboardPaste(page, filePath, mode);
    logAttach("clipboard fallback selected =", selected);
  }

  if (!selected) {
    throw new Error(`Could not choose Telegram attachment file (mode=${mode}).`);
  }

  if (!sentAutomatically) {
    const modalSendButton = await waitForAttachmentSendButton(page, 8_000);
    if (modalSendButton) {
      await modalSendButton.click();
      return;
    }

    if (await markAutoSendIfDetected("final no-preview check", 5_000)) {
      return;
    }

    if (await trySubmitByEnter("final no-preview enter fallback", 5_000)) {
      return;
    }

    if (await trySubmitViaKnownSendControls("final no-preview send-controls fallback", 5_000)) {
      return;
    }

    throw new Error(`Attachment preview did not open (mode=${mode}).`);
  }
}
export async function clickInlineButtonByText(page: Page, text: string): Promise<void> {
  await scrollChatToBottom(page);
  const target = normalize(text);
  const targetRe = new RegExp(`^\\s*${escapeRegex(target)}\\s*$`, "i");

  await expect
    .poll(async () => await hasInlineButton(page, target), { timeout: 20_000 })
    .toBeTruthy();

  const textButton = page.locator(TELEGRAM_BUTTON_TEXT_SELECTORS).filter({ hasText: targetRe }).last();
  if (await textButton.isVisible().catch(() => false)) {
    try {
      await textButton.click({ timeout: 3_000 });
      return;
    } catch {
      try {
        await textButton.click({ timeout: 2_000, force: true });
        return;
      } catch {
        // try next strategy
      }
    }
  }

  const roleButton = page.getByRole("button", { name: targetRe }).last();
  if (await roleButton.isVisible().catch(() => false)) {
    try {
      await roleButton.click({ timeout: 3_000 });
      return;
    } catch {
      try {
        await roleButton.click({ timeout: 2_000, force: true });
        return;
      } catch {
        // try next strategy
      }
    }
  }

  const genericButton = page.locator(TELEGRAM_BUTTON_SELECTORS).filter({ hasText: targetRe }).last();
  if (await genericButton.isVisible().catch(() => false)) {
    try {
      await genericButton.click({ timeout: 3_000 });
      return;
    } catch {
      try {
        await genericButton.click({ timeout: 2_000, force: true });
        return;
      } catch {
        // try next strategy
      }
    }
  }

  const clickedInDom = await page.evaluate(
    ({ selectors, textToMatch }) => {
      const normalizeText = (value: string) =>
        value
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      const isVisible = (el: Element) => {
        const style = window.getComputedStyle(el as HTMLElement);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        const rect = (el as HTMLElement).getBoundingClientRect();
        const intersectsViewport =
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        return rect.width > 0 && rect.height > 0 && intersectsViewport;
      };

      const target = normalizeText(textToMatch);
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors));
      const clickable = nodes
        .map((node) => {
          const text = normalizeText(node.innerText || node.textContent || "");
          if (!text || text !== target) {
            return null;
          }

          const actionTarget =
            node.closest("button, [role='button'], .btn, .reply-markup-button, .inline-button") || node;
          return isVisible(actionTarget) ? actionTarget : null;
        })
        .filter((node): node is HTMLElement => Boolean(node));

      const targetNode = clickable.at(-1);
      if (!targetNode) {
        return false;
      }

      targetNode.click();
      return true;
    },
    { selectors: TELEGRAM_BUTTON_SELECTORS, textToMatch: target }
  );

  if (!clickedInDom) {
    throw new Error(`Button "${target}" was not found in Telegram Web.`);
  }
}

export async function hasInlineButton(page: Page, text: string): Promise<boolean> {
  await scrollChatToBottom(page);
  const target = normalize(text);
  const targetRe = new RegExp(`^\\s*${escapeRegex(target)}\\s*$`, "i");

  const textButton = page.locator(TELEGRAM_BUTTON_TEXT_SELECTORS).filter({ hasText: targetRe }).last();
  if (await textButton.isVisible().catch(() => false)) {
    return true;
  }

  const roleButton = page.getByRole("button", { name: targetRe }).last();
  if (await roleButton.isVisible().catch(() => false)) {
    return true;
  }

  const genericButton = page.locator(TELEGRAM_BUTTON_SELECTORS).filter({ hasText: targetRe }).last();
  if (await genericButton.isVisible().catch(() => false)) {
    return true;
  }

  return await page.evaluate(
    ({ selectors, textToMatch }) => {
      const normalizeText = (value: string) =>
        value
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      const isVisible = (el: Element) => {
        const style = window.getComputedStyle(el as HTMLElement);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        const rect = (el as HTMLElement).getBoundingClientRect();
        const intersectsViewport =
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        return rect.width > 0 && rect.height > 0 && intersectsViewport;
      };

      const target = normalizeText(textToMatch);
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors));
      return nodes.some((node) => {
        const text = normalizeText(node.innerText || node.textContent || "");
        if (text !== target) {
          return false;
        }

        const actionTarget =
          node.closest("button, [role='button'], .btn, .reply-markup-button, .inline-button") || node;
        return isVisible(actionTarget);
      });
    },
    { selectors: TELEGRAM_BUTTON_SELECTORS, textToMatch: target }
  );
}

async function clickMiniAppHumanButtonInTarget(target: Page | Frame): Promise<boolean> {
  const roleButton = target.getByRole("button", { name: MINI_APP_HUMAN_BUTTON_RE }).first();
  if (await roleButton.isVisible().catch(() => false)) {
    await roleButton.click();
    return true;
  }

  const fallbackButton = target
    .locator("button, [role='button']")
    .filter({ hasText: MINI_APP_HUMAN_BUTTON_RE })
    .first();
  if (await fallbackButton.isVisible().catch(() => false)) {
    await fallbackButton.click();
    return true;
  }

  return false;
}

async function clickMiniAppVerificationActionInTarget(target: Page | Frame): Promise<boolean> {
  const actionRegexes = [
    MINI_APP_HUMAN_BUTTON_RE,
    MINI_APP_CONFIRM_BUTTON_RE,
    MINI_APP_CONTINUE_BUTTON_RE
  ];

  for (const actionRe of actionRegexes) {
    const roleButton = target.getByRole("button", { name: actionRe }).first();
    if (await roleButton.isVisible().catch(() => false)) {
      await roleButton.click();
      return true;
    }

    const fallbackButton = target
      .locator("button, [role='button'], .btn, .Button")
      .filter({ hasText: actionRe })
      .first();
    if (await fallbackButton.isVisible().catch(() => false)) {
      await fallbackButton.click();
      return true;
    }
  }

  return false;
}

async function clickTelegramWebAppLaunchInTarget(target: Page | Frame): Promise<boolean> {
  const roleButton = target.getByRole("button", { name: TELEGRAM_WEBAPP_LAUNCH_RE }).first();
  if (await roleButton.isVisible().catch(() => false)) {
    await roleButton.click();
    return true;
  }

  const fallbackButton = target
    .locator("button, [role='button'], .btn, .Button")
    .filter({ hasText: TELEGRAM_WEBAPP_LAUNCH_RE })
    .first();
  if (await fallbackButton.isVisible().catch(() => false)) {
    await fallbackButton.click();
    return true;
  }

  return false;
}

async function clickMiniAppHumanButtonInPage(targetPage: Page): Promise<boolean> {
  if (targetPage.isClosed()) {
    return false;
  }

  if (await clickMiniAppHumanButtonInTarget(targetPage)) {
    return true;
  }

  for (const frame of targetPage.frames()) {
    if (frame === targetPage.mainFrame()) {
      continue;
    }

    if (await clickMiniAppHumanButtonInTarget(frame).catch(() => false)) {
      return true;
    }
  }

  return false;
}

export async function completeMiniAppHumanVerification(
  page: Page,
  timeoutMs = 35_000,
  preferredPopup: Page | null = null
): Promise<boolean> {
  const startedAt = Date.now();
  let verificationActionClicked = false;

  while (Date.now() - startedAt < timeoutMs) {
    const contextPages = page.context().pages().filter((candidate) => candidate !== page);
    const orderedPages = [
      ...(preferredPopup && !preferredPopup.isClosed() ? [preferredPopup] : []),
      page,
      ...contextPages
    ].filter((candidate, index, arr) => arr.indexOf(candidate) === index);

    for (const candidate of orderedPages) {
      let launchClicked = false;
      if (await clickTelegramWebAppLaunchInTarget(candidate).catch(() => false)) {
        launchClicked = true;
      } else {
        for (const frame of candidate.frames()) {
          if (frame === candidate.mainFrame()) {
            continue;
          }
          if (await clickTelegramWebAppLaunchInTarget(frame).catch(() => false)) {
            launchClicked = true;
            break;
          }
        }
      }

      if (launchClicked) {
        await page.waitForTimeout(800);
      }
    }

    for (const candidate of orderedPages) {
      if (await clickMiniAppVerificationActionInTarget(candidate).catch(() => false)) {
        verificationActionClicked = true;
        await page.waitForTimeout(900);
        continue;
      }

      for (const frame of candidate.frames()) {
        if (frame === candidate.mainFrame()) {
          continue;
        }
        if (await clickMiniAppVerificationActionInTarget(frame).catch(() => false)) {
          verificationActionClicked = true;
          await page.waitForTimeout(900);
          break;
        }
      }

      if (await clickMiniAppHumanButtonInPage(candidate).catch(() => false)) {
        await page.waitForTimeout(1_000);
        return true;
      }
    }

    await page.waitForTimeout(350);
  }

  return verificationActionClicked;
}

export async function collectTailMessages(page: Page, limit = 10): Promise<string[]> {
  return await page.evaluate(
    ({ selectors, max }) => {
      const scrollTargets = [
        ".bubbles",
        ".bubbles-inner",
        ".chat-history",
        ".chat",
        ".Scrollable",
        ".scrollable-y"
      ];
      for (const selector of scrollTargets) {
        const nodes = document.querySelectorAll<HTMLElement>(selector);
        for (const node of nodes) {
          if (node.scrollHeight > node.clientHeight) {
            node.scrollTop = node.scrollHeight;
          }
        }
      }

      const unionSelector = selectors.join(", ");
      return [...document.querySelectorAll<HTMLElement>(unionSelector)]
        .map((node) => (node.innerText || node.textContent || "").trim())
        .filter((text) => text.length > 0)
        .slice(-max);
    },
    { selectors: MESSAGE_SELECTORS, max: limit }
  );
}

export async function tailContainsAny(
  page: Page,
  anchors: string[],
  limit = 15,
  timeout = 45_000
): Promise<void> {
  const prepared = anchors.map(normalize);
  await expect
    .poll(
      async () => {
        const tail = await collectTailMessages(page, limit);
        return prepared.some((anchor) => tail.some((message) => normalize(message).includes(anchor)));
      },
      { timeout }
    )
    .toBeTruthy();
}

export async function isComposerVisible(page: Page): Promise<boolean> {
  for (const selector of COMPOSER_SELECTORS) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) {
      return true;
    }
  }

  return false;
}

async function waitForComposer(page: Page, timeoutMs: number): Promise<Locator> {
  for (const selector of COMPOSER_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: timeoutMs });
      return locator;
    } catch {
      // try next selector
    }
  }

  throw new Error(
    "Telegram message composer was not found. Most likely Telegram Web auth is missing for this session."
  );
}

