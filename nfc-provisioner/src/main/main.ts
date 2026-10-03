// Electron main process. Owns the reader (native PC/SC), the device token and
// the API client; the renderer only sees state and a few validated actions.

import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from "electron";
import path from "path";
import { Provisioner } from "../core/provisioner";
import { PcscReaderAdapter, SimulatedReaderAdapter, blankNtagMemory, type ReaderAdapter } from "../nfc/reader";
import { MemoryCredentialStore, SafeCredentialStore } from "./credentialStore";

// `--simulator` (or XPOT_NFC_SIMULATOR=1) runs without hardware: a fake
// reader, a tag placed a moment after start, and an in-memory token store.
const SIMULATOR = process.argv.includes("--simulator") || process.env.XPOT_NFC_SIMULATOR === "1";

let win: BrowserWindow | null = null;
let provisioner: Provisioner;

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 440,
    minHeight: 600,
    title: "Xpot NFC Writer",
    backgroundColor: "#0b0d12",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  // No navigation, no new windows, no remote content.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function push() {
  win?.webContents.send("provisioner:state", { ...provisioner.state, blocked: provisioner.canProgram() });
}

const isString = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function registerIpc() {
  ipcMain.handle("provisioner:get-state", () => ({ ...provisioner.state, blocked: provisioner.canProgram() }));

  ipcMain.handle("provisioner:pair", async (_e, serverUrl: unknown, code: unknown) => {
    if (!isString(serverUrl, 200) || !isString(code, 20)) return { ok: false, message: "Invalid input" };
    try {
      await provisioner.pair(serverUrl, code);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });

  ipcMain.handle("provisioner:unpair", () => {
    provisioner.unpair();
    return { ok: true };
  });

  ipcMain.handle("provisioner:program", async () => {
    try {
      await provisioner.program();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });

  ipcMain.handle("provisioner:give-up", async () => {
    await provisioner.giveUp();
    return { ok: true };
  });

  ipcMain.handle("provisioner:refresh", () => {
    provisioner.refresh();
    return { ok: true };
  });

  // The only outbound link: the Tags admin on the configured Xpot server.
  ipcMain.handle("provisioner:open-website", () => {
    const origin = provisioner.state.serverUrl;
    if (origin) void shell.openExternal(`${origin}/admin/tags`);
    return { ok: true };
  });
}

app.whenReady().then(() => {
  // Deny every permission request (camera, notifications, …) from the renderer.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  let reader: ReaderAdapter;
  if (SIMULATOR) {
    const sim = new SimulatedReaderAdapter();
    setTimeout(() => sim.placeTag(blankNtagMemory(144)), 1500);
    reader = sim;
  } else {
    reader = new PcscReaderAdapter();
  }

  provisioner = new Provisioner({
    reader,
    store: SIMULATOR ? new MemoryCredentialStore() : new SafeCredentialStore(app.getPath("userData"), safeStorage),
    appVersion: app.getVersion(),
    platform: `${process.platform}-${process.arch}`,
  });
  provisioner.on("state", push);

  registerIpc();
  createWindow();
  provisioner.start();

  if (SIMULATOR && process.env.XPOT_NFC_PAIRING_CODE && process.env.XPOT_NFC_SERVER) {
    void provisioner.pair(process.env.XPOT_NFC_SERVER, process.env.XPOT_NFC_PAIRING_CODE).catch(() => undefined);
  }
});

app.on("window-all-closed", () => {
  provisioner?.stop();
  app.quit();
});
