const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");
const crypto = require("crypto");

const isDev = !app.isPackaged;
if (!isDev) {
  process.env.DESKTOP_BUILD = "1";
}
process.env.APP_DATA_DIR = app.getPath("userData");
let port = parseInt(process.env.PORT || "5000", 10);
process.env.PORT = String(port);

let serverStarted = false;
const serverWaitTimeoutMs = parseInt(process.env.SERVER_WAIT_TIMEOUT_MS || "90000", 10);
let splashWindow = null;
let quitTimer = null;
let appUrl = null;
const logPath = path.join(app.getPath("userData"), "app.log");

function appendAppLog(message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // Ignore logging failures.
  }
}

// Remove the default application menu (File/Edit/View/Window)
Menu.setApplicationMenu(null);

function ensureDesktopSecrets() {
  if (isDev) return;
  if (process.env.SESSION_SECRET || process.env.JWT_SECRET) return;

  const secretsPath = path.join(app.getPath("userData"), "secrets.json");
  let secret = "";

  try {
    if (fs.existsSync(secretsPath)) {
      const raw = fs.readFileSync(secretsPath, "utf8");
      const parsed = JSON.parse(raw);
      secret = parsed.sessionSecret || parsed.jwtSecret || "";
    }
  } catch {
    // Ignore unreadable secrets; we'll generate a new one.
  }

  if (!secret) {
    secret = crypto.randomBytes(48).toString("hex");
    try {
      fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
      fs.writeFileSync(secretsPath, JSON.stringify({ sessionSecret: secret }, null, 2));
    } catch {
      // If we cannot persist, still use the generated secret for this run.
    }
  }

  process.env.SESSION_SECRET = secret;
}

if (!isDev || process.env.DISABLE_GPU === "true") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function waitForServer(url, timeoutMs = serverWaitTimeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Server not ready after ${timeoutMs}ms`));
            return;
          }
          setTimeout(check, 500);
        });
    };
    check();
  });
}

function isPortAvailable(checkPort) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
          return;
        }
        resolve(false);
      })
      .once("listening", () => {
        tester.close(() => resolve(true));
      })
      .listen(checkPort, "127.0.0.1");
  });
}

async function findAvailablePort(startPort, retries = 10) {
  let candidate = startPort;
  for (let i = 0; i <= retries; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await isPortAvailable(candidate);
    if (ok) return candidate;
    candidate += 1;
  }
  return startPort;
}

async function ensureServerReady() {
  if (isDev || serverStarted) {
    return;
  }

  ensureSeedDatabase();

  port = await findAvailablePort(port, 5);
  process.env.PORT = String(port);

  const appPath = app.getAppPath();
  const serverPath = path.join(appPath, "dist", "index.cjs");
  require(serverPath);
  serverStarted = true;

  await waitForServer(`http://127.0.0.1:${port}`);
}

function ensureSeedDatabase() {
  const targetDir = app.getPath("userData");
  const targetDb = path.join(targetDir, "data.db");
  const hasUsersTable = (dbPath) => {
    try {
      const Database = require("better-sqlite3");
      const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
      const row = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      sqlite.close();
      return Boolean(row);
    } catch {
      return false;
    }
  };

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const candidates = [
    path.join(app.getAppPath(), "app-data", "data.db"),
    path.join(app.getAppPath(), ".local", "data.db"),
    path.join(app.getAppPath(), "data.db"),
    path.join(process.resourcesPath, "data.db"),
  ];

  const seedPath = candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });

  const hasUsers = fs.existsSync(targetDb) ? hasUsersTable(targetDb) : false;
  if (hasUsers) {
    return;
  }

  if (fs.existsSync(targetDb) && !hasUsers) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.renameSync(targetDb, path.join(targetDir, `data.invalid-${stamp}.db`));
    } catch {
      // If rename fails, we'll attempt to replace the file below.
    }
  }

  if (seedPath) {
    fs.copyFileSync(seedPath, targetDb);
    return;
  }

  throw new Error("Missing seed database; unable to initialize storage.");
}

function buildSplashHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Mill Manager</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { text-align: center; padding: 24px 32px; }
    .logo { width: 72px; height: 72px; margin: 0 auto 16px; border-radius: 12px; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 26px; }
    .loader { margin: 16px auto 0; width: 42px; height: 42px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #60a5fa; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">MM</div>
    <div>Starting Mill Manager...</div>
    <div class="loader" role="progressbar" aria-label="Loading"></div>
  </div>
</body>
</html>`;
}

async function createSplashWindow() {
  if (splashWindow) return;
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    resizable: false,
    fullscreenable: false,
    frame: false,
    show: true,
    skipTaskbar: true,
    icon: path.join(app.getAppPath(), "client", "public", "app_icon.ico"),
  });
  splashWindow.setMenu(null);
  await splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildSplashHtml())}`);
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function showFatalError(error) {
  const message = error instanceof Error ? error.message : String(error);
  appendAppLog(`FATAL: ${message}`);
  dialog.showErrorBox("Mill Manager failed to start", message);
  const win = new BrowserWindow({
    width: 680,
    height: 420,
    show: true,
    icon: path.join(app.getAppPath(), "client", "public", "app_icon.ico"),
    webPreferences: { contextIsolation: true },
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <html><head><meta charset="utf-8"><title>Mill Manager</title></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; color:#0f172a;">
      <h2>App failed to start</h2>
      <pre style="white-space: pre-wrap; background:#f1f5f9; padding:12px; border-radius:8px;">${message}</pre>
    </body></html>
  `)}`);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: path.join(app.getAppPath(), "client", "public", "app_icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "electron", "preload.cjs"),
    },
  });

  win.setMenu(null);
  win.setMenuBarVisibility(false);

  win.once("ready-to-show", () => win.show());
  setTimeout(() => {
    if (!win.isVisible()) {
      win.show();
    }
  }, 5000);
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    const message = `
      <html>
        <head><meta charset="utf-8"><title>Mill Manager</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px; color: #0f172a;">
          <h2>App failed to load</h2>
          <p>URL: ${url}</p>
          <p>Error ${code}: ${description}</p>
          <p>Please close and reopen the app. If the issue persists, check if port ${port} is in use.</p>
        </body>
      </html>
    `;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(message)}`);
    win.show();
  });
  return win;
}

async function startApp() {
  try {
    ensureDesktopSecrets();
    await createSplashWindow();
    await ensureServerReady();

    const win = createWindow();
    appUrl = `http://127.0.0.1:${port}`;
    await waitForServer(appUrl).catch(() => {});
    await win.loadURL(appUrl);
    closeSplashWindow();

    if (isDev) {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } catch (error) {
    closeSplashWindow();
    showFatalError(error);
  }
}

app.whenReady().then(startApp);

function createPreviewWindow(url) {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: true,
    icon: path.join(app.getAppPath(), "client", "public", "app_icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "electron", "preload.cjs"),
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  win.loadURL(url);
  return win;
}

async function createHiddenPrintWindow(html) {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return win;
}

ipcMain.handle("print-preview:open", (_event, payload) => {
  if (!appUrl) return undefined;
  const url = new URL("/print-preview", appUrl);
  const encoded = Buffer.from(JSON.stringify(payload || {}), "utf8").toString("base64");
  url.searchParams.set("payload", encoded);
  const win = createPreviewWindow(url.toString());
  return win.id;
});

/*
 * Paper geometry must match server/services/print/types.ts exactly. Electron,
 * Playwright and the preview iframe each get the SAME width/height/margins, so
 * "Print", "Download" and the on-screen preview cannot drift apart.
 */
const PAPER_SIZES_MM = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  Thermal80: { width: 80, height: 297 },
};

