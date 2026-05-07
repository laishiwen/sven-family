import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  nativeTheme,
  Menu,
  Tray,
  nativeImage,
  session,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { autoUpdater } from "electron-updater";
import { SidecarManager } from "./sidecar";
import { createMenu } from "./menu";

const isDev = process.env.ELECTRON_DEV === "true" || !app.isPackaged;
const insecureDevRenderer =
  process.env.ELECTRON_INSECURE_DEV_RENDERER === "true";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sidecar: SidecarManager | null = null;

const SENSITIVE_SUBDIRS = [
  "AppData",
  "Workspace",
  "Backup",
  "Media",
  "Temp",
] as const;

type SensitiveSubdir = (typeof SENSITIVE_SUBDIRS)[number];
type SensitiveDirs = {
  root: string;
  appData: string;
} & Record<Lowercase<SensitiveSubdir>, string>;

let sensitiveDirs: SensitiveDirs | null = null;

const SIDECAR_PORT = parseInt(process.env.DESKTOP_SIDECAR_PORT || "8000", 10);
const FRONTEND_URL = isDev
  ? `http://localhost:${parseInt(process.env.VITE_DEV_PORT || "3000", 10)}`
  : `http://localhost:${SIDECAR_PORT}`;

function resolveSensitiveRootDir(): string {
  if (process.platform === "win32") {
    return path.join("C:\\", "Data", "SvenStudio");
  }
  return path.join(app.getPath("home"), "Data", "SvenStudio");
}

function buildSensitiveDirsFromRoot(root: string): SensitiveDirs {
  const appData = path.join(root, "AppData");
  return {
    root,
    appData,
    appdata: appData,
    workspace: path.join(root, "Workspace"),
    backup: path.join(root, "Backup"),
    media: path.join(root, "Media"),
    temp: path.join(root, "Temp"),
  };
}

function ensureSensitiveDataDirs(): SensitiveDirs {
  const root = resolveSensitiveRootDir();

  try {
    fs.mkdirSync(root, { recursive: true });
    for (const sub of SENSITIVE_SUBDIRS) {
      fs.mkdirSync(path.join(root, sub), { recursive: true });
    }
    return buildSensitiveDirsFromRoot(root);
  } catch (error) {
    if (process.platform === "win32") {
      // Fall back when C: is unavailable to avoid startup failure.
      const fallbackRoot = path.join(app.getPath("home"), "Data", "SvenStudio");
      fs.mkdirSync(fallbackRoot, { recursive: true });
      for (const sub of SENSITIVE_SUBDIRS) {
        fs.mkdirSync(path.join(fallbackRoot, sub), { recursive: true });
      }
      console.warn(
        `[Storage] Cannot use C:\\Data\\SvenStudio, fallback to ${fallbackRoot}:`,
        error,
      );
      return buildSensitiveDirsFromRoot(fallbackRoot);
    }
    throw error;
  }
}

function mergeTreeIfMissing(source: string, target: string): void {
  if (!fs.existsSync(source)) {
    return;
  }

  const stat = fs.statSync(source);
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    mergeTreeIfMissing(path.join(source, entry), path.join(target, entry));
  }
}

function migrateLegacyDataToAppData(
  targetAppDataPath: string,
  legacyUserDataPath: string,
): void {
  const targetDataDir = targetAppDataPath;
  const targetLogDir = path.join(targetAppDataPath, "logs");
  fs.mkdirSync(targetDataDir, { recursive: true });
  fs.mkdirSync(targetLogDir, { recursive: true });

  const legacyDataSources = [
    path.join(targetAppDataPath, "data"),
    path.join(legacyUserDataPath, "data"),
    path.join(process.resourcesPath, "api", "data"),
  ];
  const legacyLogSources = [
    path.join(legacyUserDataPath, "logs"),
    path.join(process.resourcesPath, "api", "logs"),
  ];

  for (const source of legacyDataSources) {
    if (!fs.existsSync(source)) continue;

    for (const name of [
      "sven_studio.db",
      "milvus.db",
      "managed_runtime",
      "uploads",
      "vector_store",
      "model_cache",
      "training",
    ]) {
      mergeTreeIfMissing(
        path.join(source, name),
        path.join(targetDataDir, name),
      );
    }

    mergeTreeIfMissing(
      path.join(source, "vector_store", "milvus_lite.db"),
      path.join(targetDataDir, "vector_store", "milvus_lite.db"),
    );
  }

  for (const source of legacyLogSources) {
    mergeTreeIfMissing(source, targetLogDir);
  }
}

