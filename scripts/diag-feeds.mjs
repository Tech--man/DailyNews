// 診斷腳本：逐源探測存活、條數、時效分佈、類目分佈。
// 用法：node scripts/diag-feeds.mjs [--candidates]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { stripHtml } from './lib.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config/feeds.json'), 'utf8'));

const CANDIDATES = [
  ['新華網 時政', 'http://www.xinhuanet.com/politics/news_politics.xml', 4, '要聞'],
  ['新華網 國際', 'http://www.xinhuanet.com/world/news_world.xml', 4, '國際'],
  ['人民網 時政', 'http://www.people.com.cn/rss/politics.xml', 4, '要聞'],
  ['人民網 國際', 'http://www.people.com.cn/rss/world.xml', 4, '國際'],
  ['中國新聞網', 'https://www.chinanews.com.cn/rss/scroll-news.xml', 3, '要聞'],
  ['環球網', 'https://rss.huanqiu.com/rss.xml', 3, '國際'],
  ['央視新聞', 'https://news.cctv.com/rss/china.xml', 4, '要聞'],
  ['澎湃新聞', 'https://www.thepaper.cn/rss_newsDetail_25950.xml', 3, '要聞'],
  ['財新網', 'https://www.caixin.com/rss/all.xml', 4, '財經'],
  ['第一財經', 'https://www.yicai.com/rss/news.xml', 4, '財經'],
  ['證券時報', 'https://www.stcn.com/rss/news.xml', 3, '財經'],
  ['新浪財經', 'https://rss.sina.com.cn/roll/finance/hot_roll.xml', 3, '財經'],
  ['東方財富', 'https://rss.eastmoney.com/rss_partener.xml', 2, '財經'],
  ['36氪', 'https://36kr.com/feed', 2, '科技'],
  ['虎嗅', 'https://www.huxiu.com/rss/0.xml', 2, '科技'],
  ['品玩', 'https://www.pingwest.com/feed', 2, '科技'],
  ['雷峰網', 'https://www.leiphone.com/feed', 2, '科技'],
  ['機器之心', 'https://www.jiqizhixin.com/rss', 2, '科技'],
  ['InfoQ 中文', 'https://www.infoq.cn/feed', 2, '科技'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 2, '科技'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml', 2, '科技'],
  ['BBC 中文', 'https://feeds.bbci.co.uk/zhongwen/trad/rss.xml', 3, '國際'],
  ['路透中文', 'https://cn.reuters.com/rssFeed/CNTopGenNews', 4, '國際'],
  ['聯合早報', 'https://www.zaobao.com/realtime/world/rss.xml', 3, '國際'],
  ['德國之聲', 'https://rss.dw.com/rdf/rss-chi-all', 3, '國際'],
  ['紐約時報中文', 'https://cn.nytimes.com/rss/', 4, '國際'],
  ['界面新聞', 'https://a.jiemian.com/index.php?m=article&a=rss', 3, '財經'],
  ['觀察者網', 'https://www.guancha.cn/rss.xml', 3, '要聞'],
  ['知乎日報', 'https://www.zhihu.com/rss', 1, '文化'],
  ['豆瓣', 'https://www.douban.com/feed/review/movie', 1, '文化'],
  ['虎撲', 'https://bbs.hupu.com/rss.xml', 2, '體育'],
  ['懂球帝', 'https://www.dongqiudi.com/rss', 2, '體育'],
];

const XML = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const asArray = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const pick = (n, ks) => {
  for (const k of ks) {
    const v = n?.[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object' && typeof v['#text'] === 'string') return v['#text'];
  }
  return '';
};

function parse(xml) {
  const doc = XML.parse(xml);
  const items = asArray(doc?.rss?.channel?.item);
  if (items.length) {
    return items.map(it => ({
      title: stripHtml(pick(it, ['title'])),
      date: Date.parse(pick(it, ['pubDate', 'dc:date'])) || null,
      summary: pick(it, ['description', 'content:encoded']),
    }));
  }
  return asArray(doc?.feed?.entry).map(en => ({
    title: stripHtml(pick(en, ['title'])),
    date: Date.parse(pick(en, ['published', 'updated'])) || null,
    summary: pick(en, ['summary', 'content']),
  }));
}

async function probe(name, url, timeoutMs = 12000) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; DailyNewsBot/0.1)' },
      redirect: 'follow',
    });
    if (!res.ok) return { name, url, ok: false, err: `HTTP ${res.status}`, ms: Date.now() - t0 };
    const xml = await res.text();
    const items = parse(xml).filter(i => i.title);
    const now = Date.now();
    const h24 = items.filter(i => i.date && now - i.date < 864e5).length;
    const h72 = items.filter(i => i.date && now - i.date < 3 * 864e5).length;
    const dated = items.filter(i => i.date).length;
    const newest = items.reduce((m, i) => Math.max(m, i.date ?? 0), 0);
    const withSum = items.filter(i => stripHtml(i.summary).length >= 30).length;
    return {
      name, url, ok: true, total: items.length, dated, h24, h72, withSum, ms: Date.now() - t0,
      newestAgeH: newest ? ((now - newest) / 36e5).toFixed(1) : 'n/a',
    };
  } catch (e) {
    return { name, url, ok: false, err: e.message?.slice(0, 60), ms: Date.now() - t0 };
  }
}

const useCandidates = process.argv.includes('--candidates');
const list = useCandidates
  ? CANDIDATES.map(([name, url, weight, category]) => ({ name, url, weight, category }))
  : CONFIG.feeds;

console.log(`探測 ${list.length} 個源…\n`);
const results = await Promise.all(list.map(f => probe(f.name, f.url)));

const ok = results.filter(r => r.ok);
const bad = results.filter(r => !r.ok);

console.log('=== 存活源 ===');
console.log('源名'.padEnd(14) + '條數'.padStart(6) + '有日期'.padStart(8) + '24h內'.padStart(8) + '72h內'.padStart(8) + '有摘要'.padStart(8) + '最新(小時前)'.padStart(14) + '耗時'.padStart(8));
for (const r of ok) {
  console.log(
    r.name.padEnd(14) + String(r.total).padStart(6) + String(r.dated).padStart(8)
    + String(r.h24).padStart(8) + String(r.h72).padStart(8) + String(r.withSum).padStart(8)
    + String(r.newestAgeH).padStart(14) + `${r.ms}ms`.padStart(8),
  );
}

console.log(`\n=== 失敗源（${bad.length}） ===`);
for (const r of bad) console.log(`${r.name.padEnd(14)} ${r.err}`);

console.log('\n=== 匯總 ===');
console.log(`存活 ${ok.length}/${results.length}`);
console.log(`總條數 ${ok.reduce((s, r) => s + r.total, 0)}`);
console.log(`24h 內合計 ${ok.reduce((s, r) => s + r.h24, 0)}`);
console.log(`72h 內合計 ${ok.reduce((s, r) => s + r.h72, 0)}`);
