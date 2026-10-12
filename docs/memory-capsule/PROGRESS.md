# 水金呼吸・回憶膠囊開發紀錄

本檔案是分段開發的唯一進度紀錄。產品範圍以 [產品規格](PRODUCT.md)、安全與資料設計以 [系統架構](ARCHITECTURE.md) 為準。

## 目前狀態

- 目前階段：Phase 1 — 身分、家族與資料基礎
- 本次版本：v1.2.116（已發布）
- 上線狀態：程式、資料庫遷移與正式環境設定已完成並發布於 2026-10-12。LINE Login 起點已實測可安全導向 LINE；尚待首位總管理者完成首次登入與建立家族。

### 發布紀錄

- Site version 159：`2da0e86474fa3e621907bf10fc15c122ec98e2ed`
- 正式網址：`https://good-days-family-events.x0925234139.chatgpt.site`

## Phase 0 — 外部設定

| 項目 | 狀態 | 備註 |
| --- | --- | --- |
| Cloudflare R2 私有 bucket | 已完成 | `water-capsule-media-prod`；亞洲太平洋、自動位置、公開存取停用。 |
| R2 存取權杖 | 已完成 | 僅能讀取、寫入與列出上述 bucket 的物件；不能管理 bucket；值只保留於部署 secrets。 |
| LINE Login Web channel | 已完成 | 「水金呼吸 回憶膠囊」；callback 為 `https://good-days-family-events.x0925234139.chatgpt.site/api/memory/auth/callback`。 |
| 部署 secret | 已完成 | LINE、session、bootstrap 與 R2 設定皆只在正式部署平台保存；不得提交到 Git。 |
| 首位總管理者 | 待指定 | 以該管理者的 LINE Login 完成首次登入，再以一次性 bootstrap secret 建立家族。 |
| R2 binding | 已決定 | bucket 位於家族 Cloudflare 帳號，現階段由受限 S3 相容 API 權杖使用；`.openai/hosting.json` 保持 `r2: null`，避免誤綁其他專案的 Worker。 |

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

- [x] 將 LINE channel、session、bootstrap 與 R2 設定寫入正式部署 secrets；實測登入起點的 LINE 授權轉址。
- [ ] 以真實家族 LINE 帳號走完 callback 與 session 建立驗收。
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
