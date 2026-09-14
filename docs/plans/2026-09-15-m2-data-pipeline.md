# 每日新報（DailyNews）M2 数据管道 · 实施记录

**Goal:** RSS 抓取 → 清洗 → 去重 → 分类打分 → 选稿，产出第一份真实 `issues/<date>.json`。不做 LLM（M5），直接截取原文摘要。

**日期:** 2026-09-15（实施日；首份正式期为第 429 期）

## 实现

- `config/feeds.json` — 8 个中文 RSS 源（weight/category），limit 配置
- `scripts/lib.mjs` — 纯函数：`stripHtml`/`truncate`/`levenshtein`/`similarity`/`dedupeByTitle`(>0.8 合并)/`classify`(关键词)/`scoreArticle`(权重×8 + 时效衰减 0–10/36h + 关键词 0–6)/`selectLayout`(1 头条 1 次条 N 简讯 財經·科技半版各 1)
- `scripts/generate-issue.mjs` — 编排：并发抓取(allSettled 容错) → RSS 2.0/Atom 统一解析(fast-xml-parser) → 管道 → 写 `issues/<date>.json`
- `tests/` — node:test，17 用例（清洗/去重/分类/打分/选稿/SSRF 守卫）

## 关键决策

- **依赖**: 仅 `fast-xml-parser`；RSS/Atom 解析不手写（CDATA/实体/双格式边界多）
- **SSRF 守卫**: 请求前校验 URL —— 仅公网 http(s)，拒 localhost/内网主机名/私有与保留 IPv4/IPv6（含 v4 映射）
- **版权**: 只存 标题 + 截断摘要(头条 80 字/半版 120 字) + 原文链接，不存全文
- **源更替**: 36氪/联合早报/界面/虎嗅 RSS 已失效（实测 404/HTML/超时），换为 IT之家/爱范儿/华尔街见闻/钛媒体
- **期号**: 创刊日 2025-07-14，`issue = 距创刊日天数 + 1`（2026-09-14 恰为 428，衔接 M1 版面）
- **lunar/weather**: 占位空值，接真实数据属 M5
- **直接运行守卫**: `generate-issue.mjs` 的 `main()` 仅在 `import.meta.url === argv[1]` 时执行，保证可被测试安全 import

## 验证（2026-09-15 实测）

- [x] `pnpm test` 17/17 通过
- [x] 8/8 源抓取成功，合计 64 条（去重后）
- [x] 选稿完整：头条 1 / 次条 1 / 简讯 7 / 財經·科技半版各 1
- [x] 结构校验：issue 编号衔接、无 HTML 残留、链接全 https
- [x] `node scripts/generate-issue.mjs [YYYY-MM-DD]` 幂等可重跑

## 遗留 → M3

- 渲染层读 `issues/<date>.json` 替换 M1 硬编码（Astro 组件化）
- briefs 无 link 展示位（版面上以「来源」落款即可）
- 头条无图时版式退化到模板 C（文字版）——M3 模板池首件事
