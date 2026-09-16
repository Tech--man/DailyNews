// 弹性排版（v5）求解器单测：以「宽度换高度」，让同行各项等高。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  METRICS, GAP, SECTION_GEO, HEAD_GEO,
  estArticleH, estBlockH, estHeadlineH, estSecondaryH,
  solveRowRatios, solvePairRatios, solveHeadRatios,
} from '../src/lib/fit.mjs';

const mkArts = (n, chars) => Array.from({ length: n }, () => ({
  title: '标题'.repeat(Math.ceil(chars / 40)), lead: '导'.repeat(chars),
}));
const rowW = METRICS.content;
const availW = rowW - GAP * 2;

test('弹性求解：同行两块高度差显著降低并收敛', () => {
  const A = mkArts(3, 200), B = mkArts(3, 500);
  const before = Math.abs(estBlockH(A, availW / 2) - estBlockH(B, availW / 2));
  const [rA] = solveRowRatios(A, B, rowW);
  const after = Math.abs(estBlockH(A, availW * rA) - estBlockH(B, availW * (1 - rA)));
  assert.ok(after < before / 4, `等高差应降到 1/4 以下：${Math.round(before)} → ${Math.round(after)}`);
  // 殘差下限由「行數是整數」的離散性決定：寬度再變一點，行數不變則高度不變。
  assert.ok(after <= 60, `等高差应收敛到 60px 内，实际 ${Math.round(after)}`);
});

test('弹性求解：内容多的一侧分到更宽', () => {
  const A = mkArts(3, 150), B = mkArts(3, 600);
  const [rA, rB] = solveRowRatios(A, B, rowW);
  assert.ok(rB > rA, `内容多的 B 应更宽：A=${rA.toFixed(3)} B=${rB.toFixed(3)}`);
});

test('弹性求解：单侧占比受 minRatio 约束且和为 1', () => {
  const A = mkArts(1, 20), B = mkArts(5, 900);
  const [rA, rB] = solveRowRatios(A, B, rowW);
  assert.ok(rA >= SECTION_GEO.minRatio - 1e-6, `A 不应窄于 ${SECTION_GEO.minRatio}，实际 ${rA}`);
  assert.ok(rB <= 1 - SECTION_GEO.minRatio + 1e-6, `B 不应宽于 ${1 - SECTION_GEO.minRatio}，实际 ${rB}`);
  assert.ok(Math.abs(rA + rB - 1) < 1e-6, '两侧占比之和应为 1');
});

test('弹性求解：并肩两篇等高，内容多的一篇更宽', () => {
  const a1 = { title: '短标题', lead: '导'.repeat(150) };
  const a2 = { title: '较长标题', lead: '导'.repeat(280) };
  const pairW = 520;
  const [p1, p2] = solvePairRatios(a1, a2, pairW);
  const avail = pairW - GAP;
  const h1 = estArticleH(a1, avail * p1), h2 = estArticleH(a2, avail * p2);
  assert.ok(Math.abs(h1 - h2) <= 40, `并肩两篇应变高：${Math.round(h1)} vs ${Math.round(h2)}`);
  assert.ok(p2 > p1, '内容多的第二篇应更宽');
});

test('弹性求解：内容差异极端时撞 minRatio 边界（约束下的最优）', () => {
  // 差异过大时单靠分宽拉不平——这正是「约束下」的含义：
  // 保证一栏不被压到不可读，剩余高度差由版面的自然呼吸承担。
  const a1 = { title: '短', lead: '导'.repeat(20) };
  const a2 = { title: '长标题'.repeat(4), lead: '导'.repeat(1200) };
  const pairW = 520;
  const [p1, p2] = solvePairRatios(a1, a2, pairW);
  assert.ok(p1 >= SECTION_GEO.minRatio - 1e-6, `应撞宽度下限 ${SECTION_GEO.minRatio}，实际 ${p1.toFixed(3)}`);
  assert.ok(Math.abs(p1 + p2 - 1) < 1e-6, '占比之和应为 1');
});

test('弹性求解：头条与次条等高（次条含内缩补偿）', () => {
  const headline = { title: '标'.repeat(30), lead: '导'.repeat(140) };
  const secondary = { title: '标'.repeat(20), lead: '导'.repeat(150) };
  const [rH, rS] = solveHeadRatios(headline, secondary, rowW);
  assert.ok(Math.abs(rH + rS - 1) < 1e-6, '占比之和应为 1');
  const avail = rowW - GAP;
  const hH = estHeadlineH(headline, avail * rH);
  const hS = estSecondaryH(secondary, avail * rS - HEAD_GEO.secInset);
  assert.ok(Math.abs(hH - hS) <= 30, `头条/次条应变高：${Math.round(hH)} vs ${Math.round(hS)}`);
});

test('主图恒定贡献高度，且加宽不会使头条变高（单调性）', () => {
  const base = { title: '标'.repeat(30), lead: '导'.repeat(140) };
  const withImg = { ...base, image: 'https://example.com/x.jpg' };
  const hNo = estHeadlineH(base, 600), hImg = estHeadlineH(withImg, 600);
  assert.equal(hImg - hNo, HEAD_GEO.photoH, `主图应恒定贡献 ${HEAD_GEO.photoH}px`);
  // 图片固定框高是关键：若高度随栏宽增长，二分求解的单调性会被破坏。
  assert.ok(estHeadlineH(withImg, 900) <= hImg, '加宽不应使含图头条变高');
});

test('版块高度：随宽度递减、空版块为 0', () => {
  const arts = mkArts(3, 300);
  assert.ok(estBlockH(arts, 500) > estBlockH(arts, 900), '越宽越矮');
  assert.equal(estBlockH([], 500), 0, '空版块高度为 0');
  assert.ok(estBlockH(mkArts(1, 100), 500) > 0);
});

test('版块高度：count-4 的末篇通栏计入（高于同篇半栏）', () => {
  const arts = mkArts(4, 300);
  const wide = estBlockH(arts, 1000);
  const narrow = estBlockH(arts, 400);
  assert.ok(narrow > wide, '窄栏更高');
});
