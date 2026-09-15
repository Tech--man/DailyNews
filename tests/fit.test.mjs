import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SHEET, GUTTER, GAP, METRICS, TIERS, CLAMPS,
  textEm, estLines, estLinesRaw, fitClamp, fitClamp3, estParagraphLines,
} from '../src/lib/fit.mjs';
import { tidy } from '../src/lib/tidy.mjs';

/* ---------- 文本潔淨 ---------- */

test('tidy：清洗標點前空格與疊空格', () => {
  assert.equal(tidy('development , citing'), 'development, citing');
  assert.equal(tidy("'sick conspiracy'  AI-linked"), "'sick conspiracy' AI-linked");
  assert.equal(tidy('北京 ， 上海'), '北京，上海');
  assert.equal(tidy('  頭尾空白  '), '頭尾空白');
});

test('tidy：英文閉引號後的合法空格不誤傷', () => {
  assert.equal(tidy("in ‘reckless’ development"), "in ‘reckless’ development");
  assert.equal(tidy("After ‘Free Palestine’ Comments"), "After ‘Free Palestine’ Comments");
});

test('tidy：被拆開的連字符', () => {
  assert.equal(tidy('AI -linked stocks'), 'AI-linked stocks');
  assert.equal(tidy('2020 - 2024 年'), '2020 - 2024 年'); // 兩側空格的年份區間不動
});

test('tidy：所有格撇號後空格（僅限被拆開的獨立 s，不誤傷復數所有格）', () => {
  assert.equal(tidy("the world' s most"), 'the world’s most');
  assert.equal(tidy('Prince Harry’ s next'), 'Prince Harry’s next');
  assert.equal(tidy("actors' scenes"), "actors' scenes");
  assert.equal(tidy("the so-called 'pure' form"), "the so-called 'pure' form");
});

test('tidy：非字符串原樣返回', () => {
  assert.equal(tidy(undefined), undefined);
  assert.equal(tidy(null), null);
  assert.equal(tidy(5), 5);
});

/* ---------- 版面常量與 CSS 令牌對拍 ---------- */

test('fit 常量與 newspaper.css 令牌一致', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../public/css/newspaper.css', import.meta.url)), 'utf8');
  const token = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
    assert.ok(m, `CSS 令牌 --${name} 缺失`);
    return m[1].trim();
  };
  assert.equal(parseInt(token('sheet-w'), 10), SHEET);
  assert.equal(parseFloat(token('gutter')) * 16, GUTTER);
  assert.equal(parseFloat(token('gap')) * 16, GAP);
});

test('METRICS 欄寬自洽', () => {
  assert.ok(METRICS.content === SHEET - GUTTER * 2);
  assert.ok(METRICS.headline > 400 && METRICS.headline < 500);
  assert.ok(METRICS.secondary > 200 && METRICS.secondary < 300);
  // briefs 为 full 档 dense 单列实测宽（2026-09-15），不再按整栏几何推导
  assert.ok(METRICS.briefs > 140 && METRICS.briefs < 180);
  assert.ok(METRICS.sectionHalf < METRICS.sectionFull);
  assert.ok(METRICS.bodyCol > 300 && METRICS.bodyCol < 400);
});

test('TIERS 三檔寬度與鉗制表完備', () => {
  for (const tier of ['full', 'mid', 'narrow']) {
    for (const k of Object.keys(TIERS.full)) {
    assert.ok(Number.isFinite(TIERS[tier][k]) && TIERS[tier][k] > 0, `${tier}.${k}`);
    }
  }
  // full 档宽度 = 版心 1100 实测；narrow 全部单列（宽度一致）
  assert.ok(TIERS.full.headline < TIERS.mid.headline);      // 头條導語 full 佔 5/12 欄（444px），mid 通欄 688px 更寬
  assert.equal(TIERS.narrow.headline, TIERS.narrow.sectionHalf);
  for (const slot of Object.keys(CLAMPS)) {
    assert.ok(CLAMPS[slot].design >= 1 && CLAMPS[slot].guard > CLAMPS[slot].design,
      `${slot} guard 应大于 design`);
  }
});

