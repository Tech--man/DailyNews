# 排版优化变更台账与交接说明 · 2026-09-15

> 对应诊断文档：`docs/plans/2026-09-15-自动排版适配方案探讨.md`
> 实施提交：`3aa88b8`（主修复）+ `package.json` 脚本注册（后续提交）
> 验证记录：`docs/typography-optimization/CHECKS.md`；数据：`baseline-verify.json` / `after-verify.json`

## 一、逐条对照诊断建议的实施清单

| # | 诊断建议（原文要点） | 优先级 | 状态 | 实施说明 |
|---|---|---|---|---|
| 1 | L4 验证守门：构建后真实浏览器断言，不通过不出刊 | 🔴 P0 | ✅ 本次实施 | `scripts/verify-layout.mjs` + `pnpm run verify:layout`；断言无静默裁剪、无横向溢出；软告警含无谓渐隐/行数偏差/对比度/填充率/CLS |
| 2 | `--l`/`is-faded` 按 3 个断点各算一套，修复跨档失配 | 🔴 P0 | ✅ 本次实施 | `fitClamp3()` 一次算齐 full/mid/narrow；组件注入 `--l-full/mid/narrow` + `--fade-*`；CSS 容器查询按档取用 |
| 3 | `Secondary.astro` 补 `size: 14`，消除系统性高估 | 🟡 P1 | ✅ 本次实施 | `Secondary.astro` 改传 `size: 14`（与 CSS `--fs-brief` 对齐） |
| 4 | 补齐 `count-4/5` 规则，修复 4 篇丢层级、5 篇孤篇 | 🟡 P1 | ✅ 本次实施 | CSS §11：4 篇=首篇通栏+中两篇并栏+末篇通栏收尾；5 篇=首篇通栏+2×2 半栏；`Sections.astro` 的 `isFull()` 同步 |
| 5 | 半栏 `cap=4` 与真实导语长度（中位 8 行）不匹配 | 🟡 P1 | ✅ 本次实施（调至 8） | `CLAMPS['section-half'].design = 8`（zh 导语 p50≈8 行完整展示）；guard=10 |
| 6 | `METRICS.briefs` 的 `-40` 魔数 | 附带 | ✅ 本次实施 | 改为 dense 单列实测宽 159px（旧值 323px 约两倍高估——简讯大面积硬裁的根因之一）；`scripts/measure-slots.mjs` 可随时重采样 |
| 7 | `max-height` 硬编码行高 1.7 的脆弱耦合 | 附带 | ⚠ 保留（已加固） | 1.7 与 `--lh-body` 的一致性由 `tests/fit.test.mjs` 令牌对拍守卫；改动行高令牌会被单测拦截 |
| 8 | 西文字宽系数粗略近似 | 🟢 P2 | ✅ 超额完成（并入 P0-2） | en 版独立拟合模型（MAE 0.10 行），而非沿用 P2 的 opentype.js 方案——实测拟合已足够精确 |
| 9 | L1 精确度量（opentype.js 逐字符 advance width） | 🟢 P2 | ⏸ 延后 | 拟合模型 MAE 0.06/0.10 行 + 守护网已达标；引入构建依赖收益边际小。内容分布大幅变化再评估 |
| 10 | L2 版面预算（模板库）+ L3 六档降级 | 🟢 P2 | ⏸ 延后（部分落地） | 三档钳制本质是 L3 简化版（设计钳制=有序让步、渐隐=最后兜底）；完整模板库需先决策「版面高度漂移是否接受」（诊断文档待决策 #1） |

**范围说明**：诊断建议 1–6 全部落地；7 显式保留并加了守卫；8 以更轻方式超额完成；9/10 延后并写明理由与触发条件。无遗漏、无夹带（未动信息架构/文案/品牌资产）。

## 二、变更台账（位置 → 内容 → 影响范围 → 回退方式）

