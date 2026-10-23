import { contextBridge, ipcRenderer } from 'electron';
import type { LensAPI } from '../shared';
const api: LensAPI = {
  recover: action => ipcRenderer.invoke('lens:recover', action),
  snapshot: () => ipcRenderer.invoke('lens:snapshot'),
  preferences: value => ipcRenderer.invoke('lens:preferences', value),
  select: id => ipcRenderer.invoke('lens:select', id),
  clear: () => ipcRenderer.invoke('lens:clear'),
  rescan: () => ipcRenderer.invoke('lens:rescan'),
};
contextBridge.exposeInMainWorld('lens', api);
