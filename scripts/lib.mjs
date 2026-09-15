// 純函數庫 v2：清洗 / 摘要 / 去重 / 分類 / 共識 / 打分 / 配額選稿 / 農曆節氣。
// 不做任何 IO（solarlunar 僅查本地數據表），全部可單測（見 tests/lib.test.mjs）。
//
// v2 相對 v1 的關鍵變更：
//   1. 類目改為語言中立的 key（top/world/business/tech/culture/sport/society/science），
//      顯示名由 CATEGORY_LABELS 按語言取——支撐中英雙語版。
//   2. classifyV2：來源類目為先驗（3 分）+ 高置信詞命中（2 分）加權，取代 v1「單一弱詞即改判」。
//   3. computeConsensus：跨媒體集團的標題聚類共識，作為頭條權威性信號。
//   4. scoreArticle v2：tier 主導（core 12 / standard 6 / optional 2），weight 降為微調，
//      避免 v1 的 weight×8 壓倒一切。
//   5. selectEdition：配額 + 集團多樣性 + 輪轉填充，取代 v1「按分數順序取走」。
//   6. smartTruncate：按句末標點裁剪，避免半句話結尾。
import solarlunar from 'solarlunar';
import OpenCC from 'opencc-js';

/* ================= 類目 ================= */

export const CATEGORY_KEYS = ['top', 'world', 'business', 'tech', 'culture', 'sport', 'society', 'science'];

export const CATEGORY_LABELS = {
  zh: { top: '要闻', world: '国际', business: '财经', tech: '科技', culture: '文化', sport: '体育', society: '民生', science: '科学' },
  en: { top: 'Top News', world: 'World', business: 'Business', tech: 'Technology', culture: 'Culture', sport: 'Sport', society: 'Society', science: 'Science' },
};

export function categoryLabel(key, lang = 'zh') {
  return CATEGORY_LABELS[lang]?.[key] ?? CATEGORY_LABELS.zh[key] ?? key;
}

/* ================= 農曆與節氣 ================= */

// 中文版為簡體：solarlunar 返回的 monthCn/dayCn/term 本就是簡體，直接用。
const TERM_EN = {
  立春: 'Start of Spring', 雨水: 'Rain Water', 惊蛰: 'Awakening of Insects', 春分: 'Spring Equinox',
  清明: 'Pure Brightness', 谷雨: 'Grain Rain', 立夏: 'Start of Summer', 小满: 'Grain Full',
  芒种: 'Grain in Ear', 夏至: 'Summer Solstice', 小暑: 'Minor Heat', 大暑: 'Major Heat',
  立秋: 'Start of Autumn', 处暑: 'End of Heat', 白露: 'White Dew', 秋分: 'Autumn Equinox',
  寒露: 'Cold Dew', 霜降: "Frost's Descent", 立冬: 'Start of Winter', 小雪: 'Minor Snow',
  大雪: 'Major Snow', 冬至: 'Winter Solstice', 小寒: 'Minor Cold', 大寒: 'Major Cold',
};

const LUNAR_MONTH_NUM = { 正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 冬: 11, 腊: 12, 臘: 12 };
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 農曆月名（八月 / 臘月 / 閏四月）→ 月序號 */
function lunarMonthNum(monthCn) {
  const s = String(monthCn ?? '').replace(/^[闰閏]/, '').replace(/月$/, '');
  if (LUNAR_MONTH_NUM[s]) return LUNAR_MONTH_NUM[s];
  const m = s.match(/^十(.)$/);
  if (m) return 10 + (CN_DIGIT[m[1]] ?? 0);
  return 0;
}

