import { useEffect, useRef, useState } from 'react'
import { linkify } from '../linkify'
import { MEMO_TERMS } from '../constants'

const fmtDate = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const fmtDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

// 装飾ボタンの定義。マーカーだけ背景色＋文字色をまとめて適用する。
const FORMATS = [
  { key: 'bold', label: 'B', title: '太字', cls: 'fb-bold' },
  { key: 'strikeThrough', label: 'S', title: '取り消し線', cls: 'fb-strike' },
  { key: 'underline', label: 'U', title: '下線', cls: 'fb-under' },
  { key: 'marker', label: 'M', title: 'マーカー', cls: 'fb-marker' },
]

const MEMO_STATUSES = [
  { key: 'action', label: 'ACTION', description: '自分が対応する', color: '#c9344f', soft: '#fdecef' },
  { key: 'schedule', label: 'SCHEDULE', description: '予定・日時が決まっている', color: '#2563b8', soft: '#eaf3ff' },
  { key: 'waiting', label: 'WAITING', description: '返答・対応待ち', color: '#a86716', soft: '#fff4df' },
  { key: 'note', label: 'NOTE', description: '情報・メモ', color: '#6656b8', soft: '#f1efff' },
]

const memoStatus = (memo) =>
  MEMO_STATUSES.some((status) => status.key === memo.status) ? memo.status : 'note'

const memoTerm = (memo) =>
  MEMO_TERMS.some((term) => term.key === memo.term) ? memo.term : 'memo'

const FORMAT_TAGS = {
  bold: 'b',
  strikeThrough: 's',
  underline: 'u',
  marker: 'mark',
}

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function applyTextareaFormat(el, tag) {
  const value = el.value || ''
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const selected = value.slice(start, end)
  const open = `<${tag}>`
  const close = `</${tag}>`
  const insert = selected ? `${open}${selected}${close}` : `${open}${close}`
  const next = value.slice(0, start) + insert + value.slice(end)
  const cursorStart = selected ? start : start + open.length
  const cursorEnd = selected ? start + insert.length : cursorStart
  setNativeValue(el, next)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(cursorStart, cursorEnd)
  })
}

function applyFormat(key) {
  const active = document.activeElement
  const tag = FORMAT_TAGS[key]
  if (tag && active?.tagName === 'TEXTAREA') {
    applyTextareaFormat(active, tag)
    return
  }

  if (key === 'marker') {
    // 黄色ハイライト＋濃い文字色で蛍光ペン風に。
    document.execCommand('hiliteColor', false, '#dbeafe')
    document.execCommand('foreColor', false, '#18181b')
  } else {
    document.execCommand(key, false, null)
  }
}

function MemoMiniTask({ memoId, task, onToggle, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)

  useEffect(() => {
    if (!editing) setDraft(task.title)
  }, [editing, task.title])

  const save = () => {
    const title = draft.trim()
    if (title) onEdit(memoId, task.id, title)
    else setDraft(task.title)
    setEditing(false)
  }

  return (
    <div className={`memo-mini-task ${task.done ? 'is-done' : ''}`}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(memoId, task.id)}
        aria-label={`${task.title}を完了にする`}
      />
      {editing ? (
        <input
          className="memo-mini-edit"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setDraft(task.title)
              setEditing(false)
            }
          }}
        />
      ) : (
        <span
          className="memo-mini-title"
          title="クリックで編集"
          onClick={() => setEditing(true)}
        >
          {linkify(task.title)}
        </span>
      )}
      {fmtDateTime(task.createdAt) && (
        <time
          className="memo-mini-created-at"
          dateTime={task.createdAt}
          title="サブタスク登録日時"
        >
          {fmtDateTime(task.createdAt)}
        </time>
      )}
      <button
        type="button"
        className="memo-mini-delete"
        title="サブタスクを削除"
        onClick={() => onDelete(memoId, task.id)}
      >
        ×
      </button>
    </div>
  )
}

