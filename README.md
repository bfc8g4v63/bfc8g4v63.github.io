# 好日子家庭活動

長輩友善的家庭活動網頁。家人不需要註冊帳號，即可查看活動、回覆參加人數與飲食需求。

公開網站：<https://bfc8g4v63.github.io>

## 功能

- 建立、修改、取消活動
- 專屬活動修改碼
- 一鍵參加或取消參加
- 公開頁僅顯示參加總人數，不公開姓名
- 管理碼保護的管理者後台、私人名單與 CSV 匯出
- LINE 官方帳號群組綁定與活動前自動提醒
- LINE／系統分享
- iOS、Android、Windows 響應式介面
- 可加入手機主畫面的 PWA

## 架構

- `docs/`：GitHub Pages 公開前端
- `app/api/`：活動與報名 API
- `db/`：Cloudflare D1 資料表
- `.github/workflows/line-reminders.yml`：每 15 分鐘執行提醒檢查

LINE 設定教學：<https://bfc8g4v63.github.io/line-bot-guide.html>

LINE 私密環境變數：`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`。提醒排程另使用後端與 GitHub Actions 共用的 `REMINDER_SECRET`，所有值都不可提交到 Git。

## 本機檢查

```bash
npm install
npm run build
```
