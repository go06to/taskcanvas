import { useCallback, useEffect, useMemo, useState } from 'react'

// メール受信箱：Claude が Outlook を読んで書き出した JSON ファイルを、このPCのブラウザで読み込む。
// TaskNote からファイルへは書き込まない（読むだけ）。採用・不要の印と手入力分はこのブラウザに保存する。
//
// ファイルの形：
// { "version": 1, "updatedAt": "ISO日時",
//   "items": [ { "id", "receivedAt", "from", "fromAddress", "subject",
//                "title", "summary", "due": "YYYY-MM-DD"|null, "priority": 3|2|1, "reason" } ],
//   "closedMails": [ { "id", "reason": "read"|"deleted", "at", "title" } ] }
// closedMails は、受信箱に入れたあと Outlook で既読（または削除）になったメールと、
// 楽楽自動応対で対応完了・閲覧用・担当替えになったメール（id が md-…）。
// そのメールから作った Task は完了フォルダへ移す（一度だけ）。
// 楽楽自動応対の項目は source: "maildealer" と originPath（例「楽楽自動応対 ＞ 企画部共有 ＞ 事務員さんFAX」）・mdId を持つ。

const HANDLED_KEY = 'tn-mail-handled-v1'
const MANUAL_KEY = 'tn-mail-manual-v1'
const AUTO_CLOSED_KEY = 'tn-mail-auto-closed-v1'
const DB_NAME = 'tasknote-mail'
const DB_STORE = 'handles'
const HANDLE_KEY = 'inbox-file'
// 処理済みの印を書き出すファイル（メール受信箱.json と同じフォルダの 処理済み.json）。
// ブラウザの外（Claude のステータスラインの件数など）から、処理済みかどうかを見られるようにする。
const HANDLED_FILE_KEY = 'handled-file'
const HANDLED_FILE_NAME = '処理済み.json'
// 処理済みの印は60日で忘れる（ファイル側も古いメールは消していく）。
const HANDLED_KEEP_MS = 60 * 24 * 60 * 60 * 1000
const AUTO_RELOAD_MS = 60 * 1000

export const MAIL_PRIORITIES = [
  { v: 3, label: '高', color: '#dc2626', soft: '#fdecec' },
  { v: 2, label: '中', color: '#b45309', soft: '#fff4df' },
  { v: 1, label: '低', color: '#71717a', soft: '#f1f1f2' },
]
export const MAIL_PRIORITY_MAP = Object.fromEntries(MAIL_PRIORITIES.map((p) => [p.v, p]))

// どこから来た項目か。カードの色と「取得元」の表示に使う。
//   outlook    … Outlook の受信トレイ（outlook-tasknote。id が mail-…）
//   maildealer … 楽楽自動応対（maildealer-tasknote。source: "maildealer"、id が md-…）
//   review     … Claude の1日のふりかえり（id が review-…）
//   manual     … この画面で手入力したもの
export const MAIL_ORIGINS = {
  outlook: { label: 'Outlook', path: 'Outlook ＞ 受信トレイ' },
  maildealer: { label: '楽楽自動応対', path: '楽楽自動応対' },
  review: { label: 'ふりかえり', path: 'Claude の1日のふりかえり' },
  manual: { label: '手入力', path: '' },
}

const originOf = (raw, source) => {
  if (source === 'manual') return 'manual'
  const s = String(raw?.source ?? '').trim().toLowerCase()
  const id = String(raw?.id ?? '')
  if (s === 'maildealer' || id.startsWith('md-')) return 'maildealer'
  if (s === 'review' || id.startsWith('review-')) return 'review'
  return 'outlook'
}

// カードに出す「取得元」の文。楽楽自動応対はフォルダとメールIDまで出す。
export const originText = (item) => {
  const base = item.originPath || MAIL_ORIGINS[item.origin]?.path || ''
  if (!base) return ''
  return item.mdId ? `${base}（メールID ${item.mdId}）` : base
}

export const fileApiSupported =
  typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'

export const saveFileApiSupported =
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できなくても画面は動かす
  }
}

// ファイルの場所（ハンドル）を覚えておくための IndexedDB。
const openDb = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const dbRequest = async (mode, run) => {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode)
      const req = run(tx.objectStore(DB_STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

const loadHandle = (key = HANDLE_KEY) =>
  dbRequest('readonly', (store) => store.get(key)).catch(() => null)
const saveHandle = (handle, key = HANDLE_KEY) =>
  dbRequest('readwrite', (store) => store.put(handle, key)).catch(() => null)
const clearHandle = (key = HANDLE_KEY) =>
  dbRequest('readwrite', (store) => store.delete(key)).catch(() => null)

// 処理済みの印を、ファイルにまるごと書き出す。
const writeHandledFile = async (handle, handled) => {
  const writable = await handle.createWritable()
  await writable.write(
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        note: 'TaskNote の Mail で「処理済み」にしたもの。TaskNote が書き出す（ほかからは読むだけ）。',
        handled,
      },
      null,
      2,
    ),
  )
  await writable.close()
}

