import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { TERMS, STORAGE_KEY } from './constants'
import { isDue } from './dateUtils'
import { db, auth, firebaseEnabled, googleProvider, USERS } from './firebase'
import BoardPanel from './components/BoardPanel'
import Archive from './components/Archive'
import MemoPanel, { MemoRow } from './components/MemoPanel'
import TaskCard from './components/TaskCard'
import KnowledgePanel from './components/KnowledgePanel'

// ログインユーザーごとの localStorage キャッシュキー（未ログイン/無効時は共通キー）。
const localKey = (user) =>
  firebaseEnabled && user ? `${STORAGE_KEY}-u-${user.uid}` : STORAGE_KEY

// 一意なIDを生成する。
const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())

// 今日の日付を ISO 文字列で返す。
const nowISO = () => new Date().toISOString()

function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { tasks: [], memos: [], templates: [], knowledge: [] }
    const data = JSON.parse(raw)
    if (Array.isArray(data)) return { tasks: data, memos: [], templates: [], knowledge: [] }
    return {
      tasks: data.tasks ?? [],
      memos: data.memos ?? [],
      templates: data.templates ?? [],
      knowledge: data.knowledge ?? [],
    }
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
  const [view, setView] = useState('board') // 'board' | 'organize' | 'archive'
  const [sidePane, setSidePane] = useState('memo') // 'memo' | 'free'
  const [query, setQuery] = useState('') // 検索キーワード
  const [detail, setDetail] = useState(null) // 拡大表示 {type:'task'|'memo', id}
  const [sortKey, setSortKey] = useState(
    () => localStorage.getItem('tb-sort') || 'manual',
  )
  const [filterKey, setFilterKey] = useState('all')
  // 表示中のシート（SPRINT/FOCUS/VISION）。
  const [activeTerm, setActiveTerm] = useState(
    () => localStorage.getItem('tb-active-term') || 'short',
  )
  // メモ欄の幅（レイアウト設定）。's' | 'm' | 'l' | 'xl'
  const [memoSize, setMemoSize] = useState(() => {
    const saved = localStorage.getItem('tb-memo-size') || 'm'
    return saved === 'full' ? 'm' : saved
  })
  // メモを隠してボードを全体表示するか。
  const [boardFull, setBoardFull] = useState(false)
  // 逆に、ボードを隠して MEMO だけを大きく表示するか（スマホ向け）。
  const [memoOnly, setMemoOnly] = useState(false)
  const [mobilePane, setMobilePane] = useState(
    () => localStorage.getItem('tb-mobile-pane') || 'memo',
  )
  // クラウド同期の状態表示。
  const [cloudStatus, setCloudStatus] = useState(localOnly ? 'off' : 'connecting')
  const [authError, setAuthError] = useState('')
  const fileInputRef = useRef(null)
  // クラウドと最後に同期した内容（送受信のループ防止用）。
  const lastSyncRef = useRef(
    JSON.stringify({ tasks: [], memos: [], templates: [], knowledge: [] }),
  )

  const changeMemoSize = (s) => setMemoSize(s === 'full' ? 'm' : s)

  const changeActiveTerm = (key) => {
    setActiveTerm(key)
    localStorage.setItem('tb-active-term', key)
  }

  // 「ボード全体」と「メモのみ」は排他。
  const toggleBoardFull = () => {
    setBoardFull((v) => {
      const nv = !v
      if (nv) setMemoOnly(false)
      return nv
    })
  }
  const toggleMemoOnly = () => {
    setMemoOnly((v) => {
      const nv = !v
      if (nv) setBoardFull(false)
      return nv
    })
  }

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
        const incoming = {
          tasks: data.tasks ?? [],
          memos: data.memos ?? [],
          templates: data.templates ?? [],
          knowledge: data.knowledge ?? [],
        }
        lastSyncRef.current = JSON.stringify(incoming)
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
    localStorage.setItem('tb-memo-size', memoSize)
  }, [memoSize])

  useEffect(() => {
    localStorage.setItem('tb-mobile-pane', mobilePane)
  }, [mobilePane])

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

  // --- メモ（フリー入力 → ワンクリックでタスク化）------------------------
  const addMemo = (text) => {
    const t = text.trim()
    if (!t) return
    // ボードに書いた順で上から下へ並ぶよう末尾に追加。
    setMemos((prev) => [
      ...prev,
      {
        id: newId(),
        text: t,
        comment: '',
        createdAt: nowISO(),
        done: false,
        archived: false,
        archivedAt: null,
      },
    ])
  }

  const toggleMemoDone = (id) =>
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
    )

  const editMemo = (id, text) =>
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text } : m)),
    )

  const editMemoComment = (id, comment) =>
    setMemos((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, comment, commentUpdatedAt: comment ? nowISO() : null } : m,
      ),
    )

  // メモをボードのタスクへ移動（既定は SPRINT=short）。装飾は除去して本文を採用。
  const promoteMemo = (memoId, term = 'short') => {
    const m = memos.find((x) => x.id === memoId)
    if (!m) return
    const title = (m.text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title) return
    setTasks((prev) => [
      {
        id: newId(),
        title,
        term,
        createdAt: nowISO(),
        notifyDate: null,
        comment: m.comment || '',
        commentUpdatedAt: m.comment ? m.commentUpdatedAt || nowISO() : null,
        pinned: false,
        priority: 0,
        repeat: false,
        done: false,
        archived: false,
        completedAt: null,
        subtasks: [],
      },
      ...prev,
    ])
    setMemos((prev) => prev.filter((x) => x.id !== memoId))
  }

  // メモの並び替え（dragged を target の直前へ）。
  const reorderMemo = (draggedId, targetId) => {
    if (draggedId === targetId) return
    setMemos((prev) => {
      const arr = [...prev]
      const from = arr.findIndex((m) => m.id === draggedId)
      const to = arr.findIndex((m) => m.id === targetId)
      if (from < 0 || to < 0) return prev
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
    if (!confirm('このメモを削除しますか？')) return
    setMemos((prev) => prev.filter((m) => m.id !== id))
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

  // --- ファイル書き出し / 読み込み ---------------------------------------
  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ tasks, memos, templates, knowledge }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `tasks-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        // 旧形式（配列）と新形式（{tasks, memos}）の両方に対応。
        const nextTasks = Array.isArray(data) ? data : data.tasks
        const nextMemos = Array.isArray(data) ? [] : data.memos ?? []
        const nextTemplates = Array.isArray(data) ? [] : data.templates ?? []
        const nextKnowledge = Array.isArray(data) ? [] : data.knowledge ?? []
        if (!Array.isArray(nextTasks)) throw new Error('形式が違います')
        if (!Array.isArray(nextMemos)) throw new Error('形式が違います')
        if (!Array.isArray(nextTemplates)) throw new Error('形式が違います')
        if (!Array.isArray(nextKnowledge)) throw new Error('形式が違います')
        if (
          (tasks.length > 0 ||
            memos.length > 0 ||
            templates.length > 0 ||
            knowledge.length > 0) &&
          !confirm('現在のタスク・メモ・ナレッジを読み込んだ内容で置き換えます。よろしいですか？')
        ) {
          return
        }
        setTasks(nextTasks)
        setMemos(nextMemos)
        setTemplates(nextTemplates)
        setKnowledge(nextKnowledge)
      } catch {
        alert('読み込みに失敗しました。正しいJSONファイルを選んでください。')
      }
    }
    reader.readAsText(file)
    e.target.value = '' // 同じファイルを再選択できるようにリセット
  }

  // --- 検索 ---------------------------------------------------------------
  const q = query.trim().toLowerCase()
  const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, ' ')
  const matchTask = (t) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    t.subtasks.some((s) => s.title.toLowerCase().includes(q))
  const matchMemo = (m) => !q || stripHtml(m.text).toLowerCase().includes(q)

  // --- 集計 ---------------------------------------------------------------
  const activeTasks = tasks.filter((t) => !t.archived && matchTask(t))
  const archivedTasks = tasks.filter((t) => t.archived && matchTask(t))
  const activeMemos = memos.filter((m) => !m.archived && matchMemo(m))
  const archivedMemos = memos.filter((m) => m.archived && matchMemo(m))
  const termCounts = Object.fromEntries(
    TERMS.map((t) => [
      t.key,
      activeTasks.filter((x) => x.term === t.key).length,
    ]),
  )
  // バッジ件数は検索に左右されない総数で表示。
  const archivedCount =
    tasks.filter((t) => t.archived).length +
    memos.filter((m) => m.archived).length
  // お知らせ日付が来た（未完了の）タスク数 ＝ アラート対象（検索に左右されない）。
  const dueCount = tasks.filter(
    (t) => !t.archived && !t.done && isDue(t.notifyDate),
  ).length

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
    onReorder: reorderMemo,
    onPromote: promoteMemo,
    onArchive: archiveMemo,
    onDelete: deleteMemo,
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
  const openTermFromMemo = (key) => {
    changeActiveTerm(key)
    setMemoOnly(false)
    setBoardFull(false)
    setMobilePane('board')
    setView('board')
  }
  const detailTask =
    detail?.type === 'task' ? tasks.find((t) => t.id === detail.id) : null
  const detailMemo =
    detail?.type === 'memo' ? memos.find((m) => m.id === detail.id) : null
  const sidePaneWidth = {
    s: '380px',
    m: '480px',
    l: '620px',
    xl: '50vw',
  }[memoSize] || '480px'

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
      <header className="header">
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
              setBoardFull(false)
              setMemoOnly(false)
            }}
          >
            MEMO
          </button>
          <button
            className={view === 'board' && sidePane === 'free' ? 'active' : ''}
            onClick={() => {
              setView('board')
              setSidePane('free')
              setBoardFull(false)
              setMemoOnly(false)
              setMobilePane('memo')
            }}
          >
            Freespace
          </button>
          <button
            className={view === 'organize' ? 'active' : ''}
            onClick={() => {
              setView('organize')
              setSidePane('memo')
              setBoardFull(false)
              setMemoOnly(false)
            }}
          >
            ナレッジ整理
          </button>
          <button
            className={view === 'archive' ? 'active' : ''}
            onClick={() => {
              setView('archive')
              setBoardFull(false)
              setMemoOnly(false)
            }}
          >
            完了フォルダ
            {archivedCount > 0 && (
              <span className="badge">{archivedCount}</span>
            )}
          </button>
        </nav>

        <div className="search">
          <span className="search-ic">🔍</span>
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
                ? '☁ 同期中'
                : cloudStatus === 'error'
                  ? '☁ エラー'
                  : '☁ 接続中'}
            </span>
          )}
          {view === 'board' && (
            <div className="mobile-pane-switch" role="group" aria-label="mobile display">
              <button
                type="button"
                className={`ghost mobile-pane-btn memo ${mobilePane === 'memo' ? 'on' : ''}`}
                onClick={() => setMobilePane('memo')}
                title={'\u30e1\u30e2\u306e\u307f'}
                aria-label={'\u30e1\u30e2\u306e\u307f'}
              />
              <button
                type="button"
                className={`ghost mobile-pane-btn board ${mobilePane === 'board' ? 'on' : ''}`}
                onClick={() => setMobilePane('board')}
                title={'\u30dc\u30fc\u30c9\u306e\u307f'}
                aria-label={'\u30dc\u30fc\u30c9\u306e\u307f'}
              />
            </div>
          )}
          {view === 'board' && (
            <>
              <button
                className={`ghost desktop-view-toggle ${memoOnly ? 'on' : ''}`}
                onClick={toggleMemoOnly}
                title={
                  sidePane === 'free'
                    ? 'Freespace だけを大きく表示（短期/中期/長期を隠す）'
                    : 'MEMO だけを大きく表示（短期/中期/長期を隠す）'
                }
              >
                {memoOnly
                  ? '🗂 ボード表示'
                  : sidePane === 'free'
                    ? 'Freespaceのみ'
                    : '📝 メモのみ'}
              </button>
              <button
                className={`ghost desktop-view-toggle ${boardFull ? 'on' : ''}`}
                onClick={toggleBoardFull}
                title="短期/中期/長期を全体表示（メモを隠す）"
              >
                {boardFull ? '◧ メモを表示' : '⛶ ボード全体'}
              </button>
            </>
          )}
          {dueCount > 0 && (
            <div
              className="due-indicator"
              title="お知らせ日付が来たタスクがあります"
            >
              🔔 {dueCount}件
            </div>
          )}
          <button className="ghost io-export" onClick={exportFile}>
            ⬇ 書き出し
          </button>
          <button className="ghost io-import" onClick={() => fileInputRef.current?.click()}>
            ⬆ 読み込み
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={importFile}
            hidden
          />

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
              <span className="account-email" title={user.email}>
                {user.email}
              </span>
              <button className="ghost" onClick={signOutNow} title="サインアウト">
                ログアウト
              </button>
            </div>
          )}
        </div>
      </header>

      <div
        className={`layout ${
          view === 'board'
            ? `mobile-${mobilePane}`
            : view === 'organize'
              ? 'mobile-organize'
              : 'mobile-board'
        } ${
          view === 'organize' ? 'is-knowledge-organize' : ''
        } ${
          boardFull ? 'is-board-full' : ''
        } ${
          memoOnly ? 'is-memo-only' : ''
        }`}
      >
        {view !== 'archive' &&
          (view === 'board' && sidePane === 'free' ? (
            <KnowledgePanel style={{ '--memo-w': sidePaneWidth }} {...knowledgeProps} />
          ) : (
            <MemoPanel
              memos={activeMemos}
              size={memoSize}
              onSizeChange={changeMemoSize}
              onAdd={addMemo}
              onOpenDetail={(id) => openDetail('memo', id)}
              {...memoProps}
            />
          ))}

        {view === 'board' && (
          <div className="memo-term-summary" aria-label="board task counts">
            {TERMS.map((t) => (
              <button
                key={t.key}
                className="memo-term-chip"
                style={{ '--term': t.color, '--term-soft': t.soft }}
                onClick={() => openTermFromMemo(t.key)}
                type="button"
              >
                <span className="memo-term-dot" />
                <span className="memo-term-label">{t.label}</span>
                <span className="memo-term-count">{termCounts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>
        )}

        <div className="main-area">
          {view === 'board' ? (
            <BoardPanel
              terms={TERMS}
              activeKey={activeTerm}
              onSelect={changeActiveTerm}
              counts={termCounts}
              term={TERMS.find((t) => t.key === activeTerm) || TERMS[0]}
              tasks={sortFilterTasks(
                activeTasks.filter((t) => t.term === activeTerm),
              )}
              sortKey={sortKey}
              onSortChange={setSortKey}
              filterKey={filterKey}
              onFilterChange={setFilterKey}
              templates={templates}
              onUseTemplate={useTemplate}
              onAddTemplate={addTemplate}
              onRemoveTemplate={removeTemplate}
              onMoveToTerm={moveTaskToTerm}
              onAdd={addTask}
              onOpenDetail={(id) => openDetail('task', id)}
              {...taskProps}
            />
          ) : view === 'organize' ? (
            <KnowledgePanel {...knowledgeProps} />
          ) : (
            <Archive
              tasks={archivedTasks}
              memos={archivedMemos}
              onRestore={restoreTask}
              onDelete={deleteTask}
              onRestoreMemo={restoreMemo}
              onDeleteMemo={deleteMemo}
            />
          )}
        </div>
      </div>

      {/* 拡大表示（タスク／メモ） */}
      {(detailTask || detailMemo) && (
        <div
          className="detail-overlay"
          onClick={(e) => {
            if (e.target.classList.contains('detail-overlay')) closeDetail()
          }}
        >
          <div className="detail-modal">
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
          </div>
        </div>
      )}
    </div>
  )
}
