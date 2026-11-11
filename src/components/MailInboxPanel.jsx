import { useRef, useState } from 'react'
import {
  MAIL_ORIGINS,
  MAIL_PRIORITIES,
  MAIL_PRIORITY_MAP,
  fileApiSupported,
  originText,
} from '../mailInbox'

// メール受信箱。Claude が Outlook・楽楽自動応対から拾った「対応が要りそうなメール」と、手で入れた項目を並べる。
// カードの色で出所を分ける（Outlook＝青、楽楽自動応対＝緑）。左の太線は優先度の色。
// 「タスクにする」でふだんの Task（未対応）になり、「対応完了」で受信箱から消える
// （TaskNote の中だけの印。Outlook や楽楽自動応対のメールは変わらない）。

const pad = (n) => String(n).padStart(2, '0')

const fmtDateTime = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const fmtDue = (due) => {
  if (!due) return ''
  const [, m, d] = due.split('-')
  return `${Number(m)}/${Number(d)}`
}

const dueState = (due) => {
  if (!due) return ''
  const today = todayStr()
  if (due < today) return 'is-over'
  if (due === today) return 'is-today'
  return ''
}

const EMPTY_DRAFT = { title: '', from: '', due: '', priority: 2, summary: '' }

function PriorityBadge({ value }) {
  const p = MAIL_PRIORITY_MAP[value] || MAIL_PRIORITY_MAP[2]
  return (
    <span
      className="mail-prio"
      style={{ '--prio': p.color, '--prio-soft': p.soft }}
      title={`優先度：${p.label}`}
    >
      {p.label}
    </span>
  )
}

function OriginBadge({ origin }) {
  const o = MAIL_ORIGINS[origin] || MAIL_ORIGINS.outlook
  return <span className={`mail-source origin-${origin}`}>{o.label}</span>
}