// ── App single instance lock ───────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ── Window creation ────────────────────────────────────────────────────────
function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  const useInsecureDevRenderer = isDev && insecureDevRenderer;

  if (useInsecureDevRenderer) {
    console.warn(
      "[Security] Insecure dev renderer mode enabled (webSecurity disabled). Do not use in production.",
    );
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "Sven Studio",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f172a" : "#f8fafc",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 10 },
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !useInsecureDevRenderer,
      allowRunningInsecureContent: useInsecureDevRenderer,
    },
    show: false,
  });

  // Show when ready to prevent white flash
  mainWindow.once("ready-to-show", () => {
    mainWindow!.show();
    if (isDev) mainWindow!.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Inject X-Sven-Desktop header so the backend can reject browser access
  const desktopFilter = {
    urls: [
      `http://localhost:${SIDECAR_PORT}/*`,
      `http://127.0.0.1:${SIDECAR_PORT}/*`,
    ],
  };
  session.defaultSession.webRequest.onBeforeSendHeaders(
    desktopFilter,
    (details, cb) => {
      details.requestHeaders["X-Sven-Desktop"] = "1";
      cb({ requestHeaders: details.requestHeaders });
    },
  );

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL(FRONTEND_URL);
  } else {
    // In production, load from built web assets served by FastAPI
    mainWindow.loadURL(FRONTEND_URL);
  }

  return mainWindow;
}

