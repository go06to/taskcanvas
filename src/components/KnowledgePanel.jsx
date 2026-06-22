import { useEffect, useMemo, useState } from 'react'

const COLORS = [
  { key: 'white', label: '白', value: '#ffffff' },
  { key: 'gray', label: '薄いグレー', value: '#f4f4f5' },
  { key: 'slate', label: 'グレー', value: '#e9eaec' },
  { key: 'blue', label: '薄い青', value: '#eaf2ff' },
]

const defaultColor = COLORS[0].value

const LEGACY_COLORS = {
  '#fff4bf': '#f4f4f5',
  '#dff6ea': '#e9eaec',
  '#dfeeff': '#eaf2ff',
  '#f8e1ec': '#f4f4f5',
  '#eee7ff': '#e9eaec',
}

const noteColor = (color) =>
  COLORS.some((option) => option.value === color)
    ? color
    : LEGACY_COLORS[color] || defaultColor

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
  onOpenDetail,
}) {
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
      className={`knowledge-card ${item.pinned ? 'is-pinned' : ''} ${large ? 'large' : ''}`}
      style={{ '--note': noteColor(item.color) }}
    >
      <div className="knowledge-card-top">
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
  onOpenDetail,
}) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState({
    title: '',
    body: '',
    category: '',
    tags: '',
    color: defaultColor,
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...items]
      .filter((item) => {
        if (!q) return true
        return [item.title, item.body, item.category, ...(item.tags || [])]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort(
        (a, b) =>
          (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
          String(b.updatedAt || b.createdAt || '').localeCompare(
            String(a.updatedAt || a.createdAt || ''),
          ),
      )
  }, [items, query])

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
    })
    setDraft({ title: '', body: '', category: '', tags: '', color: defaultColor })
  }

  return (
    <aside className="knowledge-panel" style={style} aria-label="Freespace">
      <div className="knowledge-head">
        <div>
          <h2>Freespace</h2>
          <span className="knowledge-count">{items.length} notes</span>
        </div>
      </div>

      <div className="knowledge-tools">
        <div className="knowledge-search">
          <span>⌕</span>
          <input
            value={query}
            placeholder="ナレッジ検索"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} title="クリア">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="knowledge-composer" style={{ '--note': draft.color }}>
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
            onOpenDetail={onOpenDetail}
          />
        ))}
        {filtered.length === 0 && (
          <p className="knowledge-empty">
            {query ? '一致するナレッジはありません' : 'ナレッジはありません'}
          </p>
        )}
      </div>
    </aside>
  )
}
