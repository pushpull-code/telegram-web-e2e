import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { EvidenceRecorder } from "./helpers/evidence";
import {
  clickInlineButtonByText,
  collectTailMessages,
  collectVisibleInlineButtons,
  isComposerVisible,
  openBotChat
} from "./helpers/telegram-web";
import { botStartPayload, botUsername } from "./helpers/bot-config";
import { buildTelegramWebStartLink } from "./helpers/scenario-runner";

type DiscoveryNode = {
  id: string;
  depth: number;
  path: string[];
  buttons: string[];
  tail: string[];
  screenshot?: string;
  skipped?: string[];
  error?: string;
};

const maxDepth = Number(process.env.DISCOVERY_MAX_DEPTH || "2");
const maxNodes = Number(process.env.DISCOVERY_MAX_NODES || "12");
const maxButtonsPerNode = Number(process.env.DISCOVERY_MAX_BUTTONS_PER_NODE || "8");
const settleMs = Number(process.env.DISCOVERY_SETTLE_MS || "1200");
const denyButtonRe = new RegExp(
  process.env.DISCOVERY_DENY_BUTTON_RE ||
    "удал|delete|withdraw|вывод|cancel|отмен|заверш|finish|confirm|подтверд|оплат|pay",
  "i"
);

function normalizeId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "root"
  );
}

function nodeId(pathParts: string[]): string {
  return pathParts.length === 0 ? "root" : pathParts.map(normalizeId).join("__");
}

async function openDiscoveryRoot(page: Parameters<typeof openBotChat>[0]): Promise<void> {
  const mode = process.env.DISCOVERY_OPEN_MODE || "start-payload";
  if (mode === "chat") {
    await openBotChat(page, botUsername);
    return;
  }

  await page.goto(buildTelegramWebStartLink(botUsername, process.env.DISCOVERY_START_PAYLOAD || botStartPayload), {
    waitUntil: "domcontentloaded"
  });
}

test.use({
  trace: "on",
  screenshot: "on",
  video: "on"
});

test.describe.serial("Telegram bot discovery runner", () => {
  test("walks visible button tree and records states", async ({ page }, testInfo) => {
    test.setTimeout(12 * 60_000);

    const evidence = new EvidenceRecorder(testInfo, "discovery");
    const reportPath = path.join(evidence.dir, "discovery-report.json");
    const nodes: DiscoveryNode[] = [];
    const queue: string[][] = [[]];
    const visited = new Set<string>();

    while (queue.length > 0 && nodes.length < maxNodes) {
      const currentPath = queue.shift() || [];
      const currentId = nodeId(currentPath);
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      await openDiscoveryRoot(page);
      await expect.poll(async () => isComposerVisible(page), { timeout: 45_000 }).toBeTruthy();
      await page.waitForTimeout(settleMs);

      let failed = false;
      for (const label of currentPath) {
        try {
          await clickInlineButtonByText(page, label);
          await page.waitForTimeout(settleMs);
        } catch (error) {
          const node: DiscoveryNode = {
            id: currentId,
            depth: currentPath.length,
            path: currentPath,
            buttons: [],
            tail: await collectTailMessages(page, 80).catch(() => []),
            error: `Failed to replay path at "${label}": ${
              error instanceof Error ? error.message : String(error)
            }`
          };
          nodes.push(node);
          await evidence.append(page, nodes.length, currentId, "failed", `replay ${currentPath.join(" > ")}`, error);
          failed = true;
          break;
        }
      }

      if (failed) {
        fs.writeFileSync(reportPath, JSON.stringify({ nodes }, null, 2), "utf8");
        continue;
      }

      const allButtons = await collectVisibleInlineButtons(page, maxButtonsPerNode);
      const skipped = allButtons.filter((label) => denyButtonRe.test(label));
      const buttons = allButtons.filter((label) => !denyButtonRe.test(label));
      const tail = await collectTailMessages(page, 80);
      const screenshotName = `${String(nodes.length + 1).padStart(2, "0")}-${currentId}.png`;
      await page.screenshot({ path: path.join(evidence.dir, screenshotName), fullPage: true }).catch(() => {});

      nodes.push({
        id: currentId,
        depth: currentPath.length,
        path: currentPath,
        buttons,
        tail,
        screenshot: screenshotName,
        skipped
      });

      await evidence.append(
        page,
        nodes.length,
        currentId,
        "info",
        currentPath.length === 0 ? "root" : `path ${currentPath.join(" > ")}`
      );

      if (currentPath.length < maxDepth) {
        for (const button of buttons) {
          const nextPath = [...currentPath, button];
          const nextId = nodeId(nextPath);
          if (!visited.has(nextId) && queue.length + nodes.length < maxNodes) {
            queue.push(nextPath);
          }
        }
      }

      fs.writeFileSync(reportPath, JSON.stringify({ nodes }, null, 2), "utf8");
    }

    await testInfo.attach("discovery-report", {
      path: reportPath,
      contentType: "application/json"
    });
  });
});
