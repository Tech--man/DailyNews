// 版面截图：统一断点、统一视口，输出前后对比证据图。
// 用法：node scripts/shoot-layout.mjs --label=before --viewports=360,768,1280,1440 [--pages=,en/]
// 说明：--hide-scrollbars 让视口宽度 = 布局宽度（确定性断点）；否则滚动条会吃掉 15px 使断点漂移。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));
const LABEL = args.label || 'shot';
const BASE = args.base || 'http://localhost:4178/DailyNews';
const PAGES = (args.pages || ',en/').split(',');
const VPS = (args.viewports || '360,768,1280,1440').split(',').map(Number);
const OUT = args.out || 'docs/typography-optimization/screenshots';
const FULLPAGE = args.fullpage !== 'false';

const CANDIDATES = [
  process.env.PUPPETEER_CORE_PATH, 'puppeteer-core',
  '/Users/x.ray/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
].filter(Boolean);
let puppeteer = null, lastErr = null;
for (const c of CANDIDATES) { try { ({ default: puppeteer } = await import(c)); break; } catch (e) { lastErr = e; } }
if (!puppeteer) { console.error('无法加载 puppeteer-core:', String(lastErr)); process.exit(2); }

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--font-render-hinting=none', '--hide-scrollbars'],
});
mkdirSync(OUT, { recursive: true });
for (const pg of PAGES) {
  for (const vw of VPS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vw, height: vw <= 600 ? 800 : 1000, deviceScaleFactor: 1 });
    await page.goto(`${BASE.replace(/\/$/, '')}/${pg}`.replace(/\/$/, '/'), { waitUntil: 'networkidle0', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 350));
    const key = (pg || 'zh').replace(/\//g, '-').replace(/^-|-$/g, '') || 'zh';
    const file = join(OUT, `${LABEL}-${key}-${vw}.png`);
    await page.screenshot({ path: file, fullPage: FULLPAGE });
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`${file}  (docH=${docH}px)`);
    await page.close();
  }
}
await browser.close();
