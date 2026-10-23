import { app, BrowserWindow, ipcMain, session, screen, Menu, dialog } from 'electron';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { CacheHost } from './cache';
import { LocalDiagnostics } from './diagnostics';
import type { Snapshot } from '../shared';

const background = process.argv.includes('--background') || process.env.LENS_BACKGROUND === '1';
let diagnostics: LocalDiagnostics | undefined;
let fatal = false;
const fail = (error: unknown) => {
  if (fatal) return;
  fatal = true;
  diagnostics?.record('fatal', error);
  console.error('Session Lens stopped after an unexpected local error. See diagnostics.json in its application data folder.');
  app.exit(1);
};
// Handle both modes without Electron's modal JavaScript-error dialog or raw stacks.
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
if (background && process.platform === 'darwin') app.setActivationPolicy('accessory');
if (background) {
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>app.isReady()?app.quit():app.exit(0));
}

// No remote content, updater, analytics, or API client. Chromium background networking is disabled.
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
if (process.env.LENS_DATA_DIR) app.setPath('userData', resolve(process.env.LENS_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.exit(0);
let win: BrowserWindow | null = null;
let lens: CacheHost;
let blockedRequests = 0;
let timer: NodeJS.Timeout;
let closing = false;
let shutdownComplete = false;
let saveBounds: NodeJS.Timeout;
const renderer = join(__dirname, '../renderer/index.html');
const snapshot = (): Snapshot => {
  const value = lens.snapshot(); value.diagnostics.blockedRequests = blockedRequests; return value;
};
const scan = () => lens.rescan();

function createWindow() {
  const prefs = snapshot().preferences;
  const saved = lens.bounds() as Electron.Rectangle | null;
  const valid = saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isSafeInteger) && saved.width >= 360 && saved.width <= 16384 && saved.height >= 320 && saved.height <= 16384 && screen.getAllDisplays().some(d => saved.x + saved.width > d.workArea.x && saved.x < d.workArea.x + d.workArea.width && saved.y >= d.workArea.y && saved.y < d.workArea.y + d.workArea.height - 40);
  const bounds = valid ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : {};
  win = new BrowserWindow({width:460,height:650,minWidth:360,minHeight:320,...bounds,show:!background,focusable:!background,skipTaskbar:background,title:'Codex Session Lens',alwaysOnTop:prefs.alwaysOnTop,backgroundColor:'#101719',webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:!background,devTools:!app.isPackaged}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  const remember = () => { clearTimeout(saveBounds); saveBounds = setTimeout(() => { if (!closing && win && !win.isDestroyed()) void lens.saveBounds(win.getBounds()).catch(error => diagnostics?.record('bounds_failed', error)); },200); };
  win.on('move',remember); win.on('resize',remember);
  win.on('close',() => { if (!closing && win) void lens.saveBounds(win.getBounds()).catch(error => diagnostics?.record('bounds_failed', error)); });
  win.on('closed',() => {win = null;});
  void win.loadFile(renderer);
}

app.whenReady().then(async () => {
  const codexHome = process.env.CODEX_HOME || join(homedir(),'.codex');
  lens = new CacheHost(join(app.getPath('userData'),'telemetry.sqlite'), process.env.LENS_SESSION_DIR ? [resolve(process.env.LENS_SESSION_DIR)] : [join(codexHome,'sessions'),join(codexHome,'archived_sessions')]);
  diagnostics = new LocalDiagnostics(join(app.getPath('userData'), 'diagnostics.json'), background ? 'background' : 'desktop', app.getVersion());
  diagnostics.record('started');
  if (lens.snapshot().recovery) diagnostics.record('cache_unavailable');
  session.defaultSession.setPermissionRequestHandler((_wc,_perm,callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith(pathToFileURL(join(__dirname,'../renderer/')).href);
    if (!allowed) blockedRequests++;
    callback({cancel:!allowed});
  });
  const handle = (channel: string, action: (...args: any[]) => unknown) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame?.url !== pathToFileURL(renderer).href) throw new Error('Untrusted caller');
    try { return await action(...args); } catch (error) { diagnostics?.record('operation_failed', error); throw new Error('Local operation failed. Check settings and directory access.'); }
  });
  handle('lens:snapshot',snapshot);
  let choosingDirectories = false;
  handle('lens:choose-directories', async () => {
    if (!win || choosingDirectories || closing) return null;
    choosingDirectories = true;
    try {
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose Codex session folders', buttonLabel: 'Use folders',
        defaultPath: codexHome, properties: ['openDirectory', 'multiSelections', 'showHiddenFiles'],
        message: 'Choose folders containing Codex JSONL sessions. Source files stay read-only.',
      });
      return result.canceled ? null : result.filePaths;
    } finally { choosingDirectories = false; }
  });
  handle('lens:alias', async (id: unknown, label: unknown) => { await lens.alias(id, label); return snapshot(); });
  handle('lens:recover',async (action: unknown) => { await lens.recover(action); diagnostics?.record(lens.snapshot().recovery ? 'cache_unavailable' : 'cache_recovered'); return snapshot(); });
  handle('lens:select',async (id: unknown) => { await lens.select(id); return snapshot(); });
  handle('lens:preferences',async (value: unknown) => {
    await lens.preferences(value);
    win?.setAlwaysOnTop(snapshot().preferences.alwaysOnTop); return snapshot();
  });
  handle('lens:rescan',async () => {await scan(); return snapshot();});
  handle('lens:clear',async () => { await lens.clear(); return snapshot(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Codex Session Lens',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'quit'}]},{role:'editMenu'},{role:'windowMenu'}]));
  createWindow();
  const scanSafely = () => { void scan().catch(error => { if (!closing) diagnostics?.record('operation_failed', error); }); };
  scanSafely(); timer=setInterval(() => { if (!closing) scanSafely(); },1000);
  app.on('activate',() => {if (!win) createWindow();});
});
app.on('window-all-closed',() => app.quit());
app.on('second-instance', () => { if (!background && win) { win.show(); win.focus(); } });
app.on('before-quit', event => {
  if (shutdownComplete || !lens) return;
  event.preventDefault();
  if (closing) return;
  closing=true;
  clearInterval(timer); clearTimeout(saveBounds);
  const bounds = win && !win.isDestroyed() ? win.getBounds() : undefined;
  void lens.close(bounds).then(() => { shutdownComplete = true; app.quit(); }, error => { diagnostics?.record('shutdown_failed', error); app.exit(1); });
});
