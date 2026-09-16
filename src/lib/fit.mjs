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
  'section-full': { design: 6, guard: 9 },    // 通欄 p90=6（526px 欄寬下 220 字元 ≈5.9 行，已足）
  'section-half': { design: 12, guard: 13 },  // 半欄 251px 欄寬下 220 字元 ≈12.3 行；舊值 8 會裁掉約 1/3 導語
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

/* ================= 彈性欄寬（v5）：以寬度換高度 =================
 *
 * 策略：不再要求左右**等寬**，改為要求左右**等高**。
 *
 * 同一行兩塊內容量不同時，固定等寬會讓內容少的一側空著（實測最大 133px），
 * 用漸隱裁字去填也治不了本。改為讓內容多的一側分到更寬的欄——
 * 行數隨寬度下降，兩側高度自然拉平：內容全部鋪滿、不裁字、也不必為了填滿而加稿。
 *
 * 高度對寬度單調（越寬 → 行數越少 → 越低），故可用二分求解寬度佔比。
 * 幾何參數與 newspaper.css 令牌對拍（tests/fit.test.mjs 有守衛）。
 */

export const SECTION_GEO = {
  labelH: 41,      // .section-label（29）+ .section-articles margin-top（12）
  titleGap: 8,     // .section-title margin-bottom（--sp-2）
  sourceH: 28,     // .source-line（--fs-fine 行高 + padding-top 8）
  h3: 19,          // --fs-h3
  h2: 23,          // --fs-h2（is-lead 通欄首篇）
  brief: 14,       // --fs-brief
  lhTitle: 1.5,    // --lh-title
  lhBody: 1.7,     // --lh-body
  minRatio: 0.3,   // 單側最小寬度佔比：約束下的彈性，避免一側窄到不可讀
};

/** 單篇文章高度（px） */
export function estArticleH(article, widthPx, { lang = 'zh', lead = false } = {}) {
  const g = SECTION_GEO;
  const size = lead ? g.h2 : g.h3;
  const tLines = estLinesRaw(article?.title ?? '', widthPx, { size, lang });
  const lLines = estLinesRaw(article?.lead ?? '', widthPx, { size: g.brief, lang });
  return tLines * size * g.lhTitle + g.titleGap + lLines * g.brief * g.lhBody + g.sourceH;
}

/** 版塊高度（px）：按 count-N 的實際版式累加（通欄獨占行、半欄兩兩成行） */
export function estBlockH(articles, blockW, opts) {
  const g = SECTION_GEO;
  const arts = articles ?? [];
  const n = arts.length;
  if (!n) return 0;
  // 並肩對的寬度同樣是彈性的（與 Sections.astro 注入的 --pair-cols 同源），
  // 取兩篇較高者為該行高度。若這裡按「等分」估算，就會與實際渲染不符
  // ——實測會讓塊級求解誤判，反而造出上百像素的塊內留白。
  const pairH = (a1, a2) => {
    const [p1, p2] = solvePairRatios(a1, a2, blockW, opts);
    const avail = blockW - GAP;
    return Math.max(estArticleH(a1, avail * p1, opts), estArticleH(a2, avail * p2, opts));
  };
  if (n === 1) return g.labelH + estArticleH(arts[0], blockW, opts);
  if (n === 2) return g.labelH + pairH(arts[0], arts[1]);
  // count-3/4/5：首篇通欄，其餘兩兩成行；count-4 末篇再通欄
  let h = g.labelH + estArticleH(arts[0], blockW, { ...opts, lead: true });
  const tail = arts.slice(1, n === 4 ? n - 1 : n);
  for (let i = 0; i < tail.length; i += 2) {
    h += tail[i + 1] ? pairH(tail[i], tail[i + 1]) : estArticleH(tail[i], blockW, opts);
  }
  if (n === 4) h += estArticleH(arts[n - 1], blockW, opts);
  return h;
}

/**
 * 求解同行兩塊的寬度佔比（和為 1）。
 * rowW = 該行可用總寬（版心寬）；塊間距為 2×GAP（.sections-grid 的 column-gap）。
 */
export function solveRowRatios(artsA, artsB, rowW, { lang = 'zh' } = {}) {
  const { minRatio } = SECTION_GEO;
  const avail = rowW - GAP * 2;
  const hA = (r) => estBlockH(artsA, avail * r, { lang });
  const hB = (r) => estBlockH(artsB, avail * (1 - r), { lang });
  let lo = minRatio, hi = 1 - minRatio;
  for (let i = 0; i < 40; i++) {
    const r = (lo + hi) / 2;
    if (hA(r) > hB(r)) lo = r; else hi = r;   // A 更高 → 給 A 更多寬度
  }
  const rA = (lo + hi) / 2;
  return [rA, 1 - rA];
}

