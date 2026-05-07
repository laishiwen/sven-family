#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const cwd = process.cwd();
const runtimeRoot = path.join(cwd, "runtime");

const args = new Set(process.argv.slice(2));
const checkAll = args.has("--all");
const checkCurrent = args.has("--current") || !checkAll;
const enforce = args.has("--enforce");

const targets = [
  {
    id: "darwin-arm64",
    platform: "darwin",
    arch: "arm64",
    executable: path.join(runtimeRoot, "darwin-arm64", "bin", "python3"),
  },
  {
    id: "darwin-x64",
    platform: "darwin",
    arch: "x64",
    executable: path.join(runtimeRoot, "darwin-x64", "bin", "python3"),
  },
  {
    id: "win32-x64",
    platform: "win32",
    arch: "x64",
    executable: path.join(runtimeRoot, "win32-x64", "python.exe"),
  },
  {
    id: "linux-x64",
    platform: "linux",
    arch: "x64",
    executable: path.join(runtimeRoot, "linux-x64", "bin", "python3"),
  },
];

const currentId = `${process.platform}-${process.arch}`;
const selected = checkAll ? targets : targets.filter((t) => t.id === currentId);

if (selected.length === 0) {
  console.error(`[runtime-check] Unsupported current platform: ${currentId}`);
  process.exit(1);
}

console.log(
  `[runtime-check] mode=${checkAll ? "all" : "current"} enforce=${enforce}`,
);

let hasFailure = false;
let checked = 0;

for (const target of selected) {
  checked += 1;
  const relPath = path.relative(cwd, target.executable);
  const exists = fs.existsSync(target.executable);

  if (!exists) {
    console.log(`[missing] ${target.id} -> ${relPath}`);
    hasFailure = true;
    continue;
  }

  const result = spawnSync(target.executable, ["--version"], {
    encoding: "utf8",
    timeout: 8000,
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const ok = result.status === 0 && output.includes("Python 3");

  if (!ok) {
    console.log(`[invalid] ${target.id} -> ${relPath}`);
    console.log(`          version-output: ${output || "(empty)"}`);
    hasFailure = true;
    continue;
  }

  const importCheck = spawnSync(
    target.executable,
    ["-c", "import fastapi,uvicorn; print('deps-ok')"],
    {
      encoding: "utf8",
      timeout: 15000,
    },
  );
  const importOutput =
    `${importCheck.stdout || ""}${importCheck.stderr || ""}`.trim();
  if (importCheck.status !== 0) {
    console.log(`[invalid] ${target.id} -> ${relPath}`);
    console.log(
      `          deps-check: ${importOutput || "fastapi/uvicorn import failed"}`,
    );
    hasFailure = true;
    continue;
  }

  console.log(`[ready]   ${target.id} -> ${relPath} (${output})`);
}

if (hasFailure) {
  if (enforce) {
    console.error("[runtime-check] failed: runtime is not ready.");
    console.error(
      "[runtime-check] put Python runtimes under apps/desktop/runtime/<platform-arch>.",
    );
    process.exit(1);
  }

  console.warn("[runtime-check] warning: runtime is incomplete.");
  console.warn(
    "[runtime-check] packaging can still proceed but sidecar may fallback to system Python.",
  );
}

console.log(
  `[runtime-check] checked=${checked}, result=${hasFailure ? "warn" : "ok"}`,
);