/** 農曆日名（初一 / 十五 / 廿三 / 三十）→ 日序號 */
function lunarDayNum(dayCn) {
  const s = String(dayCn ?? '');
  if (s === '初十') return 10;
  if (s === '二十') return 20;
  if (s === '三十') return 30;
  const m = s.match(/^(初|十|廿)(.)$/);
  if (!m) return 0;
  const last = CN_DIGIT[m[2]] ?? 0;
  if (m[1] === '初') return last;
  if (m[1] === '十') return 10 + last;
  return 20 + last;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * 報頭農曆行。zh：「農曆八月初五 · 白露」；en：「5th day of the 8th lunar month · White Dew」。
 * 節氣取「當前節氣期」——自當日回看至多 16 日內最近一個已到的節氣，
 * 而非僅節氣當日顯示（報紙慣例）。
 */
export function lunarLine(dateStr, lang = 'zh') {
  const [y, m, d] = String(dateStr ?? '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const info = solarlunar.solar2lunar(y, m, d);
  if (!info || typeof info !== 'object') return '';
  let term = '';
  for (let i = 0; i < 16 && !term; i++) {
    const t = new Date(Date.UTC(y, m - 1, d - i));
    const r = solarlunar.solar2lunar(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    term = (r && typeof r === 'object' && r.term) || '';
  }
  if (lang === 'en') {
    const mn = lunarMonthNum(info.monthCn);
    const dn = lunarDayNum(info.dayCn);
    const lunar = mn && dn ? `${ordinal(dn)} day of the ${ordinal(mn)} lunar month` : 'Lunar calendar';
    return term ? `${lunar} · ${TERM_EN[term] ?? term}` : lunar;
  }
  const lunar = '农历' + info.monthCn + info.dayCn;
  return term ? `${lunar} · ${term}` : lunar;
}

/* ================= 天氣 ================= */

const WMO_ZH = [
  [0, 1, '晴'], [2, 2, '多云'], [3, 3, '阴'], [45, 48, '雾'], [51, 55, '毛毛雨'], [56, 57, '冻毛毛雨'],
  [61, 65, '雨'], [66, 67, '冻雨'], [71, 75, '雪'], [77, 77, '霰'], [80, 82, '阵雨'], [85, 86, '阵雪'], [95, 99, '雷雨'],
];
const WMO_EN = {
  晴: 'Clear', 多云: 'Partly cloudy', 阴: 'Overcast', 雾: 'Fog', 毛毛雨: 'Light drizzle',
  冻毛毛雨: 'Freezing drizzle', 雨: 'Rain', 冻雨: 'Freezing rain', 雪: 'Snow', 霰: 'Sleet',
  阵雨: 'Showers', 阵雪: 'Snow showers', 雷雨: 'Thunderstorm',
};

/** WMO weather_code → 描述（open-meteo 口徑），未知碼回退多云 */
export function wmoDesc(code, lang = 'zh') {
  let zh = '多云';
  if (typeof code === 'number' && code >= 0 && code <= 99) {
    for (const [lo, hi, name] of WMO_ZH) if (code >= lo && code <= hi) { zh = name; break; }
  }
  return lang === 'en' ? (WMO_EN[zh] ?? zh) : zh;
}

/* ================= 繁簡轉換 ================= */

// 源裡混有繁體（端傳媒等）。中文版統一輸出簡體，故對標題/導語/正文過一次 OpenCC。
let _t2s = null;
function t2sConverter() {
  if (_t2s === null) {
    try {
      // 延遲 require，避免純函數測試因字典未就緒而整體失敗
      _t2s = OpenCC.Converter({ from: 't', to: 'cn' });
    } catch {
      _t2s = s => s;
    }
  }
  return _t2s;
}

/** 繁體→簡體；非中文內容原樣返回 */
export function toSimplified(text) {
  if (!text) return '';
  return t2sConverter()(String(text));
}

/** 按語言規範化文本：zh 轉簡體，en 原樣 */
export function localizeText(text, lang = 'zh') {
  return lang === 'zh' ? toSimplified(text) : String(text ?? '');
}

/* ================= 清洗與摘要 ================= */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '「', rdquo: '」',
};

function safeFromCodePoint(cp) {
  try { return String.fromCodePoint(cp); } catch { return ''; }
}

/** 去 HTML 標籤、解常見實體、收斂空白 */
export function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => safeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeFromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

// 句界/子句界按語言分開：英文句末是「.」，中文是「。」——v1 只用中文標點，
// 導致英文摘要永遠切不出句界（正文只能出一段）。
const SENT_END = {
  zh: ['。', '！', '？', '；', '…'],
  en: ['.', '!', '?', ';', '…'],
};
const CLAUSE_END = {
  zh: ['，', '、', '：', '—', '–'],
  en: [',', ':', '—', '–', ';'],
};

/**
 * 按句末標點裁剪到 n 字以內——避免 v1 的 `slice()` 產生「……半句話」結尾。
 * 找不到句末標點時退到子句標點，再退到詞界。
 */
export function smartTruncate(text, n, { lang = 'zh', minKeep = 0.6 } = {}) {
  const s = stripHtml(text).replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const win = s.slice(0, n + 1);
  const floor = Math.max(1, Math.floor(n * minKeep));
  const sent = SENT_END[lang] ?? SENT_END.zh;
  const clause = CLAUSE_END[lang] ?? CLAUSE_END.zh;
  for (let i = win.length - 1; i >= floor; i--) if (sent.includes(win[i])) return win.slice(0, i + 1).trim();
  for (let i = win.length - 1; i >= floor; i--) if (clause.includes(win[i])) return win.slice(0, i).trim();
  const cut = win.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > floor ? cut.slice(0, sp) : cut).trim();
}

/** 截斷到 n 個字符（保留 v1 語義，供不要求句界的場景使用） */
export function truncate(text, n) {
  const s = stripHtml(text);
  return s.length <= n ? s : s.slice(0, n);
}

/* ================= 相似度與去重 ================= */

/**
 * 標題規範化：小寫、去標點符號、空白收斂為單一空格。
 * 保留空格（v1 全刪）以便英文按詞匹配。
 */
export function normalizeTitle(title) {
  return stripHtml(title)
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 去空白鍵（中文關鍵詞子串匹配用） */
export function compactKey(title) {
  return normalizeTitle(title).replace(/\s+/g, '');
}

/** 經典 DP Levenshtein 距離 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 相似度 ∈ [0,1]，1 為完全相同 */
export function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * 標題相似度去重（>threshold 合併）。保留每組中 score 最高者。
 * 條目缺 _norm 時由 title 現算。
 */
export function dedupeByTitle(items, threshold = 0.8) {
  const normOf = it => it._norm ?? normalizeTitle(it.title);
  const kept = [];
  for (const raw of items) {
    const item = { ...raw, _norm: normOf(raw) };
    const dup = kept.find(k => similarity(k._norm, item._norm) > threshold);
    if (!dup) kept.push(item);
    else if ((item.score ?? 0) > (dup.score ?? 0)) Object.assign(dup, item);
  }
  return kept;
}

/* ================= 多源共識（頭條權威性信號） ================= */

/** 字符 bigram 集合（中英文通用） */
export function bigrams(text) {
  const s = String(text ?? '').replace(/\s+/g, '');
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Dice 係數：2|A∩B| / (|A|+|B|) */
export function diceSimilarity(a, b) {
  if (!a?.size || !b?.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const g of small) if (big.has(g)) inter++;
  return (2 * inter) / (a.size + b.size);
}

/**
 * 跨媒體集團的標題聚類共識：同一事件被越多獨立集團報導，越可能是真頭條。
 * 返回與 items 同序的共識度數組（1 = 僅一個集團，上限 5）。
 *
 * 實現：只索引文檔頻率 ≤ maxDfRatio 的 bigram 建倒排，避免通用詞造成的 O(n²)。
 */
export function computeConsensus(items, { threshold = 0.42, maxDfRatio = 0.08 } = {}) {
  const n = items.length;
  if (n === 0) return [];
  const sigs = items.map(it => bigrams(normalizeTitle(it.title)));

  const df = new Map();
  for (const sig of sigs) for (const g of sig) df.set(g, (df.get(g) ?? 0) + 1);
  const maxDf = Math.max(2, Math.floor(maxDfRatio * n));

  const index = new Map();
  sigs.forEach((sig, i) => {
    for (const g of sig) {
      if ((df.get(g) ?? 0) > maxDf) continue;
      if (!index.has(g)) index.set(g, []);
      index.get(g).push(i);
    }
  });

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  const seen = new Set();
  for (const bucket of index.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i], b = bucket[j];
        const key = a < b ? a * n + b : b * n + a;
        if (seen.has(key)) continue;
        seen.add(key);
        if (diceSimilarity(sigs[a], sigs[b]) >= threshold) union(a, b);
      }
    }
  }

  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(i);
  }

  const out = new Array(n).fill(1);
  for (const members of clusters.values()) {
    const owners = new Set(members.map(i => items[i].group ?? items[i].source));
    const c = Math.min(owners.size, 5);
    for (const i of members) out[i] = c;
  }
  return out;
}

