import type { ApprovalRequest } from '../shared/types'

const ICON: Record<ApprovalRequest['kind'], string> = {
  command: '⚡',
  file: '✏️',
  permission: '🔑',
  input: '💬',
}

export function ApprovalModal({
  req,
  onDecide,
}: {
  req: ApprovalRequest | null
  onDecide: (d: 'accept' | 'decline') => void
}) {
  if (!req) return null
  return (
    <div className="modal-overlay">
      <div className="approval">
        <div className="approval-head">
          <span className="approval-ic">{ICON[req.kind]}</span>
          <span className="approval-title">{req.title}</span>
        </div>
        <p className="approval-q">AI가 아래 작업을 하려고 해요. 허용할까요?</p>
        <pre className="approval-detail">{req.detail}</pre>
        <div className="approval-actions">
          <button className="btn-decline" onClick={() => onDecide('decline')}>
            거부
          </button>
          <button className="btn-accept" onClick={() => onDecide('accept')}>
            허용
          </button>
        </div>
      </div>
    </div>
  )
}
