#!/usr/bin/env node
/**
 * Prepare bundled Python runtime for the current platform using
 * python-build-standalone (indygreg/cpython-build-standalone).
 *
 * This produces a self-contained Python installation under runtime/<platform>-<arch>
 * that can be shipped inside the Electron app (extraResources).
 *
 * Usage: node scripts/prepare-runtime-current.mjs [--python-version 3.11.14]
 */
import fs from "fs";
import path from "path";
import { spawnSync, execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, "..");
const apiDir = path.resolve(cwd, "..", "backend");
const requirements = path.join(apiDir, "requirements.txt");
const pyprojectToml = path.join(apiDir, "pyproject.toml");

const PYTHON_VERSION = process.env.RUNTIME_PYTHON_VERSION || "3.11.15";
const BUILD_DATE = process.env.RUNTIME_BUILD_DATE || "20260504";

const PLATFORM_TARGETS = {
  "darwin-arm64": `cpython-${PYTHON_VERSION}+${BUILD_DATE}-aarch64-apple-darwin-pgo+lto-full.tar.zst`,
  "darwin-x64": `cpython-${PYTHON_VERSION}+${BUILD_DATE}-x86_64-apple-darwin-pgo+lto-full.tar.zst`,
  "win32-x64": `cpython-${PYTHON_VERSION}+${BUILD_DATE}-x86_64-pc-windows-msvc-shared-pgo-full.tar.zst`,
  "linux-x64": `cpython-${PYTHON_VERSION}+${BUILD_DATE}-x86_64-unknown-linux-gnu-pgo+lto-full.tar.zst`,
};

const BASE_URL =
  process.env.RUNTIME_DOWNLOAD_BASE ||
  `https://github.com/indygreg/python-build-standalone/releases/download/${BUILD_DATE}`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.status}`);
}

function sh(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd });
}

function getTarget() {
  const id = `${process.platform}-${process.arch}`;
  const targetDir = path.join(cwd, "runtime", id);
  const bin = process.platform === "win32" ? "Scripts" : "bin";
  const pyExe = process.platform === "win32" ? "python.exe" : "python3";
  return {
    id,
    dir: targetDir,
    python: path.join(targetDir, bin, pyExe),
    pip: process.platform === "win32"
      ? path.join(targetDir, bin, "pip.exe")
      : path.join(targetDir, bin, "pip"),
  };
}

function downloadAndExtract(targetId, archiveName) {
  const target = getTarget();
  const archive = path.join(cwd, "runtime", archiveName);
  const url = `${BASE_URL}/${archiveName}`;

  // Remove old runtime (venv with symlinks becomes invalid when moved)
  if (fs.existsSync(target.dir)) {
    fs.rmSync(target.dir, { recursive: true, force: true });
  }

  if (!fs.existsSync(archive)) {
    console.log(`[runtime] Downloading ${archiveName} ...`);
    try {
      sh(`curl -fSL --progress-bar -o "${archive}" "${url}"`);
    } catch {
      console.error(`[runtime] Download failed. Check URL: ${url}`);
      console.error(`[runtime] Or set RUNTIME_DOWNLOAD_MIRROR env var.`);
      process.exit(1);
    }
  } else {
    console.log(`[runtime] Using cached archive: ${archive}`);
  }

  console.log(`[runtime] Extracting to ${target.dir} ...`);
  fs.mkdirSync(target.dir, { recursive: true });

  if (process.platform === "darwin") {
    // Extract python/install/* directly into target dir, removing both prefix dirs
    sh(`zstd -d "${archive}" --stdout | tar x -C "${target.dir}" --strip-components=2 python/install`);
  } else if (process.platform === "win32") {
    // On Windows, python-build-standalone archives are .tar.zst
    // tar on Windows 10 1803+ supports zst; fallback to 7z
    try {
      sh(`tar --zstd -xf "${archive}" -C "${target.dir}" --strip-components=1`);
    } catch {
      // Fallback: use python to extract
      const py = process.env.SYSTEM_PYTHON || "python3";
      sh(
        `${py} -c "import tarfile,subprocess,os; d='${target.dir}'; os.makedirs(d,exist_ok=True); subprocess.run(['zstd','-d','${archive}','--stdout'],stdout=subprocess.PIPE).stdout | tarfile.open(mode='r|') | (lambda t: [t.extractall(d)])"`,
      );
    }
  } else {
    // Linux: extract python/install/* directly
    sh(`tar --zstd -xf "${archive}" -C "${target.dir}" --strip-components=2 python/install`);
  }

  // Verify
  if (!fs.existsSync(target.python)) {
    console.error(`[runtime] Extraction failed: ${target.python} not found`);
    process.exit(1);
  }

  const ver = spawnSync(target.python, ["--version"], { encoding: "utf8" });
  console.log(`[runtime] Python ready: ${(ver.stdout || ver.stderr || "").trim()}`);
}

function installDeps(target) {
  console.log("[runtime] Upgrading pip ...");
  run(target.python, ["-m", "pip", "install", "--upgrade", "pip"]);

  // Install from requirements.txt (without faster-whisper/zhconv for desktop-speech group)
  console.log("[runtime] Installing API dependencies ...");
  if (fs.existsSync(requirements)) {
    run(target.pip, ["install", "-r", requirements, "--no-deps"]);
    // Then install with deps to resolve everything correctly
    run(target.pip, ["install", "-r", requirements]);
  } else if (fs.existsSync(pyprojectToml)) {
    // Use uv if available, otherwise pip from pyproject
    run(target.pip, ["install", "."], { cwd: apiDir });
  }

  // Install desktop-speech optional deps
  console.log("[runtime] Installing desktop-speech deps ...");
  try {
    run(target.pip, ["install", "faster-whisper>=1.1.1", "zhconv>=1.4.3"]);
  } catch (e) {
    console.warn("[runtime] faster-whisper install failed (may need cmake/compiler).");
    console.warn("[runtime] Speech will fallback to native CLI engines.");
  }

  console.log(`[runtime] Dependencies installed.`);
}

function main() {
  const target = getTarget();
  const archiveName = PLATFORM_TARGETS[target.id];
  if (!archiveName) {
    console.error(`[runtime] Unsupported platform: ${target.id}`);
    console.error("[runtime] Supported: darwin-arm64, darwin-x64, win32-x64, linux-x64");
    process.exit(1);
  }

  console.log(`[runtime] Preparing runtime for ${target.id}`);
  downloadAndExtract(target.id, archiveName);
  installDeps(target);

  // Clean up archive
  const archive = path.join(cwd, "runtime", archiveName);
  if (fs.existsSync(archive) && !process.env.RUNTIME_KEEP_ARCHIVE) {
    fs.unlinkSync(archive);
    console.log("[runtime] Archive cleaned up.");
  }

  console.log(`[runtime] Ready: ${target.dir}`);
}

main();
