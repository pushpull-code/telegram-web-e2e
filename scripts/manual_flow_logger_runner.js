const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const command = (process.argv[2] || "status").toLowerCase();
const repoRoot = path.resolve(__dirname, "..");
const logsRoot = path.join(repoRoot, "output", "playwright", "manual-log");
const statePath = path.join(logsRoot, ".active-run.json");
const loggerEntry = path.join(repoRoot, "scripts", "manual_flow_logger.js");

function ensureLogsRoot() {
  fs.mkdirSync(logsRoot, { recursive: true });
}

function formatStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readState() {
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeState(value) {
  ensureLogsRoot();
  fs.writeFileSync(statePath, JSON.stringify(value, null, 2), "utf8");
}

function removeState() {
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

function stopPidTree(pid) {
  if (!isAlive(pid)) {
    return false;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return !isAlive(pid);
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }

  return !isAlive(pid);
}

function start() {
  ensureLogsRoot();
  const active = readState();
  if (active && isAlive(active.pid)) {
    console.log(
      JSON.stringify(
        {
          status: "already-running",
          pid: active.pid,
          sessionDir: active.sessionDir,
          startedAt: active.startedAt
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const sessionName = `session-${formatStamp()}`;
  const sessionDir = path.join(logsRoot, sessionName);
  fs.mkdirSync(sessionDir, { recursive: true });
  const runnerLogPath = path.join(sessionDir, "runner.log");
  const runnerLogFd = fs.openSync(runnerLogPath, "a");

  const env = {
    ...process.env,
    MANUAL_LOG_DIR: sessionDir,
    MANUAL_LOG_DURATION_SEC: process.env.MANUAL_LOG_DURATION_SEC || "3600",
    MANUAL_LOG_POLL_MS: process.env.MANUAL_LOG_POLL_MS || "1000"
  };

  const child = spawn(process.execPath, [loggerEntry], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ["ignore", runnerLogFd, runnerLogFd],
    windowsHide: false
  });
  child.unref();

  writeState({
    pid: child.pid,
    sessionDir,
    runnerLogPath,
    startedAt: new Date().toISOString(),
    botUsername: process.env.BOT_USERNAME || "artp345_bot",
    durationSec: Number(env.MANUAL_LOG_DURATION_SEC),
    pollMs: Number(env.MANUAL_LOG_POLL_MS)
  });

  console.log(
    JSON.stringify(
      {
        status: "started",
        pid: child.pid,
        sessionDir,
        runnerLogPath
      },
      null,
      2
    )
  );
}

function status() {
  const active = readState();
  if (!active) {
    console.log(JSON.stringify({ status: "idle" }, null, 2));
    return;
  }

  const alive = isAlive(active.pid);
  console.log(
    JSON.stringify(
      {
        status: alive ? "running" : "stale-state",
        pid: active.pid,
        sessionDir: active.sessionDir,
        runnerLogPath: active.runnerLogPath,
        startedAt: active.startedAt
      },
      null,
      2
    )
  );
}

function stop() {
  const active = readState();
  if (!active) {
    console.log(JSON.stringify({ status: "idle" }, null, 2));
    return;
  }

  const killed = stopPidTree(active.pid);
  removeState();
  console.log(
    JSON.stringify(
      {
        status: killed ? "stopped" : "not-running",
        pid: active.pid,
        sessionDir: active.sessionDir,
        runnerLogPath: active.runnerLogPath
      },
      null,
      2
    )
  );
}

if (command === "start") {
  start();
} else if (command === "stop") {
  stop();
} else if (command === "status") {
  status();
} else {
  console.error(`Unknown command: ${command}. Use start | stop | status.`);
  process.exit(1);
}
