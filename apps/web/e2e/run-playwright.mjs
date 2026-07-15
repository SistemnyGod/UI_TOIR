import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = await resolveE2ePort();
const serverUrl = `http://127.0.0.1:${port}`;
const e2eEnv = { ...process.env };
if (!e2eEnv.VITE_ENABLE_MOCK_MODE) {
  e2eEnv.VITE_ENABLE_MOCK_MODE = "true";
}

await runBuild();

const server = spawn(
  process.execPath,
  [
    "./node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
    "--configLoader",
    "runner",
  ],
  {
    cwd: webRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

server.stdout.on("data", (chunk) => process.stdout.write(`[WebServer] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[WebServer] ${chunk}`));

let stopping = false;

try {
  await waitForServer();
  const exitCode = await runPlaywright(process.argv.slice(2));
  await stopServer();
  process.exit(exitCode);
} catch (error) {
  await stopServer();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite dev server exited before ready with code ${server.exitCode}`);
    }

    try {
      const response = await fetch(serverUrl);
      if (response.status < 500) return;
    } catch {
      // Wait until Vite binds the port.
    }

    await delay(250);
  }

  throw new Error(`Vite dev server did not become ready at ${serverUrl}`);
}

async function runBuild() {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const args = npmCli ? [npmCli, "run", "build"] : ["run", "build"];
  const child = spawn(command, args, {
    cwd: webRoot,
    env: e2eEnv,
    stdio: "inherit",
    windowsHide: true,
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`Production build failed before e2e with code ${exitCode}`);
  }
}

async function runPlaywright(args) {
  const playwrightCli = path.join(webRoot, "node_modules", "@playwright", "test", "cli.js");
  if (!existsSync(playwrightCli)) {
    throw new Error(`Playwright CLI not found: ${playwrightCli}`);
  }

  const child = spawn(process.execPath, [playwrightCli, "test", "--config", "playwright.config.ts", ...args], {
    cwd: webRoot,
    env: {
      ...e2eEnv,
      PATROL360_E2E_EXTERNAL_SERVER: "true",
      PLAYWRIGHT_BASE_URL: serverUrl,
    },
    stdio: "inherit",
    windowsHide: true,
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function stopServer() {
  if (stopping || server.exitCode !== null || server.pid === undefined) return;
  stopping = true;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("error", resolve);
      killer.on("exit", resolve);
    });
    return;
  }

  server.kill("SIGTERM");
  await delay(750);
  if (server.exitCode === null) server.kill("SIGKILL");
}

process.on("SIGINT", () => {
  void stopServer().then(() => process.exit(130));
});

process.on("SIGTERM", () => {
  void stopServer().then(() => process.exit(143));
});

async function resolveE2ePort() {
  const requested = Number(process.env.PATROL360_E2E_PORT ?? 5176);
  if (Number.isInteger(requested) && requested > 0 && await canBindPort(requested)) {
    return requested;
  }

  return getFreePort();
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "127.0.0.1");
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.once("listening", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.listen(0, "127.0.0.1");
  });
}
