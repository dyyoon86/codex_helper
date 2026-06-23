import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RunRequest, RunResult, CodexStatus, UsageInfo } from '../src/shared/types'

/**
 * codex 실행 파일 경로 해석.
 * 1) 환경변수 CODEX_BIN
 * 2) PATH의 'codex' (전역설치 노선의 기본)
 * 3) 알려진 위치 폴백(개발 머신 등)
 */
export function resolveCodexBin(): string {
  if (process.env.CODEX_BIN && existsSync(process.env.CODEX_BIN)) return process.env.CODEX_BIN
  const candidates = [
    join(homedir(), '.hermes', 'node', 'bin', 'codex'),
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return 'codex' // PATH에 의존
}

/** auth.json 경로(로그인 여부 판정용). 윈도우는 %USERPROFILE%\.codex\auth.json */
export function authPath(): string {
  return join(homedir(), '.codex', 'auth.json')
}

/** codex 설치/로그인 상태 점검. */
export function checkCodex(): Promise<CodexStatus> {
  const bin = resolveCodexBin()
  return new Promise((resolve) => {
    const child = spawn(bin, ['--version'], {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.on('error', () =>
      resolve({ installed: false, loggedIn: existsSync(authPath()), codexPath: bin }),
    )
    child.on('close', (code) => {
      const installed = code === 0
      resolve({
        installed,
        loggedIn: existsSync(authPath()),
        version: installed ? out.trim() : undefined,
        codexPath: bin,
      })
    })
  })
}

const SESSIONS_DIR = join(homedir(), '.codex', 'sessions')

/** ~/.codex/sessions 트리를 훑어 rollout-*.jsonl 파일을 mtime 내림차순으로 수집. */
function listRolloutFiles(filter?: (name: string) => boolean): string[] {
  if (!existsSync(SESSIONS_DIR)) return []
  const out: string[] = []
  const stack = [SESSIONS_DIR]
  while (stack.length) {
    const dir = stack.pop()!
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (
        e.isFile() &&
        e.name.startsWith('rollout-') &&
        e.name.endsWith('.jsonl') &&
        (!filter || filter(e.name))
      )
        out.push(p)
    }
  }
  return out.sort((a, b) => safeMtime(b) - safeMtime(a))
}

function safeMtime(p: string): number {
  try {
    return statSync(p).mtimeMs
  } catch {
    return 0
  }
}

/** rollout jsonl에서 마지막 token_count 이벤트(=최신 사용량/한도)를 파싱. */
function parseUsageFromRollout(file: string): UsageInfo | null {
  let content: string
  try {
    content = readFileSync(file, 'utf-8')
  } catch {
    return null
  }
  let info: UsageInfo | null = null
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || !t.includes('token_count')) continue
    let o: any
    try {
      o = JSON.parse(t)
    } catch {
      continue
    }
    const payload = o?.payload
    if (payload?.type !== 'token_count') continue
    const rl = payload.rate_limits
    const total = payload.info?.total_token_usage?.total_tokens
    const ctx = payload.info?.model_context_window
    info = {
      planType: rl?.plan_type ?? undefined,
      totalTokens: typeof total === 'number' ? total : undefined,
      contextWindow: typeof ctx === 'number' ? ctx : undefined,
      primary: rl?.primary
        ? {
            usedPercent: rl.primary.used_percent,
            windowMinutes: rl.primary.window_minutes,
            resetsAt: rl.primary.resets_at,
          }
        : undefined,
      secondary: rl?.secondary
        ? {
            usedPercent: rl.secondary.used_percent,
            windowMinutes: rl.secondary.window_minutes,
            resetsAt: rl.secondary.resets_at,
          }
        : undefined,
    }
  }
  return info
}

/** 특정 세션(thread_id)의 최신 사용량/한도. */
export function getSessionUsage(threadId: string): UsageInfo | null {
  const files = listRolloutFiles((name) => name.includes(threadId))
  if (!files.length) return null
  return parseUsageFromRollout(files[0])
}

/** 가장 최근 세션의 사용량/한도(시작 시 표시용). */
export function getLatestUsage(): UsageInfo | null {
  const files = listRolloutFiles()
  for (const f of files) {
    const u = parseUsageFromRollout(f)
    if (u && (u.primary || u.secondary)) return u
  }
  return null
}

