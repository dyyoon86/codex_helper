import { useEffect, useRef } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  progress?: string[]
  usage?: Record<string, number>
  error?: boolean
}

const PRESETS = [
  { emoji: '📂', title: '폴더 살펴보기', desc: '뭐가 들어있는지 쉽게 설명', prompt: '이 폴더에 뭐가 있는지 초보자도 알기 쉽게 설명해줘.' },
  { emoji: '📝', title: '문서 요약', desc: '핵심만 간단히 정리', prompt: '이 폴더의 문서들을 핵심만 간단히 요약해줘.' },
  { emoji: '🗂️', title: '정리 계획', desc: '어떻게 정리할지 제안', prompt: '파일을 어떻게 정리하면 좋을지 계획만 세워줘. 실제로 옮기진 말고.' },
]

interface Props {
  messages: ChatMessage[]
  hasFolder: boolean
  onPickFolder: () => void
  onPreset: (prompt: string) => void
}

export function ChatView({ messages, hasFolder, onPickFolder, onPreset }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <main className="chat empty">
        <div className="welcome">
          <div className="seal-ghost">안전<br />모드</div>
          <h1 className="welcome-title">안녕하세요 👋<br />무엇을 도와드릴까요?</h1>
          <p className="welcome-sub">
            {hasFolder ? (
              <>아래에서 골라 바로 시작하거나, 직접 적어 보세요.</>
            ) : (
              <>먼저 작업할 폴더를 고르면 시작해요.<br />파일은 <b>승인하기 전엔</b> 절대 바꾸지 않아요.</>
            )}
          </p>
          {!hasFolder && (
            <button className="cta" onClick={onPickFolder}>
              📁 작업 폴더 고르기
            </button>
          )}
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.title} className="preset" onClick={() => onPreset(p.prompt)}>
                <span className="pre-emoji">{p.emoji}</span>
                <span className="pre-title">{p.title}</span>
                <span className="pre-desc">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="chat">
      {messages.map((m) => (
        <div key={m.id} className={`bubble ${m.role} ${m.error ? 'err' : ''}`}>
          {m.role === 'assistant' && m.progress && m.progress.length > 0 && !m.text && (
            <div className="progress">{m.progress[m.progress.length - 1]}</div>
          )}
          <div className="text">{m.text || (m.role === 'assistant' ? '…' : '')}</div>
          {m.usage && (
            <div className="usage">
              이번 답변 · 입력 {fmt(m.usage.input_tokens)} · 출력 {fmt(m.usage.output_tokens)} 토큰
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </main>
  )
}

function fmt(n?: number) {
  return (n ?? 0).toLocaleString()
}
