/* preload.js - safe bridge between renderer and main process */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  probe   : ()              => ipcRenderer.invoke('probe'),
  examples: ()              => ipcRenderer.invoke('examples'),
  run     : (project, mode) => ipcRenderer.invoke('run', { project, mode }),
  saveText: (suggested, content) => ipcRenderer.invoke('saveText', { suggested, content }),
});
