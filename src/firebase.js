import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { firebaseConfig } from './firebaseConfig'

// 開発サーバーを `--mode localonly` で起動したときだけ、クラウドを使わずに動かす（画面の確認用）。
// 本番のビルドには効かない。
const localOnlyDev = import.meta.env.DEV && import.meta.env.MODE === 'localonly'

// 設定が実際に入力されているか（YOUR_... のままなら未設定）。
export const firebaseEnabled =
  !localOnlyDev && !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_')

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
