import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  saveProject: (data, filePath) => ipcRenderer.invoke('dkn:save', { data, filePath }),
  openProject: () => ipcRenderer.invoke('dkn:open'),
  autosave: (data) => ipcRenderer.invoke('dkn:autosave', data),
  loadAutosave: () => ipcRenderer.invoke('dkn:loadAutosave'),
  translate: (payload) => ipcRenderer.invoke('dkn:translate', payload),
  exportPdf: (html, title) => ipcRenderer.invoke('dkn:exportPdf', { html, title })
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