export interface RunHandlers {
  onThreadId?: (id: string) => void
  onAgentMessage?: (text: string) => void
  onProgress?: (text: string, rawType: string) => void
  onUsage?: (usage: Record<string, number>) => void
  onStderr?: (line: string) => void
}

/**
 * codex exec --json 실행 + JSONL 파싱.
 * 스파이크 실측 기준(codex-cli 0.141.0):
 *  - 첫 턴:   codex exec --json --skip-git-repo-check -s <sandbox> "<prompt>"
 *  - 이어가기: codex exec resume <id> --json --skip-git-repo-check "<prompt>"
 *  - stdin은 닫아야 함(여기선 stdio[0]='ignore'로 처리, </dev/null과 동일)
 */
export function runCodex(req: RunRequest, h: RunHandlers): Promise<RunResult> {
  const bin = resolveCodexBin()
  const sandbox = req.sandbox ?? 'read-only'
  // 프롬프트는 인자 대신 stdin으로 전달(셸 따옴표/줄바꿈/특수문자 안전).
  // resume은 -s 를 안 받으므로 -c sandbox_mode 로 모드 유지(따옴표 없이 = 셸 안전).
  const args = req.sessionId
    ? ['exec', 'resume', req.sessionId, '--json', '--skip-git-repo-check', '-c', `sandbox_mode=${sandbox}`]
    : ['exec', '--json', '--skip-git-repo-check', '-s', sandbox]

  return new Promise((resolve) => {
    let threadId: string | undefined
    let finalMessage: string | undefined
    let stdoutBuf = ''
    let stderrBuf = ''

    const child = spawn(bin, args, {
      cwd: req.cwd,
      // 윈도우는 codex가 codex.cmd라 shell 없이는 ENOENT → shell 사용
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    // 프롬프트 입력 후 stdin 종료
    child.stdin?.write(req.prompt)
    child.stdin?.end()

    const handleLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let ev: any
      try {
        ev = JSON.parse(trimmed)
      } catch {
        return // JSON 아니면 무시(방어적)
      }
      switch (ev.type) {
        case 'thread.started':
          threadId = ev.thread_id
          if (threadId) h.onThreadId?.(threadId)
          break
        case 'item.completed':
          if (ev.item?.type === 'agent_message' && typeof ev.item.text === 'string') {
            finalMessage = ev.item.text
            h.onAgentMessage?.(ev.item.text)
          } else if (ev.item?.type) {
            h.onProgress?.(describeItem(ev.item), ev.item.type)
          }
          break
        case 'turn.completed':
          if (ev.usage) h.onUsage?.(ev.usage)
          break
        case 'turn.started':
          break
        default:
          // 알 수 없는 type은 진행표시로만(버전업 대비)
          if (ev.type) h.onProgress?.(String(ev.type), String(ev.type))
      }
    }

    child.stdout.on('data', (d) => {
      stdoutBuf += d.toString()
      let idx
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx)
        stdoutBuf = stdoutBuf.slice(idx + 1)
        handleLine(line)
      }
    })

    child.stderr.on('data', (d) => {
      const s = d.toString()
      stderrBuf += s
      for (const line of s.split('\n')) if (line.trim()) h.onStderr?.(line.trim())
    })

    child.on('error', (err) => {
      resolve({ code: -1, error: `codex 실행 실패: ${err.message}` })
    })

    child.on('close', (code) => {
      if (stdoutBuf.trim()) handleLine(stdoutBuf)
      const usage = threadId ? getSessionUsage(threadId) ?? undefined : undefined
      resolve({
        code: code ?? -1,
        threadId,
        finalMessage,
        usage,
        error: code === 0 ? undefined : stderrBuf.trim() || `codex 종료 코드 ${code}`,
      })
    })
  })
}

/** agent_message 외 item을 사람이 읽을 진행표시 문구로. */
function describeItem(item: any): string {
  switch (item.type) {
    case 'command_execution':
      return `명령 실행: ${item.command ?? ''}`.trim()
    case 'file_change':
      return '파일 변경'
    case 'reasoning':
      return '생각 중…'
    case 'web_search':
      return '웹 검색 중…'
    default:
      return item.type
  }
}
