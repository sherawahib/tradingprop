import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";

const isDev = process.env.ELECTRON_DEV === "1";
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5180";

/**
 * Lock down a clean, writable identity for Electron BEFORE app.whenReady.
 *
 * Two stacked Windows problems we have to dodge:
 *
 *   1. Electron derives the app name from `package.json.name` which is
 *      `@paper-trader/desktop`. The `@` and `/` make Windows refuse to
 *      create the userData / cache directories — surfaces as
 *      "Unable to move the cache: Access is denied. 0x5".
 *
 *   2. Even with a clean name, `%APPDATA%\PropPrime Terminal` (Roaming) is
 *      occasionally locked by Windows Defender / OneDrive sync, which
 *      manifests as the same 0x5 error and causes Electron to exit with
 *      4294967295 ("Network service crashed or was terminated").
 *
 * Resolution: use **LocalAppData** (never roamed, less contended), pre-create
 * the dir, give dev and prod separate trees so a corrupt dev cache cannot
 * brick a packaged install, and disable HW acceleration so we don't even
 * hit the GPU shader disk cache.
 */
function ensureDir(p: string): void {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {
    /* best-effort — Electron will retry */
  }
}

app.setName("PropPrime Terminal");

const localAppData = app.getPath("appData").replace(/\\Roaming$/i, "\\Local");
const userDataRoot = path.join(localAppData, "PropPrime Terminal", isDev ? "dev" : "prod");
ensureDir(userDataRoot);
ensureDir(path.join(userDataRoot, "Cache"));
ensureDir(path.join(userDataRoot, "GPUCache"));
app.setPath("userData", userDataRoot);
app.setPath("sessionData", userDataRoot);

/** Avoid GPU disk cache & shader cache entirely on Windows where AV often locks them. */
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-software-rasterizer");
/** Some Windows 11 builds need this to avoid the network-service crash loop. */
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling,UseChromeOSDirectVideoDecoder");

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#050913",
    title: "PropPrime Terminal",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isDev && url.startsWith(VITE_DEV_SERVER_URL)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
  });

  if (isDev) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    void mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Reload window",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.webContents.reload()
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "togglefullscreen" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "toggleDevTools" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About PropPrime Terminal",
          click: () => {
            void dialog.showMessageBox({
              type: "info",
              title: "About PropPrime Terminal",
              message: "PropPrime Terminal",
              detail:
                "Educational simulated trading desktop client.\n" +
                "Connects to the @paper-trader/api backend.\n\n" +
                `Version ${app.getVersion()}`
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("app:open-external", (_evt, url: string) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
    return true;
  }
  return false;
});

app.whenReady().then(() => {
  buildAppMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

void fileURLToPath;
