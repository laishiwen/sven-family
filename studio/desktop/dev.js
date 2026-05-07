#!/usr/bin/env node
/**
 * Development launcher for Electron desktop app.
 * Requires the web frontend (pnpm dev @ :3000) to be running first.
 *
 * Usage:
 *   node dev.js
 */
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");

const FRONTEND_PORT = 3000;
const ROOT = path.resolve(__dirname, "../..");

function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = new net.Socket();
      s.setTimeout(500);
      s.on("connect", () => {
        s.destroy();
        resolve();
      });
      s.on("error", () => {
        s.destroy();
        if (Date.now() - start > timeout)
          reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        else setTimeout(check, 500);
      });
      s.connect(port, "127.0.0.1");
    };
    check();
  });
}

async function main() {
  // 1. Build TypeScript
  console.log("🔨 Building TypeScript...");
  await new Promise((resolve, reject) => {
    const tsc = spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "tsc", "-p", "tsconfig.json"],
      {
        cwd: __dirname,
        stdio: "inherit",
      },
    );
    tsc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`tsc failed: ${code}`)),
    );
  });
  console.log("✅ TypeScript built");

  // 2. Wait for frontend
  console.log(`⏳ Waiting for frontend on port ${FRONTEND_PORT}...`);
  try {
    await waitForPort(FRONTEND_PORT, 60000);
    console.log("✅ Frontend ready");
  } catch {
    console.warn(
      "⚠️  Frontend not detected, launching anyway (may show blank screen)",
    );
  }

  // 3. Launch Electron
  console.log("🚀 Launching Electron...");
  const electronBin = require("electron");
  const electron = spawn(String(electronBin), ["."], {
    cwd: __dirname,
    env: { ...process.env, ELECTRON_DEV: "true" },
    stdio: "inherit",
  });
  electron.on("close", (code) => {
    console.log(`Electron exited with code ${code}`);
    process.exit(code || 0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
