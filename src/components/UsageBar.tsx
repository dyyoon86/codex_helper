import type { UsageInfo, RateWindow } from '../shared/types'

export function UsageBar({ usage }: { usage: UsageInfo | null }) {
  if (!usage || (!usage.primary && !usage.secondary)) return null
  return (
    <div className="usagebar">
      {usage.planType && <span className="plan">{usage.planType.toUpperCase()}</span>}
      {usage.primary && <Meter label="5시간" w={usage.primary} />}
      {usage.secondary && <Meter label="주간" w={usage.secondary} />}
      {typeof usage.totalTokens === 'number' && (
        <span className="tok">세션 {fmt(usage.totalTokens)} 토큰</span>
      )}
    </div>
  )
}

function Meter({ label, w }: { label: string; w: RateWindow }) {
  const used = Math.min(100, Math.max(0, w.usedPercent))
  const left = Math.round(100 - used)
  const danger = used >= 90 ? 'danger' : used >= 70 ? 'warn' : 'ok'
  return (
    <span className="meter" title={`${label} 한도 ${used}% 사용 · ${resetText(w.resetsAt)}`}>
      <span className="meter-label">{label}</span>
      <span className="track">
        <span className={`fill ${danger}`} style={{ width: `${used}%` }} />
      </span>
      <span className="meter-num">{left}% 남음</span>
    </span>
  )
}

function fmt(n: number) {
  return n.toLocaleString()
}

function resetText(epochSec: number) {
  if (!epochSec) return ''
  const ms = epochSec * 1000 - Date.now()
  if (ms <= 0) return '곧 리셋'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 후 리셋`
  if (h >= 1) return `${h}시간 ${m}분 후 리셋`
  return `${m}분 후 리셋`
}
