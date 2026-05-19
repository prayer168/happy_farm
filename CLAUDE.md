# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案簡介

純前端農場模擬遊戲，無任何外部依賴、無建置步驟。四個檔案即為全部：`index.html`、`game.js`、`style.css`、`audio.js`。

## 開發與預覽

```bash
# 本地預覽（需 Node.js）
npx serve -l 3742 .

# 推送到 main 即自動部署 GitHub Pages
git push origin main
```

`.claude/launch.json` 已設定好 `npx serve`，可直接用 Claude Code 預覽面板開啟。

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
                  wilting ──────────→ dead
```

額外狀態旗標（非 `status` 欄位）：
- `overWatered: bool` — 在 25% waterInterval 內重複澆水時設為 true，再澆一次觸發 `deathCause='overwater'`
- `fertCount: 0|1|2` — 超過 2 次施肥 → `deathCause='overfertilize'`
- `deathCause: 'thirst'|'overwater'|'overfertilize'|null` — 死亡原因，影響 emoji 和文字顯示

### 天氣系統

`weatherTick()` 在每次 `growTick()` 開頭呼叫，到期後從 `WEATHER_POOL` 隨機選下一個天氣。`WEATHERS[key].waterMult` 乘以 crop 的 `waterInterval` 決定有效澆水間隔（`effectiveWaterInterval()`）。雨天每 25 秒自動澆水全部農地；暴風雨每秒有 2% 機率讓每個生長中的農地進入枯萎。

### 音效

`audio.js` 匯出全域 `AudioManager`（IIFE），使用 Web Audio API 合成音效，無外部音訊檔。第一次使用者互動後才呼叫 `AudioManager.start()` 啟動 AudioContext（瀏覽器自動播放限制）。

### 存檔

`localStorage` key 為 `'happyFarm'`，存整個 `state` 物件的 JSON。每次修改後呼叫 `saveState()`，另有 `setInterval(saveState, 10000)` 定期備份。**向前相容**：新增 plot 欄位時，務必在 `init()` 的 backfill 區段補上 `if (plot.xxx === undefined) plot.xxx = defaultValue`。

## CSS 佈局結構

`#app` 使用 CSS Grid 三列：`var(--hdr) var(--tbar) 1fr`，鎖定在 `100dvh`，不允許任何父層捲軸。農場格子正方形的關鍵：

```css
#farm-grid {
  height: 100%;
  width: auto;
  aspect-ratio: 1;
  max-width: 100%;
}
```

`height: 100%` 填滿 farm-section，`aspect-ratio: 1` 讓寬度等於高度，`max-width: 100%` 在視窗較窄時改由寬度約束。

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
