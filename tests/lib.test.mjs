import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripHtml, truncate, normalizeTitle, levenshtein, similarity,
  dedupeByTitle, classify, scoreArticle, withScores, selectLayout, lunarLine,
} from '../scripts/lib.mjs';

/* ---------- 農曆與節氣 ---------- */

test('lunarLine 春节锚点：2024-02-10 为正月初一，当前节气期为立春', () => {
  assert.equal(lunarLine('2024-02-10'), '農曆正月初一 · 立春');
});

test('lunarLine 节气期回看：2024-03-06 落在惊蛰期内且转繁体', () => {
  assert.ok(lunarLine('2024-03-06').endsWith('· 驚蟄'));
});

test('lunarLine 2026-09-15 为農曆八月初五 · 白露', () => {
  assert.equal(lunarLine('2026-09-15'), '農曆八月初五 · 白露');
});

test('lunarLine 腊月转臘月，节气当日直接命中', () => {
  const line = lunarLine('2026-01-20');
  assert.ok(line.includes('臘月初二'));
  assert.ok(line.endsWith('· 大寒'));
});

test('lunarLine 非法日期返回空串', () => {
  assert.equal(lunarLine('garbage'), '');
});

/* ---------- 清洗 ---------- */

test('stripHtml 去标签、解实体、收敛空白', () => {
  assert.equal(stripHtml('<p>你好&amp;世界</p>'), '你好&世界');
  assert.equal(stripHtml('a<br>b&nbsp;c'), 'a b c');
  assert.equal(stripHtml('&#20013;&#x56FD;'), '中国');
  assert.equal(stripHtml('<![CDATA[原樣輸出]]>'), '原樣輸出');
  assert.equal(stripHtml(''), '');
  assert.equal(stripHtml(null), '');
});

test('truncate 截断且先清洗', () => {
  assert.equal(truncate('<b>一二三四五</b>六七八九十', 5), '一二三四五');
  assert.equal(truncate('短文本', 10), '短文本');
});

test('normalizeTitle 去标点空白并小写', () => {
  assert.equal(normalizeTitle('Hello, 世界！ AI'), 'hello世界ai');
});

/* ---------- 相似度与去重 ---------- */

test('levenshtein 基本距离', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('', 'ab'), 2);
});

test('similarity 同题为 1，无关题为低分', () => {
  assert.ok(similarity('全国秋粮丰收', '全国秋粮丰收') === 1);
  assert.ok(similarity('全国秋粮丰收已成定局', '全国秋粮丰收已成大局') > 0.8);
  assert.ok(similarity('全国秋粮丰收', '量子计算机问世') < 0.5);
});

test('dedupeByTitle 合并相似标题且保留高分者', () => {
  const items = [
    { id: 'a', title: '全国秋粮丰收已成定局', score: 10, _norm: normalizeTitle('全国秋粮丰收已成定局') },
    { id: 'b', title: '全国秋粮丰收已成定大局', score: 20, _norm: normalizeTitle('全国秋粮丰收已成定大局') },
    { id: 'c', title: '量子原型机问世', score: 5, _norm: normalizeTitle('量子原型机问世') },
  ];
  const out = dedupeByTitle(items);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'b'); // 相似组保留高分
  assert.equal(out[1].id, 'c');
});

/* ---------- 分类与打分 ---------- */

test('classify 命中关键词归类，未命中回退来源类目', () => {
  assert.equal(classify('央行宣布降息 金融市场反响热烈', '要聞'), '財經');
  assert.equal(classify('新芯片发布 性能翻倍', '科技'), '科技');
  assert.equal(classify('今天天气不错', '要聞'), '要聞'); // 「天气」在民生词表
  assert.equal(classify('一则无法归类的消息', '國際'), '國際');
});

test('scoreArticle 等权重下新者胜，等时效下权重高者胜', () => {
  const now = Date.now();
  const fresh = scoreArticle({ title: '普通消息', weight: 2, date: now }, now);
  const stale = scoreArticle({ title: '普通消息', weight: 2, date: now - 40 * 36e5 }, now);
  assert.ok(fresh > stale);

  const heavy = scoreArticle({ title: '普通消息', weight: 3, date: now }, now);
  const light = scoreArticle({ title: '普通消息', weight: 1, date: now }, now);
  assert.ok(heavy > light);

  const noDate = scoreArticle({ title: '普通消息', weight: 1 }, now);
  assert.equal(noDate, 8 + 5);
});

test('withScores 写回 score 字段', () => {
  const out = withScores([{ title: 'x', weight: 2 }]);
  assert.equal(out.length, 1);
  assert.equal(typeof out[0].score, 'number');
});

/* ---------- 选稿 ---------- */

function mkItem(id, { cat = '要聞', score = 1, lead = 50 } = {}) {
  return {
    id, title: `标题${id}`, category: cat, score,
    summary: '导'.repeat(lead), _norm: `标题${id}`,
  };
}

test('selectLayout 选出头条/次条/半版/简讯且互不重复', () => {
  const pool = [
    { ...mkItem('h', { score: 100, lead: 80 }), source: 'X' },
    mkItem('s', { score: 90 }),
    mkItem('fin', { cat: '財經', score: 80 }),
    mkItem('tech', { cat: '科技', score: 70 }),
    ...Array.from({ length: 8 }, (_, i) => mkItem(`b${i}`, { score: 60 - i })),
  ];
  const r = selectLayout(pool, { briefs: 7 });
  assert.equal(r.headline.id, 'h');
  assert.equal(r.secondary.id, 's');
  assert.equal(r.sections['財經'].id, 'fin');
  assert.equal(r.sections['科技'].id, 'tech');
  assert.equal(r.briefs.length, 7);
  const ids = new Set([r.headline.id, r.secondary.id, r.sections['財經'].id, r.sections['科技'].id, ...r.briefs.map(b => b.id)]);
  assert.equal(ids.size, 11); // 无重复
});

test('selectLayout 池不足时优雅降级', () => {
  const r = selectLayout([mkItem('only')], { briefs: 7 });
  assert.equal(r.headline.id, 'only');
  assert.equal(r.secondary, null);
  assert.equal(r.briefs.length, 0);
  assert.equal(r.sections['財經'], null);
});

test('selectLayout 头条优先选有导语的，全无导语时仍能选出', () => {
  const pool = [mkItem('short1', { score: 30, lead: 5 }), mkItem('short2', { score: 20, lead: 5 })];
  const r = selectLayout(pool, { minLead: 30 });
  assert.ok(r.headline);
});
