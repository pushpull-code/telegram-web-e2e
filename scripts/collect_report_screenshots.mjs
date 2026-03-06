import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OUTPUT_PATH = process.argv[2] || ".cloudflare-report-screenshots.json";
const ROOTS = ["test-results", "playwright-report"];
const MAX_FILES = Number(process.env.REPORT_SCREENSHOT_MAX || "8");
const MAX_FILE_BYTES = 1_500_000;
const MAX_TOTAL_BASE64_CHARS = 4_000_000;

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

function isScreenshot(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp")
  );
}

function mimeByFile(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

function isReportStep(filePath) {
  return path.basename(filePath).toLowerCase().startsWith("report-step-");
}

function gatherCandidates() {
  const files = [];
  for (const root of ROOTS) {
    walkFiles(root, files);
  }
  const screenshotFiles = files
    .filter(isScreenshot)
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs, size: stat.size, reportStep: isReportStep(filePath) };
    });

  const reportSteps = screenshotFiles
    .filter((item) => item.reportStep)
    .sort((a, b) => path.basename(a.filePath).localeCompare(path.basename(b.filePath)));

  if (reportSteps.length > 0) {
    return reportSteps;
  }

  return screenshotFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function collectScreenshots() {
  const candidates = gatherCandidates();
  const selected = [];
  const seenHashes = new Set();
  let totalBase64Chars = 0;

  for (const item of candidates) {
    if (selected.length >= MAX_FILES) {
      break;
    }
    if (item.size <= 0 || item.size > MAX_FILE_BYTES) {
      continue;
    }

    const buffer = fs.readFileSync(item.filePath);
    const hash = crypto.createHash("sha1").update(buffer).digest("hex");
    if (seenHashes.has(hash)) {
      continue;
    }
    const dataBase64 = buffer.toString("base64");
    if (totalBase64Chars + dataBase64.length > MAX_TOTAL_BASE64_CHARS) {
      continue;
    }

    selected.push({
      name: path.basename(item.filePath),
      mime_type: mimeByFile(item.filePath),
      data_base64: dataBase64
    });
    seenHashes.add(hash);
    totalBase64Chars += dataBase64.length;
  }

  return selected;
}

const screenshots = collectScreenshots();
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(screenshots));
console.log(`Saved ${screenshots.length} screenshot(s) to ${OUTPUT_PATH}`);