// 1行のリッチテキスト編集（contentEditable）。直接書き込み・装飾・コメント。
export function MemoRow({
  memo,
  large,
  onOpenDetail,
  onToggleDone,
  onEdit,
  onEditComment,
  onSetStatus,
  onSetTerm,
  onAddMiniTask,
  onToggleMiniTask,
  onEditMiniTask,
  onDeleteMiniTask,
  onReorder,
  onArchive,
  onDelete,
}) {
  const ref = useRef(null)
  const [openC, setOpenC] = useState(false)
  const [cDraft, setCDraft] = useState(memo.comment || '')
  const [openMini, setOpenMini] = useState(false)
  const [miniDraft, setMiniDraft] = useState('')
  const miniTasks = Array.isArray(memo.miniTasks) ? memo.miniTasks : []

  // 初期内容と外部変更の反映（編集中＝フォーカス時は触らない）。
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.innerHTML !== (memo.text || '')) {
      el.innerHTML = memo.text || ''
    }
  }, [memo.text])

  const save = () => {
    const el = ref.current
    if (el && el.innerHTML !== memo.text) onEdit(memo.id, el.innerHTML)
  }

  const saveComment = () => {
    onEditComment(memo.id, cDraft.trim())
    setOpenC(false)
  }

  const addMiniTask = () => {
    const title = miniDraft.trim()
    if (!title) return
    onAddMiniTask(memo.id, title)
    setMiniDraft('')
  }

  return (
    <div
      className={`memo-row-wrap ${large ? 'large' : ''}`}
      onDragOver={large ? undefined : (e) => e.preventDefault()}
      onDrop={
        large
          ? undefined
          : (e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              if (id && id !== memo.id) onReorder(id, memo.id)
            }
      }
    >
      <div
        className={`memo-row ${memo.done ? 'is-done' : ''} ${
          large ? 'is-large' : 'has-drag'
        } ${openC || memo.comment ? 'has-comment' : ''} ${
          openMini || miniTasks.length > 0 ? 'has-mini' : ''
        }`}
      >
        {!large && (
          <span
            className="memo-drag"
            title="ドラッグで並び替え"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', memo.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            ⠿
          </span>
        )}
        <input
          type="checkbox"
          className="memo-cb"
          checked={memo.done}
          onChange={() => onToggleDone(memo.id)}
        />
        <div className="memo-content-line">
          <div
            ref={ref}
            className="memo-rich"
            contentEditable
            suppressContentEditableWarning
            onBlur={save}
            onKeyDown={(e) => {
              // Enter で確定（改行は Shift+Enter）。
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
          {fmtDateTime(memo.createdAt) && (
            <time
              className="memo-created-at"
              dateTime={memo.createdAt}
              title="登録日時"
            >
              {fmtDateTime(memo.createdAt)}
            </time>
          )}
        </div>
        {openC ? (
          <textarea
            className="memo-comment-edit"
            value={cDraft}
            autoFocus
            rows={Math.max(1, cDraft.split('\n').length)}
            placeholder={'\u30b3\u30e1\u30f3\u30c8\u3092\u5165\u529b'}
            onChange={(e) => setCDraft(e.target.value)}
            onBlur={saveComment}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCDraft(memo.comment || '')
                setOpenC(false)
              }
            }}
          />
        ) : memo.comment ? (
          <div
            className="memo-comment"
            title={'\u30af\u30ea\u30c3\u30af\u3067\u7de8\u96c6'}
            onClick={() => {
              setCDraft(memo.comment)
              setOpenC(true)
            }}
          >
            コメント{' '}
            {memo.commentUpdatedAt && (
              <span className="comment-date">{fmtDate(memo.commentUpdatedAt)}</span>
            )}
            {linkify(memo.comment)}
          </div>
        ) : null}
        {(openMini || miniTasks.length > 0) && (
          <div className="memo-mini-panel">
            {miniTasks.map((task) => (
              <MemoMiniTask
                key={task.id}
                memoId={memo.id}
                task={task}
                onToggle={onToggleMiniTask}
                onEdit={onEditMiniTask}
                onDelete={onDeleteMiniTask}
              />
            ))}
            {openMini && (
              <div className="memo-mini-add">
                <input
                  value={miniDraft}
                  autoFocus
                  placeholder="サブタスクを入力"
                  onChange={(e) => setMiniDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addMiniTask()
                    if (e.key === 'Escape') {
                      setMiniDraft('')
                      setOpenMini(false)
                    }
                  }}
                />
                <button type="button" onClick={addMiniTask} disabled={!miniDraft.trim()}>
                  追加
                </button>
              </div>
            )}
          </div>
        )}
        <div className="memo-row-actions">
          <select
            className={`memo-term-select is-${memoTerm(memo)}`}
            value={memoTerm(memo)}
            onChange={(e) => onSetTerm(memo.id, e.target.value)}
            aria-label="メモの登録先"
            title="登録先を変更"
          >
            {MEMO_TERMS.map((term) => (
              <option
                key={term.key}
                value={term.key}
                className={`is-${term.key}`}
                style={{ color: term.color, background: term.soft }}
              >
                {term.label}
              </option>
            ))}
          </select>
          <select
            className={`memo-status is-${memoStatus(memo)}`}
            value={memoStatus(memo)}
            onChange={(e) => onSetStatus(memo.id, e.target.value)}
            aria-label="メモのステータス"
            title={`${MEMO_STATUSES.find((status) => status.key === memoStatus(memo))?.description}（クリックで変更）`}
          >
            {MEMO_STATUSES.map((status) => (
              <option
                key={status.key}
                value={status.key}
                className={`is-${status.key}`}
                style={{ color: status.color, background: status.soft }}
              >
                {status.label}
              </option>
            ))}
          </select>
          {!large && (
            <button
              className="memo-expand"
              title="拡大表示"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onOpenDetail(memo.id)}
            >
              ⤢
            </button>
          )}
          <button
            className={`memo-cmt ${memo.comment ? 'has' : ''}`}
            title="コメント"
            aria-label="コメント"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setCDraft(memo.comment || '')
              setOpenC((v) => !v)
            }}
          >
            <span className="memo-comment-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`memo-mini-toggle ${miniTasks.length ? 'has' : ''}`}
            title="サブタスクを追加"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpenMini((value) => !value)}
          >
            ＋ サブタスク
          </button>
          <button
            className="memo-archive"
            title="完了フォルダへ移動"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onArchive(memo.id)}
          >
            ✓
          </button>
          <button
            className="memo-del"
            title="削除"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onDelete(memo.id)}
          >
            ×
          </button>
        </div>
      </div>

      {false && (openC ? (
        <textarea
          className="memo-comment-edit"
          value={cDraft}
          autoFocus
          rows={Math.max(1, cDraft.split('\n').length)}
          placeholder="コメントを入力"
          onChange={(e) => setCDraft(e.target.value)}
          onBlur={saveComment}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setCDraft(memo.comment || '')
              setOpenC(false)
            }
          }}
        />
      ) : memo.comment ? (
        <div
          className="memo-comment"
          title="クリックで編集"
          onClick={() => {
            setCDraft(memo.comment)
            setOpenC(true)
          }}
        >
          コメント {linkify(memo.comment)}
        </div>
      ) : null)}
    </div>
  )
}

