import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";
import * as net from "net";

interface SidecarStatus {
  running: boolean;
  pid?: number;
  port: number;
  startedAt?: string;
  error?: string;
}

export class SidecarManager {
  private process: ChildProcess | null = null;
  private apiDir: string;
  private port: number;
  private status: SidecarStatus;
  private logStream: fs.WriteStream | null = null;
  private restartCount = 0;
  private maxRestarts = 3;

  constructor(apiDir: string, port: number) {
    this.apiDir = apiDir;
    this.port = port;
    this.status = { running: false, port };
  }

  async start(): Promise<void> {
    if (this.status.running) return;

    // Wait for port to be free
    await this.waitForPortFree(this.port, 5000);

    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "api.log");
    this.logStream = fs.createWriteStream(logPath, { flags: "a" });

    // Find Python executable
    const python = await this.findPython();
    if (!python) {
      this.status.error = "Python not found. Please install Python 3.10+";
      console.error("[Sidecar] Python not found");
      return;
    }

    const runScript = path.join(this.apiDir, "run.py");
    if (!fs.existsSync(runScript)) {
      this.status.error = `run.py not found at ${runScript}`;
      console.error("[Sidecar]", this.status.error);
      return;
    }

    const appDataDir = app.getPath("userData");
    const appLogDir = path.join(appDataDir, "logs");

    // Set env for sidecar
    const env = {
      ...process.env,
      APP_PORT: String(this.port),
      APP_DATA_DIR: appDataDir,
      APP_LOG_DIR: appLogDir,
      SQLITE_PATH: path.join(appDataDir, "sven_studio.db"),
      MILVUS_LITE_PATH: path.join(appDataDir, "vector_store", "milvus_lite.db"),
      MANAGED_RUNTIME_DIR: path.join(appDataDir, "managed_runtime"),
      MODEL_CACHE_DIR: path.join(appDataDir, "model_cache"),
      TRAINING_OUTPUT_DIR: path.join(appDataDir, "training"),
      WEB_DIST_DIR: path.join(process.resourcesPath, "web-dist"),
      APP_ENV: "production",
      PYTHONUNBUFFERED: "1",
    };

    console.log(`[Sidecar] Starting Python API: ${python} ${runScript}`);
    this.process = spawn(python, [runScript], {
      cwd: this.apiDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stdout?.pipe(this.logStream);
    this.process.stderr?.pipe(this.logStream);

    this.process.on("exit", (code, signal) => {
      console.log(`[Sidecar] Exited: code=${code} signal=${signal}`);
      this.status.running = false;
      this.process = null;

      // Auto-restart on unexpected exit
      if (
        signal !== "SIGTERM" &&
        signal !== "SIGKILL" &&
        this.restartCount < this.maxRestarts
      ) {
        this.restartCount++;
        console.log(
          `[Sidecar] Auto-restarting (attempt ${this.restartCount}/${this.maxRestarts})...`,
        );
        setTimeout(() => this.start(), 3000);
      }
    });

    this.process.on("error", (err) => {
      console.error("[Sidecar] Process error:", err);
      this.status.error = err.message;
      this.status.running = false;
    });

    // Wait for API to be ready
    const ready = await this.waitForPort(this.port, 30000);
    if (ready) {
      this.status = {
        running: true,
        pid: this.process?.pid,
        port: this.port,
        startedAt: new Date().toISOString(),
      };
      console.log(`[Sidecar] API ready on port ${this.port}`);
    } else {
      this.status.error = "API did not start within 30s";
      console.error("[Sidecar]", this.status.error);
    }
  }

  stop(): void {
    if (this.process) {
      console.log("[Sidecar] Stopping...");
      this.process.kill("SIGTERM");
      setTimeout(() => {
        if (this.process) this.process.kill("SIGKILL");
      }, 5000);
      this.process = null;
    }
    this.logStream?.end();
    this.status.running = false;
  }

  async restart(): Promise<void> {
    this.stop();
    await new Promise((r) => setTimeout(r, 1000));
    await this.start();
  }

  getStatus(): SidecarStatus {
    return { ...this.status };
  }

  private async findPython(): Promise<string | null> {
    const platform = process.platform;
    const arch = process.arch;
    const runtimeRoot = path.join(process.resourcesPath, "runtime");
    const bundledRuntimeCandidates = [
      path.join(
        runtimeRoot,
        `${platform}-${arch}`,
        platform === "win32" ? "python.exe" : path.join("bin", "python3"),
      ),
      path.join(
        runtimeRoot,
        platform,
        platform === "win32" ? "python.exe" : path.join("bin", "python3"),
      ),
      path.join(
        runtimeRoot,
        "python",
        platform === "win32" ? "python.exe" : path.join("bin", "python3"),
      ),
      path.join(
        runtimeRoot,
        platform === "win32" ? "python.exe" : path.join("bin", "python3"),
      ),
    ];

    const candidates = [
      ...bundledRuntimeCandidates,
      // System python
      "python3",
      "python",
      "/usr/bin/python3",
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3",
      // Conda
      path.join(process.env.HOME || "", "anaconda3", "bin", "python"),
      path.join(process.env.HOME || "", "miniconda3", "bin", "python"),
    ];

    for (const candidate of candidates) {
      try {
        const { execSync } = require("child_process");
        const ver = execSync(`"${candidate}" --version 2>&1`).toString();
        if (ver.includes("Python 3")) {
          console.log(`[Sidecar] Using Python: ${candidate} (${ver.trim()})`);
          return candidate;
        }
      } catch {
        // try next
      }
    }
    return null;
  }

  private waitForPort(port: number, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.on("error", () => {
          socket.destroy();
          if (Date.now() - start < timeout) {
            setTimeout(check, 500);
          } else {
            resolve(false);
          }
        });
        socket.connect(port, "127.0.0.1");
      };
      check();
    });
  }

  private waitForPortFree(port: number, timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const socket = new net.Socket();
        socket.setTimeout(300);
        socket.on("connect", () => {
          socket.destroy();
          if (Date.now() - start < timeout) setTimeout(check, 500);
          else resolve();
        });
        socket.on("error", () => {
          socket.destroy();
          resolve(); // port is free
        });
        socket.connect(port, "127.0.0.1");
      };
      check();
    });
  }
}
