# 公開手順（無料・URLでどこからでも開く）

このアプリは「静的サイト」なので、**サーバーやデータベース（Firebase）は不要**です。
`dist` フォルダ（公開用にビルド済みのファイル一式）を無料サービスに置くだけで URL が発行されます。

公開用フォルダの場所:
`c:\Users\caremax\Desktop\task\dist`

---

## 方法A：Netlify Drop（いちばん簡単・Git不要・5分）

ドラッグ＆ドロップだけで公開できます。アカウント登録だけで無料。

1. ブラウザで **https://app.netlify.com/drop** を開く
   （初回は無料アカウント作成：メール or Google でOK）
2. エクスプローラーで `c:\Users\caremax\Desktop\task\dist` フォルダを開く
3. **`dist` フォルダごと**、ページの点線エリアにドラッグ＆ドロップ
4. 数秒で `https://〇〇〇.netlify.app` という URL が発行されます → 完成！
5. その URL をブックマークすれば、スマホでも別PCでもいつでも開けます

### 内容を更新したいとき
1. このフォルダで `npm run build` を実行（`dist` が新しくなる）
2. Netlify のサイト画面 → 「Deploys」タブ → 新しい `dist` を再度ドラッグ＆ドロップ
   （または同じ Drop ページにドロップ）

> 補足：URL を自分だけにしたい場合は、Netlify のサイト設定で
> 「Site configuration → Password protection（または Visitor access）」でパスワードを掛けられます（有料プランの場合あり）。

---

## 方法B：Vercel（GitHubと連携して自動更新したい人向け）

コードを GitHub に上げ、更新するたび自動で公開し直したい場合はこちら。

1. このフォルダを GitHub リポジトリにアップ（`git init` → push）
2. **https://vercel.com** で無料アカウント作成 → 「Add New… → Project」
3. 対象リポジトリを選択（設定は自動検出。`vercel.json` を同梱済みなので変更不要）
4. 「Deploy」を押すと `https://〇〇〇.vercel.app` が発行されます
5. 以後は GitHub に push するだけで自動的に再公開されます

CLI でサッと出す場合（Git不要）:
```
npm i -g vercel
vercel        # 初回はログイン → 質問はEnterで進めばOK
vercel --prod # 本番URLを発行
```

---

## データの保存について（重要）

- タスク・メモは **開いたブラウザの中（localStorage）** に保存されます。
- そのため **端末・ブラウザごとに別データ** です（PCとスマホは自動同期されません）。
- 別端末へ移したい / バックアップしたいときは、アプリ右上の
  **「⬇ 書き出し」** で JSON を保存 → 移行先で **「⬆ 読み込み」**。
- 「複数端末で同じデータを自動同期したい」場合だけ、Firebase 等のクラウド保存の追加実装が必要です。

---

## まとめ
- とりあえず公開して使う → **方法A（Netlify Drop）が最短**
- 更新を自動化したい → **方法B（Vercel + GitHub）**
- どちらも **無料 / Firebase不要**
