# Google Places 地址建議設定

網站程式以 Google Places Autocomplete 為主要的店家、設施與拆詞搜尋來源；OpenStreetMap 保留為免費備援。Google 金鑰只會由 Worker 伺服器端讀取，絕不能放進 `docs/app.js`、網頁原始碼或 Git。

## 一次性設定

1. 在 Google Cloud 選擇帳單帳戶已啟用的專案，啟用 **Places API (New)**。
2. 建立一把 API key，將 API 限制設為只允許 **Places API (New)**；不要啟用不需要的 Maps API。
3. 在 Sites 的伺服器端環境變數新增 `GOOGLE_PLACES_API_KEY`。這是祕密值，不可貼進程式碼或公開設定。
4. 在 Google Cloud 的配額頁面，為 Autocomplete 與 Place Details 設定每日上限；建議起始各 **300 次／日**。同時建立 Google Cloud 預算通知（例如每月 NT$300）。預算通知是告警，配額才是實際限制。

## 已內建的費用防護

- 使用者輸入滿 3 個字才會呼叫 Google；2 個字仍可使用免費的本機／OpenStreetMap 備援。
- 官方國民運動中心索引與快取結果不會計入限流；其餘地址建議每個 IP 每分鐘 20 次，完整地址查詢限制為每分鐘 6 次。
- 選取 Google 建議後才查一次完整地址；不會對每個建議逐筆查詢。
- Google 無法使用、金鑰未設定或請求失敗時，自動退回 OpenStreetMap，不會讓表單失效。
