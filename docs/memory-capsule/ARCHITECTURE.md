# 回憶膠囊架構與安全邊界

## 1. 元件總覽

```text
家人手機／LINE 內建瀏覽器
        │
        ├── LINE Login（OAuth + OpenID Connect）
        │
回憶膠囊網頁與 Worker API
        ├── 關聯式資料庫：家族、成員、膠囊、媒體、留言、稽核紀錄
        └── 私有 Cloudflare R2：原始媒體、縮圖、封面、匯出檔
```

本專案既有網站使用 Cloudflare Worker 相容執行環境與 D1/Drizzle 資料層。回憶膠囊沿用同一部署模式，但會新增獨立的私有 R2 binding；不得將 R2 bucket 設為公開。

## 2. LINE Login 流程

1. 家人打開有時間與用途限制的家族邀請連結。
2. 網頁將使用者導向 LINE Login，要求最小必要的 `openid profile` scope。
3. Worker 在伺服器端驗證 authorization code、`state`、nonce 與 ID token；不可相信瀏覽器自行送來的 user ID 或暱稱。
4. 系統以 LINE `sub`／user ID 建立或查找 member 記錄。
5. 保存目前的 public display name 與頭像網址作為顯示快照；登入時可更新顯示資料，但帳號關聯永遠以不可變的 subject 為準。
6. Worker 只在 OAuth callback 的當次請求，以暫時的 access token 讀取 LINE 最新公開 profile；確認 profile `userId` 與已驗證的 `sub` 一致後，才更新顯示名稱與頭像快照。token 不寫入 cookie、資料庫、前端或紀錄檔。
7. Worker 建立安全工作階段 cookie；提供明確登出與帳號切換。

不請求 email、電話、地址、生日或任何生物辨識資料。LINE access token 僅在 OAuth callback 記憶體中用於取得當下 public profile，隨請求結束即丟棄；refresh token 與 channel secret 只能在執行環境的 secret 保存。三者均絕不可放入資料庫、前端、Git 或紀錄檔。

## 3. R2 媒體流程

### 上傳

1. 已登入成員選擇媒體、膠囊與說明。
2. API 檢查角色、邀請狀態、檔案類型、大小、膠囊可用性與家族容量。
3. API 產生僅限單一物件、短效且限定內容類型的 signed upload URL。
4. 瀏覽器直接將原始檔傳入私有 R2；檔案不經過 Worker 記憶體。可讀取的照片／影片會在裝置端以背景方式產生最大邊 1200px 的 WebP 縮圖／封面，再用另一個單一物件、短效的 signed URL 傳入同一私有路徑。
5. 成功後由 API 建立 media metadata，立即在膠囊顯示。縮圖失敗時原始檔仍可使用，前端安全回退到原始媒體；不會公開 bucket 或改變原始檔。

### 讀取

1. 前端請求媒體時先驗證現行工作階段與 member 狀態。
2. API 對允許的物件產生短效 signed read URL，或以 Worker 代理帶 Range header 的媒體讀取。
3. 前端不得持久保存 signed URL；過期後重新請求。

### 物件命名

```text
families/{familyId}/media/{mediaId}/original/{safeFilename}
families/{familyId}/media/{mediaId}/thumb.webp
families/{familyId}/media/{mediaId}/poster.webp
families/{familyId}/exports/{exportId}.zip
```

物件 key 不得含 LINE user ID、公開姓名、電話或可猜測的序號。

## 4. 建議資料模型

| 資料表 | 核心欄位與目的 |
| --- | --- |
| `memory_families` | 名稱、封面、介紹、容量限制、建立者 |
| `memory_family_members` | family ID、LINE subject、目前公開暱稱、頭像、角色、狀態、最後登入 |
| `memory_family_invites` | 家族、token hash、用途、到期時間、使用次數、撤銷時間 |
| `memory_capsules` | family ID、名稱、前言、年代、封面 media ID、排序、封存狀態 |
| `memory_media` | capsule ID、作者 member ID、R2 object key、類型、mime type、大小、拍攝日期、說明、可見性、刪除時間 |
| `memory_comments` | family ID、media 或 capsule、作者 member ID、代傳顯示名稱、本文、刪除／隱藏時間 |
| `memory_reactions` | member ID、目標種類、目標 ID、reaction 種類；同一成員每個目標一筆 |
| `memory_reports` | 回報者、目標、原因、狀態、處理者、處理時間 |
| `memory_audit_log` | actor member ID、事件種類、目標、時間與必要的最小 metadata |

`line_subject` 與 `family_id` 必須是唯一組合。所有 family-scoped 查詢都必須在資料庫層過濾 `family_id`，不能只相信前端路徑參數。

## 5. 授權規則

| 動作 | 一般成員 | 膠囊管理者 | 總管理者 |
| --- | --- | --- | --- |
| 讀取家族內容 | 可以 | 可以 | 可以 |
| 新增媒體、留言與反應 | 可以 | 可以 | 可以 |
| 修改／刪除自己內容 | 可以 | 可以 | 可以 |
| 修改他人內容 | 不可 | 可 | 可 |
| 管理膠囊 | 不可 | 可 | 可 |
| 管理成員、邀請與容量 | 不可 | 視授權 | 可 |
| 匯出／永久刪除 | 不可 | 不可 | 可 |

被停用、已離開家族、邀請失效或未登入者，不能讀取任何媒體或產生 signed URL。

## 6. 風險控制

- 所有登入 callback 驗證 OAuth `state`、nonce、redirect URI 與 ID token 簽章。
- Session cookie 使用 Secure、HttpOnly、SameSite 設定並支援伺服器端撤銷。
- 驗證 MIME type、檔案大小與實際檔頭；不要只信任副檔名。
- 為登入、上傳、留言、signed URL 產生與回報 API 加入速率限制。
- 媒體、文字與稽核資料皆不可出現在公開活動 API、LINE 群組訊息或錯誤回應。
- 刪除採軟刪除＋30 天保留；R2 永久刪除只能由後端排程或明確管理操作執行。

## 7. 備份與成本

- 媒體原檔保存於 R2；資料庫 metadata 應定期匯出。
- 總管理者可請求以相簿或家族為範圍的 ZIP 匯出；第一版直接從私有 R2 串流到總管理者瀏覽器，不產生第二份長期匯出物件。單次大於 2 GB 時須逐一膠囊下載；若日後需要全家族超大單檔，才建立會自動到期的私有匯出物件與背景工作。
- 容量統計應以已確認的 R2 物件大小為準，避免僅根據前端宣告的檔案大小。
- 於 80% 與 90% 配額時告警；實際超額前拒絕新的上傳，但不影響既有內容閱讀。

## 8. 未來演進

- 使用 Cloudflare Stream 或相等服務轉檔與多畫質播放。
- 圖片格式最佳化、背景縮圖與可搜尋 metadata。
- 精細的家庭分支權限與個別膠囊可見範圍。
- 年度回顧、投影播放及受控的相簿分享。
