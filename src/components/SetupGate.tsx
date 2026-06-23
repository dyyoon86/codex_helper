import { useEffect, useRef, useState } from 'react'
import type { SystemStatus, SetupEvent } from '../shared/types'

/** node/codex/로그인 중 하나라도 안 되어 있으면 뜨는 첫 실행 준비 화면. */
export function SetupGate({
  sys,
  onReady,
  recheck,
}: {
  sys: SystemStatus
  onReady: () => void
  recheck: () => Promise<SystemStatus>
}) {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const logEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.codex.onSetup((e: SetupEvent) => {
      setLog((l) => [...l.slice(-40), e.text])
      if (e.level === 'error') setErr(e.text)
    })
    return off
  }, [])
  useEffect(() => {
    logEnd.current?.scrollIntoView()
  }, [log])

  const needInstall = !sys.node.ok || !sys.codex.ok

  async function prepare() {
    setBusy(true)
    setErr(null)
    setLog([])
    try {
      const res = await window.codex.installDeps()
      const s = await recheck()
      if (res.ok && s.node.ok && s.codex.ok && s.loggedIn) onReady()
    } finally {
      setBusy(false)
    }
  }

  async function doLogin() {
    setBusy(true)
    setErr(null)
    setLog([])
    try {
      await window.codex.login()
      const s = await recheck()
      if (s.ready) onReady()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-head">
          <span className="mark">작업실</span>
          <span className="dot" />
        </div>
        <h1 className="setup-title">AI 작업실 시작 준비</h1>
        <p className="setup-sub">필요한 구성 요소를 확인하고 있어요. 복잡한 설정은 앱이 대신 처리해요.</p>

        <ul className="checklist">
          <Check ok label="작업실 앱" sub="설치됨" />
          <Check ok={sys.node.ok} label="AI 실행 준비 프로그램" sub={sys.node.ok ? sys.node.version : '필요'} />
          <Check ok={sys.codex.ok} label="AI 실행 엔진" sub={sys.codex.ok ? sys.codex.version : '필요'} />
          <Check ok={sys.loggedIn} label="OpenAI 로그인 연결" sub={sys.loggedIn ? '연결됨' : '필요'} />
        </ul>

        {busy && (
          <div className="setup-log">
            {log.map((l, i) => (
              <div key={i} className="log-line">{l}</div>
            ))}
            <div ref={logEnd} />
          </div>
        )}

        {err && !busy && <div className="setup-err">{err}</div>}

        <div className="setup-actions">
          {needInstall ? (
            <button className="cta" onClick={prepare} disabled={busy}>
              {busy ? '준비하는 중…' : '한 번에 준비하기'}
            </button>
          ) : (
            <button className="cta" onClick={doLogin} disabled={busy}>
              {busy ? '로그인 진행 중…' : '▶ OpenAI 공식 로그인'}
            </button>
          )}
          <p className="setup-note">
            {needInstall
              ? '공식 설치 파일로 안전하게 준비해요. 1~2분 걸릴 수 있어요.'
              : 'OpenAI 공식 로그인 페이지가 열립니다. 비밀번호는 이 앱에 저장되지 않아요.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function Check({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) {
  return (
    <li className={`check ${ok ? 'on' : 'off'}`}>
      <span className="check-ic">{ok ? '✓' : '○'}</span>
      <span className="check-label">{label}</span>
      <span className="check-sub">{sub}</span>
    </li>
  )
}