const text = (value) => (value == null ? '' : String(value).trim())

const validDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null)

const normalizeItem = (raw, source) => {
  if (!raw || typeof raw !== 'object') return null
  const id = text(raw.id)
  const title = text(raw.title) || text(raw.subject)
  if (!id || !title) return null
  const priority = [1, 2, 3].includes(Number(raw.priority)) ? Number(raw.priority) : 2
  return {
    id,
    source,
    origin: originOf(raw, source),
    originPath: text(raw.originPath),
    mdId: text(raw.mdId),
    title,
    from: text(raw.from),
    fromAddress: text(raw.fromAddress),
    subject: text(raw.subject),
    summary: text(raw.summary),
    reason: text(raw.reason),
    receivedAt: text(raw.receivedAt) || null,
    due: validDate(raw.due),
    priority,
    createdAt: text(raw.createdAt) || null,
  }
}

export const parseInboxText = (raw) => {
  const data = JSON.parse(raw.replace(/^﻿/, ''))
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null
  if (!list) throw new Error('メール受信箱の形式ではありません（items がありません）')
  return {
    updatedAt: Array.isArray(data) ? null : text(data.updatedAt) || null,
    items: list.map((item) => normalizeItem(item, 'mail')).filter(Boolean),
    closed: (Array.isArray(data?.closedMails) ? data.closedMails : [])
      .map((c) => ({
        id: text(c?.id),
        reason: c?.reason === 'deleted' ? 'deleted' : 'read',
        at: text(c?.at) || null,
        title: text(c?.title),
      }))
      .filter((c) => c.id),
  }
}

