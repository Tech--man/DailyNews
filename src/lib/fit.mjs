// 構建時排版測量（fit-to-layout）· v4 三檔鉗制。
//
// 機制（診斷報告 P0/P1 的落地形態）：
//   1. 寬度與字寬全部來自實測校準：full 檔鎖定版心 1100px（CSS 斷點 999→1099），
//      估算寬度唯一確定；字寬模型由 17 斷點 × 91 元素的真實渲染行數最小二乘擬合。
//   2. 三檔行數一次算齊（fitClamp3），組件注入 --l-full/--l-mid/--l-narrow 與
//      --fade-full/--fade-mid/--fade-narrow；CSS 容器查詢按檔取用。
//   3. full 檔用「設計鉗制」（版面語言的硬上限）；mid/narrow 用「守護鉗制」
//      （放寬的安全網）——窄屏縱向成本低，信息完整優先。
//   4. mid/narrow 另有 CSS line-clamp 守護網兜底（見 newspaper.css §1.5），
//      估算誤差最多導致提前漸隱半行，不會出現「無漸隱的硬裁」。
//
// 純函數、無依賴。版面常量與 newspaper.css 令牌對拍（tests/fit.test.mjs）。

// ---------- 槽位寬度（實測） ----------
// full = 版心 1100（.sheet ≥1080，斷點 1099）；mid = 版心 600–999（.sheet 680–1079）；
// narrow = 版心 <600（.sheet ≤679：front-grid 單列、section-articles 單列）。
// 維護：版式網格改動後跑 node scripts/measure-slots.mjs 重採樣更新此表。
export const TIERS = {
  full: {
    headline: 444,       // 頭條導語（front-grid 跨 5 欄）
    secondary: 248,      // 次條導語（跨 3 欄）
    briefs: 159,         // 簡訊 dense 雙列之單列（實測；舊值 323 約為兩倍高估）
    sectionFull: 526,    // 版塊通欄（count-1 全部 / count-3 首篇）
    sectionHalf: 251,    // 版塊半欄
    bodyCol: 357,        // 頭條正文雙欄之單欄
    supplementCol: 300,  // 副刊雙欄之單欄
    translatedItem: 538, // 譯訊雙列之單列
  },
  mid: {
    headline: 688, secondary: 332, briefs: 156,
    sectionFull: 688, sectionHalf: 332,
    bodyCol: 688, supplementCol: 510, translatedItem: 332,
  },
  narrow: {
    headline: 342, secondary: 342, briefs: 342,
    sectionFull: 342, sectionHalf: 342,
    bodyCol: 342, supplementCol: 342, translatedItem: 342,
  },
};

// ---------- 鉗制表 ----------
// design = 設計鉗制（full 檔版面語言的硬上限）；guard = 守護鉗制（mid/narrow 安全網）。
// design 值依據 2026-09-15 實測行數分佈（p50/p90）與版面語言（頭條導語 ≤3 行等）。
export const CLAMPS = {
  'headline-lead': { design: 3, guard: 7 },   // 頭條導語 ≤3 行（居中版式語言）
  'secondary-body': { design: 4, guard: 6 },
  'section-full': { design: 6, guard: 9 },    // 通欄 p90=6
  'section-half': { design: 8, guard: 10 },   // 半欄 zh 導語 p50≈8 行（251px 欄寬）
  'brief-line': { design: 3, guard: 4 },      // 簡訊標題 zh p50=3 行
  'brief-lead': { design: 2, guard: 4 },
  'translated-lead': { design: 2, guard: 4 },
};

// 槽位 → TIERS 寬度鍵
const SLOT_BASE = {
  'headline-lead': 'headline',
  'secondary-body': 'secondary',
  'brief-line': 'briefs',
  'brief-lead': 'briefs',
  'section-full': 'sectionFull',
  'section-half': 'sectionHalf',
  'translated-lead': 'translatedItem',
};

