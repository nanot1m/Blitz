#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import https from "node:https";
import { dirname, join, relative, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface, emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(scriptDirectory, "..");
const certificateDirectory = join(repositoryDirectory, ".cert");
const certificateFile = join(certificateDirectory, "localhost.pem");
const keyFile = join(certificateDirectory, "localhost-key.pem");
const tokenFile = join(certificateDirectory, "bridge-token");
const bridgeHost = "127.0.0.1";
const bridgePort = 8787;
const bridgeUrl = `wss://${bridgeHost}:${bridgePort}`;
const statusUrl = `https://${bridgeHost}:${bridgePort}/__blitz/status`;
const minimumTokenLength = 24;

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const force = args.delete("--force");
const printOnly = args.delete("--print");
const nonInteractive = args.delete("--yes") || args.delete("-y");
const help = args.delete("--help") || args.delete("-h");

if (args.size > 0) {
  console.error(`Unknown option: ${[...args][0]}`);
  process.exit(2);
}

if (help) {
  console.log(`Usage: npm run setup:mcp -- [options]

Prepare and monitor the local Blitz MCP browser bridge.

Options:
  --print  Print connection details without opening the dashboard
  --force  Replace the existing certificate and bridge token
  --yes    Complete setup without prompts and print connection details
  --help   Show this help`);
  process.exit(0);
}

const interactive = stdin.isTTY && stdout.isTTY && !nonInteractive && !printOnly && !force;
const color = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  white: "\u001b[97m",
};

function commandExists(command) {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function mkcertInstallCommand() {
  if (process.platform === "darwin" && commandExists("brew")) {
    return ["brew", ["install", "mkcert"]];
  }
  if (process.platform === "win32" && commandExists("choco")) {
    return ["choco", ["install", "mkcert", "-y"]];
  }
  return undefined;
}

function printMkcertInstallInstructions() {
  console.error("mkcert is required to create a browser-trusted localhost certificate.");
  const installCommand = mkcertInstallCommand();
  if (installCommand) {
    console.error(`\nInstall it with:\n\n  ${installCommand[0]} ${installCommand[1].join(" ")}`);
  } else {
    console.error("\nInstallation instructions: https://github.com/FiloSottile/mkcert#installation");
  }
  console.error("\nThen rerun:\n\n  npm run setup:mcp");
}

async function askYesNo(question, defaultValue = true) {
  if (!interactive) {
    return defaultValue;
  }
  const input = createInterface({ input: stdin, output: stdout });
  const suffix = defaultValue ? "[Y/n]" : "[y/N]";
  try {
    while (true) {
      const answer = await new Promise((resolve) => {
        input.question(`${question} ${suffix} `, resolve);
      });
      const normalized = answer.trim().toLowerCase();
      if (!normalized) return defaultValue;
      if (normalized === "y" || normalized === "yes") return true;
      if (normalized === "n" || normalized === "no") return false;
      console.log("Enter yes or no.");
    }
  } finally {
    input.close();
  }
}

async function readToken() {
  if (!(await fileExists(tokenFile))) {
    throw new Error("The bridge token does not exist.");
  }
  const token = (await readFile(tokenFile, "utf8")).trim();
  if (token.length < minimumTokenLength) {
    throw new Error("The existing bridge token is invalid. Rotate it with --force.");
  }
  return token;
}

async function prepareCertificate({ replace = false } = {}) {
  const certificateExists = await fileExists(certificateFile);
  const keyExists = await fileExists(keyFile);
  if (!replace && certificateExists && keyExists) return;

  if (!commandExists("mkcert")) {
    const installCommand = mkcertInstallCommand();
    if (
      installCommand &&
      interactive &&
      (await askYesNo(`mkcert is missing. Run "${installCommand[0]} ${installCommand[1].join(" ")}" now?`))
    ) {
      execFileSync(installCommand[0], installCommand[1], {
        cwd: repositoryDirectory,
        stdio: "inherit",
      });
    }
  }
  if (!commandExists("mkcert")) {
    printMkcertInstallInstructions();
    process.exit(1);
  }
  if (certificateExists !== keyExists && !replace) {
    throw new Error("The certificate pair is incomplete. Rerun with --force.");
  }

  execFileSync("mkcert", ["-install"], { cwd: repositoryDirectory, stdio: "inherit" });
  execFileSync(
    "mkcert",
    [
      "-key-file",
      keyFile,
      "-cert-file",
      certificateFile,
      "localhost",
      "127.0.0.1",
      "::1",
    ],
    { cwd: repositoryDirectory, stdio: "inherit" },
  );
  await chmod(keyFile, 0o600);
  await chmod(certificateFile, 0o644);
}

async function prepareToken({ replace = false } = {}) {
  if (!replace && (await fileExists(tokenFile))) {
    const token = await readToken();
    await chmod(tokenFile, 0o600);
    return token;
  }
  const token = randomBytes(32).toString("hex");
  await writeFile(tokenFile, `${token}\n`, { mode: 0o600 });
  await chmod(tokenFile, 0o600);
  return token;
}

async function prepareSetup({ replace = false } = {}) {
  await mkdir(certificateDirectory, { recursive: true, mode: 0o700 });
  await chmod(certificateDirectory, 0o700);
  await prepareCertificate({ replace });
  return prepareToken({ replace });
}

function clientConfig() {
  return JSON.stringify(
    {
      mcpServers: {
        blitz_canvas: {
          command: "npm",
          args: ["run", "mcp:server"],
          cwd: repositoryDirectory,
        },
      },
    },
    null,
    2,
  );
}

function printDetails(token) {
  console.log(`Blitz local MCP connection

Browser bridge URL: ${bridgeUrl}
Browser bridge token: ${token}

Codex uses the repository configuration at:
  ${join(repositoryDirectory, ".codex/config.toml")}

Claude Code uses the project configuration at:
  ${join(repositoryDirectory, ".mcp.json")}

Claude Code prompts once to approve project-scoped MCP servers. Open Claude in
this repository and approve blitz_canvas through /mcp.

Other stdio MCP clients can use:

${clientConfig()}

The MCP client must launch the stdio server process. The URL and token above
connect the Blitz browser canvas to that process; they are not an HTTP MCP URL.`);
}

function getBridgeStatus() {
  return new Promise((resolve) => {
    const request = https.get(
      statusUrl,
      { rejectUnauthorized: false, timeout: 700 },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const status = JSON.parse(body);
            resolve({
              running: response.statusCode === 200 && status.server === "running",
              mcpClientConnected: status.mcpClientConnected === true,
              canvasConnected: status.canvasConnected === true,
            });
          } catch {
            resolve({ running: true, mcpClientConnected: false, canvasConnected: false });
          }
        });
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => {
      resolve({ running: false, mcpClientConnected: false, canvasConnected: false });
    });
  });
}

