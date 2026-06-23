import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCodex, runCodex, getLatestUsage } from './codex'
import type { RunRequest, CodexStreamEvent } from '../src/shared/types'

// vite-plugin-electron(CJS) 환경에선 __dirname 사용 가능. ESM 폴백도 둠.
const DIRNAME =
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))

// vite-plugin-electron 표준 환경변수
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = join(DIRNAME, '..', 'dist')

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    title: '작업실',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(DIRNAME, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(RENDERER_DIST, 'index.html'))
  }
}

app.whenReady().then(() => {
  // 폴더 선택
  ipcMain.handle('dialog:selectFolder', async () => {
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '작업 폴더 선택',
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // codex 설치/로그인 점검
  ipcMain.handle('codex:check', async () => checkCodex())

  // 마지막으로 알려진 사용량/한도(시작 시 표시)
  ipcMain.handle('codex:latestUsage', async () => getLatestUsage())

  // codex 실행(스트리밍은 'codex:event'로 push)
  ipcMain.handle('codex:run', async (e, req: RunRequest, runId: string) => {
    const send = (ev: Omit<CodexStreamEvent, 'runId'>) =>
      e.sender.send('codex:event', { runId, ...ev } satisfies CodexStreamEvent)

    return runCodex(req, {
      onThreadId: (threadId) => send({ kind: 'thread', threadId }),
      onAgentMessage: (text) => send({ kind: 'message', text }),
      onProgress: (text, rawType) => send({ kind: 'progress', text, rawType }),
      onUsage: (usage) => send({ kind: 'usage', usage }),
      onStderr: (line) => send({ kind: 'stderr', text: line }),
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