// ---------- 字寬模型（實測擬合） ----------
// 由 17 斷點 × 91 個鉗制元素的真實渲染行數最小二乘擬合（2026-09-15）：
// zh（Noto Serif SC）MAE 0.06 行；en（Old Standard TT/Playfair）MAE 0.10 行。
const WIDTH_MODEL = {
  zh: { cjk: 1.0063, space: 0.3337, digit: 0.7248, upper: 0.6726, lower: 0.6414, other: 0.5343 },
  en: { cjk: 0.1845, space: 0.6913, digit: 0.2881, upper: 0.8790, lower: 0.3877, other: 0.5382 },
};

// 安全餘量（行）：吸收斷行差異（justify + CJK 禁則的行尾空隙）與擬合殘差（max -1 行）。
const SAFETY_LINES = 1;

export function textEm(text, lang = 'zh') {
  const m = WIDTH_MODEL[lang] || WIDTH_MODEL.zh;
  let em = 0;
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if (code >= 0x2e80 || (code >= 0x2000 && code <= 0x206f)) em += m.cjk;
    else if (ch === ' ') em += m.space;
    else if (code >= 0x30 && code <= 0x39) em += m.digit;
    else if (code >= 0x41 && code <= 0x5a) em += m.upper;
    else if (code >= 0x61 && code <= 0x7a) em += m.lower;
    else em += m.other;
  }
  return em;
}

// 舊簽名兼容：estLines = 原始估算 + 1 行安全餘量（與 fitClamp3 同規則）。
export function estLines(text, widthPx, opts) {
  return estLinesRaw(text, widthPx, opts) + 1;
}

// 舊簽名兼容：fitClamp(text, width, cap, opts)
export function fitClamp(text, widthPx, cap, opts) {
  const est = estLinesRaw(text, widthPx, opts) + 1;
  return { lines: Math.min(est, cap), faded: est > cap };
}

// ---------- 三檔鉗制裝配 ----------
// 一次算齊 full/mid/narrow 的行數與漸隱標記，供組件注入 CSS 變量。
export function fitClamp3(text, slot, { size, tracking = 0, lang = 'zh', tagEm = 0 } = {}) {
  const clampCfg = CLAMPS[slot];
  const base = SLOT_BASE[slot];
  if (!clampCfg || !base) throw new Error(`fitClamp3: unknown slot '${slot}'`);
  const out = {};
  for (const tier of ['full', 'mid', 'narrow']) {
    const cap = tier === 'full' ? clampCfg.design : clampCfg.guard;
    const est = estLinesRaw(text, TIERS[tier][base], { size, tracking, lang, tagEm });
    const safe = est + 1; // 安全餘量：校準模型最大低估 1 行
    out[tier] = { lines: Math.min(safe, cap), faded: safe > cap };
  }
  return out;
}

// 原始估算（不加安全餘量的版本，供測試與校準用）
export function estLinesRaw(text, widthPx, { size = 15, tracking = 0, lang = 'zh', tagEm = 0 } = {}) {
  const em = textEm(text, lang) + tagEm;
  const capacity = Math.max(1, widthPx) / (size * (1 + tracking));
  return Math.max(1, Math.ceil(em / capacity));
}

// 安全餘量版本（對外主入口）：在原始估算上 +1 行。
export { estLines as estLinesSafe };

// ---------- 正文欄數決策 ----------
export function estParagraphLines(paragraphs, widthPx, opts) {
  return (paragraphs ?? []).reduce((sum, p) => sum + estLinesRaw(p, widthPx, opts), 0);
}

// ---------- 舊常量（欄寬斷言用；值 = full 檔實測） ----------
export const SHEET = 1180;
export const GUTTER = 40;
export const GAP = 24;
const CONTENT = SHEET - GUTTER * 2;
const TRACK = (CONTENT - 11 * GAP) / 12;
const span = (n) => TRACK * n + GAP * (n - 1);
export const METRICS = {
  content: CONTENT,
  headline: span(5),
  secondary: span(3),
  briefs: 159,
  bodyCol: (span(8) - GAP) / 2,
  sectionFull: (CONTENT - GAP * 2) / 2,
  sectionHalf: ((CONTENT - GAP * 2) / 2 - GAP) / 2,
  supplementCol: (((CONTENT - GAP) * 7) / 12 - GAP) / 2,
  translatedItem: (CONTENT - GAP * 1.5) / 2,
};
