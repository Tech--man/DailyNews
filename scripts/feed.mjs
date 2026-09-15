// 抓取與解析層（唯一做網絡 IO 的模塊）。
// 職責：SSRF 防護 → 帶重試的抓取 → RSS 2.0 / Atom 統一解析 → 規範化為條目。
// 純函數部分（parseFeed / normalizeEntry / assertPublicHttpUrl）可單測。
import { XMLParser } from 'fast-xml-parser';
import { stripHtml } from './lib.mjs';

/* ================= SSRF 防護：僅允許公網 http(s) ================= */

function isPrivateIPv4(h) {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  if ([a, b].some(n => n > 255)) return true;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isPrivateIPv6(h) {
  const s = h.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8')
    || s.startsWith('::ffff:'); // v4 映射地址統一拒絕，避免繞過
}

export function assertPublicHttpUrl(raw) {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error(`非 http(s)：${raw}`);
  const h = url.hostname.replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')
    || h.endsWith('.home.arpa')) throw new Error(`本機/內網主機名：${raw}`);
  if (isPrivateIPv4(h) || isPrivateIPv6(h)) throw new Error(`私有/保留地址：${raw}`);
  return url;
}

/* ================= 抓取（含重試） ================= */

const UA = 'Mozilla/5.0 (compatible; DailyNewsBot/0.2; +static newspaper experiment)';

/**
 * 抓取文本。timeoutMs 為單次超時；retries 為額外重試次數（偶發超時實測存在，
 * 例如 cnBeta 在兩次探測間出現過一次超時）。
 */
export async function fetchText(url, { timeoutMs = 15000, retries = 1, fetchImpl = globalThis.fetch } = {}) {
  assertPublicHttpUrl(url);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/* ================= 解析 ================= */

const XML = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const asArray = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

function pickText(node, keys) {
  for (const k of keys) {
    const v = node?.[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object' && typeof v['#text'] === 'string') return v['#text'];
  }
  return '';
}

/** 從 enclosure / media:content / media:thumbnail / itunes:image 取配圖 URL */
function pickImage(node) {
  const cands = [
    ...asArray(node?.enclosure),
    ...asArray(node?.['media:content']),
    ...asArray(node?.['media:thumbnail']),
    ...asArray(node?.['itunes:image']),
  ];
  for (const c of cands) {
    const url = typeof c === 'string' ? c : c?.['@_url'];
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  }
  return null;
}

function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** RSS 2.0 / Atom 統一映射為 {title, link, summary, date, image, byline} */
export function parseFeed(xml) {
  const doc = XML.parse(xml);
  const items = asArray(doc?.rss?.channel?.item);
  if (items.length) {
    return items.map(it => ({
      title: stripHtml(pickText(it, ['title'])),
      link: (typeof it.link === 'string' ? it.link : pickText(it, ['link'])).trim(),
      summary: pickText(it, ['content:encoded', 'description', 'summary']),
      date: parseDate(pickText(it, ['pubDate', 'dc:date'])),
      image: pickImage(it),
      byline: stripHtml(pickText(it, ['dc:creator', 'author'])),
    }));
  }
  return asArray(doc?.feed?.entry).map(en => {
    const links = asArray(en.link);
    const main = links.find(l => l['@_rel'] !== 'self' && l['@_href']) ?? links[0];
    return {
      title: stripHtml(pickText(en, ['title'])),
      link: main?.['@_href'] ?? '',
      summary: pickText(en, ['content', 'summary']),
      date: parseDate(pickText(en, ['published', 'updated'])),
      image: pickImage(en) ?? links.find(l => l['@_rel'] === 'enclosure')?.['@_href'] ?? null,
      byline: stripHtml(pickText(en, ['author', 'dc:creator'])),
    };
  });
}

/** 解析結果 → 條目池（帶來源元信息與穩定 id） */
export function normalizeEntries(feedCfg, parsed, perFeedCap) {
  return parsed
    .filter(it => it.title && it.link)
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
    .slice(0, perFeedCap)
    .map((it, idx) => ({
      id: `${feedCfg.name}#${idx}`,
      title: it.title,
      link: it.link,
      summary: it.summary,
      date: it.date,
      image: it.image,
      byline: it.byline,
      source: feedCfg.name,
      group: feedCfg.group ?? feedCfg.name,
      weight: feedCfg.weight ?? 1,
      tier: feedCfg.tier ?? 'standard',
      lang: feedCfg.lang ?? 'zh',
      sourceCategory: feedCfg.category ?? 'top',
      category: feedCfg.category ?? 'top',
    }));
}

/**
 * 並發抓取全部源。單源失敗不阻斷整體——返回 { pool, failed, okCount }。
 * includeUndated 用於容忍新華網這類不帶 pubDate 的源（本期源池未用）。
 */
export async function collectFeeds(feeds, limits = {}, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const perFeed = limits.perFeed ?? 25;
  const timeoutMs = limits.fetchTimeoutMs ?? 15000;
  const retries = limits.retries ?? 1;

  const settled = await Promise.allSettled(
    feeds.map(async f => ({ f, xml: await fetchText(f.url, { timeoutMs, retries, fetchImpl }) })),
  );

  const pool = [];
  const failed = [];
  settled.forEach((r, i) => {
    const f = feeds[i];
    if (r.status !== 'fulfilled') {
      failed.push({ name: f.name, lang: f.lang ?? 'zh', reason: r.reason?.message ?? String(r.reason) });
      return;
    }
    try {
      pool.push(...normalizeEntries(f, parseFeed(r.value.xml), perFeed));
    } catch (e) {
      failed.push({ name: f.name, lang: f.lang ?? 'zh', reason: `解析失敗 ${e.message}` });
    }
  });

  return { pool, failed, okCount: feeds.length - failed.length, total: feeds.length, now };
}