// 優先度が高い順 → 期限が近い順（期限なしは後ろ）→ 新しい順。
const compareItems = (a, b) =>
  b.priority - a.priority ||
  (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99') ||
  String(b.receivedAt || b.createdAt || '').localeCompare(String(a.receivedAt || a.createdAt || ''))

const isFresh = (mark) => new Date(mark?.at || 0).getTime() >= Date.now() - HANDLED_KEEP_MS

// 保存してある印と手入力分を読み込む。古い印は忘れ、その印が付いた手入力分も一緒に消す
// （印だけ消すと、処理済みの手入力分がまた受信箱に出てしまうため）。
const loadSaved = () => {
  const rawHandled = readJson(HANDLED_KEY, {})
  const handled = Object.fromEntries(
    Object.entries(rawHandled).filter(([, mark]) => isFresh(mark)),
  )
  const manualItems = readJson(MANUAL_KEY, [])
    .map((item) => normalizeItem(item, 'manual'))
    .filter(Boolean)
    .filter((item) => !rawHandled[item.id] || isFresh(rawHandled[item.id]))
  return { handled, manualItems }
}

export function useMailInbox() {
  const [fileItems, setFileItems] = useState([])
  const [fileUpdatedAt, setFileUpdatedAt] = useState(null)
  const [loadedAt, setLoadedAt] = useState(null)
  const [fileName, setFileName] = useState('')
  const [handle, setHandle] = useState(null)
  // 'none'（未設定）| 'need-permission'（クリックで再許可）| 'ok' | 'error'
  const [fileStatus, setFileStatus] = useState('none')
  const [fileError, setFileError] = useState('')
  const [saved] = useState(loadSaved)
  const [handled, setHandled] = useState(saved.handled)
  const [manualItems, setManualItems] = useState(saved.manualItems)
  const [closedMails, setClosedMails] = useState([])
  // 既読で自動的に完了にしたメールの id（{id: 日時}）。完了フォルダから戻した Task をまた完了にしないため。
  const [autoClosed, setAutoClosed] = useState(() => {
    const raw = readJson(AUTO_CLOSED_KEY, {})
    return Object.fromEntries(Object.entries(raw).filter(([, at]) => isFresh({ at })))
  })

  useEffect(() => writeJson(HANDLED_KEY, handled), [handled])
  useEffect(() => writeJson(MANUAL_KEY, manualItems), [manualItems])
  useEffect(() => writeJson(AUTO_CLOSED_KEY, autoClosed), [autoClosed])

  // 処理済みの印の書き出し先。'none'（未設定）| 'need-permission'（クリックで再許可）| 'ok' | 'error'
  const [handledHandle, setHandledHandle] = useState(null)
  const [handledFileStatus, setHandledFileStatus] = useState('none')
  const [handledFileError, setHandledFileError] = useState('')

  // 開いたとき：前に選んだ書き出し先があり、書く許可が残っていればそのまま使う。
  useEffect(() => {
    if (!saveFileApiSupported) return
    let cancelled = false
    loadHandle(HANDLED_FILE_KEY).then(async (saved) => {
      if (cancelled || !saved) return
      setHandledHandle(saved)
      const permission = await saved.queryPermission?.({ mode: 'readwrite' })
      if (cancelled) return
      setHandledFileStatus(permission === 'granted' ? 'ok' : 'need-permission')
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 印が変わるたびに書き出す（書ける状態の間だけ）。
  useEffect(() => {
    if (!handledHandle || handledFileStatus !== 'ok') return
    writeHandledFile(handledHandle, handled).catch((error) => {
      setHandledFileStatus(error?.name === 'NotAllowedError' ? 'need-permission' : 'error')
      setHandledFileError(error?.message || '処理済みファイルに書き込めませんでした')
    })
  }, [handled, handledHandle, handledFileStatus])

  const applyText = useCallback((raw, name) => {
    try {
      const parsed = parseInboxText(raw)
      setClosedMails(parsed.closed)
      // 受信箱に入れたあと Outlook で既読・削除になったメール（楽楽自動応対で対応済みになったものも）は、
      // 受信箱から黙って消さずに「処理済み」へ移す。自分で処理済みにしてあるものはそのまま。
      setHandled((prev) => {
        const fresh = parsed.closed.filter((c) => !prev[c.id] && isFresh({ at: c.at }))
        if (!fresh.length) return prev
        const next = { ...prev }
        for (const c of fresh) {
          next[c.id] = {
            action: c.id.startsWith('md-') ? 'closed' : c.reason === 'deleted' ? 'deleted' : 'read',
            at: c.at ? new Date(c.at).toISOString() : new Date().toISOString(),
            title: c.title || '（件名なし）',
            auto: true,
          }
        }
        return next
      })
      setFileItems(parsed.items)
      setFileUpdatedAt(parsed.updatedAt)
      setLoadedAt(new Date().toISOString())
      setFileName(name || '')
      setFileStatus('ok')
      setFileError('')
    } catch (error) {
      setFileStatus('error')
      setFileError(error?.message || 'ファイルを読み込めませんでした')
    }
  }, [])

  const readHandle = useCallback(
    async (target) => {
      try {
        const file = await target.getFile()
        applyText(await file.text(), file.name)
      } catch (error) {
        setFileStatus('error')
        setFileError(
          error?.name === 'NotFoundError'
            ? 'ファイルが見つかりません。「ファイルを選ぶ」から選び直してください'
            : error?.message || 'ファイルを読み込めませんでした',
        )
      }
    },
    [applyText],
  )

  // 開いたとき：前に選んだファイルがあり、読む許可が残っていれば自動で読む。
  useEffect(() => {
    if (!fileApiSupported) return
    let cancelled = false
    loadHandle().then(async (saved) => {
      if (cancelled || !saved) return
      setHandle(saved)
      setFileName(saved.name || '')
      const permission = await saved.queryPermission?.({ mode: 'read' })
      if (cancelled) return
      if (permission === 'granted') readHandle(saved)
      else setFileStatus('need-permission')
    })
    return () => {
      cancelled = true
    }
  }, [readHandle])

  // 読める状態の間は、画面に戻ったときと1分ごとに読み直す（Claude が10分おきに更新するため）。
  useEffect(() => {
    if (!handle || fileStatus !== 'ok') return
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      const permission = await handle.queryPermission?.({ mode: 'read' })
      if (permission === 'granted') readHandle(handle)
    }
    const timer = window.setInterval(refresh, AUTO_RELOAD_MS)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [handle, fileStatus, readHandle])

  // ファイルを選ぶ（クリックから呼ぶ）。
  const pickFile = useCallback(async () => {
    if (!fileApiSupported) return false
    try {
      const [picked] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'メール受信箱（JSON）', accept: { 'application/json': ['.json'] } }],
      })
      if (!picked) return false
      setHandle(picked)
      await saveHandle(picked)
      await readHandle(picked)
      return true
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setFileStatus('error')
        setFileError(error?.message || 'ファイルを選べませんでした')
      }
      return false
    }
  }, [readHandle])

  // 読み込み（クリックから呼ぶ）。許可が切れていればここで許可を求める。
  const reload = useCallback(async () => {
    if (!handle) return pickFile()
    try {
      const permission =
        (await handle.queryPermission?.({ mode: 'read' })) === 'granted'
          ? 'granted'
          : await handle.requestPermission?.({ mode: 'read' })
      if (permission !== 'granted') {
        setFileStatus('need-permission')
        return false
      }
      await readHandle(handle)
      return true
    } catch (error) {
      setFileStatus('error')
      setFileError(error?.message || 'ファイルを読み込めませんでした')
      return false
    }
  }, [handle, pickFile, readHandle])

  // ファイルの場所を覚える機能がないブラウザ向け：選んだファイルをその場で読むだけ。
  const loadFromFile = useCallback(
    async (file) => {
      if (!file) return
      applyText(await file.text(), file.name)
    },
    [applyText],
  )

  const forgetFile = useCallback(async () => {
    await clearHandle()
    setHandle(null)
    setFileItems([])
    setClosedMails([])
    setFileUpdatedAt(null)
    setLoadedAt(null)
    setFileName('')
    setFileStatus('none')
    setFileError('')
  }, [])

  // 処理済みの書き出し先を選ぶ（クリックから呼ぶ）。メール受信箱.json と同じフォルダから始める。
  const pickHandledFile = useCallback(async () => {
    if (!saveFileApiSupported) return false
    try {
      const picked = await window.showSaveFilePicker({
        suggestedName: HANDLED_FILE_NAME,
        ...(handle ? { startIn: handle } : {}),
        types: [{ description: '処理済みの印（JSON）', accept: { 'application/json': ['.json'] } }],
      })
      await saveHandle(picked, HANDLED_FILE_KEY)
      setHandledHandle(picked)
      setHandledFileError('')
      setHandledFileStatus('ok')
      return true
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setHandledFileStatus('error')
        setHandledFileError(error?.message || '書き出し先を選べませんでした')
      }
      return false
    }
  }, [handle])

  // 書く許可をもらい直す（クリックから呼ぶ）。
  const allowHandledFile = useCallback(async () => {
    if (!handledHandle) return pickHandledFile()
    try {
      const permission = await handledHandle.requestPermission?.({ mode: 'readwrite' })
      setHandledFileStatus(permission === 'granted' ? 'ok' : 'need-permission')
      return permission === 'granted'
    } catch (error) {
      setHandledFileStatus('error')
      setHandledFileError(error?.message || '書く許可をもらえませんでした')
      return false
    }
  }, [handledHandle, pickHandledFile])

  const forgetHandledFile = useCallback(async () => {
    await clearHandle(HANDLED_FILE_KEY)
    setHandledHandle(null)
    setHandledFileStatus('none')
    setHandledFileError('')
  }, [])

  const markHandled = useCallback((item, action) => {
    setHandled((prev) => ({
      ...prev,
      [item.id]: { action, at: new Date().toISOString(), title: item.title },
    }))
  }, [])

  const restore = useCallback((id) => {
    setHandled((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const addManual = useCallback((draft) => {
    const item = normalizeItem(
      {
        ...draft,
        id: `manual-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
        createdAt: new Date().toISOString(),
      },
      'manual',
    )
    if (!item) return null
    setManualItems((prev) => [item, ...prev])
    return item
  }, [])

  // まだ自動で完了にしていない「閉じたメール」。
  const pendingClosed = useMemo(
    () => closedMails.filter((c) => !autoClosed[c.id]),
    [closedMails, autoClosed],
  )

  const markAutoClosed = useCallback((ids) => {
    if (!ids.length) return
    const at = new Date().toISOString()
    setAutoClosed((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, at])) }))
  }, [])

  const allItems = useMemo(() => {
    const seen = new Set()
    return [...manualItems, ...fileItems].filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [manualItems, fileItems])

  const openItems = useMemo(
    () => allItems.filter((item) => !handled[item.id]).sort(compareItems),
    [allItems, handled],
  )
  // 処理済みの一覧。既読などでファイルから外れたメールも、印に残した件名で出す（受信箱には戻せない）。
  const handledItems = useMemo(() => {
    const byId = new Map(allItems.map((item) => [item.id, item]))
    return Object.entries(handled)
      .map(([id, mark]) => {
        const item = byId.get(id)
        if (item) return { ...item, handled: mark, restorable: true }
        if (!mark?.auto) return null
        return { id, title: mark.title, origin: originOf({ id }, 'mail'), handled: mark, restorable: false }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.handled.at).localeCompare(String(a.handled.at)))
  }, [allItems, handled])

  return {
    openItems,
    handledItems,
    fileStatus,
    fileError,
    fileName,
    fileUpdatedAt,
    loadedAt,
    hasFile: Boolean(handle),
    pickFile,
    reload,
    loadFromFile,
    forgetFile,
    markHandled,
    restore,
    addManual,
    pendingClosed,
    markAutoClosed,
    handledFileStatus,
    handledFileError,
    handledFileName: handledHandle?.name || '',
    pickHandledFile,
    allowHandledFile,
    forgetHandledFile,
  }
}