/* ================= 分類 ================= */

// 高置信詞：命中即可覆蓋來源類目先驗。
const STRONG_ZH = {
  business: ['降息', '加息', 'a股', '股市', '美债', '美联储', '央行', '财报', '关税', '楼市', '汇率', '上市', '融资', '并购', '市值'],
  tech: ['人工智能', '大模型', '芯片', '半导体', '量子', '开源', '算法', '机器人', '航天', '智能手机', '操作系统', '算力'],
  sport: ['联赛', '夺冠', '球员', '世界杯', '奥运', '锦标赛', '球队', '主教练', '总决赛', '赛季', '晋级'],
  culture: ['电影', '考古', '文物', '博物馆', '非遗', '展览', '小说', '出版', '汉学', '戏剧', '文学'],
  world: ['联合国', '制裁', '总统', '外交部', '大使', '峰会', '白宫', '欧盟', '停火', '选举', '首相'],
  society: ['医院', '养老', '社保', '台风', '暴雨', '地震', '地铁', '停诊', '就业', '医保', '校园'],
  top: ['国务院', '中央', '规划', '改革', '政策', '发布会', '会议'],
  science: ['研究', '科学家', '论文', '望远镜', '基因', '气候', '物种', '实验'],
};

const STRONG_EN = {
  business: ['market', 'markets', 'stocks', 'shares', 'economy', 'economic', 'inflation', 'tariff', 'tariffs', 'fed', 'bank', 'banks', 'earnings', 'investors', 'trade'],
  tech: ['ai', 'artificial', 'intelligence', 'chip', 'chips', 'semiconductor', 'software', 'algorithm', 'robot', 'robots', 'satellite', 'quantum', 'model'],
  sport: ['match', 'league', 'cup', 'olympic', 'olympics', 'champion', 'coach', 'player', 'players', 'season', 'final', 'club'],
  culture: ['film', 'movie', 'museum', 'novel', 'book', 'books', 'art', 'arts', 'exhibition', 'festival', 'music', 'theatre', 'archaeolog'],
  world: ['nations', 'sanctions', 'president', 'minister', 'summit', 'election', 'ceasefire', 'embassy', 'nato', 'parliament'],
  society: ['hospital', 'health', 'school', 'schools', 'housing', 'wage', 'wages', 'storm', 'flood', 'earthquake', 'rail', 'transit', 'pension'],
  top: ['government', 'policy', 'reform', 'announce', 'announced', 'official'],
  science: ['research', 'scientists', 'study', 'studies', 'nasa', 'gene', 'genes', 'climate', 'species', 'telescope', 'physics'],
};

