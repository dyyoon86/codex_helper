import { spawn, type ChildProcess } from 'node:child_process'
import { resolveCodexBin } from './codex'
import type { RunRequest, RunResult, UsageInfo } from '../src/shared/types'

/**
 * codex app-server(JSON-RPC over stdio) 클라이언트.
 * exec(1회성)와 달리 상시 프로세스로 띄워, 승인 요청을 주고받는 대화형 흐름을 지원한다.
 * 프로토콜: initialize → thread/start → turn/start, 서버가 보내는 승인요청에 응답.
 */

type AnyMsg = Record<string, any>
type Decision = 'accept' | 'decline'

export interface ApprovalRequest {
  /** 서버 요청 id(응답 시 사용) */
  requestId: number | string
  kind: 'command' | 'file' | 'permission' | 'input'
  title: string
  detail: string
}

export interface TurnHandlers {
  onMessageDelta: (text: string) => void
  onProgress: (text: string) => void
  onUsage: (u: UsageInfo) => void
}

let proc: ChildProcess | null = null
let initialized = false
let idc = 0
let buf = ''
const pending = new Map<number, (m: AnyMsg) => void>()

// 현재 진행 중인 한 턴의 핸들러(앱은 한 번에 한 턴만 실행)
let active: TurnHandlers | null = null
let turnResolve: ((r: RunResult) => void) | null = null
let turnThreadId = ''
let usageAcc: UsageInfo = {}
// 승인 핸들러(main이 렌더러로 브리지). 서버요청 → 사용자 결정.
let approvalHandler: ((req: ApprovalRequest) => Promise<Decision>) | null = null

// 스레드 캐시: 같은 (cwd|sandbox|approval|model)이면 재사용
let thread: { id: string; key: string } | null = null

export function setApprovalHandler(fn: (req: ApprovalRequest) => Promise<Decision>) {
  approvalHandler = fn
}

