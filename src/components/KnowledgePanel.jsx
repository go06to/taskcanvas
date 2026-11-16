import { useEffect, useMemo, useState } from 'react'

const COLORS = [
  { key: 'white', label: '白', value: '#ffffff', accent: '#64748b' },
  { key: 'gray', label: '薄いグレー', value: '#f4f4f5', accent: '#71717a' },
  { key: 'slate', label: 'グレー', value: '#e9eaec', accent: '#475569' },
  { key: 'blue', label: '薄い青', value: '#eaf2ff', accent: '#3b82f6' },
  { key: 'cyan', label: '水色', value: '#e6f9fb', accent: '#06b6d4' },
  { key: 'green', label: 'ミント', value: '#e8f7ef', accent: '#10b981' },
  { key: 'yellow', label: '黄色', value: '#fff8d9', accent: '#eab308' },
  { key: 'orange', label: 'オレンジ', value: '#fff0df', accent: '#f97316' },
  { key: 'pink', label: 'ピンク', value: '#fcebf3', accent: '#ec4899' },
  { key: 'purple', label: '紫', value: '#f2edff', accent: '#8b5cf6' },
]

const defaultColor = COLORS[0].value

// エフェクトは「MARK」（★で目立たせる）だけ。以前の発光・パルスなどが付いていたメモも MARK として扱う。
const HIGHLIGHT = 'highlight'
const isHighlighted = (item) => Boolean(item?.effect && item.effect !== 'none')

const LEGACY_COLORS = {
  '#fff4bf': '#fff8d9',
  '#dff6ea': '#e8f7ef',
  '#dfeeff': '#eaf2ff',
  '#f8e1ec': '#fcebf3',
  '#eee7ff': '#f2edff',
}

const noteColor = (color) =>
  COLORS.some((option) => option.value === color)
    ? color
    : LEGACY_COLORS[color] || defaultColor
const noteAccent = (color) =>
  COLORS.find((option) => option.value === noteColor(color))?.accent || COLORS[0].accent

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const parseTags = (value) =>
  String(value || '')
    .split(/[,\s　]+/)
    .map((x) => x.trim())
    .filter(Boolean)

const tagsToText = (tags) => (Array.isArray(tags) ? tags.join(' ') : '')

// 「完了」「不要」にしたメモは消さずに、一覧の下の「完了・不要」の欄にまとめる。
export const SETTLE_OPTIONS = [
  { key: 'done', label: '完了', icon: '✓', hint: '終わったメモ' },
  { key: 'unneeded', label: '不要', icon: '－', hint: 'もう使わないメモ' },
]
export const settledOf = (item) =>
  SETTLE_OPTIONS.find((option) => option.key === item?.settled) || null

function SettleButtons({ onSettle, className = '' }) {
  return (
    <div className={`knowledge-settle ${className}`}>
      {SETTLE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`knowledge-settle-btn is-${option.key}`}
          title={`${option.hint}として、下の「完了・不要」にまとめる`}
          onClick={(e) => {
            e.stopPropagation()
            onSettle(option.key)
          }}
        >
          {option.icon} {option.label}
        </button>
      ))}
    </div>
  )
}

const searchHitOf = (item, searchQuery) => {
  const needle = searchQuery.trim().toLowerCase()
  if (!needle) return false
  return [item.title, item.body, item.category, ...(item.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

function HighlightToggle({ on, onChange }) {
  return (
    <button
      type="button"
      className={`knowledge-highlight-toggle ${on ? 'on' : ''}`}
      aria-pressed={on}
      title={on ? 'MARK を外す' : 'MARK を付けて目立たせる'}
      onClick={() => onChange(!on)}
    >
      {on ? '★ MARKED' : '☆ MARK'}
    </button>
  )
}

function ColorSwatches({ value, onChange, label }) {
  return (
    <div className="knowledge-swatches" aria-label={label}>
      {COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`knowledge-swatch ${noteColor(value) === c.value ? 'active' : ''}`}
          style={{ '--swatch': c.value }}
          onClick={() => onChange(c.value)}
          title={c.label}
          aria-label={`色：${c.label}`}
        />
      ))}
    </div>
  )
}

