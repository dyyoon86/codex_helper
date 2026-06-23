// 메인 ↔ 렌더러 공용 타입

export type Sandbox = 'read-only' | 'workspace-write'

export interface RunRequest {
  prompt: string
  cwd: string
  /** 있으면 해당 세션을 resume(멀티턴), 없으면 새 세션 */
  sessionId?: string
  /** 새 세션 첫 턴의 샌드박스. 기본 read-only(계획만). */
  sandbox?: Sandbox
}

export interface RunResult {
  code: number
  threadId?: string
  finalMessage?: string
  error?: string
}

/** codex exec --json 한 줄(이벤트)을 렌더러로 중계할 때의 봉투. runId로 어떤 실행인지 구분. */
export interface CodexStreamEvent {
  runId: string
  kind: 'thread' | 'message' | 'progress' | 'usage' | 'stderr' | 'raw'
  /** kind=thread: thread_id / message: 텍스트 / progress: 설명 / usage: JSON문자열 / stderr: 줄 */
  text?: string
  threadId?: string
  usage?: Record<string, number>
  /** 원본 이벤트 type(디버그/고급 로그용) */
  rawType?: string
}

export interface CodexStatus {
  installed: boolean
  loggedIn: boolean
  version?: string
  codexPath?: string
}

export interface CodexAPI {
  selectFolder: () => Promise<string | null>
  checkCodex: () => Promise<CodexStatus>
  runCodex: (req: RunRequest, runId: string) => Promise<RunResult>
  onStream: (cb: (e: CodexStreamEvent) => void) => () => void
}

declare global {
  interface Window {
    codex: CodexAPI
  }
}
