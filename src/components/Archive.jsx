import { MEMO_TERM_MAP, TERM_MAP } from '../constants'
import { linkify } from '../linkify'

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, ' ')
const searchableText = (parts) =>
  parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

const SubtaskSummary = ({ items = [] }) => {
  if (!items.length) return null
  const done = items.filter((item) => item.done).length
  return (
    <span className="archive-subtask-count" title="サブタスクの完了数">
      サブ {done}/{items.length}
    </span>
  )
}

// 完了済みの内容を、変更せずに確認するための拡大表示。
export function ArchiveDetail({ item, type }) {
  const isTask = type === 'task'
  const term = isTask
    ? TERM_MAP[item.term] || TERM_MAP.short
    : MEMO_TERM_MAP[item.term] || MEMO_TERM_MAP.memo
  const subtasks = isTask ? item.subtasks || [] : item.miniTasks || []
  const completedAt = isTask ? item.completedAt : item.archivedAt

  return (
    <article className="archive-detail">
      <div className="archive-detail-head">
        <span
          className={`tag ${isTask ? '' : 'tag-memo'}`}
          style={{ background: term.soft, color: term.color }}
        >
          {term.label}
        </span>
        <span className="archive-detail-status">完了済み</span>
      </div>

      {isTask ? (
        <h2 className="archive-detail-title">{linkify(item.title)}</h2>
      ) : (
        <div
          className="archive-detail-title archive-detail-rich"
          dangerouslySetInnerHTML={{ __html: item.text }}
        />
      )}

      <p className="archive-detail-date">
        作成 {fmtDate(item.createdAt)} ／ 完了 {fmtDate(completedAt)}
      </p>

      {item.comment && (
        <section className="archive-detail-section">
          <h3>コメント</h3>
          <div className="archive-detail-comment">{linkify(item.comment)}</div>
        </section>
      )}

      <section className="archive-detail-section">
        <div className="archive-detail-section-head">
          <h3>サブタスク</h3>
          <SubtaskSummary items={subtasks} />
        </div>
        {subtasks.length > 0 ? (
          <ul className="archive-detail-subtasks">
            {subtasks.map((subtask) => (
              <li
                key={subtask.id}
                className={subtask.done ? 'is-done' : ''}
              >
                <span className="archive-detail-check" aria-hidden="true">
                  {subtask.done ? '✓' : '–'}
                </span>
                <div className="archive-detail-subtask-body">
                  <div className="archive-detail-subtask-title">
                    {linkify(subtask.title)}
                  </div>
                  <div className="archive-detail-subtask-meta">
                    {subtask.createdAt && <>登録 {fmtDate(subtask.createdAt)}</>}
                    {(subtask.alarmAt || subtask.notifyDate) && (
                      <> ／ 通知 {fmtDate(subtask.alarmAt || subtask.notifyDate)}</>
                    )}
                  </div>
                  {subtask.comment && (
                    <div className="archive-detail-subtask-comment">
                      {linkify(subtask.comment)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="archive-detail-empty">サブタスクはありません</p>
        )}
      </section>
    </article>
  )
}

// 完了フォルダ。完了したタスク・メモの一覧。戻す / 削除ができる。
export default function Archive({
  tasks,
  memos = [],
  onOpenDetail,
  onRestore,
  onDelete,
  onRestoreMemo,
  onDeleteMemo,
  isMemoUnlocked = () => true,
  onUnlockMemo,
  searchQuery = '',
}) {
  const total = tasks.length + memos.length
  const searchNeedle = searchQuery.trim().toLowerCase()
  const taskSearchHit = (task) =>
    Boolean(
      searchNeedle &&
        searchableText([
          task.title,
          task.comment,
          task.notifyDate,
          ...(task.subtasks || []).flatMap((subtask) => [
            subtask.title,
            subtask.comment,
          ]),
        ]).includes(searchNeedle),
    )
  const memoSearchHit = (memo) =>
    Boolean(
      searchNeedle &&
        searchableText([
          stripHtml(memo.text),
          memo.comment,
          memo.alarmAt,
          ...(memo.miniTasks || []).flatMap((task) => [
            task.title,
            task.comment,
            task.alarmAt,
          ]),
        ]).includes(searchNeedle),
    )

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
                <li
                  key={task.id}
                  className={`archive-item ${taskSearchHit(task) ? 'is-search-hit' : ''}`}
                >
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
                  <SubtaskSummary items={task.subtasks} />
                  <div className="archive-actions">
                    <button
                      type="button"
                      className="mini"
                      title="サブタスクを含めて拡大表示"
                      onClick={() => onOpenDetail?.('task', task.id)}
                    >
                      ⤢ 拡大
                    </button>
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
              const locked = Boolean(memo.passwordHash) && !isMemoUnlocked(memo.id)
              return (
                <li
                  key={memo.id}
                  className={`archive-item ${memoSearchHit(memo) ? 'is-search-hit' : ''}`}
                >
                  <span
                    className="tag tag-memo"
                    style={{ background: term.soft, color: term.color }}
                  >
                    {term.label}
                  </span>
                  {locked ? (
                    <span className="archive-title archive-secret">
                      PWが必要なタスク
                    </span>
                  ) : (
                    <span
                      className="archive-title"
                      dangerouslySetInnerHTML={{ __html: memo.text }}
                    />
                  )}
                  <span className="archive-date">
                    作成 {fmtDate(memo.createdAt)} ／ 完了 {fmtDate(memo.archivedAt)}
                  </span>
                  {!locked && <SubtaskSummary items={memo.miniTasks} />}
                  <div className="archive-actions">
                    {locked && (
                      <button className="mini" onClick={() => onUnlockMemo?.(memo.id)}>
                        PW
                      </button>
                    )}
                    <button
                      type="button"
                      className="mini"
                      title="サブタスクを含めて拡大表示"
                      disabled={locked}
                      onClick={() => onOpenDetail?.('memo', memo.id)}
                    >
                      ⤢ 拡大
                    </button>
                    <button
                      className="mini"
                      disabled={locked}
                      onClick={() => onRestoreMemo(memo.id)}
                    >
                      メモへ戻す
                    </button>
                    <button
                      className="mini danger"
                      disabled={locked}
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
