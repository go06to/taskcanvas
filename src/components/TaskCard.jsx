import { useRef, useState } from 'react'
import { TERMS, PRIORITY_MAP } from '../constants'
import { isDue, isToday, fmtMD } from '../dateUtils'
import { linkify } from '../linkify'

const fmtDate = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const applyCommentFormat = (tag, value, setValue, ref) => {
  const el = ref.current
  if (!el) return
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const selected = value.slice(start, end)
  const open = `<${tag}>`
  const close = `</${tag}>`
  const insert = selected ? `${open}${selected}${close}` : `${open}${close}`
  const next = value.slice(0, start) + insert + value.slice(end)
  const cursorStart = selected ? start : start + open.length
  const cursorEnd = selected ? start + insert.length : cursorStart
  setValue(next)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(cursorStart, cursorEnd)
  })
}

const applyStrike = (value, setValue, ref) =>
  applyCommentFormat('s', value, setValue, ref)

function CommentEditor({
  value,
  setValue,
  onSave,
  onCancel,
  className,
  rows,
  placeholder,
  inputRef,
  showToolbar = true,
}) {
  const localRef = useRef(null)
  const ref = inputRef || localRef

  return (
    <div className="comment-editor">
      {showToolbar && (
        <div className="comment-formatbar">
        <button
          type="button"
          className="comment-format-btn cf-bold"
          title="コメントの選択文字を太字"
          onMouseDown={(e) => {
            e.preventDefault()
            applyCommentFormat('b', value, setValue, ref)
          }}
        >
          B
        </button>
        <button
          type="button"
          className="comment-format-btn cf-strike"
          title="選択した文字に取り消し線"
          onMouseDown={(e) => {
            e.preventDefault()
            applyStrike(value, setValue, ref)
          }}
        >
          S
        </button>
        <button
          type="button"
          className="comment-format-btn cf-under"
          title="コメントの選択文字に下線"
          onMouseDown={(e) => {
            e.preventDefault()
            applyCommentFormat('u', value, setValue, ref)
          }}
        >
          U
        </button>
        <button
          type="button"
          className="comment-format-btn cf-marker"
          title="コメントの選択文字にマーカー"
          onMouseDown={(e) => {
            e.preventDefault()
            applyCommentFormat('mark', value, setValue, ref)
          }}
        >
          M
        </button>
        </div>
      )}
      <textarea
        ref={ref}
        className={className}
        value={value}
        autoFocus
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      />
    </div>
  )
}

// 追加タスク（サブタスク）1行。チェック・編集・コメント・削除。
function Subtask({ taskId, sub, onToggle, onEdit, onEditComment, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sub.title)
  const [openC, setOpenC] = useState(false)
  const [cDraft, setCDraft] = useState(sub.comment || '')

  const save = () => {
    const t = draft.trim()
    if (t) onEdit(taskId, sub.id, t)
    else setDraft(sub.title)
    setEditing(false)
  }
  const saveComment = () => {
    onEditComment(taskId, sub.id, cDraft.trim())
    setOpenC(false)
  }

  return (
    <div className="subtask-wrap">
      <div className={`subtask ${sub.done ? 'is-done' : ''}`}>
        <input
          type="checkbox"
          checked={sub.done}
          onChange={() => onToggle(taskId, sub.id)}
        />
        {editing ? (
          <input
            className="sub-edit"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setDraft(sub.title)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span
            className="sub-text"
            title="クリックで編集"
            onClick={() => {
              setDraft(sub.title)
              setEditing(true)
            }}
          >
            {linkify(sub.title)}
          </span>
        )}
        {sub.createdAt && <span className="sub-date">{fmtDate(sub.createdAt)}</span>}
        <button
          className={`sub-cmt ${sub.comment ? 'has' : ''}`}
          title="コメント"
          onClick={() => {
            setCDraft(sub.comment || '')
            setOpenC((v) => !v)
          }}
        >
          💬
        </button>
        <button
          className="sub-del"
          title="削除"
          onClick={() => onDelete(taskId, sub.id)}
        >
          ×
        </button>
      </div>

      {openC ? (
        <CommentEditor
          className="sub-comment-edit"
          value={cDraft}
          setValue={setCDraft}
          rows={Math.max(1, cDraft.split('\n').length)}
          placeholder="コメントを入力"
          onSave={saveComment}
          onCancel={() => {
            setCDraft(sub.comment || '')
            setOpenC(false)
          }}
        />
      ) : sub.comment ? (
        <div
          className="sub-comment"
          title="クリックで編集"
          onClick={() => {
            setCDraft(sub.comment)
            setOpenC(true)
          }}
        >
          {'\uD83D\uDCAC '}
          {sub.commentUpdatedAt && (
            <span className="comment-date">{fmtDate(sub.commentUpdatedAt)}</span>
          )}
          {linkify(sub.comment)}
        </div>
      ) : null}
    </div>
  )
}