test('fitClamp3：三檔鉗制一次算齊（含 +1 行安全餘量）', () => {
  // 132 字中文导语，full 档 444px 栏宽 15px 字号
  const r = fitClamp3('一'.repeat(132), 'headline-lead', { size: 15 });
  // raw est = ceil(132*1.0063/(444/15)) = ceil(133/29.6) = 5；+1 → 6；cap 3 → 钳 3、渐隐
  assert.deepEqual(r.full, { lines: 3, faded: true });
  // mid 688px：raw = ceil(133/45.9) = 3；+1 → 4 ≤ guard 7 → 不渐隐
  assert.equal(r.mid.faded, false);
  assert.equal(r.mid.lines, 4);
  // narrow 342px：raw = ceil(133/22.8) = 6；+1 → 7 = guard 7 → 不渐隐、恰好 7 行
  assert.equal(r.narrow.lines, 7);
  assert.equal(r.narrow.faded, false);
  // 未达上限：短文本各档原样
  const short = fitClamp3('短句', 'brief-line', { size: 14 });
  assert.equal(short.full.lines, 2);   // raw 1 行 + 安全餘量 1
  assert.equal(short.full.faded, false);
});

/* ---------- 字寬估算 ---------- */

test('CJK 字寬 ≈ 1em，西文按比例（實測擬合模型）', () => {
  // zh 模型：cjk=1.0063 space=0.3337 upper=0.6726 lower=0.6414 digit=0.7248
  assert.ok(Math.abs(textEm('每日新報') - 4 * 1.0063) < 0.01);
  assert.ok(textEm('AI') > 1.0 && textEm('AI') < 1.6);   // A=0.6726 + I=0.6414 → 1.31
  assert.ok(textEm('2026') > 2.0 && textEm('2026') < 3.2); // 4×0.7248 → 2.90
  assert.equal(textEm(''), 0);
  assert.equal(textEm(undefined), 0);
  // en 模型按 Old Standard TT 拟合：lower 0.3877（比例字形窄）
  assert.ok(textEm('aaaa', 'en') < textEm('aaaa', 'zh'));
});

test('estLines：整段 CJK 按欄寬折行（raw 版）', () => {
  // 444px 欄寬、15px 字號 → 每行約 29.4 字（cjk=1.0063）
  assert.equal(estLinesRaw('一'.repeat(29), METRICS.headline), 1);
  assert.equal(estLinesRaw('一'.repeat(30), METRICS.headline), 2);
  assert.equal(estLinesRaw('一'.repeat(60), METRICS.headline), 3);
  assert.equal(estLinesRaw('任意', METRICS.headline), 1); // 空欄極端仍為 1 行
  // estLines（兼容入口）= raw + 1 行安全余量
  assert.equal(estLines('一'.repeat(29), METRICS.headline), 2);
});

test('estLines：tracking 收緊每行容量', () => {
  const plain = estLines('一'.repeat(40), 400, { size: 20 });
  const tracked = estLines('一'.repeat(40), 400, { size: 20, tracking: 0.1 });
  assert.ok(tracked >= plain);
});

test('fitClamp：上限內原樣展示，超限鉗制並漸隱（含安全餘量）', () => {
  const fits = fitClamp('一'.repeat(10), METRICS.headline, 3);
  assert.deepEqual(fits, { lines: 2, faded: false }); // raw 1 + 安全 1

  const capped = fitClamp('一'.repeat(300), METRICS.headline, 3);
  assert.deepEqual(capped, { lines: 3, faded: true }); // raw 11 + 1 > 3
});

test('estParagraphLines：多段合計（raw）', () => {
  const lines = estParagraphLines(['一'.repeat(30), '一'.repeat(30)], METRICS.headline);
  assert.equal(lines, 4);
  assert.equal(estParagraphLines(undefined, METRICS.headline), 0);
  assert.equal(estParagraphLines([], METRICS.headline), 0);
});
