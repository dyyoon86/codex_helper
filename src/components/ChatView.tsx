import { useEffect, useRef } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  progress?: string[]
  usage?: Record<string, number>
  error?: boolean
}

export function ChatView({ messages, empty }: { messages: ChatMessage[]; empty: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (empty) {
    return (
      <main className="chat empty">
        <div className="welcome">
          <div className="welcome-emoji">🗂️</div>
          <h2>작업 폴더를 선택하면 시작해요</h2>
          <p>오른쪽 위 <b>작업 폴더 선택</b>을 누른 뒤, 채팅으로 시키면 됩니다.</p>
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
              토큰 in {m.usage.input_tokens ?? 0} · out {m.usage.output_tokens ?? 0}
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </main>
  )
}
