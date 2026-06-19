const URL_RE = /(https?:\/\/[^\s]+)/g

const labelFor = (url) => {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? '...' : '')
  } catch {
    return url
  }
}

const renderUrls = (value, keyPrefix) => {
  const parts = String(value).split(URL_RE)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a
        key={`${keyPrefix}-${i}`}
        href={p}
        target="_blank"
        rel="noreferrer"
        className="auto-link"
        title={p}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {labelFor(p)}
      </a>
    ) : (
      p
    ),
  )
}

export function linkify(text) {
  if (!text) return text
  const parts = String(text).split(/(<\/?(?:b|s|strike|del|u|mark)>)/gi)
  const active = new Set()

  return parts.map((p, i) => {
    const open = p.match(/^<(b|s|strike|del|u|mark)>$/i)
    if (open) {
      const tag = open[1].toLowerCase()
      active.add(tag === 'strike' || tag === 'del' ? 's' : tag)
      return null
    }
    const close = p.match(/^<\/(b|s|strike|del|u|mark)>$/i)
    if (close) {
      const tag = close[1].toLowerCase()
      active.delete(tag === 'strike' || tag === 'del' ? 's' : tag)
      return null
    }
    if (!p) return null

    const classes = [
      active.has('b') && 'comment-bold',
      active.has('s') && 'comment-strike',
      active.has('u') && 'comment-under',
      active.has('mark') && 'comment-marker',
    ]
      .filter(Boolean)
      .join(' ')

    return classes ? (
      <span key={`f-${i}`} className={classes}>
        {renderUrls(p, `f-${i}`)}
      </span>
    ) : (
      renderUrls(p, `t-${i}`)
    )
  })
}