// 一覧に並べる「読む用」のカード。クリックで拡大表示（編集）を開く。
function KnowledgeNote({ item, onTogglePin, onReorder, onOpenDetail, onSettle, searchQuery }) {
  const [dragOver, setDragOver] = useState(false)
  const [dragging, setDragging] = useState(false)
  const title = (item.title || '').trim()
  const body = (item.body || '').trim()
  const tags = Array.isArray(item.tags) ? item.tags : []
  const open = () => onOpenDetail(item.id)

  return (
    <article
      className={`knowledge-card knowledge-note ${item.pinned ? 'is-pinned' : ''} ${
        isHighlighted(item) ? 'is-highlight' : ''
      } ${searchHitOf(item, searchQuery) ? 'is-search-hit' : ''} ${
        dragOver ? 'is-drag-over' : ''
      } ${dragging ? 'is-dragging' : ''}`}
      style={{
        '--note': noteColor(item.color),
        '--note-accent': noteAccent(item.color),
      }}
      role="button"
      tabIndex={0}
      title="クリックで開いて編集"
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id =
          e.dataTransfer.getData('application/x-taskcanvas-knowledge') ||
          e.dataTransfer.getData('text/plain')
        if (id && id !== item.id) onReorder(id, item.id)
      }}
    >
      <div className="knowledge-note-head">
        <span
          className="knowledge-drag"
          title="ドラッグで並び替え"
          aria-label="ドラッグで並び替え"
          draggable
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            setDragging(true)
            e.dataTransfer.setData('application/x-taskcanvas-knowledge', item.id)
            e.dataTransfer.setData('text/plain', item.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            setDragging(false)
            setDragOver(false)
          }}
        >
          ⠿
        </span>
        <h3 className={`knowledge-note-title ${title ? '' : 'is-untitled'}`}>
          {isHighlighted(item) && (
            <span className="knowledge-note-star" aria-label="MARK 付き">
              ★
            </span>
          )}
          {title || '（タイトルなし）'}
        </h3>
        <button
          type="button"
          className={`knowledge-pin ${item.pinned ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin(item.id)
          }}
          title={item.pinned ? 'ピン留めを解除' : '一覧の先頭に固定する'}
          aria-pressed={Boolean(item.pinned)}
        >
          📌
        </button>
      </div>

      {body ? (
        <p className="knowledge-note-body">{body}</p>
      ) : (
        <p className="knowledge-note-body is-empty">本文なし</p>
      )}

      <div className="knowledge-note-foot">
        {item.category && <span className="knowledge-chip is-category">{item.category}</span>}
        {tags.map((tag) => (
          <span key={tag} className="knowledge-chip">
            #{tag}
          </span>
        ))}
        <span className="knowledge-date">{fmtDate(item.updatedAt || item.createdAt)}</span>
        {onSettle && (
          <SettleButtons
            className="is-on-note"
            onSettle={(reason) => onSettle(item.id, reason)}
          />
        )}
      </div>
    </article>
  )
}

// 「完了・不要」の欄に並べる小さいカード。クリックで中身を開ける。
function SettledNote({ item, onOpenDetail, onRestore, onDelete, searchQuery }) {
  const settled = settledOf(item)
  const title = (item.title || '').trim()
  const body = (item.body || '').trim()
  const open = () => onOpenDetail(item.id)

  return (
    <article
      className={`knowledge-settled-card is-${item.settled} ${
        searchHitOf(item, searchQuery) ? 'is-search-hit' : ''
      }`}
      style={{ '--note': noteColor(item.color), '--note-accent': noteAccent(item.color) }}
      role="button"
      tabIndex={0}
      title="クリックで開いて見る"
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <div className="knowledge-settled-card-head">
        <span className={`knowledge-settled-chip is-${item.settled}`}>
          {settled?.icon} {settled?.label}
          {fmtDate(item.settledAt) && <small>{fmtDate(item.settledAt)}</small>}
        </span>
        <h3 className={`knowledge-settled-title ${title ? '' : 'is-untitled'}`}>
          {title || '（タイトルなし）'}
        </h3>
      </div>
      {body && <p className="knowledge-settled-body">{body}</p>}
      <div className="knowledge-settled-actions">
        {item.category && <span className="knowledge-chip is-category">{item.category}</span>}
        <button
          type="button"
          className="knowledge-restore"
          title="上の一覧にもどす"
          onClick={(e) => {
            e.stopPropagation()
            onRestore(item.id)
          }}
        >
          ↩ もどす
        </button>
        <button
          type="button"
          className="knowledge-delete"
          title="このメモを削除（元に戻せません）"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(item.id)
          }}
        >
          削除
        </button>
      </div>
    </article>
  )
}

// 拡大表示（編集用）。large のときに使う。
export function KnowledgeCard({
  item,
  large = false,
  onUpdate,
  onDelete,
  onTogglePin,
  onMakeTask,
  onSettle,
  onRestore,
  searchQuery = '',
}) {
  const settled = settledOf(item)
  const [draft, setDraft] = useState({
    title: item.title || '',
    body: item.body || '',
    category: item.category || '',
    tags: tagsToText(item.tags),
  })

  useEffect(() => {
    setDraft({
      title: item.title || '',
      body: item.body || '',
      category: item.category || '',
      tags: tagsToText(item.tags),
    })
  }, [item.id, item.title, item.body, item.category, item.tags])

  const save = () => {
    const patch = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      category: draft.category.trim(),
      tags: parseTags(draft.tags),
    }
    if (
      patch.title !== (item.title || '') ||
      patch.body !== (item.body || '') ||
      patch.category !== (item.category || '') ||
      tagsToText(patch.tags) !== tagsToText(item.tags)
    ) {
      onUpdate(item.id, patch)
    }
  }

  return (
    <article
      className={`knowledge-card ${large ? 'large' : ''} ${item.pinned ? 'is-pinned' : ''} ${
        isHighlighted(item) ? 'is-highlight' : ''
      } ${searchHitOf(item, searchQuery) ? 'is-search-hit' : ''} ${settled ? 'is-settled' : ''}`}
      style={{
        '--note': noteColor(item.color),
        '--note-accent': noteAccent(item.color),
      }}
    >
      {settled && (
        <div className={`knowledge-settled-banner is-${item.settled}`}>
          <span>
            {settled.icon} 「{settled.label}」にしたメモです
            {fmtDate(item.settledAt) && `（${fmtDate(item.settledAt)}）`}
            。一覧の下の「完了・不要」にまとめています。
          </span>
          {onRestore && (
            <button type="button" className="knowledge-restore" onClick={() => onRestore(item.id)}>
              ↩ 一覧にもどす
            </button>
          )}
        </div>
      )}
      <div className="knowledge-card-top">
        <input
          className="knowledge-title-input"
          value={draft.title}
          placeholder="タイトル"
          onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
          onBlur={save}
        />
        <button
          type="button"
          className={`knowledge-pin ${item.pinned ? 'on' : ''}`}
          onClick={() => onTogglePin(item.id)}
          title={item.pinned ? 'ピン留めを解除' : '一覧の先頭に固定する'}
          aria-pressed={Boolean(item.pinned)}
        >
          📌
        </button>
      </div>

      <textarea
        className="knowledge-body-input"
        value={draft.body}
        placeholder="本文"
        rows={Math.max(4, Math.min(10, draft.body.split('\n').length + 2))}
        onChange={(e) => setDraft((v) => ({ ...v, body: e.target.value }))}
        onBlur={save}
      />

      <div className="knowledge-meta-row">
        <label className="knowledge-meta-field">
          <span>分類</span>
          <input
            className="knowledge-meta-input"
            value={draft.category}
            placeholder="例）取引先・手順"
            onChange={(e) => setDraft((v) => ({ ...v, category: e.target.value }))}
            onBlur={save}
          />
        </label>
        <label className="knowledge-meta-field">
          <span>タグ</span>
          <input
            className="knowledge-meta-input"
            value={draft.tags}
            placeholder="スペース区切りで複数"
            onChange={(e) => setDraft((v) => ({ ...v, tags: e.target.value }))}
            onBlur={save}
          />
        </label>
      </div>

      <div className="knowledge-card-actions">
        <ColorSwatches
          value={item.color}
          label="カードの色"
          onChange={(color) => onUpdate(item.id, { color })}
        />
        <HighlightToggle
          on={isHighlighted(item)}
          onChange={(on) => onUpdate(item.id, { effect: on ? HIGHLIGHT : 'none' })}
        />
        <span className="knowledge-date">更新 {fmtDate(item.updatedAt || item.createdAt)}</span>
        {onMakeTask && (
          <button
            type="button"
            className="knowledge-make-task"
            title="このメモを参考にタスクを作る（入力画面が開きます）"
            onClick={() => {
              save()
              onMakeTask({ ...item, ...draft, tags: parseTags(draft.tags) })
            }}
          >
            ＋ タスクにする
          </button>
        )}
        {onSettle && !settled && (
          <SettleButtons
            onSettle={(reason) => {
              save()
              onSettle(item.id, reason)
            }}
          />
        )}
        <button
          type="button"
          className="knowledge-delete"
          onClick={() => onDelete(item.id)}
          title="このメモを削除"
        >
          削除
        </button>
      </div>
    </article>
  )
}

export default function KnowledgePanel({
  items,
  style,
  onAdd,
  onTogglePin,
  onReorder,
  onOpenDetail,
  onExport,
  onSettle,
  onRestore,
  onDelete,
  searchQuery = '',
  onSearchQueryChange,
}) {
  const [query, setQuery] = useState('')
  const [settledOpen, setSettledOpen] = useState(false)
  const [settledFilter, setSettledFilter] = useState('all')
  const displayedQuery = onSearchQueryChange ? searchQuery : query
  const emptyDraft = {
    title: '',
    body: '',
    category: '',
    tags: '',
    color: defaultColor,
    effect: 'none',
  }
  const [draft, setDraft] = useState(emptyDraft)

  const searching = Boolean(displayedQuery.trim())

  // ピン留めしたメモを先頭に。それ以外は並び替えた順のまま。
  // 「完了」「不要」にしたメモは別にして、新しく片付けた順に下へまとめる。
  const { filtered, settledItems, settledTotal, settledCounts } = useMemo(() => {
    const q = displayedQuery.trim().toLowerCase()
    const hits = items.filter((item) => {
      if (!q) return true
      return [item.title, item.body, item.category, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    const active = hits.filter((item) => !settledOf(item))
    const settled = hits
      .filter((item) => settledOf(item))
      .sort((a, b) => String(b.settledAt || '').localeCompare(String(a.settledAt || '')))
    const allSettled = items.filter((item) => settledOf(item))
    return {
      filtered: [...active.filter((item) => item.pinned), ...active.filter((item) => !item.pinned)],
      settledItems: settled,
      settledTotal: allSettled.length,
      settledCounts: Object.fromEntries(
        SETTLE_OPTIONS.map((option) => [
          option.key,
          settled.filter((item) => item.settled === option.key).length,
        ]),
      ),
    }
  }, [items, displayedQuery])

  const activeTotal = items.length - settledTotal
  // 検索中は、完了・不要の中で一致したメモも開いて見せる。
  const showSettled = settledOpen || (searching && settledItems.length > 0)
  const visibleSettled =
    settledFilter === 'all'
      ? settledItems
      : settledItems.filter((item) => item.settled === settledFilter)

  const updateSearch = (value) => {
    if (onSearchQueryChange) onSearchQueryChange(value)
    else setQuery(value)
  }

  const canAdd =
    draft.title.trim() ||
    draft.body.trim() ||
    draft.category.trim() ||
    draft.tags.trim()

  const add = () => {
    if (!canAdd) return
    onAdd({
      title: draft.title.trim(),
      body: draft.body.trim(),
      category: draft.category.trim(),
      tags: parseTags(draft.tags),
      color: draft.color,
      effect: draft.effect,
    })
    setDraft(emptyDraft)
  }

  return (
    <aside className="knowledge-panel" style={style} aria-label="Freespace">
      <div className="knowledge-head">
        <h2>Freespace</h2>
        <div className="knowledge-head-meta">
          <span
            className="knowledge-count"
            title={
              settledTotal
                ? `ほかに完了・不要のメモが ${settledTotal} 件（一覧の下にまとめています）`
                : undefined
            }
          >
            {activeTotal}件
            {settledTotal > 0 && <small>＋完了・不要 {settledTotal}</small>}
          </span>
          <button
            type="button"
            className="section-export-button"
            onClick={onExport}
            title="FreespaceをCSVファイルに書き出す"
          >
            <span aria-hidden="true">↓</span> CSV出力
          </button>
        </div>
      </div>

      <div className="knowledge-tools">
        <div className="knowledge-search">
          <span>⌕</span>
          <input
            value={displayedQuery}
            placeholder="メモを検索（タイトル・本文・分類・タグ）"
            onChange={(e) => updateSearch(e.target.value)}
          />
          {displayedQuery && (
            <button type="button" onClick={() => updateSearch('')} title="クリア">
              ×
            </button>
          )}
        </div>
      </div>

      <div
        className={`knowledge-composer ${draft.effect !== 'none' ? 'is-highlight' : ''}`}
        style={{
          '--note': draft.color,
          '--note-accent': noteAccent(draft.color),
        }}
      >
        <input
          className="knowledge-compose-title"
          value={draft.title}
          placeholder="タイトル（例：○○介護センター 連絡先）"
          onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
        />
        <textarea
          className="knowledge-compose-body"
          value={draft.body}
          placeholder="本文を書く"
          rows={3}
          onChange={(e) => setDraft((v) => ({ ...v, body: e.target.value }))}
        />
        <div className="knowledge-compose-meta">
          <input
            value={draft.category}
            placeholder="分類"
            onChange={(e) => setDraft((v) => ({ ...v, category: e.target.value }))}
          />
          <input
            value={draft.tags}
            placeholder="タグ"
            onChange={(e) => setDraft((v) => ({ ...v, tags: e.target.value }))}
          />
          <div className="knowledge-compose-options">
            <ColorSwatches
              value={draft.color}
              label="新しいメモの色"
              onChange={(color) => setDraft((v) => ({ ...v, color }))}
            />
            <HighlightToggle
              on={draft.effect !== 'none'}
              onChange={(on) => setDraft((v) => ({ ...v, effect: on ? HIGHLIGHT : 'none' }))}
            />
          </div>
          <button type="button" className="knowledge-add" onClick={add} disabled={!canAdd}>
            追加
          </button>
        </div>
      </div>

      <div className="knowledge-grid">
        {filtered.map((item) => (
          <KnowledgeNote
            key={item.id}
            item={item}
            onTogglePin={onTogglePin}
            onReorder={onReorder}
            onOpenDetail={onOpenDetail}
            onSettle={onSettle}
            searchQuery={displayedQuery}
          />
        ))}
        {filtered.length === 0 && (
          <p className="knowledge-empty">
            {searching
              ? settledItems.length
                ? '一覧には一致するメモはありません（下の「完了・不要」に一致があります）'
                : '一致するメモはありません'
              : settledTotal
                ? 'いま使っているメモはありません（完了・不要のメモは下にまとめています）'
                : 'メモはありません'}
          </p>
        )}

        {(searching ? settledItems.length > 0 : settledTotal > 0) && (
          <section
            className={`knowledge-settled ${showSettled ? 'is-open' : ''}`}
            aria-label="完了・不要のメモ"
          >
            <button
              type="button"
              className="knowledge-settled-toggle"
              aria-expanded={showSettled}
              disabled={searching}
              onClick={() => setSettledOpen((value) => !value)}
            >
              <span className="knowledge-settled-caret" aria-hidden="true">
                {showSettled ? '▾' : '▸'}
              </span>
              <span className="knowledge-settled-label">完了・不要のメモ</span>
              <strong>{settledItems.length}件</strong>
              <span className="knowledge-settled-counts">
                {SETTLE_OPTIONS.map((option) => (
                  <span key={option.key} className={`is-${option.key}`}>
                    {option.label} {settledCounts[option.key]}
                  </span>
                ))}
              </span>
              <span className="knowledge-settled-hint">
                {searching ? '検索に一致したもの' : showSettled ? 'クリックでたたむ' : 'クリックで開く'}
              </span>
            </button>

            {showSettled && (
              <>
                <div className="knowledge-settled-filter" role="group" aria-label="完了・不要の絞り込み">
                  {[{ key: 'all', label: 'すべて' }, ...SETTLE_OPTIONS].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={settledFilter === option.key ? 'is-active' : ''}
                      aria-pressed={settledFilter === option.key}
                      onClick={() => setSettledFilter(option.key)}
                    >
                      {option.label}
                      <small>
                        {option.key === 'all' ? settledItems.length : settledCounts[option.key]}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="knowledge-settled-grid">
                  {visibleSettled.map((item) => (
                    <SettledNote
                      key={item.id}
                      item={item}
                      onOpenDetail={onOpenDetail}
                      onRestore={onRestore}
                      onDelete={onDelete}
                      searchQuery={displayedQuery}
                    />
                  ))}
                  {visibleSettled.length === 0 && (
                    <p className="knowledge-empty">該当するメモはありません</p>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}
