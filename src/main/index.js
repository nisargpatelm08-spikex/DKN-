import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile, rm } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ---- file dialog + read/write IPC (Phase 4) ----

  ipcMain.handle('dkn:save', async (_event, { data, filePath }) => {
    let target = filePath
    if (!target) {
      const result = await dialog.showSaveDialog({
        title: 'Save story',
        defaultPath: (data?.title || 'story').replace(/[\\/:*?"<>|]/g, '-') + '.dknproj',
        filters: [{ name: 'DKN Story', extensions: ['dknproj'] }]
      })
      if (result.canceled || !result.filePath) return { canceled: true }
      target = result.filePath
    }
    await writeFile(target, JSON.stringify(data, null, 2), 'utf-8')
    return { canceled: false, path: target }
  })

  ipcMain.handle('dkn:open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open story',
      properties: ['openFile'],
      filters: [{ name: 'DKN Story', extensions: ['dknproj'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const filePath = result.filePaths[0]
    const text = await readFile(filePath, 'utf-8')
    return { canceled: false, path: filePath, data: JSON.parse(text) }
  })

  ipcMain.handle('dkn:autosave', async (_event, data) => {
    const filePath = join(app.getPath('userData'), 'autosave.dknproj')
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { ok: true }
  })

  ipcMain.handle('dkn:loadAutosave', async () => {
    const filePath = join(app.getPath('userData'), 'autosave.dknproj')
    try {
      const text = await readFile(filePath, 'utf-8')
      return { ok: true, data: JSON.parse(text) }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('dkn:exportPdf', async (_event, { html, title }) => {
    const result = await dialog.showSaveDialog({
      title: 'Export as PDF',
      defaultPath: (title || 'story').replace(/[\\/:*?"<>|]/g, '-') + '.pdf',
      filters: [{ name: 'PDF document', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    const tmpHtml = join(app.getPath('temp'), 'dkn-export-' + Date.now() + '.html')
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: false, backgroundThrottling: false }
    })
    try {
      await writeFile(tmpHtml, html, 'utf-8')
      await win.loadFile(tmpHtml)
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          marginType: 'custom',
          top: 0.6,
          bottom: 0.6,
          left: 0.6,
          right: 0.6
        }
      })
      await writeFile(result.filePath, pdf)
      return { canceled: false, path: result.filePath }
    } finally {
      win.destroy()
      try {
        await rm(tmpHtml, { force: true })
      } catch {
        /* ignore cleanup errors */
      }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
