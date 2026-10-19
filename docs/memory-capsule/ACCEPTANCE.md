# 水金呼吸・回憶膠囊驗收清單

所有對外連結一律從 [正式入口](https://bfc8g4v63.github.io/memory-capsule/) 開啟。請勿把部署服務的內部網址傳給家人。

## 0. 驗收前置條件

1. Cloudflare R2 bucket `water-capsule-media-prod` 的 CORS Policy 必須允許目前公開 Worker 來源 `https://gooddays.carewear.workers.dev` 使用 `GET`、`PUT`、`HEAD` 和 `Content-Type`。
2. LINE Developers 的 Login callback URL 必須與 `MEMORY_PUBLIC_ORIGIN` 對應的 `/api/memory/auth/callback` 完全一致。
3. 準備兩個不同的 LINE 帳號：總管理者 A、受邀家人 B；不要共用同一個手機上的 LINE 登入工作階段。
4. 使用一張小於 20 MB 的 JPG，以及一支小於 1 GB、15 分鐘內的 MP4 或 MOV 作為測試檔案。

## 1. 手機與 LINE 登入

每個環境都完成下列步驟，並在欄位內勾選結果：

| 環境 | 邀請連結開啟 | LINE 登入／返回原頁 | 可看膠囊 | 備註 |
| --- | --- | --- | --- |
| iPhone Safari | ☐ | ☐ | ☐ | |
| Android Chrome | ☐ | ☐ | ☐ | |
| iPhone LINE 內建瀏覽器 | ☐ | ☐ | ☐ | |
| Android LINE 內建瀏覽器 | ☐ | ☐ | ☐ | |

預期：B 透過 A 建立的一次性邀請連結登入後，顯示 B 的 LINE 公開暱稱與頭像；重新整理後仍在家族內。邀請不可被第二個帳號重複使用。

## 2. 媒體、互動與重新整理

在每個至少一種手機瀏覽器中驗收：

- ☐ 上傳 JPG，完成後立即顯示，重新整理後仍存在。
- ☐ 上傳 MP4／MOV，能播放；若裝置格式不支援，能按「下載原始影片」。
- ☐ 以 B 的 LINE 暱稱留下一則媒體留言、按愛心、建立一段文字回憶。
- ☐ A、B 都能看見內容；B 可改／刪自己的內容，A 可管理所有內容。
- ☐ 將 B 停用後，B 重新整理、媒體 URL 逾時後再讀取，都無法取得內容；A 恢復 B 後才可再進入。

## 3. 私密備份

以 A 登入，在「家族空間」選擇備份範圍：

- ☐ 下載「全部家族」ZIP，解壓後包含 `metadata.json` 及 `media/<媒體 ID>/` 原始檔。
- ☐ 選一顆膠囊下載，ZIP 僅包含該膠囊內容與其留言／愛心 metadata。
- ☐ ZIP 下載不建立公開 R2 網址；登出或換成 B 後不能呼叫匯出 API。
- ☐ 若範圍超過 2 GB，畫面明確提示改為逐一膠囊備份；不可靜默失敗。

## 4. 驗收紀錄

完成時記錄驗收日期、裝置／瀏覽器版本、LINE 帳號 A/B，以及任何失敗畫面。不要把 LINE user ID、session cookie、signed URL 或原始媒體網址貼進紀錄。
