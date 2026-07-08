import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, shell } from 'electron';
import * as path from 'path';
import { Bonjour } from 'bonjour-service';
import { initDatabase, closeDatabase } from './db';
import { startServer, stopServer, getLocalIP, isServerRunning } from './server';
import { initPrinter } from './printers/thermal';
import { registerIpcHandlers } from './ipc';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';

const isMasBuild =
  process.env.MAS_BUILD === '1' ||
  (process as NodeJS.Process & { mas?: boolean }).mas === true;

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
const logPath = log.transports.file.getFile().path.replace(/[^\/\\]+$/, '');
console.log('[Log] Log files location:', logPath);

let updateAvailable = false;
let updateDownloaded = false;

function setupAutoUpdater(): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    mainWindow?.webContents.send('update-status', { status: 'available', version: info.version, releaseDate: info.releaseDate });
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `FloSalon ${info.version} is available!`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-status', { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-status', { status: 'downloading', percent: progress.percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    mainWindow?.webContents.send('update-status', { status: 'ready-to-install', version: info.version });
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded!',
      detail: `Version ${info.version} will install when you quit.`,
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) { isQuitting = true; autoUpdater.quitAndInstall(); }
    });
  });

  autoUpdater.on('error', (err) => {
    const is404 = err.message?.includes('404') || err.message?.includes('Cannot find latest');
    if (is404) {
      mainWindow?.webContents.send('update-status', { status: 'up-to-date' });
    } else {
      log.error('[Update] Error:', err);
      mainWindow?.webContents.send('update-status', { status: 'error', error: err.message });
    }
  });
}

function checkForUpdates(): void {
  if (isMasBuild) { mainWindow?.webContents.send('update-status', { status: 'mas' }); return; }
  if (!isDev) {
    autoUpdater.checkForUpdates().catch((err) => console.error('[Update] Check failed:', err));
  } else {
    mainWindow?.webContents.send('update-status', { status: 'dev-mode' });
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let bonjour: Bonjour | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORT = parseInt(process.env.PORT || '3001', 10);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'FloSalon',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools();
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isLocal = url.startsWith(`http://localhost:${PORT}`) || url.startsWith(`http://127.0.0.1:${PORT}`);
    if (isLocal) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 1280, height: 800, title: 'FloSalon', webPreferences: { contextIsolation: true, nodeIntegration: false } },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow?.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log.error('[Window] Renderer process gone:', details.reason);
    if (details.reason !== 'clean-exit') {
      dialog.showMessageBox({ type: 'error', title: 'App Crashed', message: 'The app crashed and will restart.', buttons: ['OK'] }).then(() => {
        mainWindow?.destroy(); mainWindow = null; createWindow();
      });
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log.error('[Window] Failed to load:', errorCode, errorDescription);
  });
}

function createTray(): void {
  const iconPath = isDev
    ? path.join(__dirname, '../../assets/icon.png')
    : path.join(process.resourcesPath, 'assets/icon.png');

  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open FloSalon', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]);

    tray.setToolTip('FloSalon');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());
  } catch {
    console.log('[Tray] Icon not found, skipping tray');
  }
}

function startMdns(): void {
  try {
    bonjour = new Bonjour();
    bonjour.publish({
      name: 'FloSalon',
      type: 'http',
      port: PORT,
      host: 'flosaloon',
      txt: { version: app.getVersion() },
    });
    const ip = getLocalIP();
    console.log(`[mDNS] Advertising flosaloon.local:${PORT}  (IP fallback: http://${ip}:${PORT})`);
  } catch (err) {
    console.warn('[mDNS] Could not start Bonjour:', err);
  }
}

