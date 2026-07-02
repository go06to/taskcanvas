import { useEffect, useRef, useState } from 'react'
import { linkify } from '../linkify'
import { MEMO_TERMS } from '../constants'

const fmtDate = (iso) => {
  if (!iso) return ''
  const datePart = String(iso).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart.replaceAll('-', '/')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const itemAlarm = (item) => {
  const value = item?.alarmAt || item?.notifyDate
  return value ? String(value).slice(0, 10) : ''
}

const isAlarmDue = (item) => {
  const value = itemAlarm(item)
  if (!value || item?.done) return false
  const time = new Date(value).getTime()
  return !Number.isNaN(time) && time <= Date.now()
}

export const MEMO_STATUSES = [
  { key: 'action', label: 'ACTION', description: '自分が対応する', color: '#c9344f', soft: '#fdecef' },
  { key: 'schedule', label: 'SCHEDULE', description: '予定・日時が決まっている', color: '#2563b8', soft: '#eaf3ff' },
  { key: 'waiting', label: 'WAITING', description: '返答・対応待ち', color: '#a86716', soft: '#fff4df' },
  { key: 'note', label: 'NOTE', description: '情報・メモ', color: '#6656b8', soft: '#f1efff' },
]

const memoStatus = (memo) =>
  MEMO_STATUSES.some((status) => status.key === memo.status) ? memo.status : 'note'

const memoTerm = (memo) =>
  MEMO_TERMS.some((term) => term.key === memo.term) ? memo.term : 'memo'

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

function applyMarker() {
  const active = document.activeElement
  if (active?.tagName === 'TEXTAREA') {
    applyTextareaFormat(active, 'mark')
    return
  }

  document.execCommand('hiliteColor', false, '#fef08a')
  document.execCommand('foreColor', false, '#18181b')
}

function removeMarker() {
  const active = document.activeElement
  if (active?.tagName === 'TEXTAREA') {
    const value = active.value || ''
    const start = active.selectionStart ?? 0
    const end = active.selectionEnd ?? value.length
    const selected = value.slice(start, end).replace(/<\/?mark>/gi, '')
    setNativeValue(active, value.slice(0, start) + selected + value.slice(end))
    requestAnimationFrame(() => {
      active.focus()
      active.setSelectionRange(start, start + selected.length)
    })
    return
  }
  document.execCommand('removeFormat', false, null)
}

function selectionHasMarker() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false

  const range = selection.getRangeAt(0)
  let element =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement

  while (element) {
    if (element.tagName === 'MARK') return true
    const background = getComputedStyle(element).backgroundColor
    if (background === 'rgb(254, 240, 138)') return true
    if (element.isContentEditable) break
    element = element.parentElement
  }

  const commandColor = String(document.queryCommandValue('hiliteColor') || '')
  return commandColor === 'rgb(254, 240, 138)' || commandColor.toLowerCase() === '#fef08a'
}

function toggleMarker() {
  if (selectionHasMarker()) removeMarker()
  else applyMarker()
}

