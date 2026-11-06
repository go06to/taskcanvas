import { useEffect, useRef, useState } from 'react'
import { linkify } from '../linkify'

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

export const isAlarmDue = (item) => {
  const value = itemAlarm(item)
  if (!value || item?.done) return false
  const time = new Date(value).getTime()
  return !Number.isNaN(time) && time <= Date.now()
}

// タスクの進み具合。未対応 → 対応中 → 返事待ち → 完了（チェック）の順に進める。
export const MEMO_STATUSES = [
  { key: 'todo', label: '未対応', description: 'まだ手を付けていない', color: '#c9344f', soft: '#fdecef' },
  { key: 'doing', label: '対応中', description: '対応を進めている', color: '#2563b8', soft: '#eaf3ff' },
  { key: 'waiting', label: '返事待ち', description: '相手の返事・対応を待っている', color: '#a86716', soft: '#fff4df' },
]

// 絞り込みで使う「期限が来た」。ステータスとは別に、期限の日付で判断する。
export const OVERDUE_FILTER = {
  key: 'overdue',
  label: '期限が来た',
  description: '期限の日になった・過ぎたタスク',
  color: '#dc2626',
  soft: '#fef2f2',
}

// 絞り込みで使う「★ MARK」。目立たせたいタスクに付ける（フリースペースの MARK と同じ考え方）。
export const MARK_FILTER = {
  key: 'marked',
  label: '★ MARK',
  description: 'MARK を付けたタスク',
  color: '#d97706',
  soft: '#fef3c7',
}

// 以前のステータス（ACTION / SCHEDULE / NOTE）は「未対応」、WAITING は「返事待ち」として扱う。
export const memoStatus = (memo) =>
  MEMO_STATUSES.some((status) => status.key === memo?.status) ? memo.status : 'todo'