function resolvePrintGeometry(opts) {
  const format = opts?.format || "A4";
  const base =
    format === "Custom"
      ? { width: Number(opts?.widthMm) || 210, height: Number(opts?.heightMm) || 297 }
      : PAPER_SIZES_MM[format] || PAPER_SIZES_MM.A4;
  // Roll paper has no landscape mode.
  const rotate = opts?.orientation === "landscape" && format !== "Thermal80";
  const uniform = Number.isFinite(opts?.marginMm) ? Number(opts.marginMm) : 10;
  const pick = (value) => (Number.isFinite(Number(value)) ? Number(value) : uniform);
  return {
    widthMm: rotate ? base.height : base.width,
    heightMm: rotate ? base.width : base.height,
    marginTopMm: pick(opts?.marginTopMm),
    marginRightMm: pick(opts?.marginRightMm),
    marginBottomMm: pick(opts?.marginBottomMm),
    marginLeftMm: pick(opts?.marginLeftMm),
  };
}

const MM_PER_INCH = 25.4;
const MICRONS_PER_MM = 1000;

ipcMain.handle("print-preview:render-pdf", async (_event, payload) => {
  const html = payload?.html || "";
  const geometry = resolvePrintGeometry(payload?.options || {});
  const win = await createHiddenPrintWindow(html);
  try {
    const pdf = await win.webContents.printToPDF({
      // Size is always explicit; `landscape` stays false because the rotation is
      // already baked into width/height.
      landscape: false,
      printBackground: true,
      pageSize: {
        width: Math.round(geometry.widthMm * MICRONS_PER_MM),
        height: Math.round(geometry.heightMm * MICRONS_PER_MM),
      },
      // printToPDF margins are in inches. `marginsType: 1` used to force zero
      // margins here, so Electron downloads ignored the user's margin settings.
      margins: {
        marginType: "custom",
        top: geometry.marginTopMm / MM_PER_INCH,
        right: geometry.marginRightMm / MM_PER_INCH,
        bottom: geometry.marginBottomMm / MM_PER_INCH,
        left: geometry.marginLeftMm / MM_PER_INCH,
      },
    });
    return Buffer.from(pdf).toString("base64");
  } finally {
    win.destroy();
  }
});

ipcMain.handle("print-preview:print-html", async (_event, payload) => {
  const html = payload?.html || "";
  const silent = payload?.silent !== false;
  const deviceName = payload?.deviceName;
  const geometry = resolvePrintGeometry(payload?.options || {});
  const win = await createHiddenPrintWindow(html);
  try {
    const result = await new Promise((resolve) => {
      win.webContents.print(
        {
          silent,
          printBackground: true,
          deviceName: deviceName || "",
          landscape: false,
          pageSize: {
            width: Math.round(geometry.widthMm * MICRONS_PER_MM),
            height: Math.round(geometry.heightMm * MICRONS_PER_MM),
          },
          // print() margins are in pixels at 96dpi.
          margins: {
            marginType: "custom",
            top: Math.round((geometry.marginTopMm / MM_PER_INCH) * 96),
            right: Math.round((geometry.marginRightMm / MM_PER_INCH) * 96),
            bottom: Math.round((geometry.marginBottomMm / MM_PER_INCH) * 96),
            left: Math.round((geometry.marginLeftMm / MM_PER_INCH) * 96),
          },
        },
        (success, failureReason) => {
        if (!success) {
          resolve(false);
          return;
        }
        if (failureReason) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
    return result;
  } finally {
    win.destroy();
  }
});

ipcMain.handle("print-preview:get-printers", async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  try {
    return await win.webContents.getPrintersAsync();
  } catch {
    return [];
  }
});

ipcMain.handle("app-log:write", (_event, payload) => {
  const message =
    typeof payload === "string"
      ? payload
      : payload && typeof payload.message === "string"
      ? payload.message
      : JSON.stringify(payload);
  appendAppLog(message);
  return true;
});

app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    startApp();
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
});

process.on("uncaughtException", (error) => {
  appendAppLog(`uncaughtException: ${error?.stack || error}`);
  showFatalError(error);
});

process.on("unhandledRejection", (error) => {
  appendAppLog(`unhandledRejection: ${error?.stack || error}`);
  showFatalError(error);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    startApp();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    if (!quitTimer) {
      quitTimer = setTimeout(() => {
        app.exit(0);
      }, 3000);
    }
  }
});
