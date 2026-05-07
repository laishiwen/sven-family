/**
 * Type declarations for the Electron bridge exposed via preload.ts
 * Available on window.__electron__ when running inside Electron.
 */

interface ElectronBridge {
  // App
  getInfo: () => Promise<{
    version: string;
    isDev: boolean;
    platform: string;
    sidecarPort: number;
    dataDir: string;
    logDir: string;
  }>;
  getUserDataPath: () => Promise<string>;
  openLogsFolder: () => Promise<void>;

  // Dialog
  openFile: (options?: {
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  openDirectory: () => Promise<string | null>;
  saveFile: (options?: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;

  // File system
  readFile: (filePath: string) => Promise<Buffer | null>;
  writeFile: (filePath: string, data: string | Buffer) => Promise<boolean>;

  // Sidecar
  getSidecarStatus: () => Promise<{
    running: boolean;
    pid?: number;
    port: number;
    startedAt?: string;
    error?: string;
  }>;
  restartSidecar: () => Promise<{ running: boolean }>;

  // Shell
  openExternal: (url: string) => Promise<void>;

  // Theme
  getNativeTheme: () => Promise<"dark" | "light">;
  onNativeThemeChange: (cb: (theme: "dark" | "light") => void) => () => void;

  // Updater
  onUpdateAvailable: (cb: () => void) => () => void;
  onUpdateDownloaded: (cb: () => void) => () => void;
  installUpdate: () => Promise<void>;

  // Platform
  platform: string;
  isDesktop: boolean;

  // Speech IPC proxy
  speechEnsure: (preferredEngine?: string) => Promise<{
    ready: boolean;
    active_engine: string | null;
    candidates: string[];
    [key: string]: unknown;
  }>;
  speechTranscribe: (
    buffer: ArrayBuffer,
    filename: string,
  ) => Promise<{ text: string; engine: string }>;
}

declare global {
  interface Window {
    __electron__?: ElectronBridge;
  }
}

export {};
