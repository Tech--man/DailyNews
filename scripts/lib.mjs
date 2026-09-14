// 純函數庫：清洗 / 去重 / 分類 / 打分 / 選稿 / 農曆節氣。
// 不做任何 IO（solarlunar 僅查本地數據表），全部可單測（見 tests/lib.test.mjs）。
import solarlunar from 'solarlunar';

/* ---------- 農曆與節氣 ---------- */

// 節氣與閏月用字簡→繁（其餘節氣名簡繁同形）
const TRAD = { 惊蛰: '驚蟄', 谷雨: '穀雨', 小满: '小滿', 芒种: '芒種', 处暑: '處暑', 腊: '臘', 闰: '閏' };
const toTrad = s => s.replace(/惊蛰|谷雨|小满|芒种|处暑|腊|闰/g, m => TRAD[m]);

/**
 * 報頭農曆行：「農曆八月初五 · 白露」。
 * 節氣取「當前節氣期」——自當日回看至多 16 日內最近一個已到的節氣，
 * 而非僅節氣當日顯示（報紙慣例）。
 */
export function lunarLine(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const info = solarlunar.solar2lunar(y, m, d);
  if (!info || typeof info !== 'object') return '';
  let term = '';
  for (let i = 0; i < 16 && !term; i++) {
    const t = new Date(Date.UTC(y, m - 1, d - i));
    term = solarlunar.solar2lunar(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()).term || '';
  }
  const lunar = '農曆' + toTrad(info.monthCn) + toTrad(info.dayCn);
  return term ? `${lunar} · ${toTrad(term)}` : lunar;
}

/* ---------- 天氣 ---------- */

/** WMO weather_code → 繁體描述（open-meteo 口徑），未知碼回退多雲 */
export function wmoDesc(code) {
  if (typeof code !== 'number' || code < 0 || code > 99) return '多雲';
  if (code === 0 || code === 1) return '晴';
  if (code === 2) return '多雲';
  if (code === 3) return '陰';
  if (code === 45 || code === 48) return '霧';
  if (code >= 51 && code <= 55) return '毛毛雨';
  if (code === 56 || code === 57) return '凍毛毛雨';
  if (code >= 61 && code <= 65) return '雨';
  if (code === 66 || code === 67) return '凍雨';
  if (code >= 71 && code <= 75) return '雪';
  if (code === 77) return '霰';
  if (code >= 80 && code <= 82) return '陣雨';
  if (code === 85 || code === 86) return '陣雪';
  if (code >= 95) return '雷雨';
  return '多雲';
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '「', rdquo: '」',
};

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

function safeFromCodePoint(cp) {
  try { return String.fromCodePoint(cp); } catch { return ''; }
}

/** 截斷到 n 個字符（摘要用，只存標題+摘要，不存全文） */
export function truncate(text, n) {
  const s = stripHtml(text);
  return s.length <= n ? s : s.slice(0, n);
}

