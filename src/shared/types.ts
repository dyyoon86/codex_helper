// 메인 ↔ 렌더러 공용 타입

export type Sandbox = 'read-only' | 'workspace-write'

export interface RunRequest {
  prompt: string
  cwd: string
  /** 있으면 해당 세션을 resume(멀티턴), 없으면 새 세션 */
  sessionId?: string
  /** 새 세션 첫 턴의 샌드박스. 기본 read-only(계획만). */
  sandbox?: Sandbox
  /** 사용할 모델. 비우면 codex 기본(gpt-5.5). */
  model?: string
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
  usage?: UsageInfo
  /** 원본 이벤트 type(디버그/고급 로그용) */
  rawType?: string
}

export interface CodexStatus {
  installed: boolean
  loggedIn: boolean
  version?: string
  codexPath?: string
}

export interface ToolStatus {
  ok: boolean
  version?: string
}

/** 첫 실행 점검 결과: AI 실행 준비 프로그램(node)·엔진(codex)·로그인 */
export interface SystemStatus {
  node: ToolStatus
  codex: ToolStatus
  loggedIn: boolean
  /** 모두 준비됐는지 */
  ready: boolean
  platform: string
}

/** 설치/로그인 진행 상황(셋업 마법사로 스트리밍) */
export interface SetupEvent {
  /** 어떤 단계 */
  step: 'node' | 'codex' | 'login' | 'done'
  /** 사람이 읽을 진행 문구 */
  text: string
  level?: 'info' | 'ok' | 'error'
}

export interface SetupResult {
  ok: boolean
  /** 친절한 한국어 에러 + 후속 안내 */
  error?: string
  status: SystemStatus
}

export interface ApprovalRequest {
  requestId: number | string
  kind: 'command' | 'file' | 'permission' | 'input'
  title: string
  detail: string
}

export interface CodexAPI {
  selectFolder: () => Promise<string | null>
  checkCodex: () => Promise<CodexStatus>
  /** 첫 실행 점검: node/codex/로그인 */
  checkSystem: () => Promise<SystemStatus>
  /** 부족한 구성요소 자동 준비(node·codex 설치). 진행은 onSetup으로 스트리밍 */
  installDeps: () => Promise<SetupResult>
  /** 공식 OpenAI 로그인(브라우저 OAuth) */
  login: () => Promise<SetupResult>
  onSetup: (cb: (e: SetupEvent) => void) => () => void
  runCodex: (req: RunRequest, runId: string) => Promise<RunResult>
  /** 시작 시 마지막으로 알려진 사용량/한도(가장 최근 세션 기준). 없으면 null */
  getLatestUsage: () => Promise<UsageInfo | null>
  onStream: (cb: (e: CodexStreamEvent) => void) => () => void
  /** AI가 위험 작업 전 승인 요청 시 호출 */
  onApproval: (cb: (req: ApprovalRequest) => void) => () => void
  /** 승인 모달의 사용자 결정 전달 */
  respondApproval: (requestId: number | string, decision: 'accept' | 'decline') => void
}

declare global {
  interface Window {
    codex: CodexAPI
  }
}
