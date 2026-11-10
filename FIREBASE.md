# 開心農場雲端設定

遊戲網站仍放在 GitHub Pages。帳號與進度放在 **Firebase**（Authentication、Firestore、Cloud Functions）。

選 Firebase、而且開一個**新專案**，不沿用 [science-portal](https://github.com/prayer168/science-portal) 那個專案：

- science-portal 已經用 Firebase Auth 的 Google 登入和 Firestore，老師的控制台與網頁 SDK 寫法可以直接沿用。
- 那個專案的安全規則是「所有人可讀、只有管理者可寫」，跟農場「學生只能讀寫自己的進度」不同。若改那邊的規則，入口網站可能壞掉。這個倉庫也不會去改 science-portal。
- 沒有選 Supabase：老師現有的教材站不是 Supabase，多一套後台比較容易搞混。

瀏覽器裡的 `firebase-config.js` 只有網頁用的公開設定。**不要**把 service account、Admin SDK 私鑰或任何伺服器金鑰放進這個倉庫或網頁。Cloud Functions 部署後會用 Google Cloud 自己的執行身分，不需要把私鑰下載回來。

這份說明只告訴你怎麼在控制台操作。這次的程式**還沒有部署**到 Firebase。

## 老師要做的步驟

1. 打開 [Firebase Console](https://console.firebase.google.com/)，用 `prayer168@gmail.com` 登入。
2. **新增專案**（不要選 science-portal）。專案名稱可以叫 `happy-farm`。Google Analytics 可以關掉。
3. 在專案裡新增一個 **Web 應用程式**。把給你的設定貼進 `firebase-config.js` 的 `window.HAPPY_FARM_FIREBASE`。要填的是 `apiKey`、`authDomain`、`projectId`、`storageBucket`、`messagingSenderId`、`appId`。不要填 measurementId，遊戲不收集分析資料。
4. **Authentication → Sign-in method**
   - 啟用 **Google**。
   - 啟用 **電子郵件/密碼**（Email/Password）。學生帳號會使用虛擬信箱 `亂數@students.happyfarm.local`，不會寄信，也不需要學生有 Gmail。
   - **Settings → Authorized domains** 加上 `prayer168.github.io`。`localhost` 通常已經在名單裡。
5. **Firestore Database → 建立資料庫**。地區建議 `asia-east1`（台灣）。先用正式模式，下一步會貼上鎖定的規則。
6. 在自己的電腦安裝並登入 Firebase CLI（只需做一次）：

   ```bash
   npm install -g firebase-tools
   firebase login
   cd happy_farm
   firebase use --add
   ```

   選剛建的專案。這會產生 `.firebaserc`。`.firebaserc` 只有專案 ID，可以提交。不要執行任何會下載 Admin SDK JSON 的指令。

7. 部署安全規則（這一步會覆寫 Firestore 規則，請確認選到的是新專案）：

   ```bash
   firebase deploy --only firestore:rules
   ```

8. Cloud Functions 需要 **Blaze（隨用隨付）** 方案。教室這個用量通常只會落在免費額度裡，但 Firebase 規定有函式就要升級。升級後部署：

   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```

   函式在 `asia-east1`，名稱是 `createStudentAccounts`、`resetStudentPassword`、`deleteStudent`。三個都會檢查呼叫者是已驗證的 `prayer168@gmail.com`。

9. 把填好的 `firebase-config.js` 提交並推上 `main` 之後，GitHub Pages 才會連到這個專案。在那之前，網站只會顯示登入畫面，按登入會提示雲端還沒設定。

10. 用管理者 Google 帳號打開 `https://prayer168.github.io/happy_farm/admin.html`。
    - 貼上帳號清單，或匯入 CSV。格式可以是 `帳號,密碼`，密碼留白就自動產生。一次最多 30 個。
    - 建立後立刻下載 CSV。關閉畫面後密碼就看不到，資料庫裡也沒有明文密碼。
    - 學生用「帳號＋密碼」登入。忘記密碼時按 **重設密碼**，新密碼同樣只顯示一次。
    - **刪除** 會同時移除登入帳號、遊戲進度和排行榜那一列。

## 資料與規則

| 位置 | 誰可以讀 | 誰可以寫 | 內容 |
|------|----------|----------|------|
| `players/{uid}` | 本人與管理者 | 只有本人 | 顯示名稱和整份遊戲進度 |
| `leaderboard/{uid}` | 已登入的人 | 只有本人，而且必須和自己的進度一致 | 只有顯示名稱、等級、金幣 |
| `accounts/{uid}` | 只有管理者 | 只有 Cloud Functions（Admin SDK） | 帳號名稱，沒有密碼 |

文件 ID 使用 Firebase 的 uid，這樣規則才能確認「這筆是不是本人的」。畫面上的前十名不會顯示 uid、電子郵件或大頭貼。

本機若要對模擬器試驗，先執行 `firebase emulators:start`，再打開 `http://127.0.0.1:3742/index.html?emulator=1`。這不會碰到正式專案。