/** 求解後該行的預測高度（取兩塊較高者），供測試與診斷 */
export function estRowHeight(artsA, artsB, rowW, opts) {
  const [rA] = solveRowRatios(artsA, artsB, rowW, opts);
  const avail = rowW - GAP * 2;
  return Math.max(estBlockH(artsA, avail * rA, opts), estBlockH(artsB, avail * (1 - rA), opts));
}

/**
 * 求解並肩兩篇的寬度佔比（和為 1），使兩篇等高。
 * 版塊內部同樣適用彈性原則——同一行兩篇內含量不同時，
 * 等寬會讓短的一篇在導語與來源行之間空出一截（來源行釘底所致）。
 * pairW = 兩篇可用總寬（版塊內寬），篇間距為 GAP。
 */
export function solvePairRatios(a1, a2, pairW, { lang = 'zh', leadA = false, leadB = false } = {}) {
  const { minRatio } = SECTION_GEO;
  const avail = pairW - GAP;
  const h1 = (r) => estArticleH(a1, avail * r, { lang, lead: leadA });
  const h2 = (r) => estArticleH(a2, avail * (1 - r), { lang, lead: leadB });
  let lo = minRatio, hi = 1 - minRatio;
  for (let i = 0; i < 40; i++) {
    const r = (lo + hi) / 2;
    if (h1(r) > h2(r)) lo = r; else hi = r;
  }
  const r1 = (lo + hi) / 2;
  return [r1, 1 - r1];
}

/* ---------- 頭版（頭條 / 次條）彈性 ----------
 * 頭條與次條的版式與各版不同：標題字號 h1(40)/h2(23)、居中、頭條另有 kicker。
 * 同樣按內含量分配寬度，使兩者等高。幾何與 newspaper.css §6/§7 對拍。
 */
export const HEAD_GEO = {
  kickerH: 32,                          // .kicker（--fs-fine 行高 + margin-bottom 12）
  h1: 40, h1LH: 1.25, h1Track: 0.04,    // .headline-title（--fs-h1 / --lh-display / letter-spacing）
  h2: 23, h2LH: 1.5,                    // .secondary-title（--fs-h2 / --lh-title）
  leadBody: 15, leadLH: 1.7,            // .headline-lead（--fs-body）
  secBody: 14, secLH: 1.7,              // .secondary-body（--fs-brief）
  secInset: 8,                          // .secondary：padding-left(20) − margin-left(-12)
  photoH: 256,                          // .photo-main 固定框高 240 + margin-top 16
  sourceH: 28,
};

/** 頭條高度（px）：kicker + 大標題（含字距）+ 導語 + 主圖（固定框高）+ 來源行 */
export function estHeadlineH(article, widthPx, { lang = 'zh' } = {}) {
  const g = HEAD_GEO;
  const tLines = estLinesRaw(article?.title ?? '', widthPx, { size: g.h1, tracking: g.h1Track, lang });
  const lLines = estLinesRaw(article?.lead ?? '', widthPx, { size: g.leadBody, lang });
  const photo = article?.image ? g.photoH : 0;
  return g.kickerH + tLines * g.h1 * g.h1LH + lLines * g.leadBody * g.leadLH + photo + g.sourceH;
}

/** 次條高度（px） */
export function estSecondaryH(article, widthPx, { lang = 'zh' } = {}) {
  const g = HEAD_GEO;
  const tLines = estLinesRaw(article?.title ?? '', widthPx, { size: g.h2, lang });
  const lLines = estLinesRaw(article?.lead ?? '', widthPx, { size: g.secBody, lang });
  return tLines * g.h2 * g.h2LH + lLines * g.secBody * g.secLH + g.sourceH;
}

/** 求解頭條／次條寬度佔比（和為 1），使兩者等高 */
export function solveHeadRatios(headline, secondary, rowW, { lang = 'zh' } = {}) {
  const { minRatio } = SECTION_GEO;
  const avail = rowW - GAP;
  const hH = (r) => estHeadlineH(headline, avail * r, { lang });
  const hS = (r) => estSecondaryH(secondary, Math.max(1, avail * (1 - r) - HEAD_GEO.secInset), { lang });
  let lo = minRatio, hi = 1 - minRatio;
  for (let i = 0; i < 40; i++) {
    const r = (lo + hi) / 2;
    if (hH(r) > hS(r)) lo = r; else hi = r;
  }
  const rH = (lo + hi) / 2;
  return [rH, 1 - rH];
}
