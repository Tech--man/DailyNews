# 每日新報（DailyNews）M1 静态版式原型 · 实施计划

> **For Claude:** 使用 superpowers:executing-plans 逐任务执行本计划。本计划为纯视觉原型，以「截图 + 验收清单」代替单元测试作为每个任务的过关条件。

**Goal:** 手写一份硬编码假数据的完整报纸版面（index.html + newspaper.css + 自托管字体），把字体、色彩、栏宽、分隔线、质感调到「看着像民国报纸」，零 JS、零运行时依赖。

**Architecture:** 单页静态 HTML，语义化区块（masthead / 栏目条 / 12 栏主区 / 半版分栏 / 副刊广告 / 页脚）；全部样式集中在一份原生 CSS；字体用 @fontsource 的 unicode-range 分片 woff2 自托管，node_modules 仅作字体来源、不进运行时。

**Tech Stack:** 原生 HTML/CSS、@fontsource（Noto Serif SC 400/700/900、Playfair Display 400/700/斜体、Old Standard TT 400、IM Fell English 400/斜体）、git 本地仓、python3 http.server 预览、Playwright 截图验收。

**已定决策:** 范围=仅 M1；报头=原创「每日新報」；字体=自托管子集；文案=繁体报纸体（不用感叹号/问句、书面语）；日期按规划稿示例（二〇二六年九月十四日 星期一 · 農曆八月初四 · 白露 · 第〇四二八期 · 售價貳角 · 杭州多雲 22~29℃）。

---

### Task 0: 存档与脚手架

**Files:** Create: `.gitignore`, `docs/dev-plan.md`, `docs/plans/2026-09-14-m1-static-prototype.md`

1. `git init`（本地仓，不建远端、不推送）；写 `.gitignore`：`node_modules/`、`.DS_Store`、`.mimosa/`、`.v2c/`、`.video_agent/`
2. 用户的开发规划文档原文存档到 `docs/dev-plan.md`；本计划存到 `docs/plans/2026-09-14-m1-static-prototype.md`
3. Commit: `chore: init repo, archive dev plan and M1 implementation plan`

### Task 1: 字体自托管子集

**Files:** Create: `package.json`、`scripts/vendor-fonts.sh`、`fonts/<pkg>/...`、`css/fonts.css`

1. `pnpm init`（private）+ `pnpm add @fontsource/noto-serif-sc @fontsource/playfair-display @fontsource/old-standard-tt @fontsource/im-fell-english`
2. 写 `scripts/vendor-fonts.sh` 并执行：把四个包从 node_modules 拷入 `fonts/`，并裁剪到只用字重——noto-serif-sc 仅 400/700/900，playfair-display 仅 400/400-italic/700，old-standard-tt 仅 400，im-fell-english 仅 400/400-italic（删其余 woff2，仓库预计 8–15MB）
3. 写 `css/fonts.css`：聚合各包对应 weight css 的 @font-face 块（unicode-range 保留），url 指向 `../fonts/<pkg>/files/…`
4. Verify: `ls fonts/*/files | wc -l` 非零；抽查一个 woff2 存在
5. Commit: `feat: vendor self-hosted font subsets (@fontsource unicode-range chunks)`

### Task 2: index.html 骨架 + 硬编码内容

**Files:** Create: `index.html`、`img/placeholder-main.svg`、`img/placeholder-small.svg`（自带半调网点纹理的灰度 SVG）

按版面结构写全部语义化区块，繁体报纸体假数据（内容保持中性日常：農業/科技/財經/文體）：

1. **报头** `header.masthead` 三段式：左（第〇四二八期／零售價 貳角）· 中（「每日新報」大字 + IM Fell 花体 "THE DAILY NEWS" + 创刊行）· 右（日期星期／農曆·節氣）
2. **栏目条** `nav.sections`：要聞│財經│科技│文化│體育│國際
3. **主区** `main.front-grid`：头条（跨5栏：大标题+导语+主图+来源行）｜次条（跨3栏：中标题+小图）｜简讯栏（跨4栏：6–8条一句话 + 天气方块）｜头条正文（跨8栏，内部 CSS 三栏流动）
4. **半版区**：財經（左半）│科技（右半），各 1 篇带小标题正文
5. **副刊·廣告位** `section.supplement`：纸暗底复古广告框（Subscription Notice 风格）+ 套红圆形印章（每日新報·第〇四二八期）
6. **页脚**：本报声明（只存标题摘要与原文链接的版权说明）+ 上一期占位
7. `<head>` 引入 `css/fonts.css` 与 `css/newspaper.css`；全页无任何 `<script>`
8. Verify: 浏览器打开结构完整、无控制台 404
9. Commit: `feat: M1 page skeleton with hardcoded mock issue`

