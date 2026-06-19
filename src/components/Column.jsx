import { useState } from 'react'
import TaskCard from './TaskCard'

// 短期 / 中期 / 長期 それぞれの列。先頭に入力欄があり、
// 入力 → そのまま列のボタンで1クリック追加できる。
export default function Column({
  term,
  tasks,
  onAdd,
  expandable,
  onExpandToggle,
  maximized,
  anyMaximized,
  onToggleMaximize,
  ...handlers
}) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    onAdd(draft, term.key)
    setDraft('')
  }

  const remaining = tasks.filter((t) => !t.done).length

  return (
    <section
      className={`column ${maximized ? 'is-max' : ''} ${
        anyMaximized && !maximized ? 'is-hidden' : ''
      }`}
      style={{ '--accent': term.color, '--soft': term.soft }}
    >
      <div className="column-head">
        <div
          className={`column-title ${expandable ? 'clickable' : ''}`}
          onClick={expandable ? onExpandToggle : undefined}
          title={expandable ? 'クリックでボードを上まで拡大／戻す' : undefined}
        >
          <span className="dot" />
          <h2>{term.label}</h2>
          <span className="count">{remaining}</span>
          <button
            className="col-max"
            title={maximized ? '全体表示を解除' : 'この列を全体表示'}
            onClick={(e) => {
              e.stopPropagation()
              onToggleMaximize()
            }}
          >
            {maximized ? '✕' : '⛶'}
          </button>
        </div>
        <p className="column-hint">{term.hint}</p>
      </div>

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
          <TaskCard key={task.id} task={task} {...handlers} />
        ))}
      </div>
    </section>
  )
}
