import fs from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { collectTailMessages } from "./telegram-web";

export type EvidenceStatus = "passed" | "failed" | "info";

export type EvidenceStep = {
  index: number;
  name: string;
  status: EvidenceStatus;
  time: string;
  action?: string;
  screenshot?: string;
  error?: string;
  tail: string[];
};

const normalizeLabel = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "step";

export class EvidenceRecorder {
  readonly dir: string;
  readonly steps: EvidenceStep[] = [];

  constructor(
    private readonly testInfo: TestInfo,
    dirName = "evidence"
  ) {
    this.dir = testInfo.outputPath(dirName);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async append(
    page: Page,
    index: number,
    name: string,
    status: EvidenceStatus,
    action?: string,
    error?: unknown
  ): Promise<void> {
    const time = new Date().toISOString();
    const errorText = error instanceof Error ? error.message : error ? String(error) : undefined;
    const tail = page.isClosed() ? [] : await collectTailMessages(page, 120).catch(() => []);
    const screenshotName = `${String(index).padStart(2, "0")}-${normalizeLabel(name)}.png`;
    const screenshotPath = path.join(this.dir, screenshotName);
    let screenshot: string | undefined;

    if (!page.isClosed()) {
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      if (fs.existsSync(screenshotPath)) {
        screenshot = screenshotName;
        await this.testInfo.attach(`step-${index}-${name}-screenshot`, {
          path: screenshotPath,
          contentType: "image/png"
        });
      }
    }

    const step: EvidenceStep = {
      index,
      name,
      status,
      time,
      action,
      screenshot,
      error: errorText,
      tail
    };

    this.steps.push(step);
    this.writeTranscriptStep(step);
    this.flush();

    await this.testInfo.attach(`step-${index}-${name}-tail`, {
      body: tail.join("\n\n---\n\n"),
      contentType: "text/plain"
    });
  }

  flush(): void {
    fs.writeFileSync(
      path.join(this.dir, "report.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), steps: this.steps }, null, 2),
      "utf8"
    );
  }

  private writeTranscriptStep(step: EvidenceStep): void {
    const transcriptPath = path.join(this.dir, "transcript.md");
    const lines = [
      `## ${step.index}. ${step.name}`,
      `- Status: ${step.status}`,
      `- Time: ${step.time}`
    ];

    if (step.action) {
      lines.push(`- Action: ${step.action}`);
    }
    if (step.error) {
      lines.push(`- Error: ${step.error}`);
    }
    if (step.screenshot) {
      lines.push(`- Screenshot: ${step.screenshot}`);
    }

    lines.push("- Tail messages:");
    for (const message of step.tail.slice(-14)) {
      lines.push(`  - ${message.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("");

    fs.appendFileSync(transcriptPath, `${lines.join("\n")}\n`, "utf8");
  }
}
