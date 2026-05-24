import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { analyzeSamples, formatAnalysis } from "../src/monitor_analysis.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const options = {
  port: numberArg(args.port, 5177),
  durationSec: numberArg(args.duration, 5),
  intervalMs: numberArg(args.interval, 50),
  scenarios: (args.scenarios ?? "stationary,depth,strafe,zigzag,jump").split(",").map((item) => item.trim()).filter(Boolean),
  chrome: args.chrome ?? findChrome(),
  out: resolve(root, args.out ?? "results/live_monitor_latest.json")
};

if (!options.chrome || !existsSync(options.chrome)) {
  throw new Error("Chrome or Edge was not found. Pass --chrome C:\\path\\to\\chrome.exe");
}

let serverProcess = null;

try {
  await ensureServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: options.chrome
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });

  await page.goto(`http://127.0.0.1:${options.port}/?monitor=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 30000
  });
  await page.waitForFunction(() => Boolean(window.nanoSimGetSnapshot));

  const report = [];
  for (const scenario of options.scenarios) {
    await page.evaluate((name) => window.nanoSimSetScenario(name), scenario);
    await page.waitForTimeout(500);
    const samples = [];
    const start = Date.now();
    while (Date.now() - start < options.durationSec * 1000) {
      samples.push(await page.evaluate(() => window.nanoSimGetSnapshot()));
      await page.waitForTimeout(options.intervalMs);
    }
    const analysis = analyzeSamples(scenario, samples);
    report.push({ analysis, samples });
    console.log(formatAnalysis(analysis));
  }

  await browser.close();
  if (browserErrors.length) {
    throw new Error(browserErrors.join("\n"));
  }

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, JSON.stringify({
    createdAt: new Date().toISOString(),
    options,
    report
  }, null, 2), "utf8");
  console.log(`wrote ${options.out}`);
} finally {
  if (serverProcess) {
    serverProcess.kill();
  }
}

async function ensureServer() {
  const url = `http://127.0.0.1:${options.port}/`;
  if (await canFetch(url)) {
    return;
  }

  serverProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(options.port) },
    stdio: "ignore",
    windowsHide: true
  });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await canFetch(url)) {
      return;
    }
    await sleep(150);
  }
  throw new Error("Timed out waiting for local simulator server.");
}

async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const token = values[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = values[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
