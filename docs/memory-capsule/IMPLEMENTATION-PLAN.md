# 回憶膠囊實作計畫

## Phase 0 — 外部設定與確認

- 建立或指定家族管理者持有的 Cloudflare 帳號、R2 訂閱與付款方式。
- 建立私有 R2 bucket、配額與帳務告警。
- 在現有 LINE Developers Provider 建立 LINE Login Web app channel，設定正式 HTTPS callback URL。
- 將 channel secret、R2 credentials／binding 與 session signing secret 僅寫入部署平台 secret。
- 確認首位總管理者，以及「陳水金家族皇宴」的內容擁有與刪除規則。

## Phase 1 — 身分、家族與資料基礎

- 新增 schema、migration、資料存取層與 family-scoped authorization helper。
- 建立 LINE Login callback、session、登出、帳號切換與邀請加入流程。
- 建立 family、member、invite 與 role 管理 API。
- 為未登入、已停用、邀請失效及跨家族存取寫自動測試。

## Phase 2 — 膠囊、相片與留言

- 建立家族首頁、膠囊頁、膠囊管理介面與「皇宴」首顆膠囊。
- 實作私有 R2 照片直傳、縮圖、瀏覽、下載受控連結與上傳重試。
- 實作 media metadata、回憶文字、留言、愛心、代長輩留言與自己的內容修改／刪除。
- 實作立即發布、回報、隱藏、恢復與 30 天保留區。

## Phase 3 — 原始影片與容量管理

- 實作影片直傳、檔案類型與大小驗證、直播放／下載 fallback。
- 建立 poster、影片資訊、播放安全連結與行動裝置相容提示。
- 建立容量統計、80%／90% 警示與上傳封鎖規則。
- 實作管理者匯出、備份、內容與容量儀表板。

## Phase 4 — 發布與驗收

- iPhone Safari、Android Chrome、LINE 內建瀏覽器、桌面 Chrome／Safari 的實機測試。
- 驗證 R2 bucket 無公開讀取、過期 signed URL 無法使用、停用會員立即失去媒體讀取權。
- 驗證所有手機 CTA 置中、保留明確邊距，且長輩可完成登入、上傳、留言與刪除自己的內容。
- 完成資料備份、恢復演練與隱私說明。

## 開工前仍需的使用者決定

1. Cloudflare 帳號由誰持有與付款？是否已有可使用帳號？
2. 首位總管理者與共同管理者是誰？
3. 家族邀請連結採固定可撤銷連結，或一次性邀請？
4. 影片上限是否先採 1 GB／15 分鐘？
5. 「陳水金家族皇宴」現有照片、影片與文字由誰整理並授權匯入？
