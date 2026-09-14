// OG 分享圖生成：satori（SVG）→ sharp（PNG 1200×630）。
// satori 不支持 woff2 分片，需完整字體；運行時下載到 .og-fonts/（已 gitignore），
// 下載成功後長期緩存。卡片沿用報紙視覺：紙底、套紅、雙線、印章。
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import sharp from 'sharp';
import { cnDate, cnIssue } from '../src/lib/dateCn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const OG_DIR = join(ROOT, 'public', 'og');
const FONT_DIR = process.env.OG_FONT_DIR ?? join(ROOT, '.og-fonts');

const FONT_FILES = [
  {
    weight: 700, file: 'NotoSerifCJKsc-Bold.otf',
    url: 'https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Bold.otf',
  },
  {
    weight: 900, file: 'NotoSerifCJKsc-Black.otf',
    url: 'https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Black.otf',
  },
];

export async function ensureFonts() {
  mkdirSync(FONT_DIR, { recursive: true });
  const fonts = [];
  for (const f of FONT_FILES) {
    const p = join(FONT_DIR, f.file);
    if (!existsSync(p) || statSync(p).size === 0) {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`字體下載失敗 HTTP ${res.status}：${f.file}`);
      writeFileSync(p, Buffer.from(await res.arrayBuffer()));
    }
    fonts.push({ name: 'Noto Serif SC', data: readFileSync(p), weight: f.weight, style: 'normal' });
  }
  return fonts;
}

const C = { paper: '#F4EFE2', ink: '#1C1A17', soft: '#6B6558', red: '#9B2B26', rule: '#8C8578' };

function trunc(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/** satori 元素樹：1200×630 報紙風卡片 */
function card(issue, date) {
  const title = trunc(issue?.headline?.title, 40);
  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.paper, color: C.ink, padding: '52px 64px',
        fontFamily: 'Noto Serif SC', justifyContent: 'space-between',
      },
      children: [
        // 報頭
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
            children: [
              { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', fontSize: 22, color: C.soft, lineHeight: 1.7 }, children: [
                { type: 'div', props: { style: { fontWeight: 900, color: C.ink }, children: cnIssue(issue.issue) } },
                { type: 'div', props: { children: '零售價 貳角' } },
              ] } },
              { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }, children: [
                { type: 'div', props: { style: { fontSize: 20, color: C.red, fontStyle: 'italic' }, children: 'The Daily News' } },
                { type: 'div', props: { style: { fontSize: 92, fontWeight: 900, letterSpacing: 14, lineHeight: 1.15 }, children: '每日新報' } },
              ] } },
              { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 22, lineHeight: 1.7 }, children: [
                { type: 'div', props: { style: { fontWeight: 900 }, children: cnDate(date) } },
                { type: 'div', props: { style: { color: C.soft }, children: issue.lunar || '\u00A0' } },
              ] } },
            ],
          },
        },
        // 雙線（satori 不吃 border double 簡寫，用兩枚 div 堆疊）
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: 3 }, children: [
          { type: 'div', props: { style: { height: 3, background: C.ink } } },
          { type: 'div', props: { style: { height: 1, background: C.ink } } },
        ] } },
        // 頭條
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 22 },
            children: [
              { type: 'div', props: { style: { fontSize: 20, color: C.red, fontWeight: 900, letterSpacing: 10 }, children: '本 報 頭 條' } },
              { type: 'div', props: { style: { fontSize: 56, fontWeight: 900, textAlign: 'center', lineHeight: 1.45 }, children: title } },
              issue?.headline?.lead
                ? { type: 'div', props: { style: { fontSize: 24, color: C.soft, textAlign: 'center' }, children: trunc(issue.headline.lead, 48) } }
                : null,
            ].filter(Boolean),
          },
        },
        // 版尾：欄目 + 印章
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
            children: [
              { type: 'div', props: { style: { fontSize: 22, color: C.soft, letterSpacing: 6 }, children: '要聞 · 財經 · 科技 · 文化 · 體育 · 國際' } },
              { type: 'div', props: { style: {
                width: 104, height: 104, borderRadius: '50%',
                borderWidth: 4, borderStyle: 'solid', borderColor: C.red,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: C.red, transform: 'rotate(-8deg)', opacity: 0.9,
              }, children: [
                { type: 'div', props: { style: { fontSize: 24, fontWeight: 900, letterSpacing: 2 }, children: '每日' } },
                { type: 'div', props: { style: { fontSize: 24, fontWeight: 900, letterSpacing: 2 }, children: '新報' } },
                { type: 'div', props: { style: { fontSize: 11, marginTop: 2 }, children: String(issue.issue) + ' 期' } },
              ] } },
            ],
          },
        },
      ],
    },
  };
}

/** 生成 public/og/<date>.png */
export async function renderOg(issue, date, fonts) {
  fonts = fonts ?? (await ensureFonts());
  const svg = await satori(card(issue, date), { width: 1200, height: 630, fonts });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  mkdirSync(OG_DIR, { recursive: true });
  const out = join(OG_DIR, `${date}.png`);
  writeFileSync(out, png);
  return out;
}
