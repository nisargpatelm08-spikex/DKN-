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

  // The board graph's working temp file: while the story is still being
  // written, scene positions + wires live here. On a real save the data is
  // committed into the .dknproj file and the temp copy is cleared.
  ipcMain.handle('dkn:boardGraphSave', async (_event, data) => {
    const filePath = join(app.getPath('userData'), 'board-graph.tmp.json')
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { ok: true }
  })

  ipcMain.handle('dkn:boardGraphLoad', async () => {
    const filePath = join(app.getPath('userData'), 'board-graph.tmp.json')
    try {
      const text = await readFile(filePath, 'utf-8')
      return { ok: true, data: JSON.parse(text) }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('dkn:boardGraphClear', async () => {
    const filePath = join(app.getPath('userData'), 'board-graph.tmp.json')
    try {
      await rm(filePath, { force: true })
    } catch {
      /* ignore cleanup errors */
    }
    return { ok: true }
  })

  // Free web translation (used by the in-app Translate tool). Routed through
  // the main process because the renderer's CSP only allows same-origin loads.
  // Primary provider: Google's unofficial gtx endpoint. When it is
  // rate-limiting (429) or failing (5xx/network), we fall back to MyMemory's
  // free API so translating keeps working even while Google is busy.
  ipcMain.handle('dkn:translate', async (_event, payload) => {
    const { q, from = 'auto', to = 'en' } = payload || {}
    if (typeof q !== 'string' || !q.trim()) throw new Error('Nothing to translate')
    try {
      return await googleTranslate(q, from, to)
    } catch (err) {
      const blocked =
        err.status === 429 || (err.status >= 500 && err.status <= 599) || !!err.network
      if (!blocked) throw err
      console.log('[dkn:translate] Google busy, using MyMemory backup…')
      try {
        return await myMemoryTranslate(q, from, to)
      } catch {
        throw new Error(
          'Both translation services are busy right now. Please wait about a minute and try again.'
        )
      }
    }
  })

  const fetchTranslated = async (url) => {
    let res
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    } catch (err) {
      err.network = true
      throw err
    }
    if (!res.ok) {
      const err = new Error('Translation service error (' + res.status + ').')
      err.status = res.status
      throw err
    }
    return res
  }

  async function googleTranslate(q, from, to) {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
      encodeURIComponent(from) +
      '&tl=' +
      encodeURIComponent(to) +
      '&dt=t&q=' +
      encodeURIComponent(q)
    const res = await fetchTranslated(url)
    let data
    try {
      data = await res.json()
    } catch {
      const err = new Error('The translation service returned an unreadable reply.')
      err.status = 502
      throw err
    }
    const text = ((data && data[0]) || []).map((seg) => (seg && seg[0]) || '').join('')
    return {
      text,
      detected: data && data[2] ? data[2] : null,
      detectedScript: data && data[8] && data[8][3] ? data[8][3][0] : null,
      provider: 'google'
    }
  }

  function guessSourceLang(q) {
    // MyMemory needs a concrete source language; detect script locally.
    return /[\u0900-\u097F]/.test(q) ? 'hi' : 'en'
  }

  // MyMemory's free tier caps each request to ~500 characters, so long prose
  // is split into sentence-sized pieces and stitched back together.
  function splitForMyMemory(text) {
    if (text.length <= 450) return [text]
    const out = []
    let cur = ''
    for (const part of text.split(/(?<=[.!?\u0964\u0965])\s+|\n+/)) {
      if (!part) continue
      if (cur && (cur + ' ' + part).length > 450) {
        out.push(cur.trim())
        cur = ''
      }
      let rest = part
      while (rest.length > 450) {
        out.push(rest.slice(0, 450))
        rest = rest.slice(450)
      }
      cur = cur ? cur + ' ' + rest : rest
    }
    if (cur.trim()) out.push(cur.trim())
    return out
  }

  async function myMemoryTranslate(q, from, to) {
    const src = from && from !== 'auto' ? from : guessSourceLang(q)
    const pieces = splitForMyMemory(q)
    const texts = []
    for (const piece of pieces) {
      const url =
        'https://api.mymemory.translated.net/get?q=' +
        encodeURIComponent(piece) +
        '&langpair=' +
        encodeURIComponent(src) +
        '|' +
        encodeURIComponent(to)
      const res = await fetchTranslated(url)
      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('The backup translation service returned an unreadable reply.')
      }
      if (data && data.responseStatus && data.responseStatus !== 200) {
        throw new Error('Backup translation service error (' + data.responseStatus + ').')
      }
      const pieceText = data && data.responseData && data.responseData.translatedText
      if (typeof pieceText !== 'string' || !pieceText.trim()) {
        throw new Error('The backup translation service returned nothing useful.')
      }
      texts.push(pieceText)
      if (pieces.length > 1) await new Promise((r) => setTimeout(r, 250))
    }
    return {
      text: texts.join(' '),
      detected: src === 'auto' ? null : src,
      detectedScript: null,
      provider: 'mymemory'
    }
  }

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
