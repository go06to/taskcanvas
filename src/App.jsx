import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { TERMS, STORAGE_KEY } from './constants'
import { isDue } from './dateUtils'
import { db, auth, firebaseEnabled, googleProvider, USERS } from './firebase'
import Archive from './components/Archive'
import MemoPanel, { MemoRow } from './components/MemoPanel'
import TaskCard from './components/TaskCard'
import KnowledgePanel, { KnowledgeCard } from './components/KnowledgePanel'

// ログインユーザーごとの localStorage キャッシュキー（未ログイン/無効時は共通キー）。
const localKey = (user) =>
  firebaseEnabled && user ? `${STORAGE_KEY}-u-${user.uid}` : STORAGE_KEY

// 一意なIDを生成する。
const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())

// 今日の日付を ISO 文字列で返す。
const nowISO = () => new Date().toISOString()

const alarmValue = (item) => {
  const value = item?.alarmAt || item?.notifyDate
  return value ? String(value).slice(0, 10) : null
}

const alarmTime = (value) => {
  if (!value) return null
  const time = new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime()
  return Number.isNaN(time) ? null : time
}

const escapeHtml = (value = '') =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const digestPassword = async (password, salt) => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('crypto-unavailable')
  const source = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await subtle.digest('SHA-256', source)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function PasswordDialog({ dialog, onChange, onSubmit, onCancel }) {
  if (!dialog) return null

  return (
    <div className="lock-overlay" role="presentation">
      <div
        className="lock-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-dialog-title"
      >
        <h3 id="password-dialog-title">{dialog.title}</h3>
        <p>{dialog.message}</p>
        <input
          type="password"
          value={dialog.password}
          autoFocus
          placeholder="PW"
          className={dialog.error ? 'error' : ''}
          onChange={(e) => onChange('password', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !dialog.confirm) onSubmit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        {dialog.confirm && (
          <input
            type="password"
            value={dialog.confirmPassword}
            placeholder="PW（確認）"
            className={dialog.error ? 'error' : ''}
            onChange={(e) => onChange('confirmPassword', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit()
              if (e.key === 'Escape') onCancel()
            }}
          />
        )}
        {dialog.error && <p className="lock-error">{dialog.error}</p>}
        <div className="lock-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" className="lock-ok" onClick={onSubmit}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

// 旧ボードの未アーカイブタスクを、新しい分類付きMEMOへ一度だけ移行する。
// 旧タスク固有の項目もオブジェクト内に残し、情報自体は失わない。
function migrateActiveTasksToMemos(data) {
  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const memos = Array.isArray(data.memos) ? data.memos : []
  const activeTasks = tasks.filter((task) => !task.archived)
  if (activeTasks.length === 0) return { data: { ...data, tasks, memos }, migrated: false }

  const convertedTaskIds = new Set(
    memos.map((memo) => memo.sourceTaskId).filter(Boolean),
  )
  const convertedMemos = activeTasks
    .filter((task) => !convertedTaskIds.has(task.id))
    .map((task) => ({
      ...task,
      id: `memo-from-task-${task.id}`,
      sourceTaskId: task.id,
      text: escapeHtml(task.title || ''),
      term: ['short', 'mid', 'long'].includes(task.term) ? task.term : 'memo',
      status: 'action',
      comment: task.comment || '',
      alarmAt: alarmValue(task),
      miniTasks: (Array.isArray(task.subtasks) ? task.subtasks : []).map((subtask) => ({
        ...subtask,
        createdAt: subtask.createdAt || task.createdAt || nowISO(),
      })),
      createdAt: task.createdAt || nowISO(),
      archived: false,
      archivedAt: null,
    }))

  return {
    data: {
      ...data,
      tasks: tasks.filter((task) => task.archived),
      memos: [...memos, ...convertedMemos],
    },
    migrated: true,
  }
}

function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { tasks: [], memos: [], templates: [], knowledge: [] }
    const data = JSON.parse(raw)
    const normalized = Array.isArray(data)
      ? { tasks: data, memos: [], templates: [], knowledge: [] }
      : {
      tasks: data.tasks ?? [],
      memos: data.memos ?? [],
      templates: data.templates ?? [],
      knowledge: data.knowledge ?? [],
      }
    return migrateActiveTasksToMemos(normalized).data
  } catch {
    return { tasks: [], memos: [], templates: [], knowledge: [] }
  }
}

export default function App() {
  // Firebase 無効時はローカルのみで動かす（ログイン不要の単一ボード）。
  const localOnly = !firebaseEnabled

  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(localOnly) // ローカル時は即準備完了
  const [tasks, setTasks] = useState(() =>
    localOnly ? loadLocal(STORAGE_KEY).tasks : [],
  )
  const [memos, setMemos] = useState(() =>
    localOnly ? loadLocal(STORAGE_KEY).memos : [],
  )
  const [templates, setTemplates] = useState(() =>
    localOnly ? loadLocal(STORAGE_KEY).templates : [],
  )
  const [knowledge, setKnowledge] = useState(() =>
    localOnly ? loadLocal(STORAGE_KEY).knowledge : [],
  )
  const [view, setView] = useState('board') // 'board' | 'archive'
  const [sidePane, setSidePane] = useState('memo') // 'memo' | 'free'
  const [query, setQuery] = useState('') // 検索キーワード
  const [detail, setDetail] = useState(null) // 拡大表示 {type:'task'|'memo'|'knowledge', id}
  const [sortKey, setSortKey] = useState(
    () => localStorage.getItem('tb-sort') || 'manual',
  )
  const [filterKey, setFilterKey] = useState('all')
  // 表示中のシート（SPRINT/FOCUS/VISION）。
  const [activeTerm, setActiveTerm] = useState(
    () => localStorage.getItem('tb-active-term') || 'short',
  )
  // クラウド同期の状態表示。
  const [cloudStatus, setCloudStatus] = useState(localOnly ? 'off' : 'connecting')
  const [authError, setAuthError] = useState('')
  const [alarmClock, setAlarmClock] = useState(() => Date.now())
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [unlockedMemoIds, setUnlockedMemoIds] = useState(() => new Set())
  const [passwordDialog, setPasswordDialog] = useState(null)
  // クラウドと最後に同期した内容（送受信のループ防止用）。
  const lastSyncRef = useRef(
    JSON.stringify({ tasks: [], memos: [], templates: [], knowledge: [] }),
  )
  const passwordResolveRef = useRef(null)

  // 開いたままの画面や旧キャッシュにも移行を適用する。
  useEffect(() => {
    const { data, migrated } = migrateActiveTasksToMemos({ tasks, memos })
    if (!migrated) return
    setTasks(data.tasks)
    setMemos(data.memos)
  }, [tasks, memos])

  useEffect(() => {
    const timer = window.setInterval(() => setAlarmClock(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const changeActiveTerm = (key) => {
    setActiveTerm(key)
    localStorage.setItem('tb-active-term', key)
  }

  const askPassword = ({ title, message, confirm = false, minLength = 1 }) =>
    new Promise((resolve) => {
      passwordResolveRef.current = resolve
      setPasswordDialog({
        title,
        message,
        confirm,
        minLength,
        password: '',
        confirmPassword: '',
        error: '',
      })
    })

  const resolvePasswordDialog = (value) => {
    const resolve = passwordResolveRef.current
    passwordResolveRef.current = null
    setPasswordDialog(null)
    if (resolve) resolve(value)
  }

  const updatePasswordDialog = (field, value) =>
    setPasswordDialog((current) =>
      current ? { ...current, [field]: value, error: '' } : current,
    )

  const submitPasswordDialog = () => {
    if (!passwordDialog) return
    const password = passwordDialog.password
    if (password.length < passwordDialog.minLength) {
      setPasswordDialog((current) =>
        current
          ? { ...current, error: `PWは${current.minLength}文字以上で入力してください` }
          : current,
      )
      return
    }
    if (passwordDialog.confirm && password !== passwordDialog.confirmPassword) {
      setPasswordDialog((current) =>
        current ? { ...current, error: 'PWが一致しません' } : current,
      )
      return
    }
    resolvePasswordDialog(password)
  }

  const cancelPasswordDialog = () => resolvePasswordDialog(null)

  // --- 認証（Google ログイン）-------------------------------------------
  const signIn = () => {
    setAuthError('')
    signInWithPopup(auth, googleProvider).catch((e) => {
      console.error('ログイン失敗:', e)
      setAuthError('ログインに失敗しました（' + (e.code || e.message) + '）')
    })
  }
  const signOutNow = () => signOut(auth)

  // ログイン状態の監視。サインイン時はそのアカウントのローカルキャッシュを表示。
  useEffect(() => {
    if (localOnly) return
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthReady(true)
      if (u) {
        const s = loadLocal(localKey(u))
        lastSyncRef.current = JSON.stringify({
          tasks: s.tasks,
          memos: s.memos,
          templates: s.templates,
          knowledge: s.knowledge,
        })
        setTasks(s.tasks)
        setMemos(s.memos)
        setTemplates(s.templates)
        setKnowledge(s.knowledge)
        setCloudStatus('connecting')
      } else {
        setTasks([])
        setMemos([])
        setTemplates([])
        setKnowledge([])
        setCloudStatus('off')
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 変更のたびにブラウザへ自動保存（アカウント別）＋クラウドへ反映。
  useEffect(() => {
    const json = JSON.stringify({ tasks, memos, templates, knowledge })
    localStorage.setItem(localKey(user), json)
    if (firebaseEnabled && db && user && json !== lastSyncRef.current) {
      lastSyncRef.current = json
      setDoc(
        doc(db, USERS, user.uid),
        { tasks, memos, templates, knowledge, updatedAt: serverTimestamp() },
        { merge: true },
      ).catch((e) => console.error('クラウド保存に失敗:', e))
    }
  }, [tasks, memos, templates, knowledge, user])

  // クラウド（Firestore）とのリアルタイム同期（ログインユーザーごと）。
  useEffect(() => {
    if (!firebaseEnabled || !db || !user) return
    setCloudStatus('connecting')
    const ref = doc(db, USERS, user.uid)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setCloudStatus('on')
        if (!snap.exists()) {
          setDoc(
            ref,
            { tasks, memos, templates, knowledge, updatedAt: serverTimestamp() },
            { merge: true },
          ).catch(() => {})
          return
        }
        const data = snap.data()
        const rawIncoming = {
          tasks: data.tasks ?? [],
          memos: data.memos ?? [],
          templates: data.templates ?? [],
          knowledge: data.knowledge ?? [],
        }
        const { data: incoming, migrated } = migrateActiveTasksToMemos(rawIncoming)
        // 移行があった場合は旧データを比較元にし、変換後データをクラウドへ書き戻す。
        lastSyncRef.current = JSON.stringify(migrated ? rawIncoming : incoming)
        setTasks(incoming.tasks)
        setMemos(incoming.memos)
        setTemplates(incoming.templates)
        setKnowledge(incoming.knowledge)
      },
      (err) => {
        setCloudStatus('error')
        console.error('クラウド同期エラー:', err)
      },
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    localStorage.setItem('tb-sort', sortKey)
  }, [sortKey])

  // 並び替え・絞り込みを適用（ピン留めは常に先頭）。
  const sortFilterTasks = (list) => {
    let r = list
    if (filterKey === 'open') r = r.filter((t) => !t.done)
    else if (filterKey === 'due')
      r = r.filter((t) => !t.done && isDue(t.notifyDate))
    const sorters = {
      manual: () => 0,
      created_desc: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
      created_asc: (a, b) => (a.createdAt > b.createdAt ? 1 : -1),
      notify: (a, b) => {
        const av = a.notifyDate || '9999-99-99'
        const bv = b.notifyDate || '9999-99-99'
        return av > bv ? 1 : av < bv ? -1 : 0
      },
      priority: (a, b) => (b.priority || 0) - (a.priority || 0),
    }
    const s = sorters[sortKey] || sorters.manual
    return [...r].sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || s(a, b),
    )
  }

  // --- タスク操作 ---------------------------------------------------------
  const addTask = (title, term) => {
    const t = title.trim()
    if (!t) return
    setTasks((prev) => [
      {
        id: newId(),
        title: t,
        term,
        createdAt: nowISO(), // 作成日付が自動で入る
        notifyDate: null, // お知らせ日付（任意・未設定可）
        comment: '', // タスクのコメント
        pinned: false, // ピン留め
        priority: 0, // 優先度（0=なし,1低,2中,3高）
        repeat: false, // 完了時に繰り返し生成
        commentUpdatedAt: null,
        done: false,
        archived: false,
        completedAt: null,
        subtasks: [],
      },
      ...prev,
    ])
  }

  const updateTask = (id, patch) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const toggleDone = (id) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    )

  const changeTerm = (id, term) => updateTask(id, { term })

  // お知らせ日付の設定／解除（null で解除）。
  const setNotify = (id, notifyDate) => updateTask(id, { notifyDate })

  const togglePin = (id) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
    )
  const setPriority = (id, priority) => updateTask(id, { priority })
  const toggleRepeat = (id) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, repeat: !t.repeat } : t)),
    )

  // ドラッグで並び替え（dragged を target の直前へ。分類はtargetに合わせる）。
  const reorderTask = (draggedId, targetId) => {
    if (draggedId === targetId) return
    setTasks((prev) => {
      const arr = [...prev]
      const from = arr.findIndex((t) => t.id === draggedId)
      const to = arr.findIndex((t) => t.id === targetId)
      if (from < 0 || to < 0) return prev
      const moved = { ...arr[from], term: arr[to].term }
      arr.splice(from, 1)
      const newTo = arr.findIndex((t) => t.id === targetId)
      arr.splice(newTo, 0, moved)
      return arr
    })
  }
  // タブへドロップ → その分類へ移動。
  const moveTaskToTerm = (draggedId, term) => updateTask(draggedId, { term })

  const archiveTask = (id) =>
    setTasks((prev) => {
      const t = prev.find((x) => x.id === id)
      let arr = prev.map((x) =>
        x.id === id
          ? { ...x, archived: true, done: true, completedAt: nowISO() }
          : x,
      )
      // 繰り返しタスクは、完了時に未完了コピーを先頭へ生成。
      if (t && t.repeat) {
        arr = [
          {
            ...t,
            id: newId(),
            createdAt: nowISO(),
            notifyDate: null,
            done: false,
            archived: false,
            completedAt: null,
            subtasks: t.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
          },
          ...arr,
        ]
      }
      return arr
    })

  const restoreTask = (id) =>
    updateTask(id, { archived: false, completedAt: null })

  const deleteTask = (id) => {
    if (!confirm('このタスクを削除しますか？')) return
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  // --- サブタスク（1階層）-------------------------------------------------
  const addSubtask = (taskId, title) => {
    const t = title.trim()
    if (!t) return
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: [
                ...task.subtasks,
                {
                  id: newId(),
                  title: t,
                  createdAt: nowISO(),
                  done: false,
                  comment: '',
                  commentUpdatedAt: null,
                },
              ],
            }
          : task,
      ),
    )
  }

  const toggleSubtask = (taskId, subId) =>
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: task.subtasks.map((s) =>
                s.id === subId ? { ...s, done: !s.done } : s,
              ),
            }
          : task,
      ),
    )

  const editSubtask = (taskId, subId, title) =>
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: task.subtasks.map((s) =>
                s.id === subId ? { ...s, title } : s,
              ),
            }
          : task,
      ),
    )

  const editSubComment = (taskId, subId, comment) =>
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              subtasks: task.subtasks.map((s) =>
                s.id === subId
                  ? { ...s, comment, commentUpdatedAt: comment ? nowISO() : null }
                  : s,
              ),
            }
          : task,
      ),
    )

  const deleteSubtask = (taskId, subId) => {
    if (!confirm('この追加タスクを削除しますか？')) return
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, subtasks: task.subtasks.filter((s) => s.id !== subId) }
          : task,
      ),
    )
  }

  // --- メモ（登録時に MEMO / SPRINT / FOCUS / VISION を選択）-------------
  const isMemoProtected = (memo) => Boolean(memo?.passwordHash)
  const isMemoUnlocked = (id) => unlockedMemoIds.has(id)
  const canReadMemo = (memo) => !isMemoProtected(memo) || isMemoUnlocked(memo.id)
  const warnIfMemoPasswordRequired = (id) => {
    const memo = memos.find((item) => item.id === id)
    if (!memo || canReadMemo(memo)) return false
    alert('このタスクはPWが必要です。')
    return true
  }
  const updateMemo = (id, patch, { allowProtected = false } = {}) =>
    setMemos((prev) =>
      prev.map((memo) =>
        memo.id === id && (allowProtected || canReadMemo(memo))
          ? { ...memo, ...patch }
          : memo,
      ),
    )

  const makePasswordPatch = async (password) => {
    const passwordSalt = newId()
    return {
      passwordSalt,
      passwordHash: await digestPassword(password, passwordSalt),
      passwordProtectedAt: nowISO(),
    }
  }

  const unlockMemo = async (id) => {
    const memo = memos.find((item) => item.id === id)
    if (!memo) return false
    if (!isMemoProtected(memo)) return true
    if (isMemoUnlocked(id)) return true
    const password = await askPassword({
      title: 'PW入力',
      message: 'このタスクを開くにはPWが必要です。',
    })
    if (password === null) return false
    try {
      const passwordHash = await digestPassword(password, memo.passwordSalt || '')
      if (passwordHash !== memo.passwordHash) {
        alert('PWが違います。')
        return false
      }
      setUnlockedMemoIds((current) => new Set(current).add(id))
      return true
    } catch {
      alert('このブラウザではPW機能を使えません。')
      return false
    }
  }

  const lockMemoView = (id) =>
    setUnlockedMemoIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })

  const setMemoPassword = async (id) => {
    const memo = memos.find((item) => item.id === id)
    if (!memo) return false
    if (isMemoProtected(memo) && !(await unlockMemo(id))) return false
    const password = await askPassword({
      title: 'PW設定',
      message: 'このタスクを開くためのPWを設定します。',
      confirm: true,
      minLength: 4,
    })
    if (password === null) return false
    try {
      const patch = await makePasswordPatch(password)
      updateMemo(id, patch, { allowProtected: true })
      setUnlockedMemoIds((current) => new Set(current).add(id))
      return true
    } catch {
      alert('このブラウザではPW機能を使えません。')
      return false
    }
  }

  const clearMemoPassword = async (id) => {
    const memo = memos.find((item) => item.id === id)
    if (!memo || !isMemoProtected(memo)) return false
    if (!(await unlockMemo(id))) return false
    if (!confirm('このタスクのPWを解除しますか？')) return false
    updateMemo(
      id,
      { passwordSalt: null, passwordHash: null, passwordProtectedAt: null },
      { allowProtected: true },
    )
    lockMemoView(id)
    return true
  }

  const addMemo = (text, status = 'note', term, passwordPatch = {}) => {
    const t = text.trim()
    if (!t || !term) return null
    const id = newId()
    // 新しく作成したMEMOを一覧の先頭へ追加。
    setMemos((prev) => [
      {
        id,
        text: t,
        status,
        term,
        comment: '',
        miniTasks: [],
        alarmAt: null,
        passwordSalt: null,
        passwordHash: null,
        passwordProtectedAt: null,
        ...passwordPatch,
        createdAt: nowISO(),
        done: false,
        archived: false,
        archivedAt: null,
      },
      ...prev,
    ])
    return id
  }

  const addProtectedMemo = async (text, status = 'note', term) => {
    const t = text.trim()
    if (!t || !term) return false
    const password = await askPassword({
      title: 'PW付きで作成',
      message: 'このタスクを開くためのPWを設定します。',
      confirm: true,
      minLength: 4,
    })
    if (password === null) return false
    try {
      const patch = await makePasswordPatch(password)
      const id = addMemo(t, status, term, patch)
      if (id) setUnlockedMemoIds((current) => new Set(current).add(id))
      return Boolean(id)
    } catch {
      alert('このブラウザではPW機能を使えません。')
      return false
    }
  }

  const toggleMemoDone = (id) => {
    if (warnIfMemoPasswordRequired(id)) return
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
    )
  }

  const editMemo = (id, text) => updateMemo(id, { text })

  const editMemoComment = (id, comment) =>
    updateMemo(id, { comment, commentUpdatedAt: comment ? nowISO() : null })

  const setMemoStatus = (id, status) => updateMemo(id, { status })

  const setMemoTerm = (id, term) => updateMemo(id, { term })

  const setMemoAlarm = (id, alarmAt) =>
    updateMemo(id, { alarmAt, notifyDate: null })

  const addMemoMiniTask = (memoId, title) => {
    if (warnIfMemoPasswordRequired(memoId)) return
    setMemos((prev) =>
      prev.map((memo) =>
        memo.id === memoId
          ? {
              ...memo,
              miniTasks: [
                ...(Array.isArray(memo.miniTasks) ? memo.miniTasks : []),
                {
                  id: newId(),
                  title,
                  done: false,
                  createdAt: nowISO(),
                  alarmAt: null,
                },
              ],
            }
          : memo,
      ),
    )
  }

  const toggleMemoMiniTask = (memoId, miniTaskId) => {
    if (warnIfMemoPasswordRequired(memoId)) return
    setMemos((prev) =>
      prev.map((memo) =>
        memo.id === memoId
          ? {
              ...memo,
              miniTasks: (memo.miniTasks || []).map((task) =>
                task.id === miniTaskId ? { ...task, done: !task.done } : task,
              ),
            }
          : memo,
      ),
    )
  }

  const editMemoMiniTask = (memoId, miniTaskId, title) => {
    if (warnIfMemoPasswordRequired(memoId)) return
    setMemos((prev) =>
      prev.map((memo) =>
        memo.id === memoId
          ? {
              ...memo,
              miniTasks: (memo.miniTasks || []).map((task) =>
                task.id === miniTaskId ? { ...task, title } : task,
              ),
            }
          : memo,
      ),
    )
  }

  const setMemoMiniTaskAlarm = (memoId, miniTaskId, alarmAt) => {
    if (warnIfMemoPasswordRequired(memoId)) return
    setMemos((prev) =>
      prev.map((memo) =>
        memo.id === memoId
          ? {
              ...memo,
              miniTasks: (memo.miniTasks || []).map((task) =>
                task.id === miniTaskId
                  ? { ...task, alarmAt, notifyDate: null }
                  : task,
              ),
            }
          : memo,
      ),
    )
  }

  const deleteMemoMiniTask = (memoId, miniTaskId) => {
    if (warnIfMemoPasswordRequired(memoId)) return
    setMemos((prev) =>
      prev.map((memo) =>
        memo.id === memoId
          ? {
              ...memo,
              miniTasks: (memo.miniTasks || []).filter(
                (task) => task.id !== miniTaskId,
              ),
            }
          : memo,
      ),
    )
  }

  // メモの並び替え（dragged を target の直前へ）。
  const reorderMemo = (draggedId, targetId) => {
    if (draggedId === targetId) return
    setMemos((prev) => {
      const arr = [...prev]
      const from = arr.findIndex((m) => m.id === draggedId)
      const to = arr.findIndex((m) => m.id === targetId)
      if (from < 0 || to < 0) return prev
      if (!canReadMemo(arr[from])) return prev
      const [moved] = arr.splice(from, 1)
      const newTo = arr.findIndex((m) => m.id === targetId)
      arr.splice(newTo, 0, moved)
      return arr
    })
  }

  // --- テンプレート -------------------------------------------------------
  const addTemplate = (title) => {
    const t = title.trim()
    if (!t) return
    setTemplates((prev) => [...prev, { id: newId(), title: t }])
  }
  const removeTemplate = (id) =>
    setTemplates((prev) => prev.filter((x) => x.id !== id))
  const useTemplate = (id) => {
    const tpl = templates.find((x) => x.id === id)
    if (tpl) addTask(tpl.title, activeTerm)
  }

  // メモを完了フォルダへ移動／ボードへ戻す。
  const archiveMemo = (id) =>
    setMemos((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, archived: true, done: true, archivedAt: nowISO() } : m,
      ),
    )

  const restoreMemo = (id) =>
    setMemos((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, archived: false, archivedAt: null } : m,
      ),
    )

  const deleteMemo = (id) => {
    if (warnIfMemoPasswordRequired(id)) return
    if (!confirm('このメモを削除しますか？')) return
    setMemos((prev) => prev.filter((m) => m.id !== id))
    lockMemoView(id)
  }

  // --- Freespace（ナレッジカード）---------------------------------------
  const addKnowledge = ({ title, body, category, tags, color }) => {
    if (!title && !body && !category && (!tags || tags.length === 0)) return
    setKnowledge((prev) => [
      {
        id: newId(),
        title,
        body,
        category,
        tags,
        color,
        pinned: false,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
      ...prev,
    ])
  }

  const updateKnowledge = (id, patch) =>
    setKnowledge((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: nowISO() } : item,
      ),
    )

  const toggleKnowledgePin = (id) =>
    setKnowledge((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, pinned: !item.pinned, updatedAt: nowISO() }
          : item,
      ),
    )

  const deleteKnowledge = (id) => {
    if (!confirm('このナレッジを削除しますか？')) return
    setKnowledge((prev) => prev.filter((item) => item.id !== id))
  }

  // --- 検索 ---------------------------------------------------------------
  const q = query.trim().toLowerCase()
  const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, ' ')
  const matchTask = (t) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    t.subtasks.some((s) => s.title.toLowerCase().includes(q))
  const matchMemo = (m) =>
    !q || (canReadMemo(m) && stripHtml(m.text).toLowerCase().includes(q))

  // --- 集計 ---------------------------------------------------------------
  const activeTasks = tasks.filter((t) => !t.archived && matchTask(t))
  const archivedTasks = tasks.filter((t) => t.archived && matchTask(t))
  const activeMemos = memos.filter((m) => !m.archived && matchMemo(m))
  const archivedMemos = memos.filter((m) => m.archived && matchMemo(m))
  // バッジ件数は検索に左右されない総数で表示。
  const archivedCount =
    tasks.filter((t) => t.archived).length +
    memos.filter((m) => m.archived).length
  const dueTaskCount = tasks.filter(
    (t) => !t.archived && !t.done && isDue(t.notifyDate),
  ).length
  const alarmItems = memos
    .filter((memo) => !memo.archived && !memo.done)
    .flatMap((memo) => {
      const visible = canReadMemo(memo)
      return [
        ...(alarmValue(memo)
          ? [
              {
                id: memo.id,
                alarmAt: alarmValue(memo),
                text: visible ? stripHtml(memo.text) : 'PWが必要なタスク',
              },
            ]
          : []),
        ...(visible ? memo.miniTasks || [] : [])
          .filter((task) => !task.done && alarmValue(task))
          .map((task) => ({
            id: `${memo.id}:${task.id}`,
            alarmAt: alarmValue(task),
            text: task.title,
          })),
      ]
    })
  const dueAlarmItems = alarmItems.filter((item) => {
    const time = alarmTime(item.alarmAt)
    return time !== null && time <= alarmClock
  })
  const dueCount = dueTaskCount + dueAlarmItems.length
  const dueAlarmSignature = dueAlarmItems
    .map((item) => `${item.id}:${item.alarmAt}`)
    .join('|')

  useEffect(() => {
    if (notificationPermission !== 'granted' || !dueAlarmSignature) return
    dueAlarmItems.forEach((item) => {
      const key = `taskcanvas-alarm:${item.id}:${item.alarmAt}`
      if (localStorage.getItem(key)) return
      try {
        new Notification('TaskCanvas アラーム', {
          body: item.text || '設定した時間になりました',
          icon: '/icon-192.png',
        })
        localStorage.setItem(key, '1')
      } catch (error) {
        console.warn('ブラウザ通知を表示できませんでした:', error)
      }
    })
  }, [dueAlarmSignature, notificationPermission])

  const enableBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  // タスクカード／メモ行に渡すハンドラ一式（通常表示と拡大表示で共用）。
  const taskProps = {
    onToggleDone: toggleDone,
    onChangeTerm: changeTerm,
    onArchive: archiveTask,
    onDelete: deleteTask,
    onSetNotify: setNotify,
    onTogglePin: togglePin,
    onSetPriority: setPriority,
    onToggleRepeat: toggleRepeat,
    onReorder: reorderTask,
    onEditTitle: (id, title) => updateTask(id, { title }),
    onEditComment: (id, comment) =>
      updateTask(id, { comment, commentUpdatedAt: comment ? nowISO() : null }),
    onAddSubtask: addSubtask,
    onToggleSubtask: toggleSubtask,
    onEditSubtask: editSubtask,
    onEditSubComment: editSubComment,
    onDeleteSubtask: deleteSubtask,
  }
  const memoProps = {
    onToggleDone: toggleMemoDone,
    onEdit: editMemo,
    onEditComment: editMemoComment,
    onSetStatus: setMemoStatus,
    onSetTerm: setMemoTerm,
    onSetAlarm: setMemoAlarm,
    onAddMiniTask: addMemoMiniTask,
    onToggleMiniTask: toggleMemoMiniTask,
    onEditMiniTask: editMemoMiniTask,
    onSetMiniTaskAlarm: setMemoMiniTaskAlarm,
    onDeleteMiniTask: deleteMemoMiniTask,
    onReorder: reorderMemo,
    onArchive: archiveMemo,
    onDelete: deleteMemo,
    onAddProtected: addProtectedMemo,
    isUnlocked: isMemoUnlocked,
    onUnlock: unlockMemo,
    onLock: lockMemoView,
    onSetPassword: setMemoPassword,
    onClearPassword: clearMemoPassword,
  }
  const knowledgeProps = {
    items: knowledge,
    onAdd: addKnowledge,
    onUpdate: updateKnowledge,
    onDelete: deleteKnowledge,
    onTogglePin: toggleKnowledgePin,
  }
  const openDetail = (type, id) => setDetail({ type, id })
  const closeDetail = () => setDetail(null)
  const detailTask =
    detail?.type === 'task' ? tasks.find((t) => t.id === detail.id) : null
  const detailMemo =
    detail?.type === 'memo' ? memos.find((m) => m.id === detail.id) : null
  const detailKnowledge =
    detail?.type === 'knowledge'
      ? knowledge.find((item) => item.id === detail.id)
      : null
  // --- 認証ゲート（Firebase 有効時のみ）---------------------------------
  if (firebaseEnabled && !authReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="auth-loading">読み込み中…</p>
        </div>
      </div>
    )
  }
  if (firebaseEnabled && !user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img className="auth-mark" src="/auth-icon.png" alt="" width="56" height="56" />
          <h1>TaskCanvas</h1>
          <p className="auth-desc">
            Google アカウントでログインしてください。
            <br />
            仕事用・プライベート用など、アカウントごとにデータが分かれます。
          </p>
          <button className="google-btn" onClick={signIn}>
            <span className="g-mark">G</span> Google でログイン
          </button>
          {authError && <p className="auth-error">{authError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header dashboard-sidebar">
        <div className="brand">
          <img className="brand-mark" src="/auth-icon.png" alt="" />
          <h1>TaskCanvas</h1>
        </div>

        <nav className="view-switch">
          <button
            className={view === 'board' && sidePane === 'memo' ? 'active' : ''}
            onClick={() => {
              setView('board')
              setSidePane('memo')
            }}
          >
            Task
          </button>
          <button
            className={view === 'board' && sidePane === 'free' ? 'active' : ''}
            onClick={() => {
              setView('board')
              setSidePane('free')
            }}
          >
            Freespace
          </button>
          <button
            className={view === 'archive' ? 'active' : ''}
            onClick={() => {
              setView('archive')
            }}
          >
            完了フォルダ
            {archivedCount > 0 && (
              <span className="badge">{archivedCount}</span>
            )}
          </button>
        </nav>

        <div className="search">
          <span className="search-ic">⌕</span>
          <input
            value={query}
            placeholder="検索（タスク・メモ）"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => setQuery('')}
              title="クリア"
            >
              ✕
            </button>
          )}
        </div>

        <div className="actions">
          {cloudStatus !== 'off' && (
            <span
              className={`cloud-status ${cloudStatus}`}
              title={
                cloudStatus === 'on'
                  ? 'クラウド同期中（全端末で共有）'
                  : cloudStatus === 'error'
                    ? 'クラウド同期エラー（設定・ルールを確認）'
                    : 'クラウドに接続中…'
              }
            >
              {cloudStatus === 'on'
                ? '同期中'
                : cloudStatus === 'error'
                  ? 'エラー'
                  : '接続中'}
            </span>
          )}
          {alarmItems.length > 0 && notificationPermission === 'default' && (
            <button
              type="button"
              className="ghost alarm-permission"
              onClick={enableBrowserNotifications}
              title="アラームのブラウザ通知を許可"
            >
              通知を許可
            </button>
          )}
          {dueCount > 0 && (
            <div
              className="due-indicator"
              title="設定時刻になったアラームがあります"
            >
              アラーム {dueCount}件
            </div>
          )}
          {user && (
            <div className="account">
              {user.photoURL ? (
                <img
                  className="account-avatar"
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="account-avatar fallback">
                  {(user.email || '?')[0].toUpperCase()}
                </span>
              )}
              <button className="ghost" onClick={signOutNow} title="サインアウト">
                ログアウト
              </button>
            </div>
          )}
        </div>
      </header>

      <div
        className={`layout ${view === 'board' ? 'is-single-pane' : 'mobile-board'}`}
      >
        {view !== 'archive' &&
          (view === 'board' && sidePane === 'free' ? (
            <KnowledgePanel
              onOpenDetail={(id) => openDetail('knowledge', id)}
              {...knowledgeProps}
            />
          ) : (
            <MemoPanel
              memos={activeMemos}
              onAdd={addMemo}
              onOpenDetail={(id) => openDetail('memo', id)}
              {...memoProps}
            />
          ))}

        {view !== 'board' && (
          <div className="main-area">
            <Archive
              tasks={archivedTasks}
              memos={archivedMemos}
              onRestore={restoreTask}
              onDelete={deleteTask}
              onRestoreMemo={restoreMemo}
              onDeleteMemo={deleteMemo}
              isMemoUnlocked={isMemoUnlocked}
              onUnlockMemo={unlockMemo}
            />
          </div>
        )}
      </div>

      {/* 拡大表示（タスク／メモ／ナレッジ） */}
      {(detailTask || detailMemo || detailKnowledge) && (
        <div
          className="detail-overlay"
          onClick={(e) => {
            if (e.target.classList.contains('detail-overlay')) closeDetail()
          }}
        >
          <div
            className={`detail-modal ${detailKnowledge ? 'knowledge-detail-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={detailKnowledge ? 'ナレッジの拡大表示' : '詳細の拡大表示'}
          >
            <button className="detail-close" onClick={closeDetail} title="閉じる">
              ✕
            </button>
            {detailTask && (
              <TaskCard task={detailTask} large onOpenDetail={() => {}} {...taskProps} />
            )}
            {detailMemo && (
              <div className="memo-detail">
                <MemoRow memo={detailMemo} large onOpenDetail={() => {}} {...memoProps} />
              </div>
            )}
            {detailKnowledge && (
              <KnowledgeCard
                item={detailKnowledge}
                large
                onOpenDetail={() => {}}
                {...knowledgeProps}
              />
            )}
          </div>
        </div>
      )}
      <PasswordDialog
        dialog={passwordDialog}
        onChange={updatePasswordDialog}
        onSubmit={submitPasswordDialog}
        onCancel={cancelPasswordDialog}
      />
    </div>
  )
}
