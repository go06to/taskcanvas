import { useEffect, useRef } from 'react'
import { MEMO_STATUSES } from './MemoPanel'
import { DUE_PRESETS, WAITING_FOLLOW_UP_DAYS, dateAfterDays, fmtMD } from '../dateUtils'

// 左上の「＋ タスクを追加」から開く、大きな入力画面。
// 電話などで受けた「やること」を、相手・連絡先・期限と一緒に書き留める。
// 閉じても書きかけの内容は残り、追加したときだけ空になる。
export default function AddTaskDialog({
  open,
  draft,
  onChange,
  onSubmit,
  onClose,
  focusRequest = 0,
}) {
  const titleRef = useRef(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => titleRef.current?.focus())
  }, [open, focusRequest])

  if (!open) return null

  const canSubmit = Boolean(draft.title.trim())

  // 返事待ちを選んだとき、期限が空なら確認日（数日後）を自動で入れる。
  const chooseStatus = (key) => {
    onChange('status', key)
    if (key === 'waiting' && !draft.due) onChange('due', dateAfterDays(WAITING_FOLLOW_UP_DAYS))
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (canSubmit) onSubmit({ keepOpen: false })
    }
  }

  return (
    <div
      className="add-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="add-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-dialog-title"
        onKeyDown={handleKeyDown}
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) onSubmit({ keepOpen: false })
        }}
      >
        <div className="add-dialog-head">
          <h2 id="add-dialog-title">タスクを追加</h2>
          <span className="add-head-hint">Enter で追加 ・ Esc で閉じる</span>
          <button type="button" className="add-dialog-close" onClick={onClose} title="閉じる（Esc）">
            ✕
          </button>
        </div>

        <label className="add-field">
          <span className="add-field-label">
            やること <em>必須</em>
          </span>
          <input
            ref={titleRef}
            className="add-title-input"
            value={draft.title}
            placeholder="例）田中様へ見積を折り返し電話"
            onChange={(event) => onChange('title', event.target.value)}
          />
        </label>

        <label className="add-field">
          <span className="add-field-label">相手</span>
          <input
            className="add-contact-input"
            value={draft.contact}
            placeholder="例）○○介護センター 田中様 03-1234-5678"
            onChange={(event) => onChange('contact', event.target.value)}
          />
        </label>

        <label className="add-field">
          <span className="add-field-label">メモ</span>
          <textarea
            value={draft.note}
            rows={4}
            placeholder={'詳しい内容など\n例）車いす2台の見積がほしいとのこと'}
            onChange={(event) => onChange('note', event.target.value)}
          />
        </label>

        <div className="add-field">
          <span className="add-field-label">期限</span>
          <div className="add-due-row">
            {DUE_PRESETS.map((preset) => {
              const value = dateAfterDays(preset.days)
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`add-due-preset ${draft.due === value ? 'is-selected' : ''}`}
                  aria-pressed={draft.due === value}
                  onClick={() => onChange('due', value)}
                >
                  {preset.label}
                  <small>{fmtMD(value)}</small>
                </button>
              )
            })}
            <input
              type="date"
              value={draft.due}
              aria-label="期限の日付"
              onChange={(event) => onChange('due', event.target.value)}
            />
            {draft.due && (
              <button type="button" className="add-chip-clear" onClick={() => onChange('due', '')}>
                期限なし
              </button>
            )}
          </div>
          <span className="add-field-note">
            {draft.status === 'waiting'
              ? `返事待ちは、期限を「返事を確認する日」として使います（空なら${WAITING_FOLLOW_UP_DAYS}日後を自動で入れます）`
              : '期限の日になると「期限が来た」に出ます'}
          </span>
        </div>

        <div className="add-field">
          <span className="add-field-label">進み具合</span>
          <div className="add-chip-row" role="radiogroup" aria-label="進み具合">
            {MEMO_STATUSES.map((status) => (
              <button
                key={status.key}
                type="button"
                role="radio"
                aria-checked={draft.status === status.key}
                className={`add-chip ${draft.status === status.key ? 'is-selected' : ''}`}
                style={{ '--chip': status.color, '--chip-soft': status.soft }}
                onClick={() => chooseStatus(status.key)}
              >
                <strong>{status.label}</strong>
                <small>{status.description}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="add-dialog-foot">
          <button
            type="button"
            className={`add-mark ${draft.marked ? 'on' : ''}`}
            aria-pressed={Boolean(draft.marked)}
            title={draft.marked ? 'MARK を外す' : 'MARK を付けて目立たせる'}
            onClick={() => onChange('marked', !draft.marked)}
          >
            {draft.marked ? '★ MARKED' : '☆ MARK'}
          </button>
          <button
            type="button"
            className="add-pw"
            disabled={!canSubmit}
            title="パスワードで保護したタスクとして追加"
            onClick={() => onSubmit({ keepOpen: false, protectedMode: true })}
          >
            🔒 PW付きで追加
          </button>
          <button
            type="button"
            className="add-more"
            disabled={!canSubmit}
            onClick={() => onSubmit({ keepOpen: true })}
          >
            追加して次を入力
          </button>
          <button type="submit" className="add-submit" disabled={!canSubmit}>
            ＋ 追加
          </button>
        </div>
      </form>
    </div>
  )
}
