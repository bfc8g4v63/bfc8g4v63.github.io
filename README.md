# 好日子家庭活動

長輩友善的家庭活動網頁。家人不需要註冊帳號，即可查看活動、回覆參加人數與飲食需求。

公開網站：<https://bfc8g4v63.github.io>

## 功能

- 建立、修改、取消活動
- 專屬活動修改碼
- 一鍵參加或取消參加
- 參加人數、飲食需求與聯絡資訊
- LINE／系統分享
- iOS、Android、Windows 響應式介面
- 可加入手機主畫面的 PWA

## 架構

- `docs/`：GitHub Pages 公開前端
- `app/api/`：活動與報名 API
- `db/`：Cloudflare D1 資料表

## 本機檢查

```bash
npm install
npm run build
```
