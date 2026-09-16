// 版面守门（L4）：在真实浏览器中逐项断言「不管内容如何，版面都成立」。
// 用法：
//   node scripts/verify-layout.mjs [--base=http://localhost:4178/DailyNews] \
//        [--out=report.json] [--viewports=360,768,1280,1440] [--pages=,en/,archive/] \
//        [--mode=strict|ship]
// 模式：strict（默认）任何裁剪都算硬失败——开发回归用；
//       ship 静默裁剪才硬失败，带渐隐的裁剪降级为告警——出刊守门用（设计钳制的有序让步）。
// 断言（硬失败）：
//   H1 无裁剪   每个钳制元素 scrollHeight <= clientHeight + 1（渐隐兜底之外不允许真正丢字）
//   H2 无横向溢出  页面与文本容器 scrollWidth <= clientWidth + 1
//   H3 同行等高    弹性排版核心保证：同一视觉行的两块盒高差 <= 4px
//                  （宽度按内含量分配来拉平高度，不靠裁字也不靠留白）
// 告警（软）：
//   W1 无谓渐隐   fade=1 但内容完整放得下（估算过估）
//   W2 行数偏差   --l 估算与实际行数偏差 > 2 行
//   W3 孤行      多行文本末行字数 <= 2
//   W4 栏空      简讯直栏填充率 < 0.6
//   W5 版式留白  某个 grid 项底部空白 > 48px（约 2 行）——内容不足或等高拉伸
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
  // 版式留白：grid 等高會把內容量少的一項拉成成片空白（裁字之外的另一半問題）。
  // 內容真實高度必須由子元素幾何邊界累加求得——不能用 scrollHeight，
  // 因為對沒有 overflow 的元素它恆 >= clientHeight，永遠測不出留白。
  const contentH = (el) => {
    const kids = [...el.children].filter((k) => k.getBoundingClientRect().height > 0);
    if (!kids.length) return el.clientHeight;
    const s = cs(el);
    let top = Infinity, bottom = -Infinity;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
    }
    if (!isFinite(top)) return el.clientHeight;
    return Math.round(bottom - top + parseFloat(s.paddingTop || 0) + parseFloat(s.paddingBottom || 0));
  };
  // 逐行彈性排版：版塊在 .sections-row 內，頭版首行（頭條／次條）在 .front-grid 內，
  // 副刊的正文欄與廣告框在 .supplement 內
  const gapSel = [
    ...document.querySelectorAll('.front-grid > *'),
    ...document.querySelectorAll('.sections-row > .section-block'),
    ...document.querySelectorAll('.supplement > *'),
  ];
  const gaps = gapSel.map((el) => {
    const boxH = Math.round(el.getBoundingClientRect().height);
    const cH = contentH(el);
    return {
      cls: (el.className || '').toString().split(' ').slice(0, 2).join('.'),
      label: (el.querySelector('.section-label')?.textContent || '').trim().slice(0, 8),
      boxH, contentH: cH, gap: boxH - cH,
    };
  }).filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap);

  // H3 彈性排版的核心保證：同一視覺行的兩項必須等高
  // （寬度按內含量分配來拉平高度，而不是靠裁字或留白）。取 top 相近者為同一行。
  const rowGroups = [...document.querySelectorAll('.sections-row'), document.querySelector('.front-grid')]
    .filter(Boolean)
    .map((row) => {
      const items = [...row.children]
        .filter((c) => c.getBoundingClientRect().height > 0)
        .map((c) => ({
          cls: (c.className || '').toString().split(' ')[0],
          h: Math.round(c.getBoundingClientRect().height),
          w: Math.round(c.getBoundingClientRect().width),
          top: Math.round(c.getBoundingClientRect().top),
        }));
      const seen = [];
      for (const it of items) {
        const g = seen.find((x) => Math.abs(x.top - it.top) < 4);
        if (g) g.items.push(it); else seen.push({ top: it.top, items: [it] });
      }
      return seen.filter((g) => g.items.length > 1);
    })
    .flat();
  const unEven = [];
  for (const g of rowGroups) {
    const hs = g.items.map((x) => x.h);
    const dh = Math.max(...hs) - Math.min(...hs);
    if (dh > 4) unEven.push({ dh, items: g.items.map((x) => `${x.cls}(${x.w}×${x.h})`).join(' vs ') });
  }
  // 对比度采样
  const contrastTargets = ['.headline-lead', '.secondary-body', '.section-body', '.section-title', '.brief-line',
    '.brief-lead', '.source-line', '.sections li', '.kicker', '.masthead-side', '.ad-body', '.ad-sign',
    '.colophon p', '.archive-date', '.archive-headline', '.briefs-title', '.supplement-title', '.translated-lead',
    '.brief-tag', '.consensus', '.section-label', '.headline-title', '.secondary-title'];
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
    gaps,
    unEven,
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
      // ship 模式：带渐隐的裁剪降级为告警（设计钳制的有序让步）；静默裁剪仍是硬失败
      const shipMode = args.mode === 'ship';
      const hardClip = shipMode ? silentClip : clipped;
      const hOver = r.nodes.filter((n) => n.hOverflow);
      const docOver = r.docW > vw + 1;
      const wasteFade = r.nodes.filter((n) => n.fadeOn && n.fitInMax && n.maxH > 0 && n.scrollH <= n.maxH - 2);
      const estDev = r.nodes.filter((n) => n.estLines > 0 && Math.abs(n.estLines - n.actualLines) > 2 && !n.clipped);
      const contrastsFail = r.contrasts.filter((c) => !c.pass);
      const briefsLow = r.briefsFill != null && r.briefsFill < 0.6;
      // W5 版式留白：單個 grid 項的底部空白 > 48px（約 2 行正文）才算病態留白；
      // 更小的差值屬正常 padding/行距。內容不足或等高拉伸都會命中。
      const bigGap = (r.gaps ?? []).filter((g) => g.gap > 48);
      const unEven = r.unEven ?? [];
      if (hardClip.length || hOver.length || docOver || unEven.length) hardFails += hardClip.length + hOver.length + (docOver ? 1 : 0) + unEven.length;
      warns += wasteFade.length + estDev.length + contrastsFail.length + (briefsLow ? 1 : 0) + (shipMode ? fadedClip.length : 0) + bigGap.length;
      results.push({ ...r, summary: {
        clamped: r.nodes.length, clipped: clipped.length, silentClip: silentClip.length, fadedClip: fadedClip.length,
        hOverflow: hOver.length, docOver,
        wasteFade: wasteFade.length, estDev: estDev.length, contrastsFail: contrastsFail.length, briefsLow,
        bigGap: bigGap.length, gapMax: bigGap[0]?.gap ?? 0, unEven: unEven.length, unEvenMax: unEven[0]?.dh ?? 0,
      }, clippedDetail: clipped.slice(0, 30), wasteFadeDetail: wasteFade.slice(0, 30), estDevDetail: estDev.slice(0, 30), gapDetail: bigGap.slice(0, 20), unEvenDetail: unEven.slice(0, 20) });
      const flag = (hardClip.length || hOver.length || docOver || unEven.length) ? 'FAIL' : ((wasteFade.length + estDev.length + contrastsFail.length + bigGap.length + (shipMode ? fadedClip.length : 0)) ? 'WARN' : ' OK ');
      console.log(`[${flag}] ${pg || '(首页)'} @${vw}px  clamped=${r.nodes.length} clipped=${clipped.length} hOver=${hOver.length} docOver=${docOver} unEven=${unEven.length}(${unEven[0]?.dh ?? 0}px) wasteFade=${wasteFade.length} estDev=${estDev.length} cFail=${contrastsFail.length} gap=${bigGap.length}(${bigGap[0]?.gap ?? 0}px) doc-${r.docH}px`);
    } catch (e) {
      console.log(`[ERR ] ${pg} @${vw}px ${e.message}`);
      results.push({ page: pg, wantVw: vw, error: String(e.message) });
      hardFails += 1;
    }
    await page.close();
  }
}
await browser.close();
console.log(`\n=== 模式 ${args.mode || 'strict'} · 硬失败 ${hardFails} · 告警 ${warns} ===`);
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify({ base: BASE, viewports: VIEWPORTS, pages: PAGES, ts: new Date().toISOString(), hardFails, warns, results }, null, 1)); console.log(`报告已写入 ${OUT}`); }
process.exit(hardFails ? 1 : 0);
