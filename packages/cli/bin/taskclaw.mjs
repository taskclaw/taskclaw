#!/usr/bin/env node

// ============================================================
// TaskClaw CLI — Quick launcher for self-hosted TaskClaw
// ============================================================
// Usage:
//   npx taskclaw            Start TaskClaw (default: ~/taskclaw)
//   npx taskclaw start      Same as above
//   npx taskclaw stop       Stop TaskClaw
//   npx taskclaw reset      Stop + delete all data
//   npx taskclaw status     Show running containers
//   npx taskclaw logs       Tail logs
//   npx taskclaw upgrade    Pull latest images and restart
// ============================================================

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { get as httpsGet } from "node:https";

// ── Config ────────────────────────────────────────────────────

const REPO_RAW =
  "https://raw.githubusercontent.com/taskclaw/taskclaw/main";
const INSTALL_DIR = process.env.TASKCLAW_DIR || join(homedir(), "taskclaw");
const PORT = process.env.TASKCLAW_PORT || "3000";

const FILES = [
  "docker-compose.quickstart.yml",
  "docker/volumes/api/kong.quickstart.yml",
  "docker/volumes/db/roles.sql",
  "docker/volumes/db/jwt.sql",
];

// ── Colors ────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const log = (msg) => console.log(`${c.cyan}[taskclaw]${c.reset} ${msg}`);
const ok = (msg) => console.log(`${c.green}[taskclaw]${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}[taskclaw]${c.reset} ${msg}`);
const err = (msg) => console.error(`${c.red}[taskclaw]${c.reset} ${msg}`);

// ── Helpers ───────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: INSTALL_DIR,
    stdio: opts.silent ? "pipe" : "inherit",
    ...opts,
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks).toString()));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function checkDocker() {
  try {
    execSync("docker --version", { stdio: "pipe" });
  } catch {
    err("Docker is required but not found.");
    err("Install it from https://docs.docker.com/get-docker/");
    process.exit(1);
  }

  try {
    execSync("docker compose version", { stdio: "pipe" });
  } catch {
    err("Docker Compose v2 is required but not found.");
    err("It's included with Docker Desktop, or install the plugin:");
    err("  https://docs.docker.com/compose/install/");
    process.exit(1);
  }
}

async function ensureFiles() {
  if (
    existsSync(join(INSTALL_DIR, "docker-compose.yml")) &&
    existsSync(join(INSTALL_DIR, "docker/volumes/db/roles.sql"))
  ) {
    return; // Already set up
  }

  log("Downloading configuration files...");
  mkdirSync(join(INSTALL_DIR, "docker/volumes/api"), { recursive: true });
  mkdirSync(join(INSTALL_DIR, "docker/volumes/db"), { recursive: true });

  for (const file of FILES) {
    const url = `${REPO_RAW}/${file}`;
    const dest = join(
      INSTALL_DIR,
      file === "docker-compose.quickstart.yml" ? "docker-compose.yml" : file
    );
    const content = await download(url);
    writeFileSync(dest, content);
  }

  ok("Configuration files ready.");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(timeoutSec = 120) {
  log("Waiting for services to become healthy (this takes 30-60 seconds)...");
  const start = Date.now();
  while (Date.now() - start < timeoutSec * 1000) {
    try {
      execSync(`curl -sf http://localhost:${PORT}/api/health`, {
        stdio: "pipe",
        timeout: 3000,
      });
      return true;
    } catch {
      await sleep(2000);
    }
  }
  return false;
}

function printBanner() {
  console.log();
  console.log(
    `${c.green}  ══════════════════════════════════════════${c.reset}`
  );
  console.log(`${c.green}  ${c.bold}TaskClaw is ready!${c.reset}`);
  console.log(
    `${c.green}  ══════════════════════════════════════════${c.reset}`
  );
  console.log();
  console.log(`  URL:      ${c.cyan}http://localhost:${PORT}${c.reset}`);
  console.log(`  Email:    ${c.cyan}super@admin.com${c.reset}`);
  console.log(`  Password: ${c.cyan}password123${c.reset}`);
  console.log();
  console.log(
    `${c.green}  ══════════════════════════════════════════${c.reset}`
  );
  console.log();
  console.log(`${c.dim}  Useful commands:${c.reset}`);
  console.log(`  npx taskclaw stop       Stop TaskClaw`);
  console.log(`  npx taskclaw logs       View logs`);
  console.log(`  npx taskclaw status     Container status`);
  console.log(`  npx taskclaw upgrade    Pull latest & restart`);
  console.log(`  npx taskclaw reset      Stop + delete all data`);
  console.log();
}

// ── Commands ──────────────────────────────────────────────────

async function start() {
  checkDocker();
  log(`Setting up in: ${INSTALL_DIR}`);
  mkdirSync(INSTALL_DIR, { recursive: true });
  await ensureFiles();

  log("Pulling Docker images (this may take a few minutes on first run)...");
  run("docker compose pull");

  log("Starting TaskClaw...");
  run("docker compose up -d");

  const healthy = await waitForHealth();
  if (healthy) {
    printBanner();
  } else {
    warn("Services are still starting up.");
    warn(`Check status: cd ${INSTALL_DIR} && docker compose ps`);
    warn(`View logs:    cd ${INSTALL_DIR} && docker compose logs -f`);
    console.log();
    console.log(`  Once ready, open: http://localhost:${PORT}`);
    console.log(`  Login: super@admin.com / password123`);
    console.log();
  }
}

function stop() {
  log("Stopping TaskClaw...");
  run("docker compose down");
  ok("TaskClaw stopped.");
}

function reset() {
  warn("Stopping TaskClaw and deleting all data...");
  run("docker compose down -v");
  ok("TaskClaw stopped and all data deleted.");
}

function status() {
  run("docker compose ps");
}

function logs() {
  const child = spawn("docker", ["compose", "logs", "-f", "--tail", "100"], {
    cwd: INSTALL_DIR,
    stdio: "inherit",
  });
  child.on("error", () => err("Failed to run docker compose logs"));
}

async function upgrade() {
  checkDocker();
  await ensureFiles();
  log("Pulling latest images...");
  run("docker compose pull");
  log("Restarting with latest version...");
  run("docker compose up -d");

  const healthy = await waitForHealth();
  if (healthy) {
    ok("TaskClaw upgraded successfully!");
    printBanner();
  } else {
    warn("Upgrade complete. Services are still starting up.");
  }
}

// ── Main ──────────────────────────────────────────────────────

const command = process.argv[2] || "start";

const commands = { start, stop, reset, status, logs, upgrade };

if (commands[command]) {
  commands[command]().catch((e) => {
    err(e.message);
    process.exit(1);
  });
} else {
  console.log(`
${c.bold}TaskClaw CLI${c.reset}

Usage: npx taskclaw [command]

Commands:
  start     Start TaskClaw (default)
  stop      Stop TaskClaw
  reset     Stop + delete all data
  status    Show container status
  logs      Tail container logs
  upgrade   Pull latest images & restart

Options:
  TASKCLAW_DIR=./my-dir npx taskclaw   Custom install directory
  TASKCLAW_PORT=8080 npx taskclaw      Custom port (requires compose edit)

Documentation: https://github.com/taskclaw/taskclaw
`);
}
