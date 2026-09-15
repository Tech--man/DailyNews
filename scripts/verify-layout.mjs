// 版面守门（L4）：在真实浏览器中逐项断言「不管内容如何，版面都成立」。
// 用法：
//   node scripts/verify-layout.mjs [--base=http://localhost:4178/DailyNews] \
//        [--out=report.json] [--viewports=360,768,1280,1440] [--pages=,en/,archive/]
// 断言（硬失败）：
//   H1 无裁剪   每个钳制元素 scrollHeight <= clientHeight + 1（渐隐兜底之外不允许真正丢字）
//   H2 无横向溢出  页面与文本容器 scrollWidth <= clientWidth + 1
// 告警（软）：
//   W1 无谓渐隐   fade=1 但内容完整放得下（估算过估）
//   W2 行数偏差   --l 估算与实际行数偏差 > 2 行
//   W3 孤行      多行文本末行字数 <= 2
//   W4 栏空      简讯直栏填充率 < 0.6
// 退出码：有硬失败 = 1（不通过不许出刊），否则 0。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));
const BASE = args.base || 'http://localhost:4178/DailyNews';
const PAGES = (args.pages || ',en/,archive/,en/archive/').split(',').map((p) => p.replace(/^\//, ''));
const VIEWPORTS = (args.viewports || '360,600,768,999,1000,1180,1280').split(',').map(Number);
const OUT = args.out || '';

const CANDIDATES = [
  process.env.PUPPETEER_CORE_PATH,
  'puppeteer-core',
  '/Users/x.ray/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
].filter(Boolean);
let puppeteer = null;
let lastErr = null;
for (const c of CANDIDATES) {
  try { ({ default: puppeteer } = await import(c)); break; } catch (e) { lastErr = e; }
}
if (!puppeteer) {
  console.error('无法加载 puppeteer-core。请安装（pnpm add -D puppeteer-core）或设置 PUPPETEER_CORE_PATH。');
  console.error(String(lastErr));
  process.exit(2);
}

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--font-render-hinting=none', '--hide-scrollbars'] });

const collect = () => {
  const cs = (el) => getComputedStyle(el);
  const clampSel = '[style*="--l"], [style*="--l-full"], .is-faded';
  const nodes = [...document.querySelectorAll(clampSel)];
  const out = [];
  for (const el of nodes) {
    const s = cs(el);
    const lineH = parseFloat(s.lineHeight) || 0;
    const fs = parseFloat(s.fontSize) || 0;
    const maxH = parseFloat(s.maxHeight) || 0;
    const fadeCur = (s.getPropertyValue('--fade-cur') || '').trim();
    const lCur = (s.getPropertyValue('--l-cur') || s.getPropertyValue('--l') || '').trim();
    const hasNewAttrs = !!(el.style.getPropertyValue('--l-full') || s.getPropertyValue('--l-full'));
    const fadedClass = el.classList.contains('is-faded');
    // 渐隐是否生效：新格式看 --fade-cur 解析值；兼容旧格式看 class
    const fadeOn = hasNewAttrs ? (fadeCur === '1' || fadeCur.endsWith('1'))
      : (fadedClass || /linear-gradient/.test(s.webkitMaskImage || s.maskImage || ''));
    // 旧格式 is-faded 的 mask 需要是渐变且未被覆盖为 none
    const maskImg = s.webkitMaskImage || s.maskImage || 'none';
    const fadeReallyOn = hasNewAttrs ? fadeOn : (fadedClass && maskImg.includes('gradient'));
    const clientH = el.clientHeight, scrollH = el.scrollHeight;
    const clientW = el.clientWidth, scrollW = el.scrollWidth;
    const actualLines = lineH > 0 ? Math.round(clientH / lineH) : 0;
    const estLines = parseFloat(lCur) || 0;
    out.push({
      cls: (el.className || '').toString().split(' ').slice(0, 2).join('.'), tag: el.tagName.toLowerCase(),
      lFull: el.style.getPropertyValue('--l-full') || s.getPropertyValue('--l-full') || null,
      lMid: el.style.getPropertyValue('--l-mid') || s.getPropertyValue('--l-mid') || null,
      lNarrow: el.style.getPropertyValue('--l-narrow') || s.getPropertyValue('--l-narrow') || null,
      lCur, hasNewAttrs, fadedClass, fadeOn: fadeReallyOn,
      fs, lineH: +lineH.toFixed(1), maxH: Math.round(maxH),
      clientH, scrollH, clientW, scrollW,
      clipped: scrollH > clientH + 1,
      hOverflow: scrollW > clientW + 1,
      estLines, actualLines,
      fitInMax: maxH > 0 ? scrollH <= maxH + 1 : true,
      ratio: maxH > 0 ? +(clientH / maxH).toFixed(2) : null,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
    });
  }
  const sheet = document.querySelector('.sheet');
  const rect = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
  const briefs = document.querySelector('.briefs');
  let briefsFill = null;
  if (briefs) {
    const listH = [...briefs.children].reduce((h, c) => h + (c.getBoundingClientRect().height || 0), 0) + 48;
    briefsFill = +(listH / briefs.getBoundingClientRect().height).toFixed(2);
  }
  // 对比度采样
  const contrastTargets = ['.headline-lead', '.secondary-body', '.section-body', '.section-title', '.brief-line',
    '.brief-lead', '.source-line', '.sections li', '.kicker', '.masthead-side', '.ad-body', '.ad-sign',
    '.colophon p', '.archive-date', '.archive-headline', '.briefs-title', '.supplement-title', '.translated-lead',
    '.brief-tag', '.consensus', '.section-label', '.weather-city', '.weather-desc', '.headline-title', '.secondary-title'];
  const lum = (rgb) => {
    const m = rgb.match(/[\d.]+/g); if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = cs(n).backgroundColor;
      if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg) && !/, 0\)$/.test(bg)) return bg;
      n = n.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
  const contrasts = [];
  for (const sel of contrastTargets) {
    const el = document.querySelector(sel); if (!el) continue;
    const s = cs(el);
    const fg = s.color, bg = bgOf(el);
    const l1 = lum(fg), l2 = lum(bg);
    if (l1 == null || l2 == null) continue;
    const ratio = +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
    const size = parseFloat(s.fontSize), weight = parseInt(s.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    contrasts.push({ sel, fg, bg, ratio, size, weight, need: large ? 3 : 4.5, pass: ratio >= (large ? 3 : 4.5) });
  }
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const fonts = res.filter((r) => /\.woff2?(\?|$)/.test(r.name)).map((r) => ({ n: r.name.split('/').pop(), bytes: r.transferSize || r.encodedBodySize || 0 }));
  const totalBytes = res.reduce((s, r) => s + (r.transferSize || 0), 0);
  return {
    url: location.pathname, viewport: { w: innerWidth, h: innerHeight },
    sheetW: sheet ? Math.round(sheet.getBoundingClientRect().width) : null,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    viewportMeta: !!document.querySelector('meta[name="viewport"]'),
    blocks: { masthead: rect('.masthead'), frontGrid: rect('.front-grid'), sectionsGrid: rect('.sections-grid'), supplement: rect('.supplement'), translated: rect('.translated'), colophon: rect('.colophon') },
    briefsFill,
    nodes: out,
    contrasts,
    fonts: { count: fonts.length, bytes: fonts.reduce((s, f) => s + f.bytes, 0), sample: fonts.slice(0, 3).map((f) => f.n), ready: document.fonts.status },
    perf: { dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null, load: nav ? Math.round(nav.loadEventEnd) : null, totalBytes, cls: window.__cls ?? null },
  };
};

const results = [];
let hardFails = 0, warns = 0;
for (const pg of PAGES) {
  for (const vw of VIEWPORTS) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      window.__cls = 0;
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {}
    });
    await page.setViewport({ width: vw, height: 1000, deviceScaleFactor: 1, isMobile: vw <= 600, hasTouch: vw <= 600 });
    const url = `${BASE.replace(/\/$/, '')}/${pg}${pg ? '' : ''}`.replace(/\/$/, '/');
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 250));
      const r = await page.evaluate(collect);
      r.page = pg; r.wantVw = vw;
      const clipped = r.nodes.filter((n) => n.clipped);
      const silentClip = clipped.filter((n) => !n.fadeOn);
      const fadedClip = clipped.filter((n) => n.fadeOn);
      const hOver = r.nodes.filter((n) => n.hOverflow);
      const docOver = r.docW > vw + 1;
      const wasteFade = r.nodes.filter((n) => n.fadeOn && n.fitInMax && n.maxH > 0 && n.scrollH <= n.maxH - 2);
      const estDev = r.nodes.filter((n) => n.estLines > 0 && Math.abs(n.estLines - n.actualLines) > 2 && !n.clipped);
      const contrastsFail = r.contrasts.filter((c) => !c.pass);
      const briefsLow = r.briefsFill != null && r.briefsFill < 0.6;
      if (clipped.length || hOver.length || docOver) hardFails += clipped.length + hOver.length + (docOver ? 1 : 0);
      warns += wasteFade.length + estDev.length + contrastsFail.length + (briefsLow ? 1 : 0);
      results.push({ ...r, summary: {
        clamped: r.nodes.length, clipped: clipped.length, silentClip: silentClip.length, fadedClip: fadedClip.length,
        hOverflow: hOver.length, docOver,
        wasteFade: wasteFade.length, estDev: estDev.length, contrastsFail: contrastsFail.length, briefsLow,
      }, clippedDetail: clipped.slice(0, 30), wasteFadeDetail: wasteFade.slice(0, 30), estDevDetail: estDev.slice(0, 30) });
      const flag = (clipped.length || hOver.length || docOver) ? 'FAIL' : (wasteFade.length + estDev.length + contrastsFail.length ? 'WARN' : ' OK ');
      console.log(`[${flag}] ${pg || '(首页)'} @${vw}px  clamped=${r.nodes.length} clipped=${clipped.length} hOver=${hOver.length} docOver=${docOver} wasteFade=${wasteFade.length} estDev=${estDev.length} cFail=${contrastsFail.length} doc-${r.docH}px`);
    } catch (e) {
      console.log(`[ERR ] ${pg} @${vw}px ${e.message}`);
      results.push({ page: pg, wantVw: vw, error: String(e.message) });
      hardFails += 1;
    }
    await page.close();
  }
}
await browser.close();
console.log(`\n=== 硬失败 ${hardFails} · 告警 ${warns} ===`);
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify({ base: BASE, viewports: VIEWPORTS, pages: PAGES, ts: new Date().toISOString(), hardFails, warns, results }, null, 1)); console.log(`报告已写入 ${OUT}`); }
process.exit(hardFails ? 1 : 0);
