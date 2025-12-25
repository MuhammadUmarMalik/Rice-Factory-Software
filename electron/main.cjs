const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");

const isDev = !app.isPackaged;
const port = process.env.PORT || "5000";
process.env.PORT = port;

let serverStarted = false;

function waitForServer(url, timeoutMs = 30000) {
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

async function ensureServerReady() {
  if (isDev || serverStarted) {
    return;
  }

  const appPath = app.getAppPath();
  const serverPath = path.join(appPath, "dist", "index.cjs");
  require(serverPath);
  serverStarted = true;

  await waitForServer(`http://127.0.0.1:${port}`);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());
  return win;
}

async function startApp() {
  await ensureServerReady();

  const win = createWindow();
  const appUrl = `http://127.0.0.1:${port}`;
  await waitForServer(appUrl).catch(() => {});
  await win.loadURL(appUrl);

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(startApp);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    startApp();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
