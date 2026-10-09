import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const LOCAL_URL = "http://localhost:2110";
const HEALTH_URL = `${LOCAL_URL}/api/health`;
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

async function isServerReady(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

function openBrowser() {
  const command =
    process.platform === "win32"
      ? { file: "rundll32.exe", args: ["url.dll,FileProtocolHandler", LOCAL_URL] }
      : process.platform === "darwin"
        ? { file: "open", args: [LOCAL_URL] }
        : { file: "xdg-open", args: [LOCAL_URL] };

  spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

async function waitUntilReady(server: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await isServerReady()) return;
    if (server.exitCode !== null) {
      throw new Error(`The local server stopped with exit code ${server.exitCode}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The local server did not become ready within two minutes.");
}

async function main() {
  if (await isServerReady()) {
    console.log(`[local] Xpot is already running at ${LOCAL_URL}`);
    openBrowser();
    return;
  }

  if (!existsSync(path.join(projectRoot, ".env"))) {
    throw new Error("Missing .env file. Link or copy the development environment file into the project root first.");
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Could not locate npm. Run this shortcut with npm run local.");
  }

  const server = spawn(process.execPath, [npmCli, "run", "dev"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: false,
  });

  const stopServer = () => {
    if (server.exitCode === null) server.kill("SIGINT");
  };
  process.once("SIGINT", stopServer);
  process.once("SIGTERM", stopServer);

  await waitUntilReady(server);
  console.log(`[local] Ready: ${LOCAL_URL}`);
  openBrowser();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("exit", (code) => {
      process.exitCode = code ?? 0;
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(`[local] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
