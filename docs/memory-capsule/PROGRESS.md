# 陳水金家族・回憶膠囊開發紀錄

本檔案是分段開發的唯一進度紀錄。產品範圍以 [產品規格](PRODUCT.md)、安全與資料設計以 [系統架構](ARCHITECTURE.md) 為準。

## 目前狀態

- 目前階段：Phase 1 — 身分、家族與資料基礎
- 本次版本：v1.2.115（待發布）
- 上線狀態：程式與資料庫遷移已完成；因 LINE Login 與 R2 帳號設定尚未提供，功能維持安全關閉，尚不建立任何家族內容。

## Phase 0 — 外部設定

| 項目 | 狀態 | 備註 |
| --- | --- | --- |
| Cloudflare R2 私有 bucket 與付款 | 待家族管理者設定 | 不會自動建立或公開 bucket。 |
| LINE Login Web channel | 待設定 | callback 固定為 `https://good-days-family-events.x0925234139.chatgpt.site/api/memory/auth/callback`。 |
| 部署 secret | 待設定 | 僅在部署平台設定；不得提交到 Git。鍵名：`MEMORY_LINE_LOGIN_CHANNEL_ID`、`MEMORY_LINE_LOGIN_CHANNEL_SECRET`、`MEMORY_SESSION_SECRET`、`MEMORY_BOOTSTRAP_SECRET`。 |
| 首位總管理者 | 待指定 | 以該管理者的 LINE Login 完成首次登入，再以一次性 bootstrap secret 建立家族。 |
| R2 binding | 待 bucket 實際建立後設定 | 本階段不猜測 bucket 名稱，因此 `.openai/hosting.json` 仍保持 `r2: null`。 |

## Phase 1 — 身分、家族與資料基礎

### 本次完成

- [x] 新增 `memory_families`、`memory_family_members`、`memory_family_invites` schema 與 Drizzle migration `0016_large_bug.sql`。
- [x] LINE Login OAuth 起點、callback、`state`、nonce、ID token verify 與安全 session cookie。
- [x] Session、登出／切換帳號資料端點；不保存 LINE access token 或 refresh token。
- [x] 家族 bootstrap、家族邀請建立／撤銷、成員清單、角色變更與停用 API。
- [x] 每筆家族操作均在伺服器端以 LINE immutable subject、有效 member、`family_id` 與角色檢查。
- [x] 邀請原文只出現在初次管理者回應；傳至 LINE OAuth 的 state 只保留不可逆 hash。
- [x] 對無設定 LINE secret 的登入入口回傳安全的「尚未設定」狀態，不會降級為匿名登入。

### 尚待驗收／啟用

- [ ] 將實際 LINE channel 值與 session secret 寫入部署 secret，完成真實帳號 callback 測試。
- [ ] 由首位總管理者建立「陳水金家族」與第一個有效邀請。
- [ ] 補齊端對端測試：失效邀請、停用成員、跨家族、角色變更與 OAuth callback。
- [ ] 提供家族入口畫面與長輩導引（排在 Phase 2 與相簿首頁一併完成，避免交付只有登入、沒有內容的空入口）。

## 後續階段

### Phase 2 — 膠囊、照片與留言

- 家族首頁、膠囊頁與「陳水金家族皇宴」首顆膠囊。
- 私有 R2 照片直傳、縮圖、受控讀取、文字回憶、LINE 暱稱留言、愛心與代長輩留言。
- 立即顯示、回報、隱藏與 30 天保留區。

### Phase 3 — 影片與容量

- 原始影片上傳、播放／下載 fallback、類型／大小檢查。
- R2 容量計算、80%／90% 告警、匯出與備份。

### Phase 4 — 發布與驗收

- iPhone Safari、Android Chrome、LINE 內建瀏覽器與桌面實機驗收。
- 私有 R2、過期 URL、停用會員與備份還原驗證。

## 本次變更的安全承諾

- LINE 的公開暱稱與頭像僅作顯示；授權一律使用不可變 `sub`。
- 不收集 email、電話、地址、生日、原始生物辨識或 LINE token。
- 不將 R2 媒體設為公開，也不在此階段寫入任何媒體資料。