function countHits(title, terms, lang) {
  const norm = normalizeTitle(title);
  if (lang === 'en') {
    const tokens = new Set(norm.split(' ').filter(Boolean));
    return terms.filter(t => tokens.has(t) || (t.length > 5 && norm.includes(t))).length;
  }
  const compact = norm.replace(/\s+/g, '');
  return terms.filter(t => compact.includes(t)).length;
}

/**
 * 分類 v2：來源類目為強先驗（3 分），高置信詞命中各 2 分，取最高分。
 * 平手時保留來源類目——避免 v1「單一弱詞即改判」造成的跨類污染
 * （實測：國際稿因命中「贸易」進財經版、因命中「数据」進科技版）。
 */
export function classifyV2(title, sourceCategory = 'top', lang = 'zh') {
  const table = lang === 'en' ? STRONG_EN : STRONG_ZH;
  const scores = new Map();
  const bump = (k, n) => scores.set(k, (scores.get(k) ?? 0) + n);
  const base = CATEGORY_KEYS.includes(sourceCategory) ? sourceCategory : 'top';
  bump(base, 3);
  for (const [key, terms] of Object.entries(table)) {
    const hits = countHits(title, terms, lang);
    if (hits) bump(key, Math.min(hits, 2) * 2);
  }
  let best = base;
  let bestScore = scores.get(base) ?? 0;
  for (const [k, v] of scores) if (v > bestScore) { best = k; bestScore = v; }
  return best;
}