export default function TaskCard({
  task,
  large,
  onOpenDetail,
  onToggleDone,
  onChangeTerm,
  onArchive,
  onDelete,
  onSetNotify,
  onTogglePin,
  onSetPriority,
  onToggleRepeat,
  onReorder,
  onEditTitle,
  onEditComment,
  onAddSubtask,
  onToggleSubtask,
  onEditSubtask,
  onEditSubComment,
  onDeleteSubtask,
}) {
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [subDraft, setSubDraft] = useState('')
  const [openSub, setOpenSub] = useState(false)
  const [openNotify, setOpenNotify] = useState(false)
  const [openComment, setOpenComment] = useState(false)
  const [commentDraft, setCommentDraft] = useState(task.comment || '')
  const commentRef = useRef(null)

  const due = !task.done && isDue(task.notifyDate)
  const prio = PRIORITY_MAP[task.priority]
  const taskCommentDate = task.commentUpdatedAt || (task.comment ? task.createdAt : null)

  const saveTitle = () => {
    if (titleDraft.trim()) onEditTitle(task.id, titleDraft.trim())
    else setTitleDraft(task.title)
    setEditing(false)
  }
  const submitSub = () => {
    onAddSubtask(task.id, subDraft)
    setSubDraft('')
  }
  const saveComment = () => {
    onEditComment(task.id, commentDraft.trim())
    setOpenComment(false)
  }
  const formatComment = (tag) => {
    const value = openComment ? commentDraft : task.comment || ''
    if (!openComment) {
      setCommentDraft(value)
      setOpenComment(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() =>
          applyCommentFormat(tag, value, setCommentDraft, commentRef),
        )
      })
      return
    }
    applyCommentFormat(tag, value, setCommentDraft, commentRef)
  }
  const strikeComment = () => formatComment('s')

  const doneSubs = task.subtasks.filter((s) => s.done).length
  const notifyEdit = (
    <div className="notify-edit notify-edit-inline">
      <input
        type="date"
        value={task.notifyDate || ''}
        onChange={(e) => onSetNotify(task.id, e.target.value || null)}
      />
      {task.notifyDate && (
        <button
          className="mini"
          onClick={() => onSetNotify(task.id, null)}
          title={'\u89e3\u9664'}
        >
          {'\u30af\u30ea\u30a2'}
        </button>
      )}
    </div>
  )
  const metaInline = (
    <div className="card-meta card-meta-inline">
      <span className="date">{fmtDate(task.createdAt)}</span>
      <button
        className={`notify-chip ${due ? 'due' : ''} ${task.notifyDate ? 'set' : ''}`}
        onClick={() => setOpenNotify((v) => !v)}
        title={'\u901a\u77e5\u65e5\u3092\u8a2d\u5b9a\u30fb\u5909\u66f4'}
      >
        {task.notifyDate ? fmtMD(task.notifyDate) : '\u901a\u77e5'}
        {due && (isToday(task.notifyDate) ? '\u30fb\u4eca\u65e5' : '\u30fb\u7d4c\u904e')}
      </button>
      {openNotify && notifyEdit}
      {prio && (
        <span
          className="prio-flag"
          style={{
            color: prio.color,
            borderColor: prio.color,
            background: `color-mix(in srgb, ${prio.color} 16%, transparent)`,
          }}
        >
          {prio.label}
        </span>
      )}
      {task.repeat && <span className="repeat-flag">{'\u7e70\u308a\u8fd4\u3057'}</span>}
      {task.subtasks.length > 0 && (
        <span className="sub-progress">
          {doneSubs}/{task.subtasks.length}
        </span>
      )}
    </div>
  )

  return (
    <article
      className={`card ${task.done ? 'is-done' : ''} ${due ? 'is-due' : ''} ${
        task.pinned ? 'pinned' : ''
      } prio-${task.priority || 0} ${large ? 'large' : ''}`}
      onDragOver={large ? undefined : (e) => e.preventDefault()}
      onDrop={
        large
          ? undefined
          : (e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              if (id && id !== task.id) onReorder(id, task.id)
            }
      }
    >
      <div className="card-top">
        {!large && (
          <span
            className="drag-handle"
            title="ドラッグで並び替え／タブへ移動"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', task.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            ⠿
          </span>
        )}
        <button
          className="check"
          title={task.done ? '完了を取り消す' : '完了にする'}
          onClick={() => onToggleDone(task.id)}
        >
          {task.done ? '✓' : ''}
        </button>

        {editing ? (
          <textarea
            className="title-edit"
            value={titleDraft}
            autoFocus
            rows={Math.max(2, titleDraft.split('\n').length)}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveTitle()
              if (e.key === 'Escape') {
                setTitleDraft(task.title)
                setEditing(false)
              }
            }}
          />
        ) : (
          <h3
            className="card-title"
            title="ダブルクリックで編集"
            onDoubleClick={() => setEditing(true)}
          >
            {linkify(task.title)}
          </h3>
        )}

        {metaInline}

        <button
          className={`pin ${task.pinned ? 'on' : ''}`}
          title={task.pinned ? 'ピンを外す' : 'ピン留め（先頭に固定）'}
          onClick={() => onTogglePin(task.id)}
        >
          📌
        </button>
      </div>

      <div className="card-meta">
        <span className="date">🗓 {fmtDate(task.createdAt)}</span>
        <button
          className={`notify-chip ${due ? 'due' : ''} ${task.notifyDate ? 'set' : ''}`}
          onClick={() => setOpenNotify((v) => !v)}
          title="お知らせ日付を設定／変更"
        >
          🔔 {task.notifyDate ? fmtMD(task.notifyDate) : '通知'}
          {due && (isToday(task.notifyDate) ? '・今日' : '・経過')}
        </button>
        {prio && (
          <span
            className="prio-flag"
            style={{
              color: prio.color,
              borderColor: prio.color,
              background: `color-mix(in srgb, ${prio.color} 16%, transparent)`,
            }}
          >
            🚩 {prio.label}
          </span>
        )}
        {task.repeat && <span className="repeat-flag">🔁 繰り返し</span>}
        {task.subtasks.length > 0 && (
          <span className="sub-progress">
            {doneSubs}/{task.subtasks.length}
          </span>
        )}
      </div>

      {openNotify && (
        <div className="notify-edit">
          <input
            type="date"
            value={task.notifyDate || ''}
            onChange={(e) => onSetNotify(task.id, e.target.value || null)}
          />
          {task.notifyDate && (
            <button
              className="mini"
              onClick={() => onSetNotify(task.id, null)}
              title="解除"
            >
              クリア
            </button>
          )}
        </div>
      )}

      {(task.comment || openComment) && (
        <div className="task-comment">
          {openComment ? (
            <CommentEditor
              className="comment-edit"
              value={commentDraft}
              setValue={setCommentDraft}
              inputRef={commentRef}
              showToolbar={false}
              rows={Math.max(2, commentDraft.split('\n').length)}
              placeholder="コメントを入力（URLはリンクになります）"
              onSave={saveComment}
              onCancel={() => {
                setCommentDraft(task.comment || '')
                setOpenComment(false)
              }}
            />
          ) : (
            <div
              className="comment-note"
              title="クリックで編集"
              onClick={() => {
                setCommentDraft(task.comment)
                setOpenComment(true)
              }}
            >
              {'\uD83D\uDCAC '}
              {taskCommentDate && (
                <span className="comment-date">{fmtDate(taskCommentDate)}</span>
              )}
              {linkify(task.comment)}
            </div>
          )}
        </div>
      )}

      {(task.subtasks.length > 0 || openSub) && (
        <div className="subtasks">
          {task.subtasks.map((s) => (
            <Subtask
              key={s.id}
              taskId={task.id}
              sub={s}
              onToggle={onToggleSubtask}
              onEdit={onEditSubtask}
              onEditComment={onEditSubComment}
              onDelete={onDeleteSubtask}
            />
          ))}
          {openSub && (
            <div className="sub-add">
              <input
                value={subDraft}
                placeholder="追加タスクを入力"
                autoFocus
                onChange={(e) => setSubDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSub()}
              />
              <button onClick={submitSub} disabled={!subDraft.trim()}>
                追加
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card-actions">
        {!large && (
          <button
            className="mini"
            title="拡大表示"
            onClick={() => onOpenDetail(task.id)}
          >
            ⤢ 拡大
          </button>
        )}
        <button className="mini" onClick={() => setOpenSub((v) => !v)}>
          ＋追加
        </button>
        <button
          className="mini cf-bold"
          title="コメントの選択文字を太字"
          onMouseDown={(e) => {
            e.preventDefault()
            formatComment('b')
          }}
        >
          B
        </button>
        <button
          className="mini cf-strike"
          title="コメントの選択文字に取り消し線"
          onMouseDown={(e) => {
            e.preventDefault()
            strikeComment()
          }}
        >
          S
        </button>
        <button
          className="mini cf-under"
          title="コメントの選択文字に下線"
          onMouseDown={(e) => {
            e.preventDefault()
            formatComment('u')
          }}
        >
          U
        </button>
        <button
          className="mini cf-marker"
          title="コメントの選択文字にマーカー"
          onMouseDown={(e) => {
            e.preventDefault()
            formatComment('mark')
          }}
        >
          M
        </button>
        <button
          className={`mini ${task.comment ? 'has-cmt' : ''}`}
          title="コメント"
          onClick={() => {
            setCommentDraft(task.comment || '')
            setOpenComment((v) => !v)
          }}
        >
          💬
        </button>
        <button
          className="mini"
          title="優先度を変更"
          style={prio ? { color: prio.color, borderColor: prio.color } : undefined}
          onClick={() => onSetPriority(task.id, ((task.priority || 0) + 1) % 4)}
        >
          🚩 {prio ? prio.label : '—'}
        </button>
        <button
          className={`mini ${task.repeat ? 'on-rep' : ''}`}
          title="完了時に繰り返し生成"
          onClick={() => onToggleRepeat(task.id)}
        >
          🔁
        </button>

        {TERMS.filter((t) => t.key !== task.term).map((t) => (
          <button
            key={t.key}
            className="mini move"
            style={{ color: t.color, borderColor: t.color }}
            title={`${t.label}へ移動`}
            onClick={() => onChangeTerm(task.id, t.key)}
          >
            {t.label}へ
          </button>
        ))}

        <div className="card-right">
          <button
            className="mini complete"
            title="完了フォルダへ移動"
            onClick={() => onArchive(task.id)}
          >
            完了
          </button>
          <button
            className="mini danger"
            title="削除"
            onClick={() => onDelete(task.id)}
          >
            🗑
          </button>
        </div>
      </div>
    </article>
  )
}