export const matchesMemoFilter = (memo, filter) => {
  if (!filter || filter === 'all') return true
  if (filter === OVERDUE_FILTER.key) return isAlarmDue(memo)
  if (filter === MARK_FILTER.key) return Boolean(memo.marked)
  return memoStatus(memo) === filter
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

// 相手欄の電話番号を見つけて、タップで電話をかけられるリンクにする。
const PHONE_RE = /(0\d{1,4}[-‐ー−\s]?\d{1,4}[-‐ー−\s]?\d{3,4})/g

function ContactText({ text }) {
  return String(text)
    .split(PHONE_RE)
    .map((part, index) =>
      index % 2 === 1 ? (
        <a
          key={index}
          className="memo-contact-tel"
          href={`tel:${part.replace(/[^\d]/g, '')}`}
          title="タップで電話をかける"
          onClick={(e) => e.stopPropagation()}
        >
          📞 {part}
        </a>
      ) : (
        part
      ),
    )
}

const fmtLogTime = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

// 対応の記録でよく使う言葉（1回押すだけで記録できる）。
const LOG_PRESETS = ['折り返し済み', '留守電を残した', 'メール送信', '見積送付', '資料送付']

// 1行のリッチテキスト編集（contentEditable）。直接書き込み・装飾・コメント。
export function MemoRow({
  memo,
  large,
  reorderable = true,
  onOpenDetail,
  onToggleDone,
  onEdit,
  onEditComment,
  onSetStatus,
  onSetContact,
  onToggleMark,
  onAddLog,
  onDeleteLog,
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
  const [openContact, setOpenContact] = useState(false)
  const [contactDraft, setContactDraft] = useState(memo.contact || '')
  const [openLog, setOpenLog] = useState(false)
  const [logDraft, setLogDraft] = useState('')
  const [showAllLogs, setShowAllLogs] = useState(false)
  const miniTasks = Array.isArray(memo.miniTasks) ? memo.miniTasks : []
  const logs = Array.isArray(memo.logs) ? memo.logs : []
  const visibleLogs = large || showAllLogs ? logs : logs.slice(-3)
  const hiddenLogCount = logs.length - visibleLogs.length
  const protectedMemo = Boolean(memo.passwordHash)
  const locked = protectedMemo && !isUnlocked(memo.id)
  const searchNeedle = searchQuery.trim().toLowerCase()
  const searchHaystack = [
    (memo.text || '').replace(/<[^>]*>/g, ' '),
    memo.comment,
    memo.contact,
    ...logs.map((log) => log.text),
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

  const saveContact = () => {
    if (!locked && contactDraft.trim() !== (memo.contact || '')) {
      onSetContact?.(memo.id, contactDraft)
    }
    setOpenContact(false)
  }

  const addLog = (text) => {
    if (locked) return
    const value = String(text || '').trim()
    if (!value) return
    onAddLog?.(memo.id, value)
    setLogDraft('')
    setOpenLog(false)
  }

  const hasExtras =
    !locked &&
    Boolean(
      openContact ||
        memo.contact ||
        openC ||
        memo.comment ||
        openLog ||
        logs.length ||
        openMini ||
        miniTasks.length,
    )

  return (
    <div
      className={`memo-row-wrap ${large ? 'large' : ''}`}
      onDragOver={large || locked || !reorderable ? undefined : (e) => e.preventDefault()}
      onDrop={
        large || locked || !reorderable
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
        } ${hasExtras ? 'has-extras' : ''} ${isAlarmDue(memo) ? 'has-alarm-due' : ''} ${
          protectedMemo ? 'is-protected' : ''
        } ${locked ? 'is-secret' : ''} ${searchHit ? 'is-search-hit' : ''} ${
          memo.marked && !locked ? 'is-marked' : ''
        }`}
      >
        {!large && !locked && !reorderable && <span className="memo-drag is-off" aria-hidden="true" />}
        {!large && !locked && reorderable && (
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
          <button
            type="button"
            className={`memo-mark-toggle ${memo.marked ? 'on' : ''}`}
            aria-pressed={Boolean(memo.marked)}
            title={memo.marked ? 'MARK を外す' : 'MARK を付けて目立たせる'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onToggleMark?.(memo.id)}
          >
            {memo.marked ? '★' : '☆'}
          </button>
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
        {hasExtras && (
          <div className="memo-extras">
            {openContact ? (
              <input
                className="memo-contact-edit"
                value={contactDraft}
                autoFocus
                placeholder="相手（例：○○介護センター 田中様 03-1234-5678）"
                onChange={(e) => setContactDraft(e.target.value)}
                onBlur={saveContact}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    saveContact()
                  }
                  if (e.key === 'Escape') {
                    setContactDraft(memo.contact || '')
                    setOpenContact(false)
                  }
                }}
              />
            ) : memo.contact ? (
              <div
                className="memo-contact"
                title="クリックで相手を編集"
                onClick={() => {
                  setContactDraft(memo.contact || '')
                  setOpenContact(true)
                }}
              >
                <span className="memo-contact-icon" aria-hidden="true">
                  👤
                </span>
                <span className="memo-contact-text">
                  <ContactText text={memo.contact} />
                </span>
              </div>
            ) : null}

            {openC ? (
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
                コメント{' '}
                {memo.commentUpdatedAt && (
                  <span className="comment-date">{fmtDate(memo.commentUpdatedAt)}</span>
                )}
                {linkify(memo.comment)}
              </div>
            ) : null}

            {(logs.length > 0 || openLog) && (
              <div className="memo-logs" aria-label="対応の記録">
                {hiddenLogCount > 0 && (
                  <button
                    type="button"
                    className="memo-logs-more"
                    onClick={() => setShowAllLogs(true)}
                  >
                    以前の記録をあと {hiddenLogCount} 件見る
                  </button>
                )}
                {visibleLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`memo-log ${log.kind === 'status' ? 'is-status' : ''}`}
                  >
                    <time className="memo-log-time" dateTime={log.at}>
                      {fmtLogTime(log.at)}
                    </time>
                    <span className="memo-log-text">{log.text}</span>
                    <button
                      type="button"
                      className="memo-log-delete"
                      title="この記録を消す"
                      onClick={() => onDeleteLog?.(memo.id, log.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {openLog && (
                  <div className="memo-log-add">
                    <div className="memo-log-presets">
                      {LOG_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addLog(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="memo-log-input">
                      <input
                        value={logDraft}
                        autoFocus
                        placeholder="記録を書く（例：11日に再度連絡すると伝えた）"
                        onChange={(e) => setLogDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) addLog(logDraft)
                          if (e.key === 'Escape') {
                            setLogDraft('')
                            setOpenLog(false)
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => addLog(logDraft)}
                        disabled={!logDraft.trim()}
                      >
                        記録
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(openMini || miniTasks.length > 0) && (
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
          </div>
        )}
        <div className="memo-row-actions">
          <select
            className={`memo-status is-${memoStatus(memo)}`}
            value={memoStatus(memo)}
            disabled={locked}
            onChange={(e) => onSetStatus(memo.id, e.target.value)}
            aria-label="タスクの進み具合"
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
          {!memo.contact && (
            <button
              type="button"
              className="memo-contact-toggle"
              disabled={locked}
              title="相手（会社名・担当者・電話番号）を書く"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (locked) return
                setContactDraft('')
                setOpenContact((value) => !value)
              }}
            >
              👤 相手
            </button>
          )}
          <button
            type="button"
            className={`memo-log-toggle ${logs.some((log) => log.kind !== 'status') ? 'has' : ''}`}
            disabled={locked}
            title="対応の記録を残す（折り返し済み・見積送付など）"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!locked) setOpenLog((value) => !value)
            }}
          >
            📝 記録
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

    </div>
  )
}

// 左側のフリーメモボード。ボードに直接書き込め、選択文字に装飾もかけられる。
export default function MemoPanel({
  memos,
  onToggleDone,
  onEdit,
  onEditComment,
  onSetStatus,
  onSetContact,
  onToggleMark,
  onAddLog,
  onDeleteLog,
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
  onStatusFilterChange,
  sortMode = 'manual',
  onSortModeChange,
  onCreate,
  searchQuery = '',
}) {
  const remaining = memos.filter((m) => !m.done).length
  const matched = memos.filter((memo) => matchesMemoFilter(memo, statusFilter))
  // 期限順：期限が近い順（期限なしは後ろ）。同じ期限なら手動の並び順のまま。
  const filteredMemos =
    sortMode === 'due'
      ? matched
          .map((memo, index) => ({ memo, index, due: itemAlarm(memo) }))
          .sort((a, b) => {
            if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
            if (Boolean(a.due) !== Boolean(b.due)) return a.due ? -1 : 1
            return a.index - b.index
          })
          .map((entry) => entry.memo)
      : matched
  const filterOptions = [...MEMO_STATUSES, OVERDUE_FILTER, MARK_FILTER].map((option) => ({
    ...option,
    count: memos.filter((memo) => !memo.done && matchesMemoFilter(memo, option.key)).length,
  }))
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
          <div className="memo-sort-switch" role="group" aria-label="並び順">
            <button
              type="button"
              className={sortMode === 'manual' ? 'is-active' : ''}
              aria-pressed={sortMode === 'manual'}
              title="ドラッグで並べた順"
              onClick={() => onSortModeChange?.('manual')}
            >
              手動
            </button>
            <button
              type="button"
              className={sortMode === 'due' ? 'is-active' : ''}
              aria-pressed={sortMode === 'due'}
              title="期限が近い順（期限なしは最後）"
              onClick={() => onSortModeChange?.('due')}
            >
              期限順
            </button>
          </div>
        </div>
        <div className="memo-head-controls">
          <div className="memo-head-counts">
            <div className="memo-head-term-counts" aria-label="進み具合で絞り込む">
              {filterOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`memo-head-term-count ${statusFilter === option.key ? 'is-active' : ''}`}
                  style={{ '--term': option.color, '--term-soft': option.soft }}
                  title={`${option.description}（クリックで絞り込み${statusFilter === option.key ? '解除' : ''}）`}
                  aria-pressed={statusFilter === option.key}
                  onClick={() =>
                    onStatusFilterChange?.(statusFilter === option.key ? 'all' : option.key)
                  }
                >
                  <span className="memo-head-term-dot" aria-hidden="true" />
                  <span>{option.label}</span>
                  <strong>{option.count}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="memo-head-actions">
            <button
              type="button"
              className="memo-show-all"
              disabled={statusFilter === 'all'}
              title="絞り込みを解除"
              onClick={() => onStatusFilterChange?.('all')}
            >
              すべて表示
            </button>
            <button
              type="button"
              className="memo-create-entry"
              onClick={onCreate}
            >
              ＋ 作成
            </button>
            <span className="memo-count">残り {remaining}</span>
          </div>
        </div>
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
            onSetContact={onSetContact}
            onToggleMark={onToggleMark}
            onAddLog={onAddLog}
            onDeleteLog={onDeleteLog}
            onSetAlarm={onSetAlarm}
            onAddMiniTask={onAddMiniTask}
            onToggleMiniTask={onToggleMiniTask}
            onEditMiniTask={onEditMiniTask}
            onSetMiniTaskAlarm={onSetMiniTaskAlarm}
            onDeleteMiniTask={onDeleteMiniTask}
            onReorder={onReorder}
            reorderable={sortMode === 'manual'}
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