// ── Tray ──────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "tray-icon.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("Sven Studio");
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// ── IPC handlers ──────────────────────────────────────────────────────────
function registerIpcHandlers() {
  // Get app info
  ipcMain.handle("app:getInfo", () => ({
    version: app.getVersion(),
    isDev,
    platform: process.platform,
    sidecarPort: SIDECAR_PORT,
    dataDir: app.getPath("userData"),
    logDir: path.join(app.getPath("userData"), "logs"),
    sensitiveDirs,
  }));

  // Open file dialog
  ipcMain.handle(
    "dialog:openFile",
    async (_, options: Electron.OpenDialogOptions) => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        ...options,
      });
      return result.canceled ? null : result.filePaths[0];
    },
  );

  // Open directory dialog
  ipcMain.handle("dialog:openDirectory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Save file dialog
  ipcMain.handle(
    "dialog:saveFile",
    async (_, options: Electron.SaveDialogOptions) => {
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, options);
      return result.canceled ? null : result.filePath;
    },
  );

  // Read file (for local file access)
  ipcMain.handle("fs:readFile", async (_, filePath: string) => {
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  });

  // Write file
  ipcMain.handle(
    "fs:writeFile",
    async (_, filePath: string, data: Buffer | string) => {
      try {
        fs.writeFileSync(filePath, data);
        return true;
      } catch {
        return false;
      }
    },
  );

  // Get sidecar status
  ipcMain.handle(
    "sidecar:getStatus",
    () => sidecar?.getStatus() ?? { running: false },
  );

  // Restart sidecar
  ipcMain.handle("sidecar:restart", async () => {
    await sidecar?.restart();
    return sidecar?.getStatus();
  });

  // Open in browser
  ipcMain.handle("shell:openExternal", (_, url: string) =>
    shell.openExternal(url),
  );

  // Get user data path
  ipcMain.handle("app:getUserDataPath", () => app.getPath("userData"));

  // Open logs folder
  ipcMain.handle("app:openLogsFolder", () => {
    shell.openPath(path.join(app.getPath("userData"), "logs"));
  });

  // Theme sync
  ipcMain.handle("theme:getNative", () =>
    nativeTheme.shouldUseDarkColors ? "dark" : "light",
  );
  nativeTheme.on("updated", () => {
    mainWindow?.webContents.send(
      "theme:nativeChanged",
      nativeTheme.shouldUseDarkColors ? "dark" : "light",
    );
  });

  // ── Speech IPC proxy (renderer → main → sidecar loopback) ──────────────
  // Faster than renderer HTTP: skips browser multipart overhead and security
  // restrictions; main process calls sidecar over loopback directly.

  ipcMain.handle("speech:ensure", async (_event, preferredEngine?: string) => {
    const url = new URL(
      `http://localhost:${SIDECAR_PORT}/api/v1/speech/ensure`,
    );
    if (preferredEngine)
      url.searchParams.set("preferred_engine", preferredEngine);
    const resp = await fetch(url.toString(), { method: "POST" });
    const body: any = await resp.json().catch(() => ({}));
    if (!resp.ok)
      throw new Error(body?.detail ?? `ensure_failed:${resp.status}`);
    return body;
  });

  ipcMain.handle(
    "speech:transcribe",
    async (
      _event,
      audioBuffer: Buffer,
      filename: string,
      preferredEngine?: string,
    ) => {
      const tmpPath = path.join(
        os.tmpdir(),
        `sven-speech-${Date.now()}-${filename}`,
      );
      fs.writeFileSync(tmpPath, audioBuffer);
      try {
        const url = new URL(
          `http://localhost:${SIDECAR_PORT}/api/v1/speech/transcribe`,
        );
        if (preferredEngine)
          url.searchParams.set("preferred_engine", preferredEngine);

        const formData = new FormData();
        formData.append(
          "audio",
          new Blob([fs.readFileSync(tmpPath)]),
          filename,
        );

        const resp = await fetch(url.toString(), {
          method: "POST",
          body: formData,
        });
        const body: any = await resp.json().catch(() => ({}));
        if (!resp.ok)
          throw new Error(body?.detail ?? `transcribe_failed:${resp.status}`);
        return body as { text: string; engine: string };
      } finally {
        fs.unlink(tmpPath, () => {});
      }
    },
  );
}

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Explicitly allow audio capture in desktop runtime so getUserMedia can work reliably.
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
        return;
      }
      callback(false);
    },
  );
  // Device permission handler for audio capture (if available)
  // @ts-ignore - API compatibility across Electron versions
  if (typeof session.defaultSession.setDevicePermissionHandler === "function") {
    // @ts-ignore - API compatibility
    session.defaultSession.setDevicePermissionHandler((details: any) => {
      return details.deviceType === "audioCapture";
    });
  }

  const legacyUserDataPath = app.getPath("userData");
  sensitiveDirs = ensureSensitiveDataDirs();
  app.setPath("userData", sensitiveDirs.appData);
  migrateLegacyDataToAppData(sensitiveDirs.appData, legacyUserDataPath);

  // Start sidecar in production
  if (!isDev) {
    const apiDir = path.join(process.resourcesPath, "api");
    sidecar = new SidecarManager(apiDir, SIDECAR_PORT);
    await sidecar.start();
  }

  registerIpcHandlers();
  Menu.setApplicationMenu(createMenu(mainWindow));
  createWindow();

  if (process.platform !== "linux") {
    createTray();
  }

  // Auto-updater (production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
});

app.on("window-all-closed", () => {
  // On macOS keep app running in tray
  if (process.platform !== "darwin") {
    sidecar?.stop();
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  sidecar?.stop();
});

// Handle auto-updater events
autoUpdater.on("update-available", () => {
  mainWindow?.webContents.send("updater:updateAvailable");
});
autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("updater:updateDownloaded");
});

ipcMain.handle("updater:installNow", () => {
  autoUpdater.quitAndInstall();
});