### Task 3: newspaper.css — 基础与版面

**Files:** Create: `css/newspaper.css`

1. CSS 变量色板（纸底 #F4EFE2／纸暗 #E8E1CF／墨黑 #1C1A17／淡墨 #6B6558／套红 #9B2B26／灰线 #8C8578）；字体栈 `"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif`，英文数字 Playfair Display / Old Standard TT
2. 容器 `max-width:1180px; padding:0 40px`；主区 `display:grid; grid-template-columns:repeat(12,1fr); gap:24px`，按 Task 2 的栏位分配 `grid-column: span N`
3. 分隔线体系：报头下 3px double、栏目条上下 1px 实线、区块间 1px；全站禁圆角禁阴影
4. 报头大字：Noto Serif SC 900 + 大字距（letter-spacing ≥ .25em）+ 微弱 text-shadow 双钩感；观感不足则记录待转 SVG 描边（M5）
5. 正文排版：15–16px／行高 1.75／`text-align:justify`；头条正文 `column-count:3; column-gap:24px; column-rule:1px solid`（实测栏宽落 320–360px）；首字下沉 `::first-letter` 约 3.2em 占 2–3 行
6. Verify: 桌面截图——双线层次、12 栏对位、栏宽达标（DevTools 量）
7. Commit: `feat: base layout, grid and rule system`

### Task 4: newspaper.css — 质感与细节

**Files:** Modify: `css/newspaper.css`

1. 质感三件套（按规划文档原样实现）：`body.paper::before` SVG feTurbulence 噪点（multiply, opacity .5）；`::after` radial-gradient 暗角；图片 `filter: grayscale(1) contrast(1.15) sepia(.15)`
2. 套红只用于：报头栏目字、印章、栏目条 hover 态（可选）、半版区分隔强调
3. 印章：圆形红底 + 反白「每日新報」四字 + 细圈边框，`transform: rotate(-6deg)`，`mix-blend-mode:multiply` 仿盖印
4. 简讯栏左右 1px 边线 + 天气方块（SVG 日/云图标 + 杭州多雲 22~29℃）
5. 简单响应式：`<900px` 主区退化为单栏堆叠、正文改单栏、报头纵向堆排；保留质感与分隔线（不追求完美移动端）
6. Verify: 375px 截图无横向滚动、可读
7. Commit: `feat: paper texture, seal, red accents and responsive fallback`

### Task 5: 验收与打磨

1. `python3 -m http.server 4173` 起本地预览；Playwright 分别在 1440×900 与 375×812 截图
2. 逐项核对验收清单，迭代微调（栏宽/字距/线宽/墨色浓度）直到全部打勾
3. 输出预览地址与两张截图给用户定稿
4. Commit: `polish: visual QA pass per M1 checklist`

---

## 验收清单（M1 Definition of Done）

- [x] 报头三段式齐全：期数/售價、报名大字、日期/農曆/節氣
- [x] 3px 双线与 1px 细线层次分明；全站零圆角、零阴影
- [x] 头条正文三栏流动，栏宽实测 320–360px，栏间 1px 线
- [x] 首字下沉占 2–3 行
- [x] 噪点、暗角、灰度图三件套全部生效
- [x] 套红仅出现在报头/印章/栏目强调处
- [x] 印章为套红圆形、带旋转与盖印质感
- [x] 全页零 `<script>`；HTML 语义化（header/nav/main/section/article/footer）
- [x] 字体全部自托管：DevTools Network 中 woff2 均 200、无外网字体请求
- [x] 375px 宽无横向滚动、版面可读
- [x] 本地 git 仓按任务粒度提交，未配置远端

## 明确不做（留给 M2–M5）

RSS 抓取/LLM 改写、Astro 渲染层、`/issue/[date]` 路由、归档页、GitHub Actions、打印样式、分享图、翻页动画、咖啡渍彩蛋、农历/天气真实接口。
