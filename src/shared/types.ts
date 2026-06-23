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

export interface RateWindow {
  /** 사용률 0~100 */
  usedPercent: number
  /** 창 길이(분): 300=5시간, 10080=주간 */
  windowMinutes: number
  /** 리셋 시각(unix epoch seconds) */
  resetsAt: number
}

export interface UsageInfo {
  planType?: string
  /** 단기 한도(보통 5시간) */
  primary?: RateWindow
  /** 장기 한도(보통 주간) */
  secondary?: RateWindow
  /** 세션 누적 총 토큰 */
  totalTokens?: number
  contextWindow?: number
}

export interface RunResult {
  code: number
  threadId?: string
  finalMessage?: string
  error?: string
  usage?: UsageInfo
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
  /** 시작 시 마지막으로 알려진 사용량/한도(가장 최근 세션 기준). 없으면 null */
  getLatestUsage: () => Promise<UsageInfo | null>
  onStream: (cb: (e: CodexStreamEvent) => void) => () => void
}

declare global {
  interface Window {
    codex: CodexAPI
  }
}
