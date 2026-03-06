import fs from "node:fs";

const logPath = (process.argv[2] || "autorun-output.log").trim();
const outputPath = (process.argv[3] || ".cloudflare-report-failure.json").trim();
const runStatus = String(process.env.RUN_STATUS || "").trim().toLowerCase();

function writeResult(result) {
  fs.writeFileSync(outputPath, JSON.stringify(result));
  console.log(`Saved failure reason to ${outputPath}: ${JSON.stringify(result)}`);
}

if (runStatus === "success") {
  writeResult({});
  process.exit(0);
}

if (!fs.existsSync(logPath)) {
  writeResult({
    message: "Run failed, but no autorun log file was found."
  });
  process.exit(0);
}

const raw = fs.readFileSync(logPath, "utf8");
const markerMatches = [...raw.matchAll(/REPORT_REASON:([a-z_]+):([^\r\n]+)/g)];
if (markerMatches.length > 0) {
  const [, code, message] = markerMatches[markerMatches.length - 1];
  writeResult({
    code: String(code || "").trim(),
    message: String(message || "").trim()
  });
  process.exit(0);
}

if (/\/join_task returned no-task branch/i.test(raw) || /There are no tasks available now/i.test(raw)) {
  writeResult({
    code: "no_task",
    message: "Bot did not provide a new task."
  });
  process.exit(0);
}

const errorMatches = [...raw.matchAll(/Error:\s*([^\r\n]+)/g)];
const lastErrorMessage = errorMatches.length > 0 ? String(errorMatches[errorMatches.length - 1][1] || "").trim() : "";

writeResult(
  lastErrorMessage
    ? { message: lastErrorMessage }
    : { message: "Run failed without a recognized failure reason." }
);
