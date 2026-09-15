// 槽位宽度实测：在三个档位（full=1280 / mid=600 最窄中幅 / narrow=360）测量
// 每类钳制元素的真实 clientWidth，用于校准 src/lib/fit.mjs 的 TIERS 常量。
// 用法：node scripts/measure-slots.mjs [--base=http://localhost:4178/DailyNews] [--pages=,en/]
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));
const BASE = args.base || 'http://localhost:4178/DailyNews';
const PAGES = (args.pages || ',en/').split(',');
const VPS = [1280, 768, 600, 360];
const CANDIDATES = [
  process.env.PUPPETEER_CORE_PATH, 'puppeteer-core',
  '/Users/x.ray/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
].filter(Boolean);
let puppeteer = null, lastErr = null;
for (const c of CANDIDATES) { try { ({ default: puppeteer } = await import(c)); break; } catch (e) { lastErr = e; } }
if (!puppeteer) { console.error('无法加载 puppeteer-core:', String(lastErr)); process.exit(2); }
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--font-render-hinting=none'],
});
for (const pg of PAGES) {
  for (const vw of VPS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vw, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${BASE.replace(/\/$/, '')}/${pg}`.replace(/\/$/, '/'), { waitUntil: 'networkidle0', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const pick = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().width) : null; };
      // dense 简讯双列的单列宽（通过第一个 brief-line 的实际可用宽度估计：父 li 宽 - 列距/2）
      const briefs = document.querySelector('.briefs');
      const briefsList = document.querySelector('.briefs-list');
      const dense = briefs?.classList.contains('briefs--dense');
      const listW = briefsList ? Math.round(briefsList.getBoundingClientRect().width) : null;
      const liW = document.querySelector('.briefs-list li') ? Math.round(document.querySelector('.briefs-list li').getBoundingClientRect().width) : null;
      const supBody = document.querySelector('.supplement-body');
      const supCols = supBody ? getComputedStyle(supBody).columnCount : null;
      const hb = document.querySelector('.headline-body');
      return {
        sheet: pick('.sheet'),
        headlineLead: pick('.headline-lead'),
        secondaryBody: pick('.secondary-body'),
        sectionBodyFull: pick('.section-articles.count-1 .section-body') || pick('.section-articles.count-3 .section-article.is-lead .section-body'),
        sectionBodyHalf: pick('.count-2 .section-body') || pick('.count-3 .section-article:not(.is-lead) .section-body'),
        briefLine: pick('.brief-line'),
        briefLead: pick('.brief-lead'),
        translatedLead: pick('.translated-lead'),
        headlineBodyCol: hb ? { w: Math.round(hb.getBoundingClientRect().width), cols: getComputedStyle(hb).columnCount } : null,
        supplementBody: supBody ? { w: Math.round(supBody.getBoundingClientRect().width), cols: supCols } : null,
        briefsText: listW, briefsDenseCol: dense && liW ? Math.round(liW - 12 / 2) : null,
        dense,
      };
    });
    console.log(`${(pg || 'zh').padEnd(4)} @${String(vw).padEnd(5)} ` + JSON.stringify(r));
    await page.close();
  }
}
await browser.close();
