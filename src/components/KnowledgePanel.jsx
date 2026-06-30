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
const EFFECTS = [
  { key: 'none', label: 'エフェクトなし' },
  { key: 'glow', label: '発光' },
  { key: 'pulse', label: 'パルス' },
  { key: 'float', label: '浮遊' },
  { key: 'ripple', label: '波紋' },
  { key: 'shine', label: '光沢' },
]
const defaultEffect = EFFECTS[0].key

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
const noteEffect = (effect) =>
  EFFECTS.some((option) => option.key === effect) ? effect : defaultEffect

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

export function KnowledgeCard({
  item,
  large = false,
  onUpdate,
  onDelete,
  onTogglePin,
  onReorder,
  onOpenDetail,
  searchQuery = '',
}) {
  const [dragOver, setDragOver] = useState(false)
  const [dragging, setDragging] = useState(false)
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
  const searchNeedle = searchQuery.trim().toLowerCase()
  const searchHaystack = [
    item.title,
    item.body,
    item.category,
    ...(item.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const searchHit = Boolean(searchNeedle && searchHaystack.includes(searchNeedle))

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
      className={`knowledge-card ${item.pinned ? 'is-pinned' : ''} ${
        large ? 'large' : ''
      } ${searchHit ? 'is-search-hit' : ''} ${dragOver ? 'is-drag-over' : ''} ${
        dragging ? 'is-dragging' : ''
      } effect-${noteEffect(item.effect)}`}
      style={{
        '--note': noteColor(item.color),
        '--note-accent': noteAccent(item.color),
      }}
      onDragOver={
        large
          ? undefined
          : (e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOver(true)
            }
      }
      onDragLeave={
        large
          ? undefined
          : (e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
            }
      }
      onDrop={
        large
          ? undefined
          : (e) => {
              e.preventDefault()
              setDragOver(false)
              const id =
                e.dataTransfer.getData('application/x-taskcanvas-knowledge') ||
                e.dataTransfer.getData('text/plain')
              if (id && id !== item.id) onReorder(id, item.id)
            }
      }
    >
      <div className="knowledge-card-top">
        {!large && (
          <span
            className="knowledge-drag"
            title="ドラッグでカードを並び替え"
            aria-label="ドラッグでカードを並び替え"
            draggable
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
        )}
        <input
          className="knowledge-title-input"
          value={draft.title}
          placeholder="タイトル"
          onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
          onBlur={save}
        />
        {!large && (
          <button
            type="button"
            className="knowledge-expand"
            onClick={() => onOpenDetail(item.id)}
            title="拡大表示"
            aria-label="拡大表示"
          >
            ⤢
          </button>
        )}
        <button
          type="button"
          className={`knowledge-pin ${item.pinned ? 'on' : ''}`}
          onClick={() => onTogglePin(item.id)}
          title={item.pinned ? 'ピン留めを解除' : 'ピン留め'}
        >
          PIN
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
        <input
          className="knowledge-meta-input"
          value={draft.category}
          placeholder="分類"
          onChange={(e) => setDraft((v) => ({ ...v, category: e.target.value }))}
          onBlur={save}
        />
        <input
          className="knowledge-meta-input"
          value={draft.tags}
          placeholder="タグ"
          onChange={(e) => setDraft((v) => ({ ...v, tags: e.target.value }))}
          onBlur={save}
        />
      </div>

      <div className="knowledge-card-actions">
        <div className="knowledge-swatches" aria-label="card color">
          {COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`knowledge-swatch ${
                noteColor(item.color) === c.value ? 'active' : ''
              }`}
              style={{ '--swatch': c.value }}
              onClick={() => onUpdate(item.id, { color: c.value })}
              title={c.label}
            />
          ))}
        </div>
        <select
          className="knowledge-effect-select"
          value={noteEffect(item.effect)}
          onChange={(e) => onUpdate(item.id, { effect: e.target.value })}
          aria-label="カードエフェクト"
          title="カードエフェクトを選択"
        >
          {EFFECTS.map((effect) => (
            <option key={effect.key} value={effect.key}>
              {effect.label}
            </option>
          ))}
        </select>
        <span className="knowledge-date">{fmtDate(item.updatedAt || item.createdAt)}</span>
        <button
          type="button"
          className="knowledge-delete"
          onClick={() => onDelete(item.id)}
          title="削除"
        >
          ×
        </button>
      </div>
    </article>
  )
}

export default function KnowledgePanel({
  items,
  style,
  onAdd,
  onUpdate,
  onDelete,
  onTogglePin,
  onReorder,
  onOpenDetail,
  searchQuery = '',
  onSearchQueryChange,
}) {
  const [query, setQuery] = useState('')
  const displayedQuery = onSearchQueryChange ? searchQuery : query
  const [draft, setDraft] = useState({
    title: '',
    body: '',
    category: '',
    tags: '',
    color: defaultColor,
    effect: defaultEffect,
  })

  const filtered = useMemo(() => {
    const q = displayedQuery.trim().toLowerCase()
    return items.filter((item) => {
      if (!q) return true
      return [item.title, item.body, item.category, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [items, displayedQuery])

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
    setDraft({
      title: '',
      body: '',
      category: '',
      tags: '',
      color: defaultColor,
      effect: defaultEffect,
    })
  }

  return (
    <aside className="knowledge-panel" style={style} aria-label="Freespace">
      <div className="knowledge-head">
        <h2>Freespace</h2>
        <span className="knowledge-count">{items.length} notes</span>
      </div>

      <div className="knowledge-tools">
        <div className="knowledge-search">
          <span>⌕</span>
          <input
            value={displayedQuery}
            placeholder="ナレッジ検索"
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
        className={`knowledge-composer effect-${draft.effect}`}
        style={{
          '--note': draft.color,
          '--note-accent': noteAccent(draft.color),
        }}
      >
        <input
          className="knowledge-compose-title"
          value={draft.title}
          placeholder="タイトル"
          onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
        />
        <textarea
          className="knowledge-compose-body"
          value={draft.body}
          placeholder="ナレッジを書く"
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
            <div className="knowledge-swatches" aria-label="new card color">
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`knowledge-swatch ${draft.color === c.value ? 'active' : ''}`}
                  style={{ '--swatch': c.value }}
                  onClick={() => setDraft((v) => ({ ...v, color: c.value }))}
                  title={c.label}
                />
              ))}
            </div>
            <select
              className="knowledge-effect-select"
              value={draft.effect}
              onChange={(e) => setDraft((v) => ({ ...v, effect: e.target.value }))}
              aria-label="新しいカードのエフェクト"
            >
              {EFFECTS.map((effect) => (
                <option key={effect.key} value={effect.key}>
                  {effect.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="knowledge-add" onClick={add} disabled={!canAdd}>
            追加
          </button>
        </div>
      </div>

      <div className="knowledge-grid">
        {filtered.map((item) => (
          <KnowledgeCard
            key={item.id}
            item={item}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onReorder={onReorder}
            onOpenDetail={onOpenDetail}
            searchQuery={displayedQuery}
          />
        ))}
        {filtered.length === 0 && (
          <p className="knowledge-empty">
            {displayedQuery ? '一致するナレッジはありません' : 'ナレッジはありません'}
          </p>
        )}
      </div>
    </aside>
  )
}
