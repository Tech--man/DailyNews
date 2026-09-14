// M2 數據管道編排：抓取 RSS → 清洗 → 去重 → 分類打分 → 選稿 → 寫 issues/<date>.json
// 用法：node scripts/generate-issue.mjs [YYYY-MM-DD]（缺省今天，本地時區）
// 只存標題+摘要+原文鏈接，不存全文（版權約束）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import {
  stripHtml, truncate, normalizeTitle, dedupeByTitle,
  classify, withScores, selectLayout, lunarLine,
} from './lib.mjs';
import { renderOg } from './og.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config/feeds.json'), 'utf8'));

/* ---------- 日期與期號 ---------- */

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 創刊日 2025-07-14：2026-09-14 恰為第 428 期，與 M1 版面一致
const ISSUE_EPOCH = Date.UTC(2025, 6, 14);
function issueNo(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const days = (Date.UTC(y, m - 1, d) - ISSUE_EPOCH) / 864e5;
  return days + 1;
}

/* ---------- SSRF 防護：僅允許公網 http(s) ---------- */

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

/* ---------- 抓取與解析 ---------- */

async function fetchText(url, timeoutMs) {
  assertPublicHttpUrl(url);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'DailyNewsBot/0.1 (+static newspaper experiment)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const XML = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function pickText(node, keys) {
  for (const k of keys) {
    const v = node?.[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object' && typeof v['#text'] === 'string') return v['#text'];
  }
  return '';
}

/** RSS 2.0 / Atom 統一映射為 {title, link, summary, date} */
export function parseFeed(xml) {
  const doc = XML.parse(xml);
  const items = asArray(doc?.rss?.channel?.item);
  if (items.length) {
    return items.map(it => ({
      title: stripHtml(pickText(it, ['title'])),
      link: (typeof it.link === 'string' ? it.link : pickText(it, ['link'])).trim(),
      summary: pickText(it, ['content:encoded', 'description', 'summary']),
      date: parseDate(pickText(it, ['pubDate', 'dc:date'])),
    }));
  }
  const entries = asArray(doc?.feed?.entry);
  return entries.map(en => {
    const links = asArray(en.link);
    const main = links.find(l => l['@_rel'] !== 'self' && l['@_href']) ?? links[0];
    return {
      title: stripHtml(pickText(en, ['title'])),
      link: main?.['@_href'] ?? '',
      summary: pickText(en, ['content', 'summary']),
      date: parseDate(pickText(en, ['published', 'updated'])),
    };
  });
}

function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/* ---------- 主流程 ---------- */

async function main() {
  const dateStr = process.argv[2] ?? localDateStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.error(`日期參數不合法：${dateStr}`);
    process.exit(2);
  }
  const { perFeed, briefs, fetchTimeoutMs, minFeedsOk } = CONFIG.limits;
  const now = Date.now();

  const settled = await Promise.allSettled(
    CONFIG.feeds.map(async f => ({ feed: f, xml: await fetchText(f.url, fetchTimeoutMs) })),
  );

  let pool = [];
  const failed = [];
  settled.forEach((r, i) => {
    const f = CONFIG.feeds[i];
    if (r.status !== 'fulfilled') {
      failed.push(`${f.name}: ${r.reason?.message ?? r.reason}`);
      return;
    }
    try {
      const entries = parseFeed(r.value.xml)
        .filter(it => it.title && it.link)
        .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
        .slice(0, perFeed)
        .map((it, idx) => ({
          id: `${f.name}#${idx}`,
          title: it.title,
          link: it.link,
          summary: it.summary,
          date: it.date,
          source: f.name,
          weight: f.weight,
          category: f.category,
        }));
      pool.push(...entries);
      console.log(`✓ ${f.name.padEnd(6)} ${entries.length} 條`);
    } catch (e) {
      failed.push(`${f.name}: 解析失敗 ${e.message}`);
    }
  });

  if (settled.length - failed.length < minFeedsOk) {
    console.error(`可用源不足（${settled.length - failed.length}/${settled.length}，要求 ≥${minFeedsOk}）：\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }

  // 打分 → 去重（同組保留高分）→ 分類
  pool = dedupeByTitle(withScores(pool, now));
  for (const it of pool) it.category = classify(it.title, it.category);
  pool.sort((a, b) => b.score - a.score);
  console.log(`合計 ${pool.length} 條（去重後）${failed.length ? `；失敗源：${failed.join('；')}` : ''}`);

  const pick = selectLayout(pool, { briefs });

  const article = it => it && ({
    title: it.title,
    lead: truncate(it.summary, 80),
    source: it.source,
    link: it.link,
  });

  const issue = {
    issue: issueNo(dateStr),
    date: dateStr,
    lunar: lunarLine(dateStr),   // 農曆＋當前節氣期，本地計算；天氣接真實數據屬後續打磨
    weather: null,
    headline: article(pick.headline),
    secondary: article(pick.secondary),
    briefs: pick.briefs.map(it => ({ title: it.title, category: it.category, source: it.source, link: it.link })),
    sections: Object.entries(pick.sections)
      .filter(([, it]) => it)
      .map(([name, it]) => ({ name, articles: [{ ...article(it), lead: truncate(it.summary, 120) }] })),
  };

  const outDir = join(ROOT, 'issues');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${dateStr}.json`);
  writeFileSync(outPath, JSON.stringify(issue, null, 2) + '\n');

  // OG 分享圖：失敗降級為警告（站點仍可構建，僅 og:image 缺失）
  try {
    const ogPath = await renderOg(issue, dateStr);
    console.log(`✓ ${ogPath}`);
  } catch (e) {
    console.warn(`⚠ OG 圖生成失敗（忽略）：${e.message?.slice(0, 200)}`);
  }

  console.log(`選稿：頭條「${issue.headline?.title ?? '—'}」/ 次條 ${issue.secondary ? 1 : 0} / 簡訊 ${issue.briefs.length} / 半版 ${issue.sections.length}`);
  console.log(`已寫出 ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