function visibleLength(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").length;
}

function fit(value, width) {
  const plain = value.replace(/\u001b\[[0-9;]*m/g, "");
  if (plain.length <= width) return value;
  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

function pad(value, width) {
  return `${fit(value, width)}${" ".repeat(Math.max(0, width - visibleLength(fit(value, width))))}`;
}

function badge(label, state, detail) {
  const stateColor =
    state === "connected" || state === "running"
      ? color.green
      : state === "waiting"
        ? color.yellow
        : color.red;
  const symbol = state === "connected" || state === "running" ? "●" : state === "waiting" ? "◐" : "○";
  return `${stateColor}${symbol} ${state.toUpperCase()}${color.reset}  ${label}${detail ? ` · ${detail}` : ""}`;
}

function renderDashboard(token, status, message, standaloneProcess) {
  const terminalWidth = Math.max(68, Math.min(stdout.columns ?? 92, 110));
  const inside = terminalWidth - 4;
  const line = (value = "") => `│ ${pad(value, inside)} │`;
  const border = `┌${"─".repeat(terminalWidth - 2)}┐`;
  const divider = `├${"─".repeat(terminalWidth - 2)}┤`;
  const bottom = `└${"─".repeat(terminalWidth - 2)}┘`;
  const serverDetail = standaloneProcess
    ? "standalone diagnostics process"
    : status.running
      ? "started by an MCP client"
      : "start or restart your MCP client";

  stdout.write("\u001b[2J\u001b[H");
  console.log(border);
  console.log(line(`${color.bold}${color.cyan}BLITZ · LOCAL MCP${color.reset}`));
  console.log(line(`${color.dim}Secure localhost canvas bridge${color.reset}`));
  console.log(divider);
  console.log(line(badge("Server", status.running ? "running" : "stopped", serverDetail)));
  console.log(
    line(
      badge(
        "MCP client",
        status.mcpClientConnected ? "connected" : "waiting",
        standaloneProcess ? "stdio is not attached in standalone mode" : "stdio transport",
      ),
    ),
  );
  console.log(
    line(
      badge(
        "Blitz canvas",
        status.canvasConnected ? "connected" : "waiting",
        status.canvasConnected ? "browser bridge active" : "enter the URL and token in Blitz",
      ),
    ),
  );
  console.log(divider);
  console.log(line(`${color.bold}BROWSER CONNECTION${color.reset}`));
  console.log(line(`URL    ${color.cyan}${bridgeUrl}${color.reset}`));
  console.log(line(`TOKEN  ${color.white}${token}${color.reset}`));
  console.log(divider);
  console.log(line(`${color.bold}MCP CLIENT${color.reset}`));
  console.log(line(`Transport  stdio · configured in .codex/config.toml`));
  console.log(line(`Command    npm run mcp:server`));
  console.log(bottom);
  console.log();
  console.log(
    `${color.dim}[S]${color.reset} start standalone  ${color.dim}[R]${color.reset} rotate credentials  ${color.dim}[C]${color.reset} show client config  ${color.dim}[Q]${color.reset} quit`,
  );
  console.log(
    `${color.dim}${message || "Status refreshes automatically. Keep this window open while connecting."}${color.reset}`,
  );
}

async function runDashboard(token) {
  let status = await getBridgeStatus();
  let message = "";
  let standaloneProcess;
  let closing = false;

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  const stopStandalone = () => {
    if (standaloneProcess && standaloneProcess.exitCode === null) {
      standaloneProcess.kill("SIGTERM");
    }
    standaloneProcess = undefined;
  };

  const cleanup = () => {
    closing = true;
    clearInterval(refreshTimer);
    stopStandalone();
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\u001b[0m\n");
  };

  const refresh = async () => {
    const nextStatus = await getBridgeStatus();
    if (closing) return;
    status = nextStatus;
    renderDashboard(token, status, message, standaloneProcess);
  };

  const refreshTimer = setInterval(() => void refresh(), 1_000);
  renderDashboard(token, status, message, standaloneProcess);

  await new Promise((resolve) => {
    stdin.on("keypress", async (_input, key) => {
      if (closing) return;
      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve();
        return;
      }

      switch (key.name) {
        case "q":
          cleanup();
          resolve();
          break;
        case "c":
          message = `Client config: ${clientConfig().replace(/\s+/g, " ")}`;
          renderDashboard(token, status, message, standaloneProcess);
          break;
        case "r":
          if (standaloneProcess) {
            message = "Stop the standalone process and rerun with --force to rotate credentials.";
          } else if (status.running) {
            message = "Stop the MCP client-managed server before rotating credentials.";
          } else {
            stopStandalone();
            token = await prepareSetup({ replace: true });
            message = "Certificate and token rotated.";
          }
          await refresh();
          break;
        case "s":
          if (status.running) {
            message = "A server is already running on port 8787.";
          } else if (!standaloneProcess) {
            standaloneProcess = spawn("npm", ["run", "mcp:server"], {
              cwd: repositoryDirectory,
              env: process.env,
              stdio: ["pipe", "ignore", "pipe"],
            });
            standaloneProcess.stderr.setEncoding("utf8");
            standaloneProcess.stderr.on("data", (chunk) => {
              const lastLine = chunk.trim().split("\n").at(-1);
              if (lastLine) message = lastLine;
            });
            standaloneProcess.on("exit", (code) => {
              standaloneProcess = undefined;
              if (closing) return;
              message = `Standalone server exited${code === null ? "" : ` with code ${code}`}.`;
              void refresh();
            });
            message =
              "Starting standalone bridge. MCP tools require a separate client-managed stdio process.";
          }
          setTimeout(() => void refresh(), 300);
          break;
      }
    });
  });
}

try {
  if (printOnly) {
    printDetails(await readToken());
  } else {
    const token = await prepareSetup({ replace: force });
    if (interactive) {
      await runDashboard(token);
    } else {
      printDetails(token);
    }
  }
} catch (error) {
  console.error(`\nLocal MCP setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
