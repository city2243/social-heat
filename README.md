# 社群熱度

台灣、美國、日本股票的社群討論熱度。靜態網站，沒有後端；頁面只讀倉庫裡的 `data/`。另一個程序可以每天改這些檔、推上 `main`，GitHub Pages 會重新發布。

網站：<https://city2243.github.io/social-heat/>

`data/` 是每日例行程序推上的真實資料（自 2026-10-30 起；history.csv 含 10/21 起回補的 PTT 計數）。

本頁只整理討論熱度，不是投資建議。

## 頁面

1. **今日**：台灣、美國、日本三個分頁。每個市場列出熱門話題，以及當天的早期升溫卡片。
2. **趨勢**：搜尋或點選關鍵字。圖是各來源堆疊的提及次數、前 7 日均量虛線，以及規則觸發的三角標記。圖表使用 CDN 上的 [Chart.js 4.4.7](https://www.chartjs.org/)。
3. **觀察名單**：每個每日快照裡的早期升溫，以及它後來有沒有出現在熱門話題。
4. **回測**：讀 `data/backtest.json`。主結果只在美股驗證過；台股與日股仍在累積資料。

## 本地預覽

```bash
python3 -m http.server 4173
```

打開 <http://127.0.0.1:4173/> 。不要用 `file://` 直接點 `index.html`，否則瀏覽器讀不到 `data/`。

檢查資料契約：

```bash
python3 scripts/validate_data.py
```

## 部署

網站檔在倉庫根目錄：`index.html`、`assets/`、`data/`。`.github/workflows/pages.yml` 會在推上 `main` 時檢查資料，再把這些檔發到 GitHub Pages。Pages 的建置類型要設成 GitHub Actions。

倉庫裡也有 `.nojekyll`。若改走「從分支部署 / 根目錄」，Jekyll 不會改寫這些檔。

## 資料契約

編碼都是 UTF-8。日期是 `YYYY-MM-DD`。市場只使用 `TW`、`US`、`JP`。來源只使用：

| source | 畫面上的名稱 |
| --- | --- |
| `ptt` | PTT |
| `cmoney` | CMoney |
| `threads` | Threads |
| `5ch` | 5ch |
| `reddit` | Reddit |
| `x` | X |
| `youtube` | YouTube |
| `news` | 新聞 |

### `data/history.csv`

表頭固定為：

```text
date,market,source,keyword,mentions,authors
```

同一天、同一個市場、同一個來源、同一個關鍵字只能有一列。`mentions` 與 `authors` 是非負整數。沒有提及的日子不要寫列；圖表會把缺的日期當成 0。

```text
date,market,source,keyword,mentions,authors
2026-10-08,TW,ptt,南亞科,8,5
2026-10-08,TW,cmoney,南亞科,6,3
2026-10-08,TW,threads,南亞科,4,3
```

### `data/daily/YYYY-MM-DD.json` 與 `data/latest.json`

`latest.json` 必須與最新的每日檔內容相同。`date` 必須等於檔名日期。

```json
{
  "date": "2026-10-28",
  "data_label": "範例資料",
  "markets": {
    "TW": {
      "topics": [
        {
          "keyword": "台積電",
          "summary": "討論摘要。",
          "links": [
            { "title": "標題", "url": "https://example.com/story", "source": "news" }
          ]
        }
      ],
      "early_heating": [
        {
          "keyword": "奇鋐",
          "reason": "為什麼把它標成早期升溫。",
          "ratio_vs_7d": 10.27,
          "communities": 3,
          "platforms": ["ptt", "cmoney", "threads"]
        }
      ]
    },
    "US": { "topics": [], "early_heating": [] },
    "JP": { "topics": [], "early_heating": [] }
  },
  "hit_rate_note": "給今日頁底部的一句話。"
}
```

- `markets` 必須同時有 `TW`、`US`、`JP`。
- `topics[].links` 是物件陣列，欄位為 `title`、`url`、`source`。`url` 只接受 `https://`。
- `early_heating[].platforms` 使用上面的 source 代碼。`communities` 是非負整數。`ratio_vs_7d` 是數字；前 7 日合計為 0 時可以是 `null`。
- `data_label` 可省略。範例檔填 `"範例資料"`。正式資料拿掉它。
- `hit_rate_note` 是給人讀的字串，頁面不會解析裡面的數字。

### `data/manifest.json`

靜態站不能列出目錄，所以每日檔的日期要寫在這裡。`daily` 由舊到新、不重複，`latest` 等於最後一天。磁碟上的 `data/daily/*.json` 必須和這份清單一致。

```json
{
  "data_label": "範例資料",
  "latest": "2026-10-28",
  "daily": ["2026-09-21", "2026-09-22"]
}
```

### `data/backtest.json`

頁面直接渲染這份摘要，不重算。`scope_note` 要包含這句：

> 此回測僅在美股驗證；台股與日股仍在累積資料。

```json
{
  "data_label": "範例資料",
  "source_note": "由結果檔整理，網站沒有重算。",
  "scope_note": "此回測僅在美股驗證；台股與日股仍在累積資料。",
  "ret_note": "ret 是簡單報酬：0.44 表示 +44%。",
  "parameters": { "k": 5.0, "minabs": 5.0, "tk": 1.3 },
  "metrics": {
    "hit_rate": 0.2667,
    "precision": 1.0,
    "flags": 15,
    "control_flags": 0,
    "control_names_flagged": 0,
    "median_lead_days": 23,
    "score": 0.567
  },
  "us_slice": {
    "hot_names": 8,
    "hot_hits": 4,
    "hot_hit_rate": 0.5,
    "control_names": 3,
    "control_names_flagged": 0,
    "flags": 12,
    "note": "美股熱門股的整理說明。"
  },
  "channels": [
    {
      "id": "best",
      "label": "Reddit 主結果",
      "validated": true,
      "mentions_label": "Reddit 提及",
      "note": "這個管道的說明。",
      "rollup": {
        "names": 20,
        "hot_names": 15,
        "hot_hits": 4,
        "hot_hit_rate": 0.2667,
        "control_names": 5,
        "control_names_flagged": 0,
        "control_hits": 0,
        "flags": 15
      },
      "rows": [
        {
          "name": "Micron",
          "zh_name": "美光",
          "market": "US",
          "group": "hot",
          "hit": true,
          "ret": 4.175,
          "n_flags": 5,
          "n_conf": 5,
          "first_flag": "2025-12-17",
          "lead_attn": 51,
          "lead_price": 1,
          "price_peak": "2026-06-25",
          "attn_peak": "2026-06-28",
          "trend_peak": "2026-06-21",
          "mentions": 467,
          "flags": ["2025-12-17"]
        }
      ]
    }
  ]
}
```

`group` 使用 `hot` 或 `control`。沒有的數字欄位填 `null`。`channels` 裡要有一個 `id` 為 `best`、`validated` 為 `true` 的主結果。其他管道（新聞、PTT、Reddit + 新聞、GDELT）可以 `validated: false`；GDELT 若沒有列，`rows` 用空陣列。

目前這份摘要來自參數搜尋後的最佳組（k = 5、minabs = 5、tk = 1.3）以及新聞、PTT、Reddit + 新聞、GDELT 的對照。主結果熱門股命中率 26.7%（4/15），精準度 100%，旗標 15 次，對照組旗標 0，中位領先天數 23。只看美股熱門股是 4/8。`ret`、`hit`、領先天數都沿用結果檔。

## 觸發規則

趨勢圖上的三角由 `history.csv` 現算，規則在 `assets/rule.js`（並有一份相同的 `scripts/rule.py`）：

1. 檔案日期範圍裡，這一天之前要有完整 7 個日曆日。缺少的日期算 0。
2. 當日各來源 `mentions` 合計 ≥ 5。
3. 當日合計 ≥ 前 7 日合計的 5 倍。前 7 日合計是 0 時，只要達到第 2 點即視為倍數成立。
4. 含當日在內的 3 個日曆日裡，至少 2 個不同 `source` 的提及大於 0。

這份契約沒有更細的社群欄位，所以「至少 2 個社群」和「跨平台」是同一個條件：3 日內不同來源 ≥ 2。`early_heating.communities` 在範例裡等於 `platforms` 的長度，`platforms` 就是那些來源。

每日快照的 `early_heating` 由產生資料的程序填寫。觀察名單讀快照，不重算規則。範例資料讓兩套結果對得起來；正式日更若調整規則，圖上的三角仍依上面 4 點計算。

「其後列入熱門」是指：標記日之後的某個每日快照，把同一個市場、同一個關鍵字放進 `topics`。

## 每天更新

1. 把新的提及列加進 `data/history.csv`。
2. 寫 `data/daily/YYYY-MM-DD.json`。
3. 把該日期加進 `data/manifest.json` 的 `daily`，並更新 `latest`。
4. 把同一個 JSON 複製成 `data/latest.json`。
5. 若回測有更新，覆寫 `data/backtest.json`，並保留驗證範圍那一句。
6. 正式資料不要再寫 `data_label`。
7. 推上 `main`。


## 範例資料在講什麼

樣本區間是 2026-09-14 到 2026-10-28。每日快照從 2026-09-21 開始。南亞科、聯發科、美光、英特爾、輝達、鎧俠、愛德萬測試有早期升溫，後來進入熱門話題。世芯-KY 標了但還沒有進入熱門。奇鋐、超微、藤倉標在最後一天，所以觀察名單上仍是尚未列入熱門。AST SpaceMobile 在 2026-10-11 只有 Reddit 放量，量夠但沒有跨平台，圖上不會出現三角。