| 文件 | 改动 | 影响范围 | 回退方式 |
|---|---|---|---|
| `src/lib/fit.mjs` | 全量重写：`TIERS` 三档宽度表、`CLAMPS` 双层钳制表、按语言拟合字宽模型、`fitClamp3()`、+1 行安全余量；保留旧签名兼容 | 所有钳制元素的行数估算（构建时） | `git revert 3aa88b8 -- src/lib/fit.mjs`；基线快照在 `docs/typography-optimization` 工作台（.cluster/dailynews-typography/baseline/code/） |
| `src/components/Headline.astro` | `fitClamp` → `fitClamp3`；注入三档变量；接 `lang` | 头条导语 | `git revert`（组件可独立回退） |
| `src/components/Secondary.astro` | 同上 + `size: 14` 修复 | 次条导语 | 同上 |
| `src/components/Briefs.astro` | 同上 + dense 宽度 159px 修复 + `tagEm` 从栏宽扣除 | 简讯标题/导语 | 同上 |
| `src/components/Sections.astro` | 同上 + `isFull()` 支持 count-4/5 | 各版文章导语 | 同上 |
| `src/components/Translated.astro` | `fitClamp` → `fitClamp3` | 域外译讯（当前无数据，前瞻性） | 同上 |
| `src/components/BodyColumns.astro` | 栏数决策宽度改用 `TIERS.full.bodyCol` | 头条正文栏数 | 同上 |
| `src/components/Supplement.astro` | 同上（`TIERS.full.supplementCol`）+ 按语言估算 | 副刊正文栏数 | 同上 |
| `src/components/FrontPage.astro` | 向五个子组件传 `lang` | 组件接口（无视觉影响） | 同上 |
| `public/css/newspaper.css` | ① 钳制块三档变量化（`--l-cur`/`--fade-cur` + mask calc）② 容器查询断点 999→1099 ③ mid/narrow 取档 + line-clamp 守护网 ④ count-4/5 网格规则 ⑤ `.briefs` 加 `align-self: start` ⑥ 窄幅副刊正文单列 ⑦ 打印档取 mid 守护值 | 全站版式（7 处独立修改点） | `git revert 3aa88b8 -- public/css/newspaper.css` |
| `tests/fit.test.mjs` | 适配新模型 + 新增 `TIERS`/`fitClamp3` 用例（12→14，总计 88） | 单测 | `git revert` |
| `package.json` | 注册 `verify:layout` / `shoot:layout` / `measure:slots` | npm scripts | 删三行 |
| `scripts/verify-layout.mjs` | **新增**（守门脚本，189 行） | CI/本地验证 | 删除文件 |
| `scripts/shoot-layout.mjs` | **新增**（截图脚本） | 证据采集 | 删除文件 |
| `scripts/measure-slots.mjs` | **新增**（槽位宽度采样） | 维护工具 | 删除文件 |
| `docs/typography-optimization/*` | **新增**：验证记录、对比截图、验证数据、本台账 | 文档 | 删除目录 |

## 三、维护交接

### 日常出刊
流水线不变：`pnpm run build:issue && pnpm build`。排版估算在 Astro 构建时自动完成，无需额外步骤。

### 验证守门（建议 CI 化）
```bash
pnpm preview &            # 或任一静态服务 dist/
pnpm run verify:layout    # 退出码 1 = 有静默裁剪/溢出，不出刊
```
GitHub Actions 建议：在 `daily-issue.yml` 的 build 后加一步（需 puppeteer-core + Chrome/chromium headless）。

### 版式网格改动后的重校准
1. `pnpm run measure:slots` —— 重新采样各档槽位宽度
2. 与 `src/lib/fit.mjs` 的 `TIERS` 对照，宽度变了就更新表
3. `pnpm test && pnpm run verify:layout` —— 令牌对拍 + 浏览器断言双守卫

### 钳制值调整
版面语言变化（如头版导语放宽到 4 行）→ 只改 `CLAMPS` 一个表，构建即生效；`guard` 必须大于 `design`（单测有断言）。

### 已知边界
- **+1 行安全余量的代价**：估算偏保守，`faded=true` 可能比理论值早一行触发（表现为「多渐隐一行」而非丢字）——有意取舍：宁可视觉多溶解一行，绝不静默裁剪。
- **en 版 CLS 0.0367**：Old Standard 700 字重 swap 所致（v3 已有），远低于 0.1 阈值；归零需 `font-display: optional`（代价：偶尔回退系统衬线）。
- **mid 档内漂移**：估算用档内代表宽度（688px），极端视口可能偏差 1–2 行——line-clamp 守护网兜底，不会破版。

### 延后项触发条件
- **L1 精确度量**：`verify:layout` 的 estDev 告警在多期内容上持续出现（估算与真实偏差 >2 行）时引入。
- **L2 模板库 + L3 完整降级**：设计钳制渐隐占比 >50% 且编辑认为信息损失不可接受时，回诊断文档「三、方案」。
