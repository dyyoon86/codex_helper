import { contextBridge, ipcRenderer } from 'electron'
import type {
  RunRequest,
  RunResult,
  CodexStatus,
  CodexStreamEvent,
  UsageInfo,
} from '../src/shared/types'

// 렌더러에 안전한 API만 노출(Node 직접 접근 차단).
contextBridge.exposeInMainWorld('codex', {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),

  checkCodex: (): Promise<CodexStatus> => ipcRenderer.invoke('codex:check'),

  getLatestUsage: (): Promise<UsageInfo | null> => ipcRenderer.invoke('codex:latestUsage'),

  runCodex: (req: RunRequest, runId: string): Promise<RunResult> =>
    ipcRenderer.invoke('codex:run', req, runId),

  onStream: (cb: (e: CodexStreamEvent) => void): (() => void) => {
    const listener = (_e: unknown, data: CodexStreamEvent) => cb(data)
    ipcRenderer.on('codex:event', listener)
    return () => ipcRenderer.removeListener('codex:event', listener)
  },
})
