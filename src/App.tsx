import { useEffect, useRef, useState } from 'react'
import type { SystemStatus, UsageInfo, ApprovalRequest } from './shared/types'
import { ChatView, type ChatMessage } from './components/ChatView'
import { UsageBar } from './components/UsageBar'
import { SetupGate } from './components/SetupGate'
import { ApprovalModal } from './components/ApprovalModal'

let runCounter = 0

export function App() {
  const [sys, setSys] = useState<SystemStatus | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [writeMode, setWriteMode] = useState(false) // false=계획만(read-only), true=작업(수정허용)
  const [model, setModel] = useState('gpt-5.5')
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const sessionId = useRef<string | undefined>(undefined)

  useEffect(() => {
    return window.codex.onApproval((req) => setApproval(req))
  }, [])

  function decideApproval(d: 'accept' | 'decline') {
    if (approval) window.codex.respondApproval(approval.requestId, d)
    setApproval(null)
  }

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
      if (e.kind === 'usage') {
        if (e.usage) setUsage(e.usage)
        return
      }
      setMessages((m) =>
        m.map((msg) => {
          if (msg.id !== aiMsg.id) return msg
          if (e.kind === 'message') return { ...msg, text: (msg.text || '') + (e.text || '') }
          if (e.kind === 'progress')
            return { ...msg, progress: [...(msg.progress || []), e.text || ''] }
          return msg
        }),
      )
    })

    try {
      const res = await window.codex.runCodex(
        {
          prompt,
          cwd: dir,
          sessionId: sessionId.current,
          sandbox: writeMode ? 'workspace-write' : 'read-only',
          model,
        },
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
          <Chip ok={sys.loggedIn} label={sys.loggedIn ? '연결됨' : '로그인 필요'} />
          <select
            className="model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            title="모델 선택"
          >
            <option value="gpt-5.5">gpt-5.5 · 기본</option>
            <option value="gpt-5.5-codex">gpt-5.5-codex · 코딩</option>
            <option value="o3">o3 · 깊은 추론</option>
          </select>
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

      <div className="composer-wrap">
        <div className="composer">
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
        </div>
        <div className="composer-foot">
          <div className="segmented" role="tablist">
            <button className={`seg ${!writeMode ? 'on' : ''}`} onClick={() => setWriteMode(false)}>
              계획만
            </button>
            <button
              className={`seg ${writeMode ? 'on danger' : ''}`}
              onClick={() => setWriteMode(true)}
            >
              수정 허용
            </button>
          </div>
          <span className={`foot-note ${writeMode ? 'warn' : ''}`}>
            {writeMode ? 'AI가 이 폴더의 파일을 직접 수정할 수 있어요' : '파일은 바꾸지 않고 설명·계획만 해요'}
          </span>
        </div>
      </div>

      <ApprovalModal req={approval} onDecide={decideApproval} />
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
