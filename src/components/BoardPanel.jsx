import { useState } from 'react'
import TaskCard from './TaskCard'
import { SORTS, FILTERS } from '../constants'

// 右側のボード。タブ切替＋並び替え/絞り込み/テンプレート＋ドラッグ並び替え。
export default function BoardPanel({
  terms,
  activeKey,
  counts,
  onSelect,
  term,
  tasks,
  sortKey,
  onSortChange,
  filterKey,
  onFilterChange,
  templates,
  onUseTemplate,
  onAddTemplate,
  onRemoveTemplate,
  onMoveToTerm,
  onReorder,
  onAdd,
  ...cardHandlers
}) {
  const [draft, setDraft] = useState('')
  const [tplOpen, setTplOpen] = useState(false)
  const [tplDraft, setTplDraft] = useState('')

  const submit = () => {
    onAdd(draft, term.key)
    setDraft('')
  }

  return (
    <section
      className="board-panel"
      style={{ '--accent': term.color, '--soft': term.soft }}
    >
      {/* シート切り替えタブ（ドロップで分類移動） */}
      <div className="term-tabs">
        {terms.map((t) => (
          <button
            key={t.key}
            className={`term-tab ${activeKey === t.key ? 'active' : ''}`}
            style={{ '--tab': t.color, '--tabsoft': t.soft }}
            onClick={() => onSelect(t.key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              if (id) onMoveToTerm(id, t.key)
            }}
          >
            <span className="tab-dot" />
            <span className="tab-label">{t.label}</span>
            <span className="tab-count">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* 並び替え・絞り込み・テンプレート */}
      <div className="board-controls">
        <select
          className="ctrl-select"
          value={sortKey}
          onChange={(e) => onSortChange(e.target.value)}
          title="並び替え"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              ↕ {s.label}
            </option>
          ))}
        </select>
        <select
          className="ctrl-select"
          value={filterKey}
          onChange={(e) => onFilterChange(e.target.value)}
          title="絞り込み"
        >
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              ▽ {f.label}
            </option>
          ))}
        </select>

        <div className="tpl">
          <button className="ctrl-btn" onClick={() => setTplOpen((v) => !v)}>
            📋 テンプレ
          </button>
          {tplOpen && (
            <div className="tpl-pop">
              {templates.length === 0 && (
                <p className="tpl-empty">テンプレートはまだありません</p>
              )}
              {templates.map((tp) => (
                <div key={tp.id} className="tpl-item">
                  <button
                    className="tpl-use"
                    title={`${term.label}へ追加`}
                    onClick={() => onUseTemplate(tp.id)}
                  >
                    ＋ {tp.title}
                  </button>
                  <button
                    className="tpl-del"
                    title="テンプレート削除"
                    onClick={() => onRemoveTemplate(tp.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="tpl-add">
                <input
                  value={tplDraft}
                  placeholder="新規テンプレート名"
                  onChange={(e) => setTplDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onAddTemplate(tplDraft)
                      setTplDraft('')
                    }
                  }}
                />
                <button
                  onClick={() => {
                    onAddTemplate(tplDraft)
                    setTplDraft('')
                  }}
                  disabled={!tplDraft.trim()}
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="board-hint">{term.hint}</p>

      <div className="add-row">
        <input
          value={draft}
          placeholder={`${term.label}のタスクを入力`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="add-btn" onClick={submit} disabled={!draft.trim()}>
          ＋
        </button>
      </div>

      <div className="cards">
        {tasks.length === 0 && <p className="empty">タスクはありません</p>}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onReorder={onReorder}
            {...cardHandlers}
          />
        ))}
      </div>
    </section>
  )
}
