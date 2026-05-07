import { app, Menu, shell, BrowserWindow, dialog } from "electron";

type MenuLocale = "zh-CN" | "en";

const menuMessages: Record<MenuLocale, Record<string, string>> = {
  "zh-CN": {
    "menu.file": "文件",
    "menu.file.import-dataset": "导入数据集",
    "menu.file.choose-dataset": "选择数据集文件",
    "menu.edit": "编辑",
    "menu.view": "视图",
    "menu.community": "社区",
    "menu.community.open": "打开社区",
    "menu.window": "窗口",
    "menu.help": "帮助",
    "menu.help.api-docs": "API 文档",
    "menu.help.view-logs": "查看日志",
    "menu.help.about": "关于 Sven Studio",
    "menu.help.about.detail":
      "本地优先 AI Agent 开发平台\n\nPowered by FastAPI + React + Electron",
  },
  en: {
    "menu.file": "File",
    "menu.file.import-dataset": "Import Dataset",
    "menu.file.choose-dataset": "Choose Dataset File",
    "menu.edit": "Edit",
    "menu.view": "View",
    "menu.community": "Community",
    "menu.community.open": "Open Community",
    "menu.window": "Window",
    "menu.help": "Help",
    "menu.help.api-docs": "API Docs",
    "menu.help.view-logs": "View Logs",
    "menu.help.about": "About Sven Studio",
    "menu.help.about.detail":
      "Local-first AI Agent development platform\n\nPowered by FastAPI + React + Electron",
  },
};

function getMenuLocale(): MenuLocale {
  const locale = app.getLocale().toLowerCase();
  return locale.startsWith("zh") ? "zh-CN" : "en";
}

function createMenuT(locale: MenuLocale) {
  return (key: string) => menuMessages[locale][key] || key;
}

export function createMenu(win: BrowserWindow | null): Menu {
  const isMac = process.platform === "darwin";
  const t = createMenuT(getMenuLocale());

  const template: Electron.MenuItemConstructorOptions[] = [
    // Mac App menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),

    // File
    {
      label: t("menu.file"),
      submenu: [
        {
          label: t("menu.file.import-dataset"),
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            if (!win) return;
            const result = await dialog.showOpenDialog(win, {
              title: t("menu.file.choose-dataset"),
              filters: [
                { name: "Dataset", extensions: ["jsonl", "csv", "parquet"] },
              ],
              properties: ["openFile"],
            });
            if (!result.canceled && result.filePaths[0]) {
              win.webContents.send("menu:importDataset", result.filePaths[0]);
            }
          },
        },
        { type: "separator" },
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },

    // Community
    {
      label: t("menu.community"),
      submenu: [
        {
          label: t("menu.community.open"),
          accelerator: "CmdOrCtrl+Shift+C",
          click: () => {
            const communityUrl =
              process.env.COMMUNITY_URL || "http://localhost:3002";
            shell.openExternal(communityUrl);
          },
        },
      ],
    },

    // Edit
    {
      label: t("menu.edit"),
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },

    // View
    {
      label: t("menu.view"),
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },

    // Window
    {
      label: t("menu.window"),
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },

    // Help
    {
      label: t("menu.help"),
      submenu: [
        {
          label: t("menu.help.api-docs"),
          click: () => shell.openExternal("http://localhost:8000/docs"),
        },
        {
          label: t("menu.help.view-logs"),
          click: () => {
            const { app: electronApp } = require("electron");
            shell.openPath(
              require("path").join(electronApp.getPath("userData"), "logs"),
            );
          },
        },
        { type: "separator" },
        {
          label: t("menu.help.about"),
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "Sven Studio",
              message: `Sven Studio v${app.getVersion()}`,
              detail: t("menu.help.about.detail"),
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
