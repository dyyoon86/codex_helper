import { useEffect, useRef, useState } from 'react'
import type { SystemStatus, UsageInfo } from './shared/types'
import { ChatView, type ChatMessage } from './components/ChatView'
import { UsageBar } from './components/UsageBar'
import { SetupGate } from './components/SetupGate'

let runCounter = 0

export function App() {
  const [sys, setSys] = useState<SystemStatus | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const sessionId = useRef<string | undefined>(undefined)

  async function refresh(): Promise<SystemStatus> {
    const s = await window.codex.checkSystem()
    setSys(s)
    return s
  }

  useEffect(() => {
    refresh()
    window.codex.getLatestUsage().then(setUsage)
  }, [])

  async function pickFolder(): Promise<string | null> {
    const dir = await window.codex.selectFolder()
    if (dir) {
      setCwd(dir)
      sessionId.current = undefined
      setMessages([])
    }
    return dir
  }

  async function sendWith(prompt: string, dir: string) {
    if (!prompt.trim() || running) return
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
        { prompt, cwd: dir, sessionId: sessionId.current, sandbox: 'read-only' },
        runId,
      )
      if (res.threadId) sessionId.current = res.threadId
      if (res.usage) setUsage(res.usage)
      if (res.error && !res.finalMessage) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === aiMsg.id ? { ...msg, text: `문제가 생겼어요: ${res.error}`, error: true } : msg,
          ),
        )
      }
    } finally {
      off()
      setRunning(false)
    }
  }

  async function send() {
    const prompt = input.trim()
    if (!prompt || !cwd) return
    setInput('')
    await sendWith(prompt, cwd)
  }

  // 시작 화면 프리셋: 폴더 없으면 먼저 고르고 실행
  async function runPreset(prompt: string) {
    let dir = cwd
    if (!dir) {
      dir = await pickFolder()
      if (!dir) return
    }
    await sendWith(prompt, dir)
  }

  // 로딩 중
  if (!sys) {
    return (
      <div className="app">
        <div className="setup">
          <div className="setup-card">
            <div className="setup-head">
              <span className="mark">작업실</span>
              <span className="dot" />
            </div>
            <p className="setup-sub">준비 상태를 확인하고 있어요…</p>
          </div>
        </div>
      </div>
    )
  }

  // node/codex/로그인 중 하나라도 안 되어 있으면 준비 화면
  if (!sys.ready) {
    return <SetupGate sys={sys} onReady={refresh} recheck={refresh} />
  }

  const ready = cwd

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">작업실</span>
          <span className="dot" />
          <span className="ver">M1</span>
        </div>
        <div className="status">
          <Chip ok={sys.codex.ok} label={sys.codex.ok ? 'AI 엔진 준비됨' : 'AI 엔진 없음'} />
          <Chip ok={sys.loggedIn} label={sys.loggedIn ? '로그인됨' : '로그인 필요'} />
          <button className="folder-btn" onClick={pickFolder}>
            {cwd ? `📁 ${shorten(cwd)}` : '📁 작업 폴더'}
          </button>
        </div>
      </header>

      <UsageBar usage={usage} />

      <ChatView
        messages={messages}
        hasFolder={!!cwd}
        onPickFolder={pickFolder}
        onPreset={runPreset}
      />

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
            !cwd ? '먼저 작업 폴더를 골라주세요' : '무엇을 도와드릴까요? (예: 이 폴더 설명해줘)'
          }
          disabled={!ready || running}
          rows={2}
        />
        <button className="send" onClick={send} disabled={!ready || running || !input.trim()}>
          {running ? '…' : '보내기'}
        </button>
      </footer>

      <div className="safenote">
        <span className="seal">안전<br />모드</span>
        지금은 <b style={{ color: 'var(--ink)' }}>계획만</b> 봅니다 · 파일은 승인하기 전엔 바꾸지 않아요
      </div>
    </div>
  )
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`chip ${ok ? 'ok' : 'no'}`}>
      <span className="led" />
      {label}
    </span>
  )
}

function shorten(p: string) {
  const parts = p.split(/[\\/]/)
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}
