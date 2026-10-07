# 下一個對話交接文件

> 最後更新：2026-10-07（台北時間）  
> 目前版本：`v1.2.92`  
> 最新提交：`e9c487b` — `Clarify LINE manager binding and card spacing`

## 新對話先讀這一份

請先完整讀取本文件，再依任務類型讀取下方「必要文件」。不要直接假定 LINE 綁定、群組通知與管理者私訊提醒是同一個功能。

### 可直接貼給下一個對話的開場文字

`請先完整閱讀 C:\Users\user\OneDrive\Documents\Family\NEXT_CHAT_HANDOFF.md，接著依其中「依任務類型必讀的文件」讀取與本次需求相關的原始碼。先回覆你讀到的目前狀態與預計修改範圍，再開始變更。`

## 目前已上線的狀態

- GitHub Pages 前台：<https://bfc8g4v63.github.io/>
- Sites 後端：<https://good-days-family-events.x0925234139.chatgpt.site>
- Sites 專案 ID：`appgprj_6a59965184ac81918326a83155d8f795`
- `main` 分支已推送到 GitHub Pages 與 Sites 來源庫；最新 Sites 發佈版本為 #140。
- `npm test` 在 v1.2.92 通過 **42/42**；測試會先執行 `vinext build`。

## 最重要的 LINE 行為說明

### 兩種綁定是分開的

1. **管理者私訊提醒**：在管理者與機器人的一對一聊天室輸入 `管理綁定 123456`。  
   成功後，該 LINE 帳號會在有人報名、取消或更動人數時收到私訊。管理頁顯示 `私訊提醒 N 人` 即表示已成功。
2. **LINE 群組通知**：必須在目標 LINE 群組內輸入該活動的群組綁定碼。  
   管理頁顯示 `尚未設定群組通知` 並不代表私訊提醒失敗，只代表該活動尚未選定群組公告與定時提醒的目標。

同一個帳號重複輸入管理綁定碼時會更新既有綁定，不應造成同一活動對同一人重複通知。

### 最新變更（v1.2.92）

- 管理綁定完成後，LINE 以 Flex 活動卡列出已綁定活動、日期與時間，而非長段純文字。
- Flex 活動卡底部的「查看／回覆」與「在 Google 地圖開啟」已有間隔。
- 找回活動頁將群組狀態改為 `尚未設定群組通知`，與 `私訊提醒 N 人` 清楚分開。

## 依任務類型必讀的文件

### 任何修改都先讀

1. `README.md`
2. `Changelog.md`
3. `package.json`
4. `.openai/hosting.json`
5. `tests/rendered-html.test.mjs`

### LINE 指令、綁定、提醒或群組公告

1. `app/api/line/webhook/route.ts`
2. `app/api/line/lib.ts`
3. `app/api/admin/line/route.ts`
4. `app/api/line/run-reminders/route.ts`
5. `app/api/line/commands.ts`
6. `db/schema.ts`
7. `docs/app.js`

### 建立／管理／複製活動、找回活動或報名

1. `docs/app.js`
2. `app/api/events/route.ts`
3. `app/api/admin/event/route.ts`
4. `app/api/creator-recovery/route.ts`
5. `app/api/rsvps/route.ts`
6. `db/schema.ts`
7. `db/init.ts` 及對應 `drizzle/*.sql`

### 公開活動頁或手機讀取問題

1. `docs/e/app.js`
2. `docs/e/index.html`
3. `docs/styles.css`
4. `app/api/events/access/route.ts`
5. `app/api/events/route.ts`

### GitHub Pages 快取／前端發佈

1. `docs/index.html`
2. `docs/e/index.html`
3. `docs/line-bot-guide.html`
4. `docs/sw.js`

前端內容有變動時，必須同步更新 HTML 內的 `?v=`、頁尾版本與 `docs/sw.js` 快取名稱和資產版本，否則手機可能繼續使用舊程式。

## 既有重要功能與決策

- 活動可結束並移入歷史紀錄；原資料與安排保留。
- 可「複製為新活動」：帶入活動設定、已選 LINE 群組、提醒與安排區；不帶入報名、安排結果、管理者私訊綁定或已發送通知。
- 複製活動的日期與時間支援滾動式選擇，也會處理上午／下午與 24 小時輸入的轉換。
- 手機安排頁不支援拖曳；以選取家庭後按「安排選取家庭」完成安排。
- 活動卡會顯示目前參加人數，行前提醒提供 Google 地圖開啟。
- 同行卡保留既有資料，但一般活動公開頁不再顯示。
- 已移除下載 CSV 名單功能。

## 安全與資料保護

- 不要刪除或重建既有 D1 資料庫、活動、報名、LINE 綁定或排程資料。
- 管理連結、管理碼、LINE access token、LINE channel secret、提醒密鑰都不可回傳、記錄或寫進文件。
- 活動參加者姓名、電話、飲食與備註不可在公開 API 或群組通知中外洩；依既有路由與測試維持權限界線。

## 修改與部署檢查清單

1. 先確認工作區是否有非本次變更：`git status --short`。
2. 實作後執行 `npm test`，必須全部通過。
3. 更新 `Changelog.md` 與版本號；若前端有變動，更新快取版本。
4. 提交並推送 `main` 至 GitHub：`git push origin main`。
5. 後端／Sites 發佈需使用 Sites 原生工具取得短期來源庫憑證，推送相同提交，再以包含 `.openai/hosting.json` 與 `dist` 的封存檔儲存並部署版本。不得把憑證寫入檔案、Git remote 或回覆文字。
6. 確認 GitHub Pages 的 `pages-build-deployment` workflow 對應提交成功。

## 工作區提醒

- `.sites-release-v1.2.92.tar` 是上次成功部署後留下的未追蹤暫存封存檔，**不可提交**；可在確認不再需要上傳後刪除。
- 若使用 Sites 技能，下一個對話應先閱讀其 `sites-building` 與 `sites-hosting` 指示，再處理部署。

