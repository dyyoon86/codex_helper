// 헤드리스 스모크 테스트: electron/codex.ts 의 러너 로직을 그대로 미러링해
// 실제 codex로 1턴 + resume(멀티턴)이 도는지 GUI 없이 검증한다.
//   node scripts/smoke-codex.mjs
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

function resolveCodexBin() {
  if (process.env.CODEX_BIN && existsSync(process.env.CODEX_BIN)) return process.env.CODEX_BIN
  const candidates = [
    join(homedir(), '.hermes', 'node', 'bin', 'codex'),
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return 'codex'
}

function runCodex({ prompt, cwd, sessionId, sandbox = 'read-only' }) {
  const bin = resolveCodexBin()
  const args = sessionId
    ? ['exec', 'resume', sessionId, '--json', '--skip-git-repo-check']
    : ['exec', '--json', '--skip-git-repo-check', '-s', sandbox]
  return new Promise((resolve) => {
    let threadId, finalMessage, buf = '', err = ''
    const child = spawn(bin, args, { cwd, shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.write(prompt); child.stdin.end()
    const line = (l) => {
      const t = l.trim()
      if (!t) return
      let ev
      try { ev = JSON.parse(t) } catch { return }
      if (ev.type === 'thread.started') threadId = ev.thread_id
      else if (ev.type === 'item.completed' && ev.item?.type === 'agent_message')
        finalMessage = ev.item.text
    }
    child.stdout.on('data', (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1) }
    })
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) => resolve({ code: -1, error: e.message }))
    child.on('close', (code) => {
      if (buf.trim()) line(buf)
      resolve({ code, threadId, finalMessage, error: code === 0 ? undefined : err.trim() })
    })
  })
}

async function main() {
  console.log('codex bin:', resolveCodexBin())
  const cwd = mkdtempSync(join(tmpdir(), 'codexhelper-smoke-'))

  console.log('\n[1] 새 세션 (read-only)…')
  const r1 = await runCodex({ prompt: 'Reply with exactly one word: hello', cwd })
  console.log('  threadId:', r1.threadId)
  console.log('  message :', JSON.stringify(r1.finalMessage))
  console.log('  exit    :', r1.code, r1.error ? `(err: ${r1.error})` : '')
  if (r1.code !== 0 || !r1.finalMessage || !r1.threadId) {
    console.error('  ❌ 1턴 실패'); process.exit(1)
  }

  console.log('\n[2] resume (멀티턴 문맥 유지)…')
  const r2 = await runCodex({
    prompt: 'What word did you just say? Reply with only that word.',
    cwd,
    sessionId: r1.threadId,
  })
  console.log('  message :', JSON.stringify(r2.finalMessage))
  console.log('  exit    :', r2.code, r2.error ? `(err: ${r2.error})` : '')
  const kept = (r2.finalMessage || '').toLowerCase().includes('hello')
  if (r2.code !== 0 || !kept) {
    console.error('  ❌ resume 문맥 유지 실패'); process.exit(1)
  }

  console.log('\n✅ 스모크 통과: 새 세션 + resume 멀티턴 모두 동작')
}

main()
