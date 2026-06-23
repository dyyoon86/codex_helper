import { useEffect, useRef, useState } from 'react'
import type { CodexStatus, UsageInfo } from './shared/types'
import { ChatView, type ChatMessage } from './components/ChatView'
import { UsageBar } from './components/UsageBar'

let runCounter = 0

export function App() {
  const [status, setStatus] = useState<CodexStatus | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const sessionId = useRef<string | undefined>(undefined)

  // 시작 시 codex 상태 점검 + 마지막 사용량 표시
  useEffect(() => {
    window.codex.checkCodex().then(setStatus)
    window.codex.getLatestUsage().then(setUsage)
  }, [])

  async function pickFolder() {
    const dir = await window.codex.selectFolder()
    if (dir) {
      setCwd(dir)
      // 폴더 바꾸면 새 세션
      sessionId.current = undefined
      setMessages([])
    }
  }

  async function send() {
    const prompt = input.trim()
    if (!prompt || !cwd || running) return
    setInput('')
    setRunning(true)

    const runId = `run-${++runCounter}`
    const userMsg: ChatMessage = { id: `${runId}-u`, role: 'user', text: prompt }
    const aiMsg: ChatMessage = { id: `${runId}-a`, role: 'assistant', text: '', progress: [] }
    setMessages((m) => [...m, userMsg, aiMsg])

    const off = window.codex.onStream((e) => {
      if (e.runId !== runId) return
      setMessages((m) =>
        m.map((msg) => {
          if (msg.id !== aiMsg.id) return msg
          if (e.kind === 'message') return { ...msg, text: (msg.text || '') + (e.text || '') }
          if (e.kind === 'progress')
            return { ...msg, progress: [...(msg.progress || []), e.text || ''] }
          if (e.kind === 'usage') return { ...msg, usage: e.usage }
          return msg
        }),
      )
    })

    try {
      const res = await window.codex.runCodex(
        { prompt, cwd, sessionId: sessionId.current, sandbox: 'read-only' },
        runId,
      )
      if (res.threadId) sessionId.current = res.threadId
      if (res.usage) setUsage(res.usage)
      if (res.error && !res.finalMessage) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === aiMsg.id ? { ...msg, text: `⚠ 오류: ${res.error}`, error: true } : msg,
          ),
        )
      }
    } finally {
      off()
      setRunning(false)
    }
  }

  const ready = status?.installed && status?.loggedIn && cwd

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">작업실 <span className="ver">M1</span></div>
        <div className="status">
          <Chip ok={!!status?.installed} label={status?.installed ? `엔진 ${status.version ?? ''}` : '엔진 없음'} />
          <Chip ok={!!status?.loggedIn} label={status?.loggedIn ? '로그인됨' : '로그인 필요'} />
          <button className="folder-btn" onClick={pickFolder}>
            {cwd ? `📁 ${shorten(cwd)}` : '📁 작업 폴더 선택'}
          </button>
        </div>
      </header>

      <UsageBar usage={usage} />

      <ChatView messages={messages} empty={!cwd} />

      <footer className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={
            !cwd ? '먼저 작업 폴더를 선택하세요' : '무엇을 도와드릴까요? (예: 이 폴더 설명해줘)'
          }
          disabled={!ready || running}
          rows={2}
        />
        <button className="send" onClick={send} disabled={!ready || running || !input.trim()}>
          {running ? '…' : '보내기'}
        </button>
      </footer>
      {cwd && (
        <div className="safenote">🔒 안전모드(계획만): 파일을 수정하지 않고 설명·계획만 합니다.</div>
      )}
    </div>
  )
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`chip ${ok ? 'ok' : 'no'}`}>{ok ? '✅' : '❌'} {label}</span>
}

function shorten(p: string) {
  const parts = p.split(/[\\/]/)
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}
