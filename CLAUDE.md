# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案簡介

純前端農場模擬遊戲，無任何外部依賴、無建置步驟。五個檔案即為全部：`index.html`、`game.js`、`style.css`、`audio.js`、`CLAUDE.md`。

## 開發與預覽

```bash
# 本地預覽（需 Node.js）
npx serve -l 3742 .

# 推送到 main 即自動部署 GitHub Pages
git push origin main
```

`.claude/launch.json` 已設定好 `npx serve`，可直接用 Claude Code 預覽面板開啟。  
預覽後務必用 `preview_eval` 注入 `localStorage.setItem('happyFarm_currentPlayer','測試')` 跳過名字輸入 modal，再 `location.reload(true)`。

## 架構

### 資料流

`state`（全域物件）→ `render()` → DOM。沒有 reactive 框架，所有操作都是：修改 state → 呼叫 `render()` 或個別 `renderXxx()`，最後 `saveState()`。

```
growTick() [每秒] ─→ weatherTick() → 修改 state.weather
                  └→ 逐 plot 更新狀態 → renderFarm() / renderStats()

handlePlotClick() → doPlant/doWater/doHarvest/doFertilize/doRemove
                  → saveState() → render()
```

### 農地（Plot）狀態機

```
empty → planted → growing ⟷ watered → ready → (harvest) → empty
                     ↓            ↓
                  wilting ──────────────────→ dead
```

額外旗標（非 `status` 欄位）：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `overWatered` | bool | 在 25% waterInterval 內重複澆水設 true；再澆一次死亡 |
| `fertCount` | 0\|1\|2 | 0→1(-40%)、1→2(-20%)、≥2 → 死亡 |
| `deathCause` | string\|null | `'thirst'`/`'overwater'`/`'overfertilize'` |

### 玩家與存檔系統

- 目前玩家名稱存於 `localStorage['happyFarm_currentPlayer']`
- 每位玩家的存檔 key 為 `happyFarm_save_{name}`
- `getPlayerName()` / `setPlayerName(n)` / `getSaveKey()` 三個 helper
- 首次開啟（無玩家名）強制顯示 `showPlayerModal(required=true)`
- 切換玩家時先 `saveState()` 再重設 state 再 `loadState()` 載入目標玩家
- **向前相容**：新增 plot 欄位必須在 `init()` backfill 區段補上 `if (plot.xxx === undefined) plot.xxx = defaultValue`

### 天氣系統

`weatherTick()` 在每次 `growTick()` 開頭呼叫，到期後從 `WEATHER_POOL` 隨機選下一個天氣。`WEATHERS[key].waterMult` 乘以 crop 的 `waterInterval` 決定有效澆水間隔（`effectiveWaterInterval()`）。雨天每 25 秒自動澆水全部農地；暴風雨每秒有 2% 機率讓每個生長中的農地進入枯萎。

### Modal 系統

`showModal(title, body, opts)` 支援 input 欄位與確認按鈕：

```js
showModal('標題', '內容', {
  input: true,          // 顯示文字輸入框
  placeholder: '...',
  confirmText: '確認',  // 顯示確認按鈕，點後呼叫 onConfirm
  closeText: '取消',
  hideClose: false,     // true = 強制必須輸入（不可關閉）
  onConfirm: (value) => { /* 取得輸入值 */ },
})
```

### 音效

`audio.js` 匯出全域 `AudioManager`（IIFE），使用 Web Audio API 合成音效，無外部音訊檔。第一次使用者互動後才呼叫 `AudioManager.start()` 啟動 AudioContext（瀏覽器自動播放限制）。

## CSS 佈局結構

```
#app  (100dvh, grid: 50px 1fr)
├── header
└── main (grid: var(--left-w) 1fr var(--right-w))
    ├── #left-panel   (工具 + 倉庫)
    ├── #farm-section (container-type: size)
    │   └── #farm-grid
    └── #right-panel  (種子商店 + 日誌)
```

CSS 變數控制欄寬，隨 breakpoint 縮小：
```css
:root         { --left-w: 155px; --right-w: 205px; }
≤1023px       { --left-w: 130px; --right-w: 175px; }
≤800px        { --left-w: 110px; --right-w: 155px; }
```

**農場格子正方形關鍵（Container Queries）：**
```css
#farm-section { container-type: size; }
#farm-grid {
  width:  min(100cqw, 100cqh);  /* 取容器寬高的較小值 */
  height: min(100cqw, 100cqh);
}
```

**RWD breakpoints：**
- `≥900px`（桌機）：三欄、無捲軸
- `600–899px`（平板）：三欄縮小、無捲軸
- `≤600px`（手機）：垂直堆疊（main flex-direction: column），工具 5 個橫排，種子橫向捲動，允許頁面捲軸

**Emoji 自動縮放：**
```css
.plot .plot-emoji { font-size: clamp(1.5rem, 8vmin, 4rem); }
```

## 新增作物

在 `CROPS` 物件加入一筆，必填欄位：

| 欄位 | 說明 |
|------|------|
| `name` | 中文名稱 |
| `emoji` | 顯示在農地、種子列表的 emoji |
| `seedCost` / `sellPrice` | 購買與售出金幣 |
| `growTime` | 成熟秒數 |
| `waterInterval` | 需要再次澆水的間隔（秒），超過此值進入枯萎 |
| `wiltGracePeriod` | 枯萎後多少秒死亡（秒） |
| `waterBonus` | 每次澆水縮短的成熟秒數 |
| `expGain` | 收穫給予的經驗 |
| `unlockLevel` | 解鎖所需等級（1–8） |
| `fertilizerCost` | 第1次施肥費用；第2次×2，第3次×3（中毒） |

`LEVEL_EXP` 和 `PLOTS_UNLOCKED` 各有 9 個元素對應等級 1–8，新增等級需同步延伸這兩個陣列。

## 新增天氣

在 `WEATHERS` 加入 key，必填 `name/emoji/minDur/maxDur/waterMult`，選填 `autoWater`（雨天自動澆水間隔秒）和 `stormDmg`（每秒每 plot 的損傷機率）。同時將新天氣 key 加入 `WEATHER_POOL`（重複出現代表高機率）。天氣效果邏輯統一寫在 `growTick()` 中。

## 數值上限

`MAX_VAL = 99999999`（8 位數）。所有增加金幣或 EXP 的操作都用 `Math.min(value + delta, MAX_VAL)`。

## GitHub Pages 部署注意

環境保護規則已設定允許 `main` 分支部署（`github-pages` environment → deployment branch policy = `main`）。直接 `git push origin main` 即觸發自動部署，約 30 秒完成。