function MemoMiniTask({ memoId, task, onToggle, onEdit, onSetAlarm, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [openAlarm, setOpenAlarm] = useState(false)
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
    <div
      className={`memo-mini-task ${task.done ? 'is-done' : ''} ${
        isAlarmDue(task) ? 'has-alarm-due' : ''
      }`}
    >
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
      <button
        type="button"
        className={`memo-mini-alarm ${itemAlarm(task) ? 'is-set' : ''} ${
          isAlarmDue(task) ? 'is-due' : ''
        }`}
        title={itemAlarm(task) ? `アラーム ${fmtDate(itemAlarm(task))}` : 'アラームを設定'}
        onClick={() => setOpenAlarm((value) => !value)}
      >
        ⏰
      </button>
      {fmtDate(task.createdAt) && (
        <time
          className="memo-mini-created-at"
          dateTime={task.createdAt}
          title="サブタスク登録日時"
        >
          {fmtDate(task.createdAt)}
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
      {openAlarm && (
        <div className="memo-mini-alarm-editor">
          <input
            type="date"
            value={itemAlarm(task)}
            onChange={(e) => onSetAlarm(memoId, task.id, e.target.value || null)}
            aria-label="サブタスクのアラーム日時"
          />
          {itemAlarm(task) && (
            <button type="button" onClick={() => onSetAlarm(memoId, task.id, null)}>
              解除
            </button>
          )}
        </div>
      )}
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
  onSetAlarm,
  onAddMiniTask,
  onToggleMiniTask,
  onEditMiniTask,
  onSetMiniTaskAlarm,
  onDeleteMiniTask,
  onReorder,
  onArchive,
  onDelete,
  isUnlocked = () => true,
  onUnlock,
  onLock,
  onSetPassword,
  onClearPassword,
  searchQuery = '',
}) {
  const ref = useRef(null)
  const [openC, setOpenC] = useState(false)
  const [cDraft, setCDraft] = useState(memo.comment || '')
  const [openMini, setOpenMini] = useState(false)
  const [openAlarm, setOpenAlarm] = useState(false)
  const [miniDraft, setMiniDraft] = useState('')
  const miniTasks = Array.isArray(memo.miniTasks) ? memo.miniTasks : []
  const protectedMemo = Boolean(memo.passwordHash)
  const locked = protectedMemo && !isUnlocked(memo.id)
  const searchNeedle = searchQuery.trim().toLowerCase()
  const searchHaystack = [
    (memo.text || '').replace(/<[^>]*>/g, ' '),
    memo.comment,
    memo.alarmAt,
    ...miniTasks.flatMap((task) => [task.title, task.comment, task.alarmAt]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const searchHit = Boolean(searchNeedle && !locked && searchHaystack.includes(searchNeedle))

  // 初期内容と外部変更の反映（編集中＝フォーカス時は触らない）。
  useEffect(() => {
    const el = ref.current
    if (locked) {
      if (el) el.innerHTML = ''
      return
    }
    if (el && document.activeElement !== el && el.innerHTML !== (memo.text || '')) {
      el.innerHTML = memo.text || ''
    }
  }, [locked, memo.text])

  const save = () => {
    if (locked) return
    const el = ref.current
    if (el && el.innerHTML !== memo.text) onEdit(memo.id, el.innerHTML)
  }

  const saveComment = () => {
    onEditComment(memo.id, cDraft.trim())
    setOpenC(false)
  }

  const addMiniTask = () => {
    if (locked) return
    const title = miniDraft.trim()
    if (!title) return
    onAddMiniTask(memo.id, title)
    setMiniDraft('')
  }

  return (
    <div
      className={`memo-row-wrap ${large ? 'large' : ''}`}
      onDragOver={large || locked ? undefined : (e) => e.preventDefault()}
      onDrop={
        large || locked
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
        } ${isAlarmDue(memo) ? 'has-alarm-due' : ''} ${
          protectedMemo ? 'is-protected' : ''
        } ${locked ? 'is-secret' : ''} ${searchHit ? 'is-search-hit' : ''}`}
      >
        {!large && !locked && (
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
          disabled={locked}
          onChange={() => onToggleDone(memo.id)}
        />
        <div className="memo-content-line">
          {locked ? (
            <div className="memo-secret-placeholder">
              <span className="memo-secret-badge">PW</span>
              <span>PWが必要なタスク</span>
              <button type="button" onClick={() => onUnlock?.(memo.id)}>
                開く
              </button>
            </div>
          ) : (
            <>
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
          <button
            type="button"
            className="memo-title-marker"
            title="選択した文字のマーカーを切り替える"
            aria-label="マーカーを切り替える"
            onMouseDown={(e) => {
              e.preventDefault()
              toggleMarker()
            }}
          >
            <span className="memo-marker-swatch" aria-hidden="true" />
          </button>
          {fmtDate(memo.createdAt) && (
            <time
              className="memo-created-at"
              dateTime={memo.createdAt}
              title="登録日時"
            >
              {fmtDate(memo.createdAt)}
            </time>
          )}
            </>
          )}
        </div>
        {!locked && openC ? (
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
        ) : !locked && memo.comment ? (
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
        {!locked && (openMini || miniTasks.length > 0) && (
          <div className="memo-mini-panel">
            {miniTasks.map((task) => (
              <MemoMiniTask
                key={task.id}
                memoId={memo.id}
                task={task}
                onToggle={onToggleMiniTask}
                onEdit={onEditMiniTask}
                onSetAlarm={onSetMiniTaskAlarm}
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
            disabled={locked}
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
            disabled={locked}
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
          <button
            type="button"
            className={`memo-alarm ${itemAlarm(memo) ? 'is-set' : ''} ${
              isAlarmDue(memo) ? 'is-due' : ''
            }`}
            title={itemAlarm(memo) ? `アラーム ${fmtDate(itemAlarm(memo))}` : 'アラームを設定'}
            onMouseDown={(e) => e.preventDefault()}
            disabled={locked}
            onClick={() => {
              if (!locked) setOpenAlarm((value) => !value)
            }}
          >
            {itemAlarm(memo) ? `⏰ ${fmtDate(itemAlarm(memo))}` : '⏰ アラーム'}
          </button>
          {!locked && openAlarm && (
            <div className="memo-alarm-editor">
              <input
                type="date"
                value={itemAlarm(memo)}
                onChange={(e) => onSetAlarm(memo.id, e.target.value || null)}
                aria-label="MEMOのアラーム日時"
              />
              {itemAlarm(memo) && (
                <button type="button" onClick={() => onSetAlarm(memo.id, null)}>
                  解除
                </button>
              )}
            </div>
          )}
          {!large && (
            <button
              className="memo-expand"
              title="拡大表示"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (locked ? onUnlock?.(memo.id) : onOpenDetail(memo.id))}
            >
              ⤢
            </button>
          )}
          <button
            type="button"
            className={`memo-pw ${protectedMemo ? 'is-set' : ''}`}
            title={protectedMemo ? (locked ? 'PWを入力して開く' : '内容を隠す') : 'PWを設定'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!protectedMemo) onSetPassword?.(memo.id)
              else if (locked) onUnlock?.(memo.id)
              else onLock?.(memo.id)
            }}
          >
            {protectedMemo ? (locked ? 'PW' : '隠す') : 'PW'}
          </button>
          {protectedMemo && !locked && (
            <button
              type="button"
              className="memo-pw-clear"
              title="PWを解除"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onClearPassword?.(memo.id)}
            >
              解除
            </button>
          )}
          <button
            className={`memo-cmt ${memo.comment ? 'has' : ''}`}
            disabled={locked}
            title="コメント"
            aria-label="コメント"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!locked) {
                setCDraft(memo.comment || '')
                setOpenC((v) => !v)
              }
            }}
          >
            <span className="memo-comment-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`memo-mini-toggle ${miniTasks.length ? 'has' : ''}`}
            disabled={locked}
            title="サブタスクを追加"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!locked) setOpenMini((value) => !value)
            }}
          >
            ＋ サブタスク
          </button>
          <button
            className="memo-archive"
            disabled={locked}
            title="完了フォルダへ移動"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!locked) onArchive(memo.id)
            }}
          >
            ✓
          </button>
          <button
            className="memo-del"
            disabled={locked}
            title="削除"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!locked) onDelete(memo.id)
            }}
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
  onSetAlarm,
  onAddMiniTask,
  onToggleMiniTask,
  onEditMiniTask,
  onSetMiniTaskAlarm,
  onDeleteMiniTask,
  onReorder,
  onArchive,
  onDelete,
  isUnlocked,
  onUnlock,
  onLock,
  onSetPassword,
  onClearPassword,
  onOpenDetail,
  onExport,
  statusFilter = 'all',
  termFilter = 'all',
  onStatusFilterChange,
  onTermFilterChange,
  createRequest = 0,
  searchQuery = '',
}) {
  const newRef = useRef(null)
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
  const openComposer = () => {
    if (composerOpen) {
      newRef.current?.focus()
      return
    }
    setComposerOpen(true)
    setSelectedTerm(null)
    setTermError(false)
    requestAnimationFrame(() => newRef.current?.focus())
  }

  useEffect(() => {
    if (!createRequest) return
    openComposer()
  }, [createRequest])

  return (
    <aside className="memo-panel">
      <div className="memo-head">
        <div className="memo-title-group">
          <h2>Task</h2>
          <button
            type="button"
            className="section-export-button"
            onClick={onExport}
            title="TaskフォルダをCSVファイルに書き出す"
          >
            <span aria-hidden="true">↓</span> CSV出力
          </button>
        </div>
        <div className="memo-head-controls">
          <div className="memo-head-counts">
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
                    onTermFilterChange?.(termFilter === term.key ? 'all' : term.key)
                  }
                >
                  <span className="memo-head-term-dot" aria-hidden="true" />
                  <span>{term.label}</span>
                  <strong>{termCounts[term.key]}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="memo-head-actions">
            <select
              className={`memo-status-filter ${statusFilter === 'all' ? '' : `is-${statusFilter}`}`}
              value={statusFilter}
              onChange={(e) => onStatusFilterChange?.(e.target.value)}
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
              className="memo-show-all"
              disabled={statusFilter === 'all' && termFilter === 'all'}
              title="分類とステータスの絞り込みをすべて解除"
              onClick={() => {
                onStatusFilterChange?.('all')
                onTermFilterChange?.('all')
              }}
            >
              全表示
            </button>
            <button
              type="button"
              className="memo-create-entry"
              onClick={openComposer}
            >
              ＋ 作成
            </button>
            <span className="memo-count">残り {remaining}</span>
          </div>
        </div>
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
            onSetAlarm={onSetAlarm}
            onAddMiniTask={onAddMiniTask}
            onToggleMiniTask={onToggleMiniTask}
            onEditMiniTask={onEditMiniTask}
            onSetMiniTaskAlarm={onSetMiniTaskAlarm}
            onDeleteMiniTask={onDeleteMiniTask}
            onReorder={onReorder}
            onArchive={onArchive}
            onDelete={onDelete}
            isUnlocked={isUnlocked}
            onUnlock={onUnlock}
            onLock={onLock}
            onSetPassword={onSetPassword}
            onClearPassword={onClearPassword}
            onOpenDetail={onOpenDetail}
            searchQuery={searchQuery}
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
