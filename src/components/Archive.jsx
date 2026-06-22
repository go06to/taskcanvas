import { MEMO_TERM_MAP, TERM_MAP } from '../constants'

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

// 完了フォルダ。完了したタスク・メモの一覧。戻す / 削除ができる。
export default function Archive({
  tasks,
  memos = [],
  onRestore,
  onDelete,
  onRestoreMemo,
  onDeleteMemo,
}) {
  const total = tasks.length + memos.length

  return (
    <main className="archive">
      <div className="archive-head">
        <h2>完了フォルダ</h2>
        <p className="archive-sub">
          タスク {tasks.length} 件 ／ メモ {memos.length} 件
        </p>
      </div>

      {total === 0 && (
        <p className="empty big">完了したものはまだありません</p>
      )}

      {tasks.length > 0 && (
        <>
          <h3 className="archive-group">タスク</h3>
          <ul className="archive-list">
            {tasks.map((task) => {
              const term = TERM_MAP[task.term]
              return (
                <li key={task.id} className="archive-item">
                  <span
                    className="tag"
                    style={{ background: term.soft, color: term.color }}
                  >
                    {term.label}
                  </span>
                  <span className="archive-title">{task.title}</span>
                  <span className="archive-date">
                    作成 {fmtDate(task.createdAt)} ／ 完了 {fmtDate(task.completedAt)}
                  </span>
                  <div className="archive-actions">
                    <button className="mini" onClick={() => onRestore(task.id)}>
                      ボードへ戻す
                    </button>
                    <button className="mini danger" onClick={() => onDelete(task.id)}>
                      ×
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {memos.length > 0 && (
        <>
          <h3 className="archive-group">メモ</h3>
          <ul className="archive-list">
            {memos.map((memo) => {
              const term = MEMO_TERM_MAP[memo.term] || MEMO_TERM_MAP.memo
              return (
                <li key={memo.id} className="archive-item">
                  <span
                    className="tag tag-memo"
                    style={{ background: term.soft, color: term.color }}
                  >
                    {term.label}
                  </span>
                  <span
                    className="archive-title"
                    dangerouslySetInnerHTML={{ __html: memo.text }}
                  />
                  <span className="archive-date">
                    作成 {fmtDate(memo.createdAt)} ／ 完了 {fmtDate(memo.archivedAt)}
                  </span>
                  <div className="archive-actions">
                    <button className="mini" onClick={() => onRestoreMemo(memo.id)}>
                      メモへ戻す
                    </button>
                    <button
                      className="mini danger"
                      onClick={() => onDeleteMemo(memo.id)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
