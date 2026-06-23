import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RunRequest, RunResult, CodexStatus } from '../src/shared/types'

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
    const child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
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
  const args = req.sessionId
    ? ['exec', 'resume', req.sessionId, '--json', '--skip-git-repo-check', req.prompt]
    : ['exec', '--json', '--skip-git-repo-check', '-s', req.sandbox ?? 'read-only', req.prompt]

  return new Promise((resolve) => {
    let threadId: string | undefined
    let finalMessage: string | undefined
    let stdoutBuf = ''
    let stderrBuf = ''

    const child = spawn(bin, args, {
      cwd: req.cwd,
      stdio: ['ignore', 'pipe', 'pipe'], // stdin 닫음
    })

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
      resolve({
        code: code ?? -1,
        threadId,
        finalMessage,
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