/** 關鍵詞加成（打分用）：0–6 */
export function keywordBoost(title, lang = 'zh') {
  const table = lang === 'en' ? STRONG_EN : STRONG_ZH;
  let hits = 0;
  for (const terms of Object.values(table)) hits += countHits(title, terms, lang);
  return Math.min(6, hits * 2);
}

/** 粗略語言判定：含 CJK 即視為中文 */
export function detectLang(text) {
  return /[\u4e00-\u9fff]/.test(String(text ?? '')) ? 'zh' : 'en';
}

/* ================= 噪音過濾 ================= */

// 聚合索引 / 版面公告 / 直播頁——不是新聞，不應上版
const NOISE_ZH = /(早报|晚报|日报|晨报|盘点|汇总|一览|速览|要闻回顾|一周回顾|直播中|滚动播报)$|^(快讯|简讯|图片新闻|专题报道)$/;
const NOISE_EN = /^(live|live updates|live blog|podcast|video|newsletter|in pictures|in charts)\b|\b(live updates|live blog|as it happened)\b/i;

export function isNoise(item) {
  const title = stripHtml(item?.title ?? '').trim();
  if (!title) return true;
  const lang = item.lang ?? detectLang(title);
  if (lang === 'en' ? NOISE_EN.test(title) : NOISE_ZH.test(title)) return true;
  if (title.length < 10 && stripHtml(item.summary ?? '').length < 20) return true;
  if (/^[\d\s年月日时分:：.、\-–—/]+$/.test(title)) return true;
  return false;
}

/* ================= 打分 ================= */

const TIER_BASE = { core: 12, standard: 6, optional: 2 };

/**
 * 打分 v2 = tier(2/6/12) + weight×1.5(1.5–7.5) + 時效(0–10) + 共識(0–10) + 關鍵詞(0–6)。
 * tier 主導權威性，weight 降為微調——修 v1 的 weight×8 壓倒一切。
 */
export function scoreArticle(item, now = Date.now(), { maxAgeHours = 36 } = {}) {
  const tier = TIER_BASE[item.tier] ?? TIER_BASE.standard;
  const weight = (item.weight ?? 1) * 1.5;
  let recency = 5;
  if (item.date) {
    const ageH = Math.max(0, (now - item.date) / 36e5);
    recency = Math.max(0, 10 * (1 - ageH / maxAgeHours));
  }
  const consensus = Math.min(Math.max(item.consensus ?? 1, 1), 5);
  return tier + weight + recency + (consensus - 1) * 2.5 + keywordBoost(item.title, item.lang ?? 'zh');
}

/** 給條目打分並寫回 score 字段 */
export function withScores(items, now = Date.now(), opts = {}) {
  return items.map(it => ({ ...it, score: scoreArticle(it, now, opts) }));
}

/* ================= 新鮮度 ================= */

/** 只保留 maxAgeHours 內條目；無日期條目按 includeUndated 決定去留 */
export function filterFresh(items, now = Date.now(), { maxAgeHours = 36, includeUndated = false } = {}) {
  return items.filter(it => {
    if (!it.date) return includeUndated;
    return now - it.date < maxAgeHours * 36e5;
  });
}