// 「＋作成」から開く新規作成フォーム。
function MemoComposer({ inputRef, onAdd, status, term, onMissingTerm, onAdded, onCancel }) {
  const commit = () => {
    const el = inputRef.current
    if (!el) return
    if (!el.textContent.trim()) return
    if (!term) {
      onMissingTerm()
      return
    }
    onAdd(el.innerHTML, status, term)
    el.innerHTML = ''
    onAdded()
  }

  return (
    <div className="memo-composer">
      <div
        ref={inputRef}
        className="memo-rich memo-compose-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="内容を入力…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            commit()
          }
        }}
      />
      <div className="memo-compose-actions">
        <button type="button" className="memo-compose-cancel" onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="memo-compose-submit" onClick={commit}>
          作成
        </button>
      </div>
    </div>
  )
}

// 左側のフリーメモボード。ボードに直接書き込め、選択文字に装飾もかけられる。
export default function MemoPanel({
  memos,
  onAdd,
  onToggleDone,
  onEdit,
  onEditComment,
  onSetStatus,
  onSetTerm,
  onAddMiniTask,
  onToggleMiniTask,
  onEditMiniTask,
  onDeleteMiniTask,
  onReorder,
  onArchive,
  onDelete,
  onOpenDetail,
}) {
  const newRef = useRef(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [termFilter, setTermFilter] = useState('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedTerm, setSelectedTerm] = useState(null)
  const [termError, setTermError] = useState(false)
  const remaining = memos.filter((m) => !m.done).length
  const filteredMemos = memos.filter(
    (memo) =>
      (statusFilter === 'all' || memoStatus(memo) === statusFilter) &&
      (termFilter === 'all' || memoTerm(memo) === termFilter),
  )
  const termCounts = Object.fromEntries(
    MEMO_TERMS.map((term) => [
      term.key,
      memos.filter((memo) => memoTerm(memo) === term.key).length,
    ]),
  )

  return (
    <aside className="memo-panel">
      <div className="memo-head">
        <h2>
          <span className="memo-icon">M</span> MEMO
        </h2>
        <div className="memo-head-counts">
          <span className="memo-count">残り {remaining}</span>
          <div className="memo-head-term-counts" aria-label="分類別の件数">
            {MEMO_TERMS.filter((term) => term.key !== 'memo').map((term) => (
              <button
                key={term.key}
                type="button"
                className={`memo-head-term-count ${termFilter === term.key ? 'is-active' : ''}`}
                style={{ '--term': term.color, '--term-soft': term.soft }}
                title={`${term.label} ${termCounts[term.key]}件（クリックで絞り込み${termFilter === term.key ? '解除' : ''}）`}
                aria-pressed={termFilter === term.key}
                onClick={() =>
                  setTermFilter((current) => (current === term.key ? 'all' : term.key))
                }
              >
                <span className="memo-head-term-dot" aria-hidden="true" />
                <span>{term.label}</span>
                <strong>{termCounts[term.key]}</strong>
              </button>
            ))}
          </div>
        </div>
        <select
          className={`memo-status-filter ${statusFilter === 'all' ? '' : `is-${statusFilter}`}`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="メモをステータスで絞り込む"
          title="ステータスで絞り込む"
        >
          <option value="all">ALL</option>
          {MEMO_STATUSES.map((status) => (
            <option
              key={status.key}
              value={status.key}
              className={`is-${status.key}`}
              style={{ color: status.color, background: status.soft }}
            >
              {status.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="memo-create-entry"
          onClick={() => {
            if (composerOpen) {
              newRef.current?.focus()
              return
            }
            setComposerOpen(true)
            setSelectedTerm(null)
            setTermError(false)
            requestAnimationFrame(() => newRef.current?.focus())
          }}
        >
          ＋ 作成
        </button>
      </div>

      {composerOpen && (
        <div className="memo-create-panel">
          <div className="memo-term-picker" aria-label="登録先を選択">
            {MEMO_TERMS.map((term) => (
              <button
                key={term.key}
                className={`memo-term-chip ${selectedTerm === term.key ? 'is-selected' : ''}`}
                style={{ '--term': term.color, '--term-soft': term.soft }}
                type="button"
                aria-pressed={selectedTerm === term.key}
                title={term.hint}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelectedTerm(term.key)
                  setTermError(false)
                  requestAnimationFrame(() => newRef.current?.focus())
                }}
              >
                <span className="memo-term-dot" />
                <span className="memo-term-label">{term.label}</span>
                <span className="memo-term-count">{termCounts[term.key]}</span>
              </button>
            ))}
          </div>
          <p className={`memo-term-help ${termError ? 'is-error' : ''}`} aria-live="polite">
            登録先を選択してください
          </p>
          <MemoComposer
            inputRef={newRef}
            onAdd={onAdd}
            status={statusFilter === 'all' ? 'note' : statusFilter}
            term={selectedTerm}
            onMissingTerm={() => setTermError(true)}
            onAdded={() => {
              setComposerOpen(false)
              setSelectedTerm(null)
              setTermError(false)
            }}
            onCancel={() => {
              if (newRef.current) newRef.current.innerHTML = ''
              setComposerOpen(false)
              setSelectedTerm(null)
              setTermError(false)
            }}
          />
        </div>
      )}

      {/* 装飾ツールバー */}
      <div className="memo-toolbar">
        {FORMATS.map((f) => (
          <button
            key={f.key}
            className={`fmt-btn ${f.cls}`}
            title={f.title}
            // mousedown を抑止して選択範囲を保持したまま装飾を適用。
            onMouseDown={(e) => {
              e.preventDefault()
              applyFormat(f.key)
            }}
          >
            {f.label}
          </button>
        ))}

      </div>

      <div className="memo-board">
        {filteredMemos.map((memo) => (
          <MemoRow
            key={memo.id}
            memo={memo}
            onToggleDone={onToggleDone}
            onEdit={onEdit}
            onEditComment={onEditComment}
            onSetStatus={onSetStatus}
            onSetTerm={onSetTerm}
            onAddMiniTask={onAddMiniTask}
            onToggleMiniTask={onToggleMiniTask}
            onEditMiniTask={onEditMiniTask}
            onDeleteMiniTask={onDeleteMiniTask}
            onReorder={onReorder}
            onArchive={onArchive}
            onDelete={onDelete}
            onOpenDetail={onOpenDetail}
          />
        ))}

        {filteredMemos.length === 0 && (
          <p className="empty memo-empty">
            {memos.length === 0 ? 'メモはありません' : '該当するメモはありません'}
          </p>
        )}
      </div>
    </aside>
  )
}
