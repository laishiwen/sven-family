import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose safe Electron APIs to the renderer process via window.__electron__
 * The renderer can check `window.__electron__` to detect desktop context.
 */
const electronBridge = {
  // ── App info ────────────────────────────────────────────────────────────
  getInfo: () => ipcRenderer.invoke("app:getInfo"),
  getUserDataPath: () => ipcRenderer.invoke("app:getUserDataPath"),
  openLogsFolder: () => ipcRenderer.invoke("app:openLogsFolder"),

  // ── Dialog ──────────────────────────────────────────────────────────────
  openFile: (options?: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke("dialog:openFile", options),
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  saveFile: (options?: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke("dialog:saveFile", options),

  // ── File system ─────────────────────────────────────────────────────────
  readFile: (filePath: string) => ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath: string, data: string | Buffer) =>
    ipcRenderer.invoke("fs:writeFile", filePath, data),

  // ── Sidecar ─────────────────────────────────────────────────────────────
  getSidecarStatus: () => ipcRenderer.invoke("sidecar:getStatus"),
  restartSidecar: () => ipcRenderer.invoke("sidecar:restart"),

  // ── Shell ───────────────────────────────────────────────────────────────
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),

  // ── Theme ───────────────────────────────────────────────────────────────
  getNativeTheme: () => ipcRenderer.invoke("theme:getNative"),
  onNativeThemeChange: (cb: (theme: "dark" | "light") => void) => {
    ipcRenderer.on("theme:nativeChanged", (_event, theme) => cb(theme));
    return () => ipcRenderer.removeAllListeners("theme:nativeChanged");
  },

  // ── Updater ─────────────────────────────────────────────────────────────
  onUpdateAvailable: (cb: () => void) => {
    ipcRenderer.on("updater:updateAvailable", cb);
    return () => ipcRenderer.removeAllListeners("updater:updateAvailable");
  },
  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on("updater:updateDownloaded", cb);
    return () => ipcRenderer.removeAllListeners("updater:updateDownloaded");
  },
  installUpdate: () => ipcRenderer.invoke("updater:installNow"),

  // ── Platform detection ──────────────────────────────────────────────────
  platform: process.platform,
  isDesktop: true,

  // ── Speech IPC proxy ────────────────────────────────────────────────────
  // Renderer sends ArrayBuffer; preload converts to Buffer (zero-copy view)
  // before handing to main process so we avoid browser multipart overhead.
  speechEnsure: (preferredEngine?: string) =>
    ipcRenderer.invoke("speech:ensure", preferredEngine),
  speechTranscribe: (buffer: ArrayBuffer, filename: string) =>
    ipcRenderer.invoke("speech:transcribe", Buffer.from(buffer), filename),
};

contextBridge.exposeInMainWorld("__electron__", electronBridge);

// Type declaration (for TS in renderer)
export type ElectronBridge = typeof electronBridge;