/* ================= 選稿（配額 + 集團多樣性） ================= */

/**
 * 按版面配額選稿：1 頭條 / 1 次條 / 各版 N 篇 / N 簡訊 / 1 副刊稿。
 * 約束：單一媒體集團占本期上限 groupCapRatio；頭條與次條不同集團；
 *       同一版內稿件的來源集團不重複；簡訊按集團輪轉並有單類目上限。
 */
export function selectEdition(pool, layout, { groupCapRatio = 0.2 } = {}) {
  const byScore = [...pool].sort((a, b) => b.score - a.score);
  const used = new Set();
  const groupCount = new Map();
  const leadLen = it => stripHtml(it.summary ?? '').length;
  const grp = it => it.group ?? it.source;
  const consensusOf = it => Math.max(1, it.consensus ?? 1);

  const sectionsCfg = layout.sections ?? [];
  const briefsCfg = layout.briefs ?? { min: 0, max: 0, perCategoryMax: 99 };
  const totalSlots = 2 + sectionsCfg.reduce((s, x) => s + x.count, 0) + briefsCfg.max + (layout.supplement ? 1 : 0);
  const groupCap = Math.max(3, Math.ceil(groupCapRatio * totalSlots));

  const canTake = it => !used.has(it.id) && (groupCount.get(grp(it)) ?? 0) < groupCap;
  const take = it => {
    used.add(it.id);
    groupCount.set(grp(it), (groupCount.get(grp(it)) ?? 0) + 1);
    return it;
  };
  const tierOk = (it, tiers) => !tiers || tiers.includes(it.tier ?? 'standard');
  const catOf = cfg => cfg.categories ?? (cfg.key ? [cfg.key] : []);

  /**
   * 頭條：tier → 類目 → 多源共識 → 導語充足，逐級放寬。
   * minConsensus 是「權威性信號」的硬門檻：優先選被 ≥N 家獨立集團報導的事件；
   * 當日確實無共識事件時才降級，並回報 headlineTier 以便復盤。
   */
  const hCfg = layout.headline ?? {};
  const hCats = hCfg.categories ?? [];
  const minLead = hCfg.minLead ?? 0;
  const minConsensus = hCfg.minConsensus ?? 1;
  const hard = byScore.filter(it => tierOk(it, hCfg.tiers) && hCats.includes(it.category));
  const tiers = [
    [hard, it => consensusOf(it) >= minConsensus && leadLen(it) >= minLead, 'consensus+lead'],
    [hard, it => leadLen(it) >= minLead, 'lead'],
    [hard, () => true, 'category'],
    [byScore, it => tierOk(it, hCfg.tiers) && leadLen(it) >= minLead, 'tier+lead'],
    [byScore, () => true, 'any'],
  ];
  let headline = null;
  let headlineTier = 'none';
  for (const [set, pred, name] of tiers) {
    const hit = set.find(it => canTake(it) && pred(it));
    if (hit) { headline = take(hit); headlineTier = name; break; }
  }

  /**
   * 次條：與頭條不同集團，優先硬新聞類目。
   * 加類目約束是因為次條排位很前——若不限類目，它會把體育/文化/科學等
   * 供給稀薄的版塊的唯一候選稿搶走，導致整版見空（實測：體育版只剩 1 篇）。
   * 三級降級保證次條不空缺。
   */
  const sCfg = layout.secondary ?? {};
  const sCats = sCfg.categories ?? [];
  const sMinLead = sCfg.minLead ?? 0;
  const secTiers = [
    [it => sCats.includes(it.category), 'category'],
    [() => true, 'any'],
  ];
  let secondary = null;
  for (const [pred] of secTiers) {
    const hit = byScore.find(it => canTake(it)
      && tierOk(it, sCfg.tiers)
      && grp(it) !== grp(headline)
      && leadLen(it) >= sMinLead
      && pred(it));
    if (hit) { secondary = take(hit); break; }
  }

  /**
   * 各版：先按「同版不同集團」填滿；仍不足時放行同集團補位。
   * 例：體育版當日只有 BBC Sport 一家有貨，硬守異集團會讓整版空掉——
   * 寧可同源補位，也不留版面空洞（並在 dry-run 報表可見）。
   */
  const sections = [];
  for (const cfg of sectionsCfg) {
    const cats = catOf(cfg);
    const count = cfg.count ?? 1;
    const picked = [];
    const inCat = it => cats.includes(it.category);
    for (const it of byScore) {
      if (picked.length >= count) break;
      if (!canTake(it) || !inCat(it)) continue;
      if (picked.some(p => grp(p) === grp(it))) continue;
      picked.push(take(it));
    }
    for (const it of byScore) {
      if (picked.length >= count) break;
      if (!canTake(it) || !inCat(it)) continue;
      picked.push(take(it));
    }
    if (picked.length) sections.push({ key: cfg.key ?? cats[0] ?? 'top', articles: picked });
  }

  // 副刊：先文化/科學長文；fallback='longest' 時退到全池最長摘要，保證副刊版不空
  let supplement = null;
  if (layout.supplement) {
    const sCats = layout.supplement.categories ?? [];
    const sMin = layout.supplement.minLead ?? 0;
    let cand = byScore.find(it => canTake(it) && sCats.includes(it.category) && leadLen(it) >= sMin)
      ?? byScore.find(it => canTake(it) && sCats.includes(it.category));
    if (!cand && layout.supplement.fallback === 'longest') {
      cand = byScore.filter(it => canTake(it)).sort((a, b) => leadLen(b) - leadLen(a))[0] ?? null;
    }
    supplement = cand ? take(cand) : null;
  }

  // 簡訊：按集團輪轉 + 單類目上限，覆蓋盡量多的來源
  const catCount = new Map();
  const buckets = new Map();
  for (const it of byScore) {
    if (!canTake(it)) continue;
    const b = buckets.get(grp(it)) ?? [];
    b.push(it);
    buckets.set(grp(it), b);
  }
  const briefs = [];
  for (let round = 0; briefs.length < briefsCfg.max; round++) {
    let progressed = false;
    for (const b of buckets.values()) {
      if (briefs.length >= briefsCfg.max) break;
      const it = b[round];
      if (!it || !canTake(it)) continue;
      if ((catCount.get(it.category) ?? 0) >= (briefsCfg.perCategoryMax ?? 99)) continue;
      briefs.push(take(it));
      catCount.set(it.category, (catCount.get(it.category) ?? 0) + 1);
      progressed = true;
    }
    if (!progressed) break;
  }

  return {
    headline, secondary, sections, briefs, supplement,
    headlineTier,
    headlineConsensus: headline ? consensusOf(headline) : 0,
    groupCap,
  };
}

/* ================= 加工層 ================= */

/**
 * 頭條正文：把來源摘要按句群切為 2–3 個自然段，餵給三欄流動。
 * v1 從未產出此字段，導致規劃 §3 的「正文三欄」永遠空白。
 */
export function buildBody(summary, { lang = 'zh', maxParagraphs = 3, maxChars = 800, minSentences = 2 } = {}) {
  const text = smartTruncate(summary, maxChars, { lang });
  if (!text) return [];
  const joiner = lang === 'en' ? ' ' : '';
  const splitter = lang === 'en' ? /(?<=[.!?])\s+/ : /(?<=[。！？；])\s*/;
  const sentences = text.split(splitter).map(s => s.trim()).filter(Boolean);
  if (sentences.length < minSentences) return [text];
  // 均分為 groups 段：用邊界索引而非固定步長，否則 4 句切 3 段會只得到 2 段
  const groups = Math.min(maxParagraphs, sentences.length);
  const out = [];
  for (let g = 0; g < groups; g++) {
    const from = Math.floor(g * sentences.length / groups);
    const to = Math.floor((g + 1) * sentences.length / groups);
    out.push(sentences.slice(from, to).join(joiner));
  }
  return out;
}
