import { app, BrowserWindow, ipcMain, session, screen, Menu } from 'electron';
import { join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Store } from './store';
import { Ingestor } from './ingestion';
import type { Preferences, Snapshot } from '../shared';

// No remote content, updater, analytics, or API client. Chromium background networking is disabled.
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
if (process.env.LENS_DATA_DIR) app.setPath('userData', resolve(process.env.LENS_DATA_DIR));
let win: BrowserWindow | null = null;
let store: Store;
let ingestor: Ingestor;
let prefs: Preferences;
let blockedRequests = 0;
let timer: NodeJS.Timeout;
let closing = false;
let saveBounds: NodeJS.Timeout;
const renderer = join(__dirname, '../renderer/index.html');
const snapshot = (): Snapshot => ({ sessions:[...ingestor.sessions.values()].sort((a,b) => b.lastActivity.localeCompare(a.lastActivity)),preferences:prefs,diagnostics:{errors:ingestor.errors.size,files:ingestor.files,lastScan:ingestor.lastScan,messages:[...new Set(ingestor.errors.values())],blockedRequests} });
const persist = () => store.set('preferences', prefs);
const scan = async () => { if (!prefs.paused) await ingestor.scan(prefs.directories); };

function createWindow() {
  const saved = store.get<Electron.Rectangle>('bounds');
  const valid = saved && screen.getAllDisplays().some(d => saved.x + saved.width > d.workArea.x && saved.x < d.workArea.x + d.workArea.width && saved.y >= d.workArea.y && saved.y < d.workArea.y + d.workArea.height - 40);
  win = new BrowserWindow({width:460,height:650,minWidth:360,minHeight:320,...(valid ? saved : {}),title:'Codex Session Lens',alwaysOnTop:prefs.alwaysOnTop,backgroundColor:'#101719',webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  const remember = () => { clearTimeout(saveBounds); saveBounds = setTimeout(() => { if (!closing && win && !win.isDestroyed()) store.set('bounds',win.getBounds()); },200); };
  win.on('move',remember); win.on('resize',remember);
  win.on('close',() => { if (!closing && win) store.set('bounds',win.getBounds()); });
  win.on('closed',() => {win = null;});
  void win.loadFile(renderer);
}

app.whenReady().then(async () => {
  store = new Store(join(app.getPath('userData'),'telemetry.sqlite'));
  const codexHome = process.env.CODEX_HOME || join(homedir(),'.codex');
  prefs = store.get<Preferences>('preferences') || {theme:'system',compact:false,alwaysOnTop:false,directories:process.env.LENS_SESSION_DIR ? [resolve(process.env.LENS_SESSION_DIR)] : [join(codexHome,'sessions'),join(codexHome,'archived_sessions')],selectedId:null,recentIds:[],paused:false};
  ingestor = new Ingestor(store);
  session.defaultSession.setPermissionRequestHandler((_wc,_perm,callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith(pathToFileURL(join(__dirname,'../renderer/')).href);
    if (!allowed) blockedRequests++;
    callback({cancel:!allowed});
  });
  const handle = (channel: string, action: (...args: any[]) => unknown) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame?.url !== pathToFileURL(renderer).href) throw new Error('Untrusted caller');
    try { return await action(...args); } catch { throw new Error('Local operation failed. Check settings and directory access.'); }
  });
  handle('lens:snapshot',snapshot);
  handle('lens:select',(id: unknown) => {
    if (typeof id !== 'string' || !ingestor.sessions.has(id)) throw new Error('Unknown session');
    prefs.selectedId=id; prefs.recentIds=[id,...prefs.recentIds.filter(x => x !== id)].slice(0,10); persist(); return snapshot();
  });
  handle('lens:preferences',async (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preferences');
    const v = value as Partial<Preferences>;
    if (v.theme !== undefined && !['system','dark','light'].includes(v.theme)) throw new Error('Invalid theme');
    for (const key of ['compact','alwaysOnTop','paused'] as const) if (v[key] !== undefined && typeof v[key] !== 'boolean') throw new Error('Invalid setting');
    if (v.directories !== undefined && (!Array.isArray(v.directories) || v.directories.length > 20 || v.directories.some(d => typeof d !== 'string' || !isAbsolute(d) || d.length > 4096))) throw new Error('Use absolute directories');
    for (const key of ['theme','compact','alwaysOnTop','paused','directories'] as const) if (v[key] !== undefined) (prefs as any)[key] = v[key];
    persist(); win?.setAlwaysOnTop(prefs.alwaysOnTop); void scan().catch(() => ingestor.errors.set('scan','Scan failed; retained prior data.')); return snapshot();
  });
  handle('lens:rescan',async () => {await scan(); return snapshot();});
  handle('lens:clear',async () => {
    prefs.paused=true; await ingestor.idle(); prefs.selectedId=null; prefs.recentIds=[];
    store.clear(prefs); ingestor.reset(); return snapshot();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Codex Session Lens',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'quit'}]},{role:'editMenu'},{role:'windowMenu'}]));
  createWindow();
  void scan().catch(() => ingestor.errors.set('scan','Scan failed; retained prior data.')); timer=setInterval(() => {void scan().catch(() => ingestor.errors.set('scan','Scan failed; retained prior data.'));},1000);
  app.on('activate',() => {if (!win) createWindow();});
});
app.on('window-all-closed',() => app.quit());
app.on('before-quit', event => {
  if (closing || !store) return;
  event.preventDefault();
  if (win && !win.isDestroyed()) store.set('bounds',win.getBounds());
  closing=true; clearInterval(timer); clearTimeout(saveBounds);
  void ingestor.idle().finally(() => { store.close(); app.quit(); });
});
