#!/usr/bin/env node
import fs from "fs";
import path from "path";
import process from "process";
import { spawn } from "child_process";

const cwd = process.cwd();
const releaseDir = path.join(cwd, "release");
const port = Number(process.env.DESKTOP_SIDECAR_PORT || "8000");
const timeoutMs = Number(process.env.VERIFY_TIMEOUT_MS || "120000");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function resolveAppEntry() {
  if (process.platform === "darwin") {
    const candidates = [
      path.join(
        releaseDir,
        "mac-arm64",
        "Sven Studio.app",
        "Contents",
        "MacOS",
        "Sven Studio",
      ),
      path.join(
        releaseDir,
        "mac",
        "Sven Studio.app",
        "Contents",
        "MacOS",
        "Sven Studio",
      ),
    ];
    const hit = candidates.find((p) => exists(p));
    return hit || null;
  }

  if (process.platform === "win32") {
    const candidate = path.join(releaseDir, "win-unpacked", "Sven Studio.exe");
    return exists(candidate) ? candidate : null;
  }

  if (process.platform === "linux") {
    const dir = path.join(releaseDir, "linux-unpacked");
    if (!exists(dir)) return null;

    const entries = fs.readdirSync(dir);
    const preferred = entries.find(
      (name) => name.toLowerCase() === "sven studio",
    );
    if (preferred) return path.join(dir, preferred);

    const executable = entries
      .map((name) => path.join(dir, name))
      .find((full) => {
        try {
          const st = fs.statSync(full);
          return st.isFile() && (st.mode & 0o111) !== 0;
        } catch {
          return false;
        }
      });
    return executable || null;
  }

  return null;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl) {
  const start = Date.now();
  let lastErr = "";

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = String(e?.message || e);
    }
    await wait(1000);
  }

  throw new Error(
    `Health check timeout after ${timeoutMs}ms. lastError=${lastErr}`,
  );
}

async function verifyRoot(baseUrl) {
  const res = await fetch(`${baseUrl}/`);
  if (!res.ok) {
    throw new Error(`Root check failed: HTTP ${res.status}`);
  }
  const body = await res.text();
  const looksHtml = /<!doctype html>|<html/i.test(body);
  if (!looksHtml) {
    throw new Error("Root response is not HTML. web-dist may be missing.");
  }
}

async function main() {
  const appEntry = resolveAppEntry();
  if (!appEntry) {
    console.error(
      "[verify-package] packaged app entry not found under apps/desktop/release.",
    );
    process.exit(1);
  }

  const relAppEntry = path.relative(cwd, appEntry);
  console.log(`[verify-package] launching ${relAppEntry}`);

  const child = spawn(appEntry, [], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "1",
      DESKTOP_SIDECAR_PORT: String(port),
    },
    stdio: "ignore",
    detached: process.platform !== "win32",
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const health = await waitForHealth(baseUrl);
    console.log(`[verify-package] health ok -> ${JSON.stringify(health)}`);

    await verifyRoot(baseUrl);
    console.log("[verify-package] root page ok -> HTML detected");
  } finally {
    if (process.platform === "win32") {
      child.kill();
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  }

  console.log("[verify-package] done");
}

main().catch((err) => {
  console.error(`[verify-package] failed: ${err.message}`);
  process.exit(1);
});
