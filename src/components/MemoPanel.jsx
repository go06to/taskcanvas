import { useEffect, useRef, useState } from 'react'
import { linkify } from '../linkify'

const fmtDate = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

// メモ欄の幅プリセット（横並びレイアウト時に有効）。
// w が null の「全幅」はボードを隠してメモを横いっぱいに表示する。
const SIZES = [
  { key: 's', label: '小', w: 380 },
  { key: 'm', label: '標準', w: 480 },
  { key: 'l', label: '大', w: 620 },
  { key: 'xl', label: '最大', w: '50vw' },
]

// 装飾ボタンの定義。マーカーだけ背景色＋文字色をまとめて適用する。
const FORMATS = [
  { key: 'bold', label: 'B', title: '太字', cls: 'fb-bold' },
  { key: 'strikeThrough', label: 'S', title: '取り消し線', cls: 'fb-strike' },
  { key: 'underline', label: 'U', title: '下線', cls: 'fb-under' },
  { key: 'marker', label: '🖍', title: 'マーカー', cls: 'fb-marker' },
]

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
    document.execCommand('hiliteColor', false, '#fde047')
    document.execCommand('foreColor', false, '#1a1a1a')
  } else {
    document.execCommand(key, false, null)
  }
}

// 1行のリッチテキスト編集（contentEditable）。直接書き込み・装飾・コメント。
export function MemoRow({
  memo,
  large,
  onOpenDetail,
  onToggleDone,
  onEdit,
  onEditComment,
  onReorder,
  onPromote,
  onArchive,
  onDelete,
}) {
  const ref = useRef(null)
  const [openC, setOpenC] = useState(false)
  const [cDraft, setCDraft] = useState(memo.comment || '')

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
        } ${openC || memo.comment ? 'has-comment' : ''}`}
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
            {'\uD83D\uDCAC '}
            {memo.commentUpdatedAt && (
              <span className="comment-date">{fmtDate(memo.commentUpdatedAt)}</span>
            )}
            {linkify(memo.comment)}
          </div>
        ) : null}
        <div className="memo-row-actions">
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
            className="memo-to-sprint"
            title="SPRINTのタスクへ移動"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPromote(memo.id, 'short')}
          >
            SPRINTへ
          </button>
          <button
            className={`memo-cmt ${memo.comment ? 'has' : ''}`}
            title="コメント"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setCDraft(memo.comment || '')
              setOpenC((v) => !v)
            }}
          >
            💬
          </button>
          <button
            className="memo-archive"
            title="完了フォルダへ移動"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onArchive(memo.id)}
          >
            📥
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
          💬 {linkify(memo.comment)}
        </div>
      ) : null)}
    </div>
  )
}

// 末尾の「直接書き込む」行。Enter で確定して続けて書ける。
function MemoNewLine({ inputRef, onAdd }) {
  const commit = (keepFocus) => {
    const el = inputRef.current
    if (!el) return
    if (el.textContent.trim()) onAdd(el.innerHTML)
    el.innerHTML = ''
    if (keepFocus) requestAnimationFrame(() => el.focus())
  }

  return (
    <div className="memo-row memo-new">
      <span className="memo-cb-ghost" aria-hidden="true" />
      <div
        ref={inputRef}
        className="memo-rich"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="ここに直接書き込み…"
        onBlur={() => commit(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            commit(true)
          }
        }}
      />
    </div>
  )
}

// 左側のフリーメモボード。ボードに直接書き込め、選択文字に装飾もかけられる。
export default function MemoPanel({
  memos,
  size,
  onSizeChange,
  onAdd,
  onToggleDone,
  onEdit,
  onEditComment,
  onReorder,
  onPromote,
  onArchive,
  onDelete,
  onOpenDetail,
}) {
  const newRef = useRef(null)
  const remaining = memos.filter((m) => !m.done).length
  const width = (SIZES.find((s) => s.key === size) || SIZES[1]).w
  const widthValue = typeof width === 'number' ? `${width}px` : width

  return (
    <aside
      className="memo-panel"
      style={widthValue ? { '--memo-w': widthValue } : undefined}
    >
      <div className="memo-head">
        <h2>
          <span className="memo-icon">📝</span> MEMO
        </h2>
        <span className="memo-count">残り {remaining}</span>
      </div>

      {/* 装飾ツールバー（左）＋ メモ幅の切替（右） */}
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

        <div className="memo-size" title="メモ欄の幅">
          {SIZES.map((s) => (
            <button
              key={s.key}
              className={`size-btn ${size === s.key ? 'active' : ''}`}
              onClick={() => onSizeChange(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="memo-board"
        onClick={(e) => {
          if (e.target.classList.contains('memo-board')) newRef.current?.focus()
        }}
      >
        <MemoNewLine inputRef={newRef} onAdd={onAdd} />

        {memos.map((memo) => (
          <MemoRow
            key={memo.id}
            memo={memo}
            onToggleDone={onToggleDone}
            onEdit={onEdit}
            onEditComment={onEditComment}
            onReorder={onReorder}
            onPromote={onPromote}
            onArchive={onArchive}
            onDelete={onDelete}
            onOpenDetail={onOpenDetail}
          />
        ))}

        {memos.length === 0 && <p className="empty memo-empty">メモはありません</p>}
      </div>
    </aside>
  )
}
