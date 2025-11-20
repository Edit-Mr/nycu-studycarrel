# 交大圖書館免登入開房系統

不登入交大圖書館系統的情況下，與你的好友一起開包廂，享受私密的單獨時光。

<https://nyculib.elvismao.com/>

## 解決痛點

- 每次登入只會維持 20 分鐘，基本上等於每次都需要重新登入，輸入很容易看錯的驗證碼。
- 手機版網頁看不到地圖，很難知道是哪一間。
- 哪間有沒有空位需要一個個單獨檢查。
- 預約遲到 30 分鐘會被取消並且記點。
- 進去之後卡片記得要放在裡面，不然 30 分鐘沒卡會自動退房。
- 單次最多只能預約 4 小時。
- 只能預約 14 天以內的時段。

## 開發

請先安裝 [Node.js](https://nodejs.org/) 及 [pnpm](https://pnpm.io/installation)，接著執行：

安裝 Chrome Driver 或是任意瀏覽器：

```
npx puppeteer browsers install chrome
```

設定環境變數 `.env`（可參考 `.env.example`）：

```
NYCU_USERNAME=114000000
NYCU_PASSWORD=yourpasswordhere
```

安裝相依套件並啟動開發伺服器：

```bash
pnpm i
pnpm dev
```

## 免責聲明

- 此系統與國立陽明交通大學無關。
- 此專案僅供學術用途，以及看噁心 Code 的壓力訓練。