function stopMdns(): void {
  if (bonjour) {
    bonjour.unpublishAll(() => bonjour?.destroy());
    bonjour = null;
  }
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Ticket', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('new-order') },
        { label: 'Quick Search', accelerator: 'CmdOrCtrl+K', click: () => mainWindow?.webContents.send('quick-search') },
        { type: 'separator' },
        { label: 'Backup Database', click: () => mainWindow?.webContents.send('backup-database') },
        { label: 'Restore Backup', click: () => mainWindow?.webContents.send('restore-backup') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } },
      ],
    },
    {
      label: 'Tickets',
      submenu: [
        { label: 'View All Tickets', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('view-orders') },
      ],
    },
    {
      label: 'Reports',
      submenu: [
        { label: 'Daily Summary', click: () => mainWindow?.webContents.send('report-daily') },
        { label: 'Sales Report', click: () => mainWindow?.webContents.send('report-sales') },
        { label: 'X Report', click: () => mainWindow?.webContents.send('report-x') },
        { label: 'Z Report', click: () => mainWindow?.webContents.send('report-z') },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        { label: 'Business Settings', click: () => mainWindow?.webContents.send('settings-business') },
        { label: 'Tax Settings', click: () => mainWindow?.webContents.send('settings-tax') },
        { label: 'Printer Setup', click: () => mainWindow?.webContents.send('settings-printer') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About FloSalon', click: () => showAbout() },
        ...(isMasBuild ? [] : [{ label: 'Check for Updates', click: () => checkForUpdates() }]),
      ],
    },
  ];

  if (isDev) {
    template.push({
      label: 'Developer',
      submenu: [
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout(): void {
  const ip = getLocalIP();
  dialog.showMessageBox({
    type: 'info',
    title: 'About FloSalon',
    message: 'FloSalon Desktop',
    detail: [
      `Version: ${app.getVersion()}`,
      `Electron: ${process.versions.electron}`,
      `Node: ${process.versions.node}`,
      '',
      'A self-hosted, offline-first Salon POS system.',
      '',
      `URL: http://flosaloon.local:${PORT}`,
      `IP:  http://${ip}:${PORT}`,
    ].join('\n'),
  });
}

async function initialize(): Promise<void> {
  try {
    console.log('[FloSalon] Initializing...');

    console.log('[FloSalon] Initializing database...');
    initDatabase();

    console.log('[FloSalon] Starting local server...');
    await startServer();

    console.log('[FloSalon] Starting mDNS advertisement...');
    startMdns();

    console.log('[FloSalon] Initializing printer...');
    await initPrinter();

    console.log('[FloSalon] Registering IPC handlers...');
    registerIpcHandlers();

    ipcMain.handle('get-update-status', () => ({ updateAvailable, updateDownloaded, version: app.getVersion() }));
    ipcMain.handle('check-for-updates', () => { checkForUpdates(); });
    ipcMain.handle('get-status', () => {
      const mem = process.memoryUsage();
      return {
        server: isServerRunning() ? 'running' : 'stopped',
        memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024), heapTotal: Math.round(mem.heapTotal / 1024 / 1024), rss: Math.round(mem.rss / 1024 / 1024) },
        uptime: process.uptime(),
        port: PORT,
      };
    });

    console.log('[FloSalon] Creating window...');
    createWindow();
    createTray();
    createMenu();
    if (!isMasBuild) {
      setupAutoUpdater();
      setTimeout(() => checkForUpdates(), 5000);
    }

    console.log('[FloSalon] Ready!');
  } catch (error) {
    console.error('[FloSalon] Initialization error:', error);
    dialog.showErrorBox('Initialization Error', `Failed to start FloSalon: ${error}`);
    app.quit();
  }
}

app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
  else mainWindow.show();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('quit', () => {
  console.log('[FloSalon] Shutting down...');
  stopMdns();
  stopServer();
  closeDatabase();
  console.log('[FloSalon] Goodbye!');
});

process.on('uncaughtException', (error) => { log.error('[FloSalon] Uncaught exception:', error); });
process.on('unhandledRejection', (reason) => { log.error('[FloSalon] Unhandled rejection:', reason); });