function MailItem({ item, onAdopt, onDismiss }) {
  const [open, setOpen] = useState(false)
  const where = originText(item)
  return (
    <article className={`mail-item prio-${item.priority} origin-${item.origin}`}>
      <div className="mail-item-main">
        <PriorityBadge value={item.priority} />
        <div className="mail-item-body">
          <h3 className="mail-item-title">{item.title}</h3>
          <p className="mail-item-meta">
            <OriginBadge origin={item.origin} />
            {item.from && <span title={item.fromAddress || undefined}>{item.from}</span>}
            {(item.receivedAt || item.createdAt) && (
              <span>{fmtDateTime(item.receivedAt || item.createdAt)}</span>
            )}
            {item.due && (
              <span className={`mail-due ${dueState(item.due)}`}>期限 {fmtDue(item.due)}</span>
            )}
          </p>
          {where && item.origin !== 'manual' && (
            <p className="mail-item-origin">取得元：{where}</p>
          )}
          {item.subject && item.subject !== item.title && (
            <p className="mail-item-subject">件名：{item.subject}</p>
          )}
          {(item.summary || item.reason) && (
            <>
              {open && item.summary && <p className="mail-item-summary">{item.summary}</p>}
              {open && item.reason && (
                <p className="mail-item-reason">優先度の理由：{item.reason}</p>
              )}
              <button
                type="button"
                className="mail-more"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? '閉じる' : '内容を見る'}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mail-item-actions">
        <button
          type="button"
          className="mail-adopt"
          onClick={() => onAdopt(item)}
          title="Task一覧に「未対応」で追加する"
        >
          タスクにする
        </button>
        <button
          type="button"
          className="mail-dismiss"
          onClick={() => onDismiss(item)}
          title="対応が済んだので受信箱から消す（TaskNoteの中だけの印で、Outlookや楽楽自動応対のメールは変わりません。下の「処理済み」から戻せます）"
        >
          対応完了
        </button>
      </div>
    </article>
  )
}

function ManualForm({ onAdd, onClose }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))
  const submit = (e) => {
    e.preventDefault()
    if (!draft.title.trim()) return
    onAdd(draft)
    setDraft(EMPTY_DRAFT)
  }
  return (
    <form className="mail-manual" onSubmit={submit}>
      <label className="mail-field">
        <span>
          やること <em>必須</em>
        </span>
        <input
          autoFocus
          value={draft.title}
          placeholder="例）○○様のメールに見積を返信"
          onChange={(e) => set('title', e.target.value)}
        />
      </label>
      <div className="mail-manual-row">
        <label className="mail-field">
          <span>相手</span>
          <input
            value={draft.from}
            placeholder="例）○○介護センター 田中様"
            onChange={(e) => set('from', e.target.value)}
          />
        </label>
        <label className="mail-field mail-field-due">
          <span>期限</span>
          <input type="date" value={draft.due} onChange={(e) => set('due', e.target.value)} />
        </label>
      </div>
      <div className="mail-field">
        <span>優先度</span>
        <div className="mail-prio-pick" role="group" aria-label="優先度">
          {MAIL_PRIORITIES.map((p) => (
            <button
              key={p.v}
              type="button"
              className={draft.priority === p.v ? 'is-active' : ''}
              aria-pressed={draft.priority === p.v}
              style={{ '--prio': p.color, '--prio-soft': p.soft }}
              onClick={() => set('priority', p.v)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <label className="mail-field">
        <span>メモ</span>
        <textarea
          rows={2}
          value={draft.summary}
          placeholder="メールの要点など"
          onChange={(e) => set('summary', e.target.value)}
        />
      </label>
      <div className="mail-manual-foot">
        <button type="button" className="mail-dismiss" onClick={onClose}>
          閉じる
        </button>
        <button type="submit" className="mail-adopt" disabled={!draft.title.trim()}>
          ＋ 受信箱に追加
        </button>
      </div>
    </form>
  )
}

export default function MailInboxPanel({ inbox, onAdopt }) {
  const [showManual, setShowManual] = useState(false)
  const [showHandled, setShowHandled] = useState(false)
  const fileInputRef = useRef(null)
  const {
    openItems,
    handledItems,
    fileStatus,
    fileError,
    fileName,
    fileUpdatedAt,
    loadedAt,
    hasFile,
    pickFile,
    reload,
    loadFromFile,
    forgetFile,
    markHandled,
    restore,
    addManual,
  } = inbox

  const counts = MAIL_PRIORITIES.map((p) => ({
    ...p,
    count: openItems.filter((item) => item.priority === p.v).length,
  }))

  const choose = () => {
    if (fileApiSupported) pickFile()
    else fileInputRef.current?.click()
  }

  return (
    <aside className="memo-panel mail-panel">
      <div className="mail-head">
        <div className="mail-head-title">
          <h2>Mail</h2>
          <span className="mail-head-sub">メール受信箱</span>
          <div className="mail-head-counts" aria-label="優先度ごとの件数">
            {counts.map((p) => (
              <span
                key={p.v}
                className="mail-count"
                style={{ '--prio': p.color, '--prio-soft': p.soft }}
              >
                {p.label} <strong>{p.count}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="mail-head-actions">
          <button
            type="button"
            className="section-export-button"
            onClick={() => setShowManual((v) => !v)}
            aria-expanded={showManual}
          >
            ＋ 手で追加
          </button>
          {hasFile ? (
            <button type="button" className="section-export-button" onClick={reload}>
              ↻ 読み込み
            </button>
          ) : (
            <button type="button" className="section-export-button" onClick={choose}>
              ファイルを選ぶ
            </button>
          )}
        </div>
      </div>

      <div className="mail-file-line">
        {fileStatus === 'ok' && (
          <span>
            {fileName}
            {fileUpdatedAt && <> ・ Claudeの更新 {fmtDateTime(fileUpdatedAt)}</>}
            {loadedAt && <> ・ 読込 {fmtDateTime(loadedAt)}</>}
          </span>
        )}
        {fileStatus === 'need-permission' && (
          <span className="mail-file-warn">
            ブラウザの許可が切れています。
            <button type="button" className="mail-link" onClick={reload}>
              クリックして読み込む
            </button>
          </span>
        )}
        {fileStatus === 'error' && <span className="mail-file-error">{fileError}</span>}
        {fileStatus === 'none' && (
          <span>
            Claudeが書き出す <code>メール受信箱.json</code> を「ファイルを選ぶ」で選んでください。
            {fileApiSupported && ' 次からはボタン1つで読み込めます。'}
          </span>
        )}
        {hasFile && (
          <span className="mail-file-tools">
            <button type="button" className="mail-link" onClick={pickFile}>
              別のファイルを選ぶ
            </button>
            <button type="button" className="mail-link" onClick={forgetFile}>
              ファイルの設定を外す
            </button>
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            loadFromFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      <div className="mail-scroll">
        {showManual && (
          <ManualForm
            onAdd={(draft) => {
              addManual({ ...draft, due: draft.due || null })
            }}
            onClose={() => setShowManual(false)}
          />
        )}

        {openItems.length === 0 ? (
          <p className="mail-empty">
            {fileStatus === 'ok' || !hasFile
              ? '受信箱は空です。'
              : '読み込むと、ここにメールが並びます。'}
          </p>
        ) : (
          <div className="mail-list">
            {openItems.map((item) => (
              <MailItem
                key={item.id}
                item={item}
                onAdopt={(it) => {
                  onAdopt(it)
                  markHandled(it, 'adopted')
                }}
                onDismiss={(it) => markHandled(it, 'dismissed')}
              />
            ))}
          </div>
        )}

        {handledItems.length > 0 && (
          <div className="mail-handled">
            <button
              type="button"
              className="mail-link"
              aria-expanded={showHandled}
              onClick={() => setShowHandled((v) => !v)}
            >
              {showHandled ? '▾' : '▸'} 処理済み {handledItems.length}件
            </button>
            {showHandled && (
              <ul>
                {handledItems.map((item) => (
                  <li key={item.id}>
                    <span
                      className={`mail-handled-tag ${
                        item.handled.action === 'adopted' ? 'is-adopted' : ''
                      }`}
                    >
                      {item.handled.action === 'adopted' ? 'タスク化' : '対応完了'}
                    </span>
                    <OriginBadge origin={item.origin} />
                    <span className="mail-handled-title">{item.title}</span>
                    <span className="mail-handled-at">{fmtDateTime(item.handled.at)}</span>
                    <button type="button" className="mail-link" onClick={() => restore(item.id)}>
                      受信箱に戻す
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
