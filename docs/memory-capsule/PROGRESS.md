# 水金呼吸・回憶膠囊開發紀錄

本檔案是分段開發的唯一進度紀錄。產品範圍以 [產品規格](PRODUCT.md)、安全與資料設計以 [系統架構](ARCHITECTURE.md) 為準。

## 目前狀態

- 目前階段：Phase 3 — 影片與容量
- 本次版本：v1.2.138（待發布；待實機驗收）
- 上線狀態：首位總管理者已建立「陳水金家族」與第一顆膠囊；照片、影片、互動、整理與容量保護已部署，待管理者以實機檔案完成上傳與播放驗收。

### 發布紀錄

- Site version 170：`d102ad573e653aa5c6b169c2191da698c7cff384`
- 家人入口：`https://bfc8g4v63.github.io/memory-capsule/`。此網址是唯一可分享的入口，會安全地交接到目前承載登入與私有媒體 API 的入口；既有資料、LINE 綁定、提醒與私有 R2 媒體均不重建或刪除。
- 入口設定：LINE callback 與 R2 CORS 必須依目前承載登入與私有媒體 API 的 HTTPS 入口完成設定，才可進行實機登入與上傳驗收；隔離目的 D1 `good-days-family` 保留給未來完整搬遷使用。

## Phase 0 — 外部設定

| 項目 | 狀態 | 備註 |
| --- | --- | --- |
| Cloudflare R2 私有 bucket | 已完成 | `water-capsule-media-prod`；亞洲太平洋、自動位置、公開存取停用。 |
| R2 存取權杖 | 已完成 | 僅能讀取、寫入與列出上述 bucket 的物件；不能管理 bucket；值只保留於部署 secrets。 |
| LINE Login Web channel | 待驗收 | 「水金呼吸 回憶膠囊」已建立；必須確認 LINE Developers 的 callback 與目前承載登入 API 的 HTTPS callback 完全一致。家人僅使用 GitHub Pages 入口連結。 |
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

- [x] 家族入口、膠囊頁與「陳水金家族皇宴」第一顆膠囊；建立家族時自動帶入。
- [x] 私有 R2 照片直傳：受邀成員僅能上傳 JPEG、PNG、WebP、HEIC／HEIF，單張上限 20 MB；上傳網址最長 15 分鐘，顯示網址最長 5 分鐘。
- [x] 受控讀取與立即顯示；每張相片保留上傳者 LINE 公開暱稱與時間，沒有公開 bucket URL。
- [x] 家族入口在桌面與手機都將登入、上傳、選擇相片與切換帳號 CTA 置中，並有自動化回歸檢查。
- [ ] 在 Cloudflare R2 CORS 加入目前承載登入與私有媒體 API 的 HTTPS 入口（PUT／GET／HEAD 與必要 headers）；bucket 的公開開發 URL 維持停用。未完成前，家人從入口進入後的直傳會遭瀏覽器阻擋。
- [x] 管理者可建立單次、具有效期限的家人邀請連結，並可複製、查看及撤銷未使用邀請。
- [x] 邀請連結先顯示「以 LINE 接受邀請」頁面；登入成功才依 LINE immutable subject 加入家族。邀請不能建立總管理者，只有總管理者能建立共同管理者邀請。
- [x] 管理者可查看家人目前 LINE 暱稱與頭像；總管理者可設定共同管理者、停用或恢復家人。
- [x] 文字回憶、LINE 暱稱留言、愛心與代長輩留言；實際操作者持續以 LINE immutable subject 記錄。
- [x] 膠囊建立、前言／年代／封面設定、排序；媒體標題、拍攝日期、描述與自己的內容軟刪除。
- [x] 回報、管理者隱藏／恢復與操作稽核紀錄；刪除內容仍採 30 天保留規則。待 R2 上傳恢復後以真實內容驗收。

### Phase 3 — 影片與容量

- [x] 原始 MP4／MOV 私有 R2 上傳、短效播放網址、手機上傳進度與類型／大小檢查；單支上限 1 GB、15 分鐘由家人自行遵守。
- [x] 每個家族預設 20 GB 容量上限；將已完成媒體與未逾期上傳保留量納入檢查，超過上限拒絕新的上傳。
- [x] 管理者可看到已確認的空間用量與 80%／90% 提醒；R2 維持私有，既有內容不受影響。
- [x] 影片無法直接播放時，提供短效私有原始檔下載 fallback。
- [ ] 自動轉檔與多畫質串流（後續升級，不阻礙第一版使用）。
- [x] 總管理者可調整家族容量上限（1 GB 至 1 TB）。
- [x] 總管理者可查看 30 天保留區，確認後永久清理已逾期的媒體與留言；清理過程保留最小必要稽核紀錄。
- [ ] 相簿／家族匯出與備份。

### Phase 4 — 發布與驗收

- iPhone Safari、Android Chrome、LINE 內建瀏覽器與桌面實機驗收。
- 私有 R2、過期 URL、停用會員與備份還原驗證。

## 本次變更的安全承諾

- LINE 的公開暱稱與頭像僅作顯示；授權一律使用不可變 `sub`。
- 不收集 email、電話、地址、生日、原始生物辨識或 LINE token。
- 不將 R2 媒體設為公開，也不在此階段寫入任何媒體資料。
