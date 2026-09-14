# 每日新報（DailyNews）

以民國報紙版式呈現當日新聞的靜態站點。每天清晨定時抓取 RSS 聚合、清洗去重、
打分選稿，生成一期「打開就是一張報紙」的靜態頁面——零腳本、零運行時依賴。

![桌面版式](docs/screenshots/m3-desktop-1440.png)

## 里程碑狀態

- [x] M1 靜態版式原型（11 項視覺驗收）
- [x] M2 數據管道（RSS 抓取 → 清洗 → Levenshtein 去重 → 分類打分 → 選稿）
- [x] M3 Astro 渲染層（`/` 最新期、`/issue/[date]/`、`/archive/`）
- [x] M4 自動化（`.github/workflows/daily-issue.yml`，北京時間每日 06:00）
- [x] M5 打印樣式（A4）、農曆節氣、OG 分享圖、天氣、LLM 標題改寫（可選增強）
- [x] 部署：GitHub Pages（https://tech--man.github.io/DailyNews/）

## 常用命令

```bash
pnpm install
pnpm test           # node --test 單元測試
pnpm run build:issue  # 抓取 RSS 生成 issues/<今天>.json + OG 分享圖
pnpm run build:og     # 為全部期次重新生成 OG 圖
pnpm build          # Astro 構建到 dist/
pnpm preview        # 預覽構建產物
```

## 配置

- `config/feeds.json` — RSS 源（weight 權重 / category 類目）、城市、條數上限
- `scripts/og.mjs` — OG 卡片字體緩存目錄可用 `OG_FONT_DIR` 覆蓋（默認 `.og-fonts/`，不入庫）

### LLM 標題改寫（可選）

不配置則自動跳過、保留 RSS 原標題。金鑰僅從環境變量讀取：

```bash
export LLM_API_KEY=***    # 必填才啟用
export LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4   # 可選，OpenAI 兼容接口
export LLM_MODEL=glm-4-flash                                # 可選
```

改寫要求 8–12 字繁體報紙體、禁感嘆問號；不合格輸出一律回退原標題。

## 部署（GitHub Pages）

- 站點地址：https://tech--man.github.io/DailyNews/
- 推送 `main` 即自動測試、構建並部署（`.github/workflows/deploy.yml`）
- 每日定時出刊提交新期後主動 `workflow_dispatch` 上述部署工作流
  （定時任務用 GITHUB_TOKEN 推送不會觸發 push 事件，須顯式觸發）
- 項目頁掛在 `/DailyNews/` 子路徑：`astro.config.mjs` 的 `base` 已配置，
  站內連結統一走 `src/lib/base.mjs` 的 BASE 前綴
- 定時出刊在 GitHub Actions 上默認無 `LLM_API_KEY`，改寫自動跳過、保留原標題；
  如需線上啟用改寫，在倉庫 Secrets 添加同名變量即可

## 版權約束

只存標題、截斷摘要與原文鏈接，不存全文；原文版權歸各來源所有。

## 結構

```
config/feeds.json        源與參數配置
issues/                  每日期數據（入 Git）
scripts/                 數據管道（lib 純函數 / 抓取編排 / OG 生成 / LLM 改寫）
src/                     Astro 組件與頁面
public/                  字體、樣式、占位圖、OG 圖
tests/                   node:test 單元測試
docs/                    規劃存檔、實施記錄、驗收截圖
```