function ensureProc(): ChildProcess {
  if (proc) return proc
  const bin = resolveCodexBin()
  proc = spawn(bin, ['app-server'], {
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  proc.stdout!.on('data', onData)
  proc.stderr!.on('data', () => {}) // codex 로그 무시
  proc.on('exit', () => {
    proc = null
    initialized = false
    thread = null
  })
  return proc
}

function onData(d: Buffer) {
  buf += d.toString()
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let m: AnyMsg
    try {
      m = JSON.parse(line)
    } catch {
      continue
    }
    route(m)
  }
}

function request(method: string, params: unknown): Promise<AnyMsg> {
  const p = ensureProc()
  const id = ++idc
  p.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((res) => pending.set(id, res))
}

function respond(id: number | string, result: unknown) {
  proc?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function route(m: AnyMsg) {
  // 응답
  if (m.id !== undefined && (m.result !== undefined || m.error !== undefined) && pending.has(m.id)) {
    pending.get(m.id)!(m)
    pending.delete(m.id)
    return
  }
  // 서버 요청(승인 등)
  if (m.method && m.id !== undefined) {
    handleServerRequest(m)
    return
  }
  // 알림
  if (m.method) handleNotification(m)
}

async function handleServerRequest(m: AnyMsg) {
  const method: string = m.method
  const p = m.params ?? {}
  // 승인 계열
  let req: ApprovalRequest | null = null
  if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') {
    const cmd = Array.isArray(p.command) ? p.command.join(' ') : p.command ?? ''
    req = { requestId: m.id, kind: 'command', title: '명령 실행 승인', detail: (p.reason ? p.reason + '\n\n' : '') + (cmd || '(명령)') }
  } else if (method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval') {
    req = { requestId: m.id, kind: 'file', title: '파일 변경 승인', detail: p.reason || '파일을 수정하려고 해요.' }
  } else if (method === 'item/permissions/requestApproval') {
    req = { requestId: m.id, kind: 'permission', title: '권한 요청', detail: p.reason || '추가 권한을 요청했어요.' }
  }

  if (req && approvalHandler) {
    let decision: Decision = 'decline'
    try {
      decision = await approvalHandler(req)
    } catch {
      decision = 'decline'
    }
    // 메서드별 응답 모양
    if (method === 'item/permissions/requestApproval') {
      // 권한요청은 복잡 → 1차 구현은 거부(현 샌드박스 유지). 추후 보강.
      respond(m.id, { decision: 'decline' })
    } else if (method === 'execCommandApproval' || method === 'applyPatchApproval') {
      respond(m.id, { decision: decision === 'accept' ? 'approved' : 'denied' })
    } else {
      respond(m.id, { decision }) // command/file: "accept"|"decline"
    }
    return
  }

  // 그 외 서버요청은 안전하게 빈/거부 응답
  if (method === 'item/tool/requestUserInput') respond(m.id, { value: null })
  else respond(m.id, {})
}

function mapRateLimits(rl: AnyMsg): UsageInfo {
  const win = (w: AnyMsg | null) =>
    w ? { usedPercent: w.usedPercent, windowMinutes: w.windowDurationMins ?? 0, resetsAt: w.resetsAt ?? 0 } : undefined
  return {
    planType: rl?.planType ?? undefined,
    primary: win(rl?.primary),
    secondary: win(rl?.secondary),
  }
}

function handleNotification(m: AnyMsg) {
  const p = m.params ?? {}
  switch (m.method) {
    case 'item/agentMessage/delta':
      active?.onMessageDelta(p.delta ?? '')
      break
    case 'item/started':
      if (p.item?.type === 'commandExecution' || p.item?.itemType === 'commandExecution')
        active?.onProgress('명령 실행 중…')
      else if (p.item?.type === 'fileChange') active?.onProgress('파일 변경 중…')
      else if (p.item?.type === 'reasoning') active?.onProgress('생각 중…')
      break
    case 'thread/tokenUsage/updated': {
      const t = p.tokenUsage
      if (t) {
        usageAcc = { ...usageAcc, totalTokens: t.total?.totalTokens ?? t.total?.total_tokens, contextWindow: t.modelContextWindow ?? undefined }
        active?.onUsage(usageAcc)
      }
      break
    }
    case 'account/rateLimits/updated':
      usageAcc = { ...usageAcc, ...mapRateLimits(p.rateLimits) }
      active?.onUsage(usageAcc)
      break
    case 'error':
      active?.onProgress('오류: ' + (p.error?.message || JSON.stringify(p.error)))
      break
    case 'turn/completed': {
      const r = turnResolve
      const u = Object.keys(usageAcc).length ? usageAcc : undefined
      active = null
      turnResolve = null
      r?.({ code: 0, threadId: turnThreadId, usage: u })
      break
    }
  }
}

async function ensureInit() {
  if (initialized) return
  await request('initialize', {
    clientInfo: { name: 'codex-helper', version: '0.2.0', title: '작업실' },
    capabilities: null,
  })
  initialized = true
  // 초기 사용량 스냅샷
  try {
    const r = await request('account/rateLimits/read', undefined)
    if (r.result) {
      usageAcc = { ...usageAcc, ...mapRateLimits(r.result) }
    }
  } catch {
    /* noop */
  }
}

async function ensureThread(req: RunRequest): Promise<string> {
  const sandbox = req.sandbox ?? 'read-only'
  const approvalPolicy = sandbox === 'read-only' ? 'never' : 'on-request'
  const key = `${req.cwd}|${sandbox}|${approvalPolicy}|${req.model ?? ''}`
  if (thread && thread.key === key) return thread.id
  const r = await request('thread/start', {
    cwd: req.cwd,
    sandbox,
    approvalPolicy,
    model: req.model || undefined,
  })
  const id = r.result?.thread?.id
  if (!id) throw new Error(r.error?.message || 'thread/start 실패')
  thread = { id, key }
  return id
}

/** 최신 사용량(시작 시 표시용) */
export async function getUsage(): Promise<UsageInfo | null> {
  try {
    await ensureInit()
    return Object.keys(usageAcc).length ? usageAcc : null
  } catch {
    return null
  }
}

/** 한 번의 사용자 턴 실행. 승인은 setApprovalHandler 로 처리됨. */
export async function runTurn(req: RunRequest, h: TurnHandlers): Promise<RunResult> {
  try {
    await ensureInit()
    const threadId = await ensureThread(req)
    active = h
    turnThreadId = threadId
    return await new Promise<RunResult>((resolve) => {
      turnResolve = resolve
      request('turn/start', {
        threadId,
        input: [{ type: 'text', text: req.prompt, text_elements: [] }],
      }).then((r) => {
        if (r.error && turnResolve === resolve) {
          active = null
          turnResolve = null
          resolve({ code: -1, threadId, error: r.error?.message || '턴 시작 실패' })
        }
      })
    })
  } catch (e) {
    active = null
    turnResolve = null
    return { code: -1, error: (e as Error).message }
  }
}
