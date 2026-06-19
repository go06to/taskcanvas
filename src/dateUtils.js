// 今日の日付を 'YYYY-MM-DD'（ローカル）で返す。<input type="date"> と同形式。
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

// 通知日が今日以前（＝その日が来た／過ぎた）かどうか。
// 'YYYY-MM-DD' は辞書順比較がそのまま日付比較になる。
export const isDue = (notifyDate) => !!notifyDate && notifyDate <= todayStr()

// その日がちょうど今日か。
export const isToday = (dateStr) => !!dateStr && dateStr === todayStr()

// 'YYYY-MM-DD' を 'MM/DD' に整形。
export const fmtMD = (dateStr) => (dateStr ? dateStr.slice(5).replace('-', '/') : '')
