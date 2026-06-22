// 分類の定義。色はここで一元管理する。
// label はネオン調のかっこいい呼び名、hint に日本語の意味（期間）を残す。
// color is the main accent; soft is the low-contrast tint used on light panels.
export const TERMS = [
  { key: 'short', label: 'SPRINT', hint: '短期 ・ 今すぐ〜数日', color: '#c9346c', soft: '#fbeaf1' },
  { key: 'mid', label: 'FOCUS', hint: '中期 ・ 数週間〜1ヶ月', color: '#166fbd', soft: '#eaf4fd' },
  { key: 'long', label: 'VISION', hint: '長期 ・ 数ヶ月以上', color: '#2f8f68', soft: '#eaf7f2' },
]

// MEMO 内で使う登録先。分類しない情報も「MEMO」として明示的に選べる。
export const MEMO_TERMS = [
  { key: 'memo', label: 'MEMO', hint: '分類せずメモとして保管', color: '#9a6b28', soft: '#fff8e8' },
  ...TERMS,
]
export const MEMO_TERM_MAP = Object.fromEntries(MEMO_TERMS.map((t) => [t.key, t]))

export const TERM_MAP = Object.fromEntries(TERMS.map((t) => [t.key, t]))

// 優先度（0=なし）。
export const PRIORITIES = [
  { v: 3, label: '高', color: '#dc2626' },
  { v: 2, label: '中', color: '#3f3f46' },
  { v: 1, label: '低', color: '#71717a' },
]
export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.v, p]))

// 並び替え・絞り込みの選択肢。
export const SORTS = [
  { key: 'manual', label: '手動（ドラッグ順）' },
  { key: 'created_desc', label: '作成が新しい順' },
  { key: 'created_asc', label: '作成が古い順' },
  { key: 'notify', label: '通知日が近い順' },
  { key: 'priority', label: '優先度が高い順' },
]
export const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'open', label: '未完了のみ' },
  { key: 'due', label: '期限切れのみ' },
]

export const STORAGE_KEY = 'task-board-v1'