/** 標題規範化：去標點空白、小寫，用於相似度比較 */
export function normalizeTitle(title) {
  return stripHtml(title)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
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
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
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
 * 標題相似度去重（規劃稿：>0.8 合併）。
 * 保留每組中 score 最高者；條目缺 _norm 時由 title 現算。
 */
export function dedupeByTitle(items, threshold = 0.8) {
  const normOf = it => it._norm ?? normalizeTitle(it.title);
  const kept = [];
  for (const raw of items) {
    const item = { ...raw, _norm: normOf(raw) };
    const dup = kept.find(k => similarity(k._norm, item._norm) > threshold);
    if (!dup) {
      kept.push(item);
    } else if ((item.score ?? 0) > (dup.score ?? 0)) {
      Object.assign(dup, item);
    }
  }
  return kept;
}

/* ---------- 分類 ---------- */

export const CATEGORIES = ['要聞', '財經', '科技', '文化', '體育', '國際', '民生'];

const CATEGORY_KEYWORDS = {
  財經: ['经济', '金融', '股市', '股', '基金', '汇率', '降息', '加息', '上市', '财报', '贸易', '关税', '投资', '央行', '通胀', 'gdp', '债券', '银行', '消费', '出口', '房价', '市场'],
  科技: ['科技', 'ai', '人工智能', '芯片', '半导体', '互联网', '软件', '算法', '数据', '手机', '量子', '航天', '卫星', '系统', '程序员', '开源', '自动驾驶', '机器人', '新能源', '电池', 'app'],
  體育: ['足球', '篮球', '奥运', '联赛', '夺冠', '球员', '锦标赛', '冠军', '体育', '世界杯', '金牌', '教练'],
  文化: ['文化', '电影', '图书', '展览', '艺术', '音乐', '出版', '博物馆', '文物', '考古', '文学', '非遗'],
  國際: ['联合国', '总统', '外交部', '峰会', '制裁', '俄罗斯', '乌克兰', '中东', '以色列', '加沙', '选举', '大使', '条约', '白宫', '欧盟', '日本', '韩国', '美国'],
  民生: ['医疗', '教育', '养老', '社保', '工资', '就业', '台风', '暴雨', '地震', '出行', '地铁', '假期', '气象', '降温'],
  要聞: ['中央', '国务院', '政策', '发布会', '改革', '规划', '会议'],
};

/** 按關鍵詞命中分類，無命中回退 fallbackCategory（默認來源自帶類目） */
export function classify(title, fallbackCategory = '要聞') {
  const norm = normalizeTitle(title);
  let best = null;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let hits = 0;
    for (const w of words) if (norm.includes(w)) hits++;
    if (hits > 0 && (!best || hits > best.hits)) best = { cat, hits };
  }
  return best ? best.cat : (CATEGORIES.includes(fallbackCategory) ? fallbackCategory : '要聞');
}

/** 關鍵詞命中數（打分用） */
export function keywordBoost(title) {
  const norm = normalizeTitle(title);
  let hits = 0;
  for (const words of Object.values(CATEGORY_KEYWORDS)) {
    for (const w of words) if (norm.includes(w)) hits++;
  }
  return Math.min(6, hits * 2);
}

/**
 * 打分：来源权重 × 8 + 时效衰减(0–10，36 小时线性归零) + 关键词加成(0–6)。
 * noDate 时时效分取中位 5。
 */
export function scoreArticle(item, now = Date.now()) {
  const weight = item.weight ?? 1;
  let recency = 5;
  if (item.date) {
    const ageH = Math.max(0, (now - item.date) / 36e5);
    recency = Math.max(0, 10 - ageH / 3.6);
  }
  return weight * 8 + recency + keywordBoost(item.title);
}

/** 給條目打分並寫回 score 字段 */
export function withScores(items, now = Date.now()) {
  return items.map(it => ({ ...it, score: scoreArticle(it, now) }));
}

/* ---------- 選稿 ---------- */

/**
 * 從已打分池中選出：1 頭條 / 1 次條 / N 簡訊 / 財經·科技半版各 1。
 * 已選中的不重複出現。頭條要求導語長度 ≥ minLead。
 */
export function selectLayout(scored, { briefs = 7, minLead = 30 } = {}) {
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const used = new Set();

  const takeFirst = pred => {
    const idx = pool.findIndex(it => !used.has(it.id) && (!pred || pred(it)));
    if (idx === -1) return null;
    const it = pool[idx];
    used.add(it.id);
    return it;
  };

  const headline = takeFirst(it => truncate(it.summary, 999).length >= minLead) ?? takeFirst();
  const secondary = takeFirst();

  const sectionPicks = {};
  for (const cat of ['財經', '科技']) {
    sectionPicks[cat] = takeFirst(it => it.category === cat);
  }

  const briefItems = [];
  while (briefItems.length < briefs) {
    const it = takeFirst();
    if (!it) break;
    briefItems.push(it);
  }

  return { headline, secondary, sections: sectionPicks, briefs: briefItems };
}
