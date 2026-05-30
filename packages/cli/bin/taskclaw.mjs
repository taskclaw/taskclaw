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
//   npx taskclaw remote     Install TaskClaw on a remote VPS over SSH
//
// Remote install (one command, from your laptop):
//   npx taskclaw remote --host <ip> [--user root] [--key <path>]
//                       [--password] [--domain <example.com>] [--port 3000]
//   Aliases also accepted:  ip=<ip> login=<user> password=<pw> domain=<d>
// ============================================================

import { execSync, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

// ============================================================
// remote — install TaskClaw on a VPS over SSH (zero-dependency)
// ============================================================

// Parse `--flag value`, `--flag`, and `alias=value` styles.
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && !next.includes("=")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true; // boolean flag
      }
    } else if (a.includes("=")) {
      const idx = a.indexOf("=");
      out[a.slice(0, idx)] = a.slice(idx + 1);
    } else {
      out._.push(a);
    }
  }
  return out;
}

function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "command",
    process.platform === "win32" ? [bin] : ["-v", bin], {
      stdio: "pipe",
      shell: process.platform !== "win32",
    });
  return r.status === 0;
}

// Hidden TTY prompt — reads a line without echoing it. Falls back to a plain
// prompt if there's no TTY (returns empty string -> caller errors out).
function promptHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      return resolve("");
    }
    process.stdout.write(question);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    let buf = "";
    const onData = (ch) => {
      const s = ch.toString("utf8");
      for (const char of s) {
        if (char === "\n" || char === "\r" || char === "\x04") {
          stdin.setRawMode(wasRaw);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(buf);
        } else if (char === "\x03") {
          // Ctrl-C
          stdin.setRawMode(wasRaw);
          stdin.pause();
          process.stdout.write("\n");
          process.exit(130);
        } else if (char === "\x7f" || char === "\b") {
          buf = buf.slice(0, -1);
        } else {
          buf += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}

// Common SSH options: no host-key prompt on first connect, fail fast.
function baseSshOpts(opts) {
  const o = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=15",
  ];
  if (opts.key) o.push("-i", opts.key);
  if (opts.port && opts.sshPort) o.push("-p", String(opts.sshPort));
  return o;
}

// Build an SSH/SCP invocation, wiring password auth via sshpass or SSH_ASKPASS.
// Returns { cmd, args, env, cleanup }.
function buildSshInvocation(kind, opts, remoteArgs) {
  const env = { ...process.env };
  let cmd;
  let args = [];
  let cleanup = () => {};

  const usePassword = !!opts.password && !opts.useKey;

  if (usePassword && opts.haveSshpass) {
    // sshpass -e reads the password from SSHPASS — never appears in argv.
    env.SSHPASS = opts.password;
    cmd = "sshpass";
    args = ["-e", kind, ...remoteArgs];
  } else if (usePassword) {
    // Fallback: SSH_ASKPASS helper. ssh calls this script to obtain the
    // password; we pass it via an env var the helper echoes back.
    const helper = join(
      tmpdir(),
      `tc-askpass-${process.pid}-${Date.now()}.sh`
    );
    writeFileSync(
      helper,
      '#!/usr/bin/env bash\nprintf "%s\\n" "$TASKCLAW_SSH_PW"\n',
      { mode: 0o700 }
    );
    env.TASKCLAW_SSH_PW = opts.password;
    env.SSH_ASKPASS = helper;
    env.SSH_ASKPASS_REQUIRE = "force";
    env.DISPLAY = env.DISPLAY || ":0";
    cleanup = () => {
      try { unlinkSync(helper); } catch { /* ignore */ }
    };
    // setsid detaches from the controlling TTY so ssh uses SSH_ASKPASS.
    if (opts.haveSetsid) {
      cmd = "setsid";
      args = [kind, ...remoteArgs];
    } else {
      // macOS / no setsid: try anyway; ssh may still honor SSH_ASKPASS
      // when stdin is not a TTY. We close stdin via the spawn options.
      cmd = kind;
      args = remoteArgs;
    }
  } else {
    // Key / ssh-agent auth.
    cmd = kind;
    args = remoteArgs;
  }

  return { cmd, args, env, cleanup };
}

// Run ssh/scp, streaming output. Resolves with exit code.
function sshExec(kind, opts, remoteArgs, { stream = true } = {}) {
  return new Promise((resolve) => {
    const { cmd, args, env, cleanup } = buildSshInvocation(
      kind,
      opts,
      remoteArgs
    );
    const usingAskpass = !!env.SSH_ASKPASS;
    const child = spawn(cmd, args, {
      env,
      // Detach stdin when using SSH_ASKPASS so ssh won't read the TTY.
      stdio: [usingAskpass ? "ignore" : "inherit", stream ? "inherit" : "pipe", "inherit"],
      detached: usingAskpass && opts.haveSetsid ? true : false,
    });
    let out = "";
    if (!stream && child.stdout) {
      child.stdout.on("data", (d) => {
        out += d.toString();
        process.stdout.write(d);
      });
    }
    child.on("error", (e) => {
      cleanup();
      err(`Failed to spawn ${cmd}: ${e.message}`);
      resolve({ code: 127, out });
    });
    child.on("close", (code) => {
      cleanup();
      resolve({ code: code ?? 1, out });
    });
  });
}

async function remote() {
  const args = parseArgs(process.argv.slice(3));

  if (args.help || args.h) {
    printRemoteHelp();
    return;
  }

  // Accept both --flags and the user's aliases (ip=, login=, password=, domain=).
  const host = args.host || args.ip;
  const user = args.user || args.login || "root";
  const key = args.key || args.i || process.env.TASKCLAW_SSH_KEY || null;
  const domain = args.domain || null;
  const port = String(args.port || PORT);
  const sshPort = args["ssh-port"] || args.sshPort || null;
  // --password may be a boolean flag (prompt) or password=<pw> (value).
  let password =
    typeof args.password === "string" ? args.password : null;
  const wantPassword = args.password === true || password !== null;

  if (!host) {
    err("Missing --host. Example:");
    err("  npx taskclaw remote --host 203.0.113.10 --user root");
    err("Run 'npx taskclaw remote --help' for all options.");
    process.exit(1);
  }

  // ── Tooling availability ──────────────────────────────────
  if (!which("ssh") || !which("scp")) {
    err("This command needs the system 'ssh' and 'scp' on your PATH.");
    err("Install OpenSSH client and retry.");
    process.exit(1);
  }
  const haveSshpass = which("sshpass");
  const haveSetsid = which("setsid");

  // ── Auth strategy ─────────────────────────────────────────
  // Precedence: explicit --key / ssh-agent first; else password.
  const haveAgent = !!process.env.SSH_AUTH_SOCK;
  let useKey = !!key || (haveAgent && !wantPassword);

  if (wantPassword) {
    useKey = false;
    if (password !== null) {
      warn("Passing password= on the CLI is insecure: it can leak via shell");
      warn("history and the process list. Prefer an SSH key (--key) instead.");
    } else {
      // Hidden prompt — never echoed, never placed in argv.
      password = await promptHidden(`SSH password for ${user}@${host}: `);
      if (!password) {
        err("No password entered (and no TTY). Use --key or run interactively.");
        process.exit(1);
      }
    }
    if (!haveSshpass && !haveSetsid && process.platform !== "win32") {
      warn("Neither 'sshpass' nor 'setsid' is available for non-interactive");
      warn("password auth. The most reliable path is an SSH key:");
      warn(`  ssh-copy-id ${user}@${host}   then re-run with --key ~/.ssh/id_*`);
    }
  } else if (!useKey) {
    // No key, no agent, no explicit password request -> fall back to password.
    warn("No SSH key (--key) or ssh-agent detected.");
    password = await promptHidden(`SSH password for ${user}@${host}: `);
    if (!password) {
      err("No key and no password available. Provide --key <path> or a password.");
      process.exit(1);
    }
    useKey = false;
  }

  const sshOpts = {
    key,
    password,
    useKey,
    haveSshpass,
    haveSetsid,
    sshPort,
    port: !!sshPort,
  };
  const target = `${user}@${host}`;
  const sshBase = baseSshOpts(sshOpts);

  // ── Compute the public SITE_URL ───────────────────────────
  const siteUrl = domain
    ? `https://${domain}`
    : `http://${host}:${port}`;

  log(`Remote install target: ${c.cyan}${target}${c.reset}`);
  log(`Public URL will be:    ${c.cyan}${siteUrl}${c.reset}`);
  if (domain) {
    warn(`Make sure a DNS A-record for ${domain} points at ${host} first,`);
    warn("and that you have TLS termination (reverse proxy) in front of port " + port + ".");
  }

  // ── 1. SSH preflight ──────────────────────────────────────
  log("Checking SSH connectivity...");
  const pre = await sshExec(
    "ssh",
    sshOpts,
    [...sshBase, target, "echo taskclaw-ssh-ok"],
    { stream: false }
  );
  if (pre.code !== 0 || !pre.out.includes("taskclaw-ssh-ok")) {
    err(`SSH preflight failed (exit ${pre.code}).`);
    if (!useKey && !haveSshpass) {
      err("Password auth over the system ssh is finicky without 'sshpass'.");
      err("Strongly recommended: set up an SSH key and use --key.");
      err(`  ssh-copy-id ${target}`);
    }
    process.exit(1);
  }
  ok("SSH connection OK.");

  // ── 2. Get install.sh onto the box ────────────────────────
  // Prefer the local copy shipped with this CLI (so a feature branch / local
  // edits are honored); otherwise curl it from the repo on the box.
  const localInstall = findLocalInstallScript();
  const remoteScript = "/tmp/taskclaw-install.sh";

  if (localInstall) {
    log("Uploading installer (scp)...");
    const scpArgs = [...sshBase];
    if (sshPort) {
      // scp uses -P (uppercase) for port.
      const pIdx = scpArgs.indexOf("-p");
      if (pIdx !== -1) scpArgs.splice(pIdx, 2);
      scpArgs.push("-P", String(sshPort));
    }
    const up = await sshExec(
      "scp",
      sshOpts,
      [...scpArgs, localInstall, `${target}:${remoteScript}`]
    );
    if (up.code !== 0) {
      err("Failed to upload install.sh.");
      process.exit(1);
    }
  } else {
    log("Fetching installer onto the server (curl)...");
    const dl = await sshExec("ssh", sshOpts, [
      ...sshBase,
      target,
      `curl -fsSL ${REPO_RAW}/scripts/install.sh -o ${remoteScript}`,
    ]);
    if (dl.code !== 0) {
      err("Failed to download install.sh on the server.");
      process.exit(1);
    }
  }

  // ── 3. Run the installer in server mode (stream output) ───
  log("Running the installer on the server (this can take a few minutes)...");
  const sudo = user === "root" ? "" : "sudo -E ";
  const remoteCmd =
    `chmod +x ${remoteScript} && ` +
    `${sudo}env TASKCLAW_SITE_URL=${shq(siteUrl)} TASKCLAW_PORT=${shq(port)} bash ${remoteScript}`;
  const install = await sshExec("ssh", sshOpts, [
    ...sshBase,
    "-t",
    target,
    remoteCmd,
  ]);
  if (install.code !== 0) {
    err(`Installer exited with code ${install.code}.`);
    err(`SSH in and inspect:  ssh ${target} 'cd ~/taskclaw && docker compose ps && docker compose logs --tail 50'`);
    process.exit(1);
  }

  // ── 4. Pull the credentials file back ─────────────────────
  const localCreds = join(process.cwd(), `taskclaw-${host}.credentials.json`);
  log("Retrieving credentials file...");
  const scpDown = [...sshBase];
  if (sshPort) {
    const pIdx = scpDown.indexOf("-p");
    if (pIdx !== -1) scpDown.splice(pIdx, 2);
    scpDown.push("-P", String(sshPort));
  }
  const back = await sshExec(
    "scp",
    sshOpts,
    [...scpDown, `${target}:~/taskclaw/taskclaw-credentials.json`, localCreds]
  );
  if (back.code === 0 && existsSync(localCreds)) {
    try { chmodSync(localCreds, 0o600); } catch { /* ignore */ }
    ok(`Saved credentials to ${localCreds} (chmod 600).`);
  } else {
    warn("Could not copy the credentials file back automatically.");
    warn(`Fetch it manually:  scp ${target}:~/taskclaw/taskclaw-credentials.json .`);
  }

  // ── 5. Final summary ──────────────────────────────────────
  console.log();
  console.log(`${c.green}  ══════════════════════════════════════════${c.reset}`);
  console.log(`${c.green}  ${c.bold}TaskClaw deployed!${c.reset}`);
  console.log(`${c.green}  ══════════════════════════════════════════${c.reset}`);
  console.log();
  console.log(`  URL:        ${c.cyan}${siteUrl}${c.reset}`);
  console.log(`  Email:      ${c.cyan}super@admin.com${c.reset}`);
  console.log(`  Password:   ${c.cyan}password123${c.reset}`);
  if (existsSync(localCreds)) {
    console.log(`  Secrets:    ${c.cyan}${localCreds}${c.reset}`);
  }
  console.log();
  if (domain) {
    warn(`Reminder: ${domain} must have a DNS A-record -> ${host}, and TLS in`);
    warn("front of the gateway, before HTTPS will work.");
  } else {
    warn("Running over plain HTTP. For production, add a domain + TLS and");
    warn(`re-run with:  npx taskclaw remote --host ${host} --domain your-domain.com`);
  }
  console.log();
}

// Locate scripts/install.sh relative to this CLI file (works from the repo
// checkout). Returns null when running from a published npm tarball (bin/ only).
function findLocalInstallScript() {
  try {
    const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/bin
    const candidates = [
      join(here, "..", "..", "..", "scripts", "install.sh"), // repo root
      join(here, "..", "scripts", "install.sh"),
      join(process.cwd(), "scripts", "install.sh"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Minimal POSIX single-quote shell-escaping for values we put in the remote cmd.
function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function printRemoteHelp() {
  console.log(`
${c.bold}taskclaw remote${c.reset} — install TaskClaw on a remote VPS over SSH

Usage:
  npx taskclaw remote --host <ip> [options]

Options:
  --host <ip>          Target server IP or hostname        ${c.dim}(alias: ip=<ip>)${c.reset}
  --user <name>        SSH user (default: root)            ${c.dim}(alias: login=<name>)${c.reset}
  --key <path>         SSH private key to authenticate with
  --password [pw]      Use password auth. Bare flag => hidden prompt.
                       ${c.dim}(alias: password=<pw> — insecure, prefer --key)${c.reset}
  --domain <example>   Serve over https://<domain> instead of http://<ip>:<port>
                       ${c.dim}(alias: domain=<example>)${c.reset}
  --port <n>           Public HTTP port on the server (default: ${PORT})
  --ssh-port <n>       SSH port if not 22

Examples:
  npx taskclaw remote --host 203.0.113.10 --key ~/.ssh/id_ed25519
  npx taskclaw remote ip=203.0.113.10 login=ubuntu --password
  npx taskclaw remote --host 203.0.113.10 --domain taskclaw.example.com

Notes:
  - Key / ssh-agent auth is preferred. Password auth uses 'sshpass' when
    present, else an SSH_ASKPASS helper; if neither works, use an SSH key.
  - For --domain, point a DNS A-record at the host (and terminate TLS in a
    reverse proxy) before HTTPS will resolve.
  - On success a credentials file is saved locally as
    ./taskclaw-<host>.credentials.json (chmod 600).
`);
}

// ── Main ──────────────────────────────────────────────────────

const command = process.argv[2] || "start";

const commands = { start, stop, reset, status, logs, upgrade, remote };

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
  remote    Install TaskClaw on a remote VPS over SSH

Remote install:
  npx taskclaw remote --host <ip> [--user root] [--key <path>]
                      [--password] [--domain <example.com>] [--port 3000]
  Aliases: ip=<ip> login=<user> password=<pw> domain=<d>
  See: npx taskclaw remote --help

Options:
  TASKCLAW_DIR=./my-dir npx taskclaw   Custom install directory
  TASKCLAW_PORT=8080 npx taskclaw      Custom port (requires compose edit)

Documentation: https://github.com/taskclaw/taskclaw
`);
}
