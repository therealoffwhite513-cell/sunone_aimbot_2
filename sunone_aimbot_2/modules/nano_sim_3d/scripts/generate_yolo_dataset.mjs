import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  SIM_YOLO_CLASS_NAMES,
  createPoseSidecar,
  splitName,
  toYoloLabelText
} from "../src/yolo_dataset.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const options = {
  samples: numberArg(args.samples, 500),
  width: numberArg(args.width, 640),
  height: numberArg(args.height, 640),
  seed: numberArg(args.seed, 1337),
  trainRatio: numberArg(args.trainRatio, 0.88),
  port: numberArg(args.port, 5177),
  out: resolve(root, args.out ?? "training/sim_yolo_dataset"),
  clean: args.clean !== "false",
  chrome: args.chrome ?? findChrome()
};

if (!options.chrome || !existsSync(options.chrome)) {
  throw new Error("Chrome or Edge was not found. Pass --chrome C:\\path\\to\\chrome.exe");
}

let serverProcess = null;

try {
  await ensureServer();
  await prepareDataset();

  const browser = await chromium.launch({
    headless: true,
    executablePath: options.chrome
  });
  const page = await browser.newPage({
    viewport: {
      width: options.width,
      height: options.height
    },
    deviceScaleFactor: 1
  });

  await page.goto(`http://127.0.0.1:${options.port}/dataset_render.html`, {
    waitUntil: "networkidle",
    timeout: 30000
  });
  await page.waitForFunction(() => Boolean(window.nanoYoloRenderer));

  for (let i = 0; i < options.samples; i += 1) {
    const split = splitName(i, options.samples, options.trainRatio);
    const stem = `sim_target_${String(i).padStart(6, "0")}`;
    const sample = await page.evaluate((renderOptions) => {
      return window.nanoYoloRenderer.renderSample(renderOptions);
    }, {
      width: options.width,
      height: options.height,
      seed: options.seed,
      index: i
    });

    const imagePath = join(options.out, "images", split, `${stem}.jpg`);
    const labelPath = join(options.out, "labels", split, `${stem}.txt`);
    const posePath = join(options.out, "poses", split, `${stem}.json`);
    await page.locator("#renderCanvas").screenshot({
      path: imagePath,
      type: "jpeg",
      quality: 92
    });
    await writeFile(labelPath, toYoloLabelText(sample, options.width, options.height), "utf8");
    await writeFile(posePath, `${JSON.stringify(createPoseSidecar(sample), null, 2)}\n`, "utf8");

    if ((i + 1) % 50 === 0 || i + 1 === options.samples) {
      console.log(`generated ${i + 1}/${options.samples}`);
    }
  }

  await browser.close();
  await writeDatasetYaml();
  console.log(`dataset written to ${options.out}`);
} finally {
  if (serverProcess) {
    serverProcess.kill();
  }
}

async function prepareDataset() {
  if (options.clean && existsSync(options.out)) {
    await rm(options.out, { recursive: true, force: true });
  }

  for (const split of ["train", "val"]) {
    await mkdir(join(options.out, "images", split), { recursive: true });
    await mkdir(join(options.out, "labels", split), { recursive: true });
    await mkdir(join(options.out, "poses", split), { recursive: true });
  }
}

async function writeDatasetYaml() {
  const yaml = [
    `path: ${toYamlPath(options.out)}`,
    "train: images/train",
    "val: images/val",
    "names:",
    ...SIM_YOLO_CLASS_NAMES.map((className, classId) => `  ${classId}: ${className}`),
    ""
  ].join("\n");
  await writeFile(join(options.out, "dataset.yaml"), yaml, "utf8");
}

async function ensureServer() {
  const url = `http://127.0.0.1:${options.port}/dataset_render.html`;
  if (await canFetch(url)) {
    return;
  }

  serverProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(options.port)
    },
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
  throw new Error("Timed out waiting for local dataset renderer server.");
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

function toYamlPath(path) {
  return path.replaceAll("\\", "/");
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
