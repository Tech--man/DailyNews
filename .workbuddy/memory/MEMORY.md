# 每日新報 DailyNews · 项目约定

> 长期项目笔记。工作日志见同目录 `YYYY-MM-DD.md`。

## 项目定位
民国/复古报纸版式的**中英双语**每日新闻静态站。Astro 静态输出，零运行时 JS。
部署 GitHub Pages：https://tech--man.github.io/DailyNews/（子路径 `/DailyNews/`）。

## 不可破坏的约定

1. **站内链接一律走 `BASE` 前缀**（`src/lib/base.mjs`），语言段由 `langPrefix(lang)` 追加。
   硬编码 `/issue/...` 会在 GitHub Pages 项目页下 404。
2. **期数据格式**：`issues/<date>.json` 是**双语版**结构 ——
   `{ issue, date, languages, lunar:{zh,en}, weather:{zh,en}, editions:{zh:{...},en:{...}}, meta }`。
   取某语言版用 `editionOf(issue, lang)`（`src/lib/issues.mjs`）。
   `issues/<date>.meta.json` 是出刊元数据，**不要**当期数据读（`listIssueDates()` 已过滤）。
3. **类目用语言中立的 key**（`top`/`world`/`business`/`tech`/`culture`/`sport`/`society`/`science`），
   显示名由 `CATEGORY_LABELS[lang]` 取。**不要**在数据里写「财经」「財經」这类显示名。
4. **版面配额与源池都在 `config/feeds.json`**，不写死在代码里。每源必须声明
   `group`（媒体集团）、`tier`（core/standard/optional）、`lang`、`category`。
5. **配额按 `group` 计算，不按 `name`** —— 一家媒体的多个分频道源必须同 group，
   否则多样性约束会被「一家开多频道」绕过。
6. **版权约束**：只存标题 + 截断摘要 + 原文链接，**不存全文**。
7. **中文版为简体**。混入的繁体稿（端传媒等）经 `toSimplified()`（opencc-js）转换。
   仅报头刊名「每日新報」保留繁体作品牌美术字。
8. **纯函数与 IO 分离**：`scripts/lib.mjs` 不做任何 IO（可单测），网络全在 `scripts/feed.mjs`。
9. **报头刊名层级随语言镜像反转**（`Masthead.astro`）：
   zh 版＝中文刊名作大字（Noto Serif SC 900 · 88px · 字距 .22em · 双钩描边）+ 拉丁刊名作小字（IM Fell 斜体套红）；
   en 版＝英文刊名作大字（Playfair Display **900** · **72px** · 字距 **.02em** · **无描边**）+ 中文刊名作小字（宋体 700 套红 · 字距 .3em）。
   两套字距/描边**不可互换**——中文那套是为方块字等宽与细笔画补墨设计的，拉丁衬线照搬会「字间漏风」且描边糊衬线。
   字号令牌 `--fs-display`(88) / `--fs-display-en`(72)；中幅 52、窄幅 44（CSS §3b）。类名 `masthead-minor` = 小字位（曾名 `masthead-latin`）。
10. **版本差异声明带必须挂在全部入口页**：`EditionNotice.astro` 需同时出现在 `FrontPage.astro` 与 `Archive.astro`。
    两版各自独立选稿、内容不同源、非互译，不声明即属内容诚信缺失。它放在报头与栏目条之间（不是装饰）。
    可关闭、且 5 秒后自动收起——**全程零脚本**（隐藏 checkbox + `:checked ~` 收起；
    外层 `grid-template-rows: 1fr→0fr` 动画塌陷，因 `height:auto→0` 不可插值；
    底边 2px 红条为倒计时进度条，让自动消失可预期）。
    本站的「零脚本」是对外承诺，勿为交互引入 JS；确需「关闭后可重开／跨次记住」时须同步改 colophon 表述。
11. **广告位口径是「招租」**（`adHead`/`adBody`/`adSign`）：本站无订阅业务，勿把订阅价格/投递方式写回文案。
12. **创刊年份不得写死**：由最早期次推得（`listIssueDates().at(-1)` → `foundedYear` prop），`i18n` 的 `founded` 是函数。
13. **字体产物在 `public/fonts`**（`css/fonts.css` 以 `../fonts/` 引用），`scripts/vendor-fonts.sh` 的 `OUT` 必须指向它。
    Playfair 需 400/700/900 三个字重（900 供英文刊名）。
14. **期号自第一期起算**（第一期 = 1，按磁盘上的实际出刊序列定，缺期不跳号）。
    两处实现必须同口径：渲染层 `src/lib/issues.mjs` 的 `issueNumberOf()` 与生成层
    `scripts/generate-issue.mjs` 的 `issueNo()`——不一致会让报头与过刊页显示不同期号。
    **渲染一律用派生值，不用期数据里的 `issue` 字段**（那是旧口径：自虚构创刊日 2025-07-14
    按天推算，算的是日历天数差而非出刊期数，站上只有一期却显示 429）。
15. **报头不显示售价**（`price` 键已删）。报头左侧只剩期号，靠 `align-items: end` 与右侧底部齐平。

## 出刊管道（顺序不可换）

```
collectFeeds            scripts/feed.mjs      抓取（SSRF 守卫 + 重试）
  → filterFresh         36h 时效硬门槛，无日期条目剔除
  → isNoise             聚合索引/直播页过滤
  → classifyV2          来源类目先验(3) + 高置信词(2)
  → computeConsensus    ★ 必须在去重之前：去重合并同题条目后就算不出「几家独立报道」
  → withScores          tier(2/6/12) + weight×1.5 + 时效(0-10) + 共识(0-10) + 关键词(0-6)
  → dedupeByTitle       相似度 >0.8 合并，保留高分者
  → selectEdition       配额 + 集团上限 + 头次条异集团 + 简讯轮转
  → buildBody/compose   头条正文切段、副刊、简讯导语、繁简转换
```
每语言版**独立跑一遍**（`buildEdition`），两版内容不同源、互不冒充。

## 常用命令（本机 pnpm 不在 PATH）

```bash
CP="/Users/x.ray/.workbuddy/binaries/node/versions/22.22.2-3/bin/corepack"
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 $CP pnpm test
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 $CP pnpm run build:issue:dry   # 漏斗报表，不写文件
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 $CP pnpm run build:issue
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 $CP pnpm build
```
预览：本机已有 astro preview 在 **4178** 端口（`--port 4321` 会报 already running），
直接看 `http://localhost:4178/DailyNews/`。

## 实测失效的候选源（勿重复尝试）

- 404：央视新闻、第一财经、证券时报、联合早报、虎扑、新浪体育、网易体育、中国日报体育、果壳、三联生活周刊、财联社、路透中文（401）、AP（403）、懂球帝（403）、虎嗅（超时）
- 内容陈旧：人民网（最新 11831 小时前 = 1.3 年前，归档转储）、澎湃新闻（6549 小时前）
- 无日期字段：新华网（300 条全无 `pubDate`，无法做时效过滤）
- 返回空：Nikkei Asia、DW English、Nature、ESPN、美国之音中文
