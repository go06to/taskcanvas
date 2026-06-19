import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { firebaseConfig } from './firebaseConfig'

// 設定が実際に入力されているか（YOUR_... のままなら未設定）。
export const firebaseEnabled =
  !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_')

let db = null
let auth = null
if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig)
  db = getFirestore(app)
  auth = getAuth(app)
}

export { db, auth }

// Google ログイン用プロバイダ。
export const googleProvider = new GoogleAuthProvider()

// 各ユーザーのデータを入れるコレクション（users/{uid}）。
export const USERS = 'users'
