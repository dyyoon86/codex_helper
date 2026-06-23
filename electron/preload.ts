import { contextBridge, ipcRenderer } from 'electron'
import type {
  RunRequest,
  RunResult,
  CodexStatus,
  CodexStreamEvent,
  UsageInfo,
  SystemStatus,
  SetupResult,
  SetupEvent,
  ApprovalRequest,
} from '../src/shared/types'

// 렌더러에 안전한 API만 노출(Node 직접 접근 차단).
contextBridge.exposeInMainWorld('codex', {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),

  checkCodex: (): Promise<CodexStatus> => ipcRenderer.invoke('codex:check'),

  getLatestUsage: (): Promise<UsageInfo | null> => ipcRenderer.invoke('codex:latestUsage'),

  checkSystem: (): Promise<SystemStatus> => ipcRenderer.invoke('system:check'),
  installDeps: (): Promise<SetupResult> => ipcRenderer.invoke('system:install'),
  login: (): Promise<SetupResult> => ipcRenderer.invoke('system:login'),
  onSetup: (cb: (e: SetupEvent) => void): (() => void) => {
    const listener = (_e: unknown, data: SetupEvent) => cb(data)
    ipcRenderer.on('setup:event', listener)
    return () => ipcRenderer.removeListener('setup:event', listener)
  },

  runCodex: (req: RunRequest, runId: string): Promise<RunResult> =>
    ipcRenderer.invoke('codex:run', req, runId),

  onStream: (cb: (e: CodexStreamEvent) => void): (() => void) => {
    const listener = (_e: unknown, data: CodexStreamEvent) => cb(data)
    ipcRenderer.on('codex:event', listener)
    return () => ipcRenderer.removeListener('codex:event', listener)
  },

  onApproval: (cb: (req: ApprovalRequest) => void): (() => void) => {
    const listener = (_e: unknown, data: ApprovalRequest) => cb(data)
    ipcRenderer.on('approval:request', listener)
    return () => ipcRenderer.removeListener('approval:request', listener)
  },
  respondApproval: (requestId: number | string, decision: 'accept' | 'decline'): void => {
    ipcRenderer.invoke('approval:respond', requestId, decision)
  },
})
