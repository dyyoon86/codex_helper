import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveCodexBin, authPath } from './codex'
import type { SystemStatus, ToolStatus, SetupEvent, SetupResult } from '../src/shared/types'

/** 명령 실행 → {code, stdout, stderr}. shell=true(윈도우 npm/winget 호출 위함). */
function run(
  cmd: string,
  args: string[],
  onLine?: (line: string) => void,
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    let out = '',
      err = ''
    const child = spawn(cmd, args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (d) => {
      const s = d.toString()
      out += s
      if (onLine) for (const l of s.split('\n')) if (l.trim()) onLine(l.trim())
    })
    child.stderr.on('data', (d) => {
      const s = d.toString()
      err += s
      if (onLine) for (const l of s.split('\n')) if (l.trim()) onLine(l.trim())
    })
    child.on('error', () => resolve({ code: -1, out, err }))
    child.on('close', (code) => resolve({ code: code ?? -1, out, err }))
  })
}

function version(cmd: string, args = ['--version']): Promise<ToolStatus> {
  return run(cmd, args).then((r) => ({
    ok: r.code === 0,
    version: r.code === 0 ? r.out.trim().split('\n')[0] : undefined,
  }))
}

export async function checkSystem(): Promise<SystemStatus> {
  const [node, codex] = await Promise.all([version('node'), version(resolveCodexBin())])
  const loggedIn = existsSync(authPath())
  return {
    node,
    codex,
    loggedIn,
    ready: node.ok && codex.ok && loggedIn,
    platform: process.platform,
  }
}

/** npm 전역 bin 경로(codex 설치 후 PATH 미반영 케이스 폴백) */
function npmGlobalCodex(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [join(process.env.APPDATA || '', 'npm', 'codex.cmd')]
      : [join(homedir(), '.npm-global', 'bin', 'codex'), '/usr/local/bin/codex']
  for (const c of candidates) if (c && existsSync(c)) return c
  return null
}

/** 사람이 읽을 한국어 에러로 변환 */
function friendlyError(raw: string): string {
  const s = raw.toLowerCase()
  if (s.includes('eacces') || s.includes('permission'))
    return '설치 권한 때문에 자동 설치가 막혔어요. 회사/학교 PC라면 권한이 제한됐을 수 있어요. [관리자 권한으로 실행]하거나 수동 설치 안내를 따라주세요.'
  if (s.includes('enoent') || s.includes('not found') || s.includes('not recognized'))
    return '설치 위치를 찾지 못했어요. 컴퓨터를 한 번 재시작한 뒤 다시 시도해 주세요.'
  if (s.includes('network') || s.includes('etimedout') || s.includes('getaddrinfo'))
    return '인터넷 연결 문제로 다운로드가 막혔어요. 연결을 확인하고 다시 시도해 주세요.'
  if (s.includes('winget'))
    return 'Windows 설치 도구(winget)를 사용할 수 없어요. 공식 설치 파일 안내를 따라주세요.'
  return '준비 중 문제가 생겼어요. 다시 시도하거나 수동 설치 안내를 확인해 주세요.'
}

/**
 * 부족한 구성요소 자동 준비.
 *  - Node 없음 → winget(OpenJS.NodeJS.LTS) / 그 외 OS는 안내
 *  - Codex 없음 → npm i -g @openai/codex
 * 실제 설치는 윈도우 타깃 기준. 진행은 emit으로 스트리밍.
 */
export async function installDeps(emit: (e: SetupEvent) => void): Promise<SetupResult> {
  const isWin = process.platform === 'win32'

  // 1) Node
  let node = await version('node')
  if (!node.ok) {
    emit({ step: 'node', text: 'AI 실행 준비 프로그램(Node)을 설치하고 있어요…', level: 'info' })
    if (isWin) {
      const r = await run(
        'winget',
        ['install', '-e', '--id', 'OpenJS.NodeJS.LTS', '--accept-source-agreements', '--accept-package-agreements'],
        (l) => emit({ step: 'node', text: l, level: 'info' }),
      )
      if (r.code !== 0) {
        return fail('node', friendlyError(r.err || r.out), emit)
      }
    } else {
      return fail(
        'node',
        'Node가 없어요. 이 OS에서는 자동 설치를 지원하지 않아요 — Node.js 공식 사이트에서 설치 후 다시 시도해 주세요.',
        emit,
      )
    }
    node = await version('node')
    if (!node.ok)
      return fail('node', '설치는 됐지만 아직 인식되지 않아요. 컴퓨터를 재시작한 뒤 다시 열어주세요.', emit)
    emit({ step: 'node', text: 'AI 실행 준비 프로그램 준비 완료 ✓', level: 'ok' })
  }

  // 2) Codex
  let codex = await version(resolveCodexBin())
  if (!codex.ok) {
    emit({ step: 'codex', text: 'AI 실행 엔진을 설치하고 있어요… (1~2분 걸릴 수 있어요)', level: 'info' })
    const r = await run('npm', ['install', '-g', '@openai/codex'], (l) =>
      emit({ step: 'codex', text: l, level: 'info' }),
    )
    if (r.code !== 0) return fail('codex', friendlyError(r.err || r.out), emit)
    codex = await version(resolveCodexBin())
    if (!codex.ok) {
      const fallback = npmGlobalCodex()
      if (!fallback)
        return fail('codex', '설치는 됐지만 인식되지 않아요. 컴퓨터를 재시작한 뒤 다시 열어주세요.', emit)
    }
    emit({ step: 'codex', text: 'AI 실행 엔진 준비 완료 ✓', level: 'ok' })
  }

  const status = await checkSystem()
  emit({ step: 'done', text: '준비 완료!', level: 'ok' })
  return { ok: status.node.ok && status.codex.ok, status }
}

async function fail(
  step: SetupEvent['step'],
  error: string,
  emit: (e: SetupEvent) => void,
): Promise<SetupResult> {
  emit({ step, text: error, level: 'error' })
  return { ok: false, error, status: await checkSystem() }
}

/**
 * 공식 OpenAI 로그인(브라우저 OAuth).
 * `codex login`이 브라우저를 열고 로그인 완료 시 ~/.codex/auth.json 생성 후 종료.
 * auth.json 생성 폴링 + 프로세스 종료를 함께 감지.
 */
export function login(emit: (e: SetupEvent) => void): Promise<SetupResult> {
  return new Promise((resolve) => {
    const bin = resolveCodexBin()
    emit({ step: 'login', text: '브라우저에서 OpenAI 공식 로그인 페이지를 여는 중…', level: 'info' })
    const child = spawn(bin, ['login'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let settled = false
    const finish = async (ok: boolean, error?: string) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      try {
        child.kill()
      } catch {
        /* noop */
      }
      const status = await checkSystem()
      if (ok || status.loggedIn) emit({ step: 'login', text: '로그인 완료 ✓', level: 'ok' })
      resolve({ ok: ok || status.loggedIn, error, status })
    }
    child.stdout.on('data', (d) =>
      emit({ step: 'login', text: d.toString().trim(), level: 'info' }),
    )
    child.stderr.on('data', (d) =>
      emit({ step: 'login', text: d.toString().trim(), level: 'info' }),
    )
    child.on('error', () =>
      finish(false, '로그인 도구를 실행하지 못했어요. AI 실행 엔진이 설치됐는지 확인해 주세요.'),
    )
    child.on('close', () => finish(existsSync(authPath())))
    // auth.json 생성 폴링(브라우저 로그인 완료 즉시 감지)
    const poll = setInterval(() => {
      if (existsSync(authPath())) finish(true)
    }, 1200)
  })
}
