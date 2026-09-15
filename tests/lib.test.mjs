import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripHtml, truncate, smartTruncate, normalizeTitle, compactKey, levenshtein, similarity,
  dedupeByTitle, bigrams, diceSimilarity, computeConsensus,
  classifyV2, keywordBoost, detectLang, categoryLabel,
  isNoise, scoreArticle, withScores, filterFresh,
  selectEdition, buildBody, lunarLine, wmoDesc,
  toSimplified, localizeText, CATEGORY_KEYS,
} from '../scripts/lib.mjs';

/* ---------- 天氣碼（簡體 + 英文） ---------- */

test('wmoDesc 中文返回簡體描述', () => {
  assert.equal(wmoDesc(0), '晴');
  assert.equal(wmoDesc(2), '多云');
  assert.equal(wmoDesc(3), '阴');
  assert.equal(wmoDesc(45), '雾');
  assert.equal(wmoDesc(61), '雨');
  assert.equal(wmoDesc(80), '阵雨');
  assert.equal(wmoDesc(95), '雷雨');
  assert.equal(wmoDesc(null), '多云');
});

test('wmoDesc 英文按語言返回', () => {
  assert.equal(wmoDesc(0, 'en'), 'Clear');
  assert.equal(wmoDesc(3, 'en'), 'Overcast');
  assert.equal(wmoDesc(95, 'en'), 'Thunderstorm');
});

/* ---------- 農曆與節氣（中英雙版） ---------- */

test('lunarLine 中文版為簡體，春节锚点正确', () => {
  assert.equal(lunarLine('2024-02-10', 'zh'), '农历正月初一 · 立春');
  assert.equal(lunarLine('2026-09-15', 'zh'), '农历八月初五 · 白露');
});

test('lunarLine 英文版輸出英文月日與節氣名', () => {
  assert.equal(lunarLine('2026-09-15', 'en'), '5th day of the 8th lunar month · White Dew');
  assert.ok(lunarLine('2024-02-10', 'en').startsWith('1st day of the 1st lunar month'));
});

test('lunarLine 非法日期返回空串', () => {
  assert.equal(lunarLine('garbage'), '');
});

/* ---------- 清洗與摘要 ---------- */

test('stripHtml 去标签、解实体、收敛空白', () => {
  assert.equal(stripHtml('<p>你好&amp;世界</p>'), '你好&世界');
  assert.equal(stripHtml('a<br>b&nbsp;c'), 'a b c');
  assert.equal(stripHtml('&#20013;&#x56FD;'), '中国');
  assert.equal(stripHtml('<![CDATA[原样输出]]>'), '原样输出');
  assert.equal(stripHtml(''), '');
  assert.equal(stripHtml(null), '');
});

test('truncate 截断且先清洗', () => {
  assert.equal(truncate('<b>一二三四五</b>六七八九十', 5), '一二三四五');
  assert.equal(truncate('短文本', 10), '短文本');
});

test('smartTruncate 在句末标点处收尾，不产生半句话', () => {
  const src = '第一句话到此结束。第二句话还没说完就被截断了内容内容内容';
  assert.equal(smartTruncate(src, 12), '第一句话到此结束。');
});

test('smartTruncate 英文按句点收尾', () => {
  const src = 'First sentence ends here. Second sentence is cut off in the middle of a clause';
  assert.equal(smartTruncate(src, 30, { lang: 'en' }), 'First sentence ends here.');
});

test('smartTruncate 无句末标点时退到子句或词界', () => {
  const out = smartTruncate('没有句号的一段很长很长的文字，后面还有很多内容继续延伸下去', 12);
  assert.ok(out.length <= 13 && !out.endsWith('。'));
  const en = smartTruncate('a very long run on line without any sentence stop at all', 20, { lang: 'en' });
  assert.ok(en.length <= 20 && !en.endsWith(' '));
});

test('smartTruncate 短于上限时原样返回', () => {
  assert.equal(smartTruncate('短。', 10), '短。');
});

/* ---------- 繁簡轉換 ---------- */

test('toSimplified 繁體轉簡體', () => {
  assert.equal(toSimplified('科技烏托邦，可以給視障者「一雙眼睛」嗎？'), '科技乌托邦，可以给视障者「一双眼睛」吗？');
  assert.equal(toSimplified(''), '');
});

test('localizeText 按語言分流：zh 轉簡體，en 原樣', () => {
  assert.equal(localizeText('機器學習', 'zh'), '机器学习');
  assert.equal(localizeText('Machine Learning', 'en'), 'Machine Learning');
});

/* ---------- 相似度與去重 ---------- */

test('normalizeTitle 去标点、保留空格、小写', () => {
  assert.equal(normalizeTitle('Hello, 世界！ AI'), 'hello 世界 ai');
});

test('compactKey 去空格供中文子串匹配', () => {
  assert.equal(compactKey('Hello, 世界！ AI'), 'hello世界ai');
});

test('levenshtein 与 similarity 基本性质', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'ab'), 2);
  assert.ok(similarity('全国秋粮丰收', '全国秋粮丰收') === 1);
  assert.ok(similarity('全国秋粮丰收', '量子计算机问世') < 0.5);
});

test('dedupeByTitle 合并相似标题且保留高分者', () => {
  const items = [
    { id: 'a', title: '全国秋粮丰收已成定局', score: 10 },
    { id: 'b', title: '全国秋粮丰收已成定大局', score: 20 },
    { id: 'c', title: '量子原型机问世', score: 5 },
  ];
  const out = dedupeByTitle(items);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'b');
  assert.equal(out[1].id, 'c');
});

/* ---------- 多源共識 ---------- */

test('bigrams 与 diceSimilarity 基本性质', () => {
  assert.deepEqual([...bigrams('abcd')], ['ab', 'bc', 'cd']);
  assert.equal(diceSimilarity(bigrams('abcd'), bigrams('abcd')), 1);
  assert.equal(diceSimilarity(bigrams('abcd'), bigrams('wxyz')), 0);
});

test('computeConsensus 將同事件跨集團聚類並計數', () => {
  const items = [
    { title: '特朗普抨击Anthropic CEO 称AI发展不能踩刹车', group: 'A' },
    { title: '特朗普批评Anthropic CEO AI发展不能踩刹车', group: 'B' },
    { title: '另一条完全无关的新闻内容在此', group: 'C' },
  ];
  const out = computeConsensus(items);
  assert.equal(out[0], 2);
  assert.equal(out[1], 2);
  assert.equal(out[2], 1);
});

test('computeConsensus 同集團多條不重複計數', () => {
  const items = [
    { title: '同一家媒体的两条相同事件报道', group: 'A' },
    { title: '同一家媒体的两条相同事件报道', group: 'A' },
  ];
  assert.deepEqual(computeConsensus(items), [1, 1]);
});

test('computeConsensus 空輸入返回空數組', () => {
  assert.deepEqual(computeConsensus([]), []);
});

/* ---------- 分類 ---------- */

test('classifyV2 来源类目为强先验，不被单一弱词改写', () => {
  // v1 缺陷：命中「贸易」被判成財經；v2 保留来源类目 world
  assert.equal(classifyV2('与美国贸易争端加剧 加拿大转向欧洲？', 'world', 'zh'), 'world');
  // v1 缺陷：命中「数据」被判成科技；v2 保留 world
  assert.equal(classifyV2('核电站数据造假 日本中部电力公司两名高层辞职', 'world', 'zh'), 'world');
});

test('classifyV2 高置信词可覆盖来源类目', () => {
  assert.equal(classifyV2('央行宣布降息 美联储释放宽松信号', 'world', 'zh'), 'business');
  assert.equal(classifyV2('某队夺得联赛冠军 主教练赛后发言', 'top', 'zh'), 'sport');
});

test('classifyV2 英文按词匹配，避免子串误伤', () => {
  assert.equal(classifyV2('Fed signals rate cut as inflation cools', 'world', 'en'), 'business');
  // 'ai' 不应匹配 'train' 这类子串
  assert.equal(classifyV2('Train services resume after storm', 'world', 'en'), 'world');
  assert.equal(classifyV2('Premier League club appoints new coach', 'world', 'en'), 'sport');
});

test('keywordBoost 有上限且中英通用', () => {
  assert.equal(keywordBoost('这是一个平淡无奇的标题'), 0);
  assert.ok(keywordBoost('央行降息 股市大涨 美联储加息') <= 6);
  assert.ok(keywordBoost('Fed cuts rates as stocks rally', 'en') > 0);
});

test('detectLang 粗略判定語言', () => {
  assert.equal(detectLang('中文标题'), 'zh');
  assert.equal(detectLang('English headline'), 'en');
});

test('categoryLabel 中英顯示名', () => {
  assert.equal(categoryLabel('business', 'zh'), '财经');
  assert.equal(categoryLabel('business', 'en'), 'Business');
  assert.ok(CATEGORY_KEYS.includes('society'));
});

/* ---------- 噪音過濾 ---------- */

test('isNoise 過濾聚合索引與純日期條目', () => {
  assert.equal(isNoise({ title: '9月15日新闻早报', summary: '今日要闻一览' }), true);
  assert.equal(isNoise({ title: '一周回顾', summary: '本周大事' }), true);
  assert.equal(isNoise({ title: '2026-09-15', summary: '' }), true);
  assert.equal(isNoise({ title: '短', summary: '' }), true);
});

test('isNoise 過濾英文直播頁與播客', () => {
  assert.equal(isNoise({ title: 'Live updates: storm hits the coast', lang: 'en' }), true);
  assert.equal(isNoise({ title: 'Podcast: the week in tech', lang: 'en' }), true);
});

test('isNoise 保留正常新聞', () => {
  assert.equal(isNoise({ title: '中国地震局与苹果公司沟通推进地震预警信息接入 iOS', summary: '一段足够长的摘要内容在这里' }), false);
  assert.equal(isNoise({ title: 'Fed signals rate cut as inflation cools', lang: 'en' }), false);
});

/* ---------- 打分 ---------- */

test('scoreArticle tier 主導權威性', () => {
  const now = Date.now();
  const base = { title: '普通消息', weight: 2, date: now };
  const core = scoreArticle({ ...base, tier: 'core' }, now);
  const std = scoreArticle({ ...base, tier: 'standard' }, now);
  const opt = scoreArticle({ ...base, tier: 'optional' }, now);
  assert.ok(core > std && std > opt);
  // tier 極差(10) 應大於 weight 極差(6)：權威性優先於來源權重
  assert.ok(core - opt > 6);
});

test('scoreArticle 共識提權且新者勝', () => {
  const now = Date.now();
  const solo = scoreArticle({ title: '普通消息', tier: 'standard', date: now, consensus: 1 }, now);
  const multi = scoreArticle({ title: '普通消息', tier: 'standard', date: now, consensus: 4 }, now);
  assert.ok(multi > solo);
  const fresh = scoreArticle({ title: '普通消息', tier: 'standard', date: now }, now);
  const stale = scoreArticle({ title: '普通消息', tier: 'standard', date: now - 40 * 36e5 }, now);
  assert.ok(fresh > stale);
});

test('withScores 写回 score 字段', () => {
  const out = withScores([{ title: 'x', tier: 'core' }]);
  assert.equal(typeof out[0].score, 'number');
});

/* ---------- 新鮮度 ---------- */

test('filterFresh 剔除過期條目，無日期條目默認剔除', () => {
  const now = Date.now();
  const items = [
    { id: 'a', date: now - 1 * 36e5 },
    { id: 'b', date: now - 50 * 36e5 },
    { id: 'c', date: null },
  ];
  assert.deepEqual(filterFresh(items, now, { maxAgeHours: 36 }).map(i => i.id), ['a']);
  assert.deepEqual(filterFresh(items, now, { maxAgeHours: 36, includeUndated: true }).map(i => i.id), ['a', 'c']);
});

/* ---------- 選稿引擎 ---------- */

function mk(id, { cat = 'top', tier = 'standard', group = 'G1', score = 10, lead = 60, consensus = 1 } = {}) {
  return { id, title: `标题${id}`, category: cat, tier, group, score, consensus, summary: '导'.repeat(lead) };
}

const LAYOUT = {
  headline: { minLead: 20, minConsensus: 2, tiers: ['core'], categories: ['top', 'world'] },
  secondary: { minLead: 20, tiers: ['core', 'standard'], categories: ['top', 'world', 'business', 'tech'] },
  sections: [{ key: 'tech', count: 2 }],
  briefs: { max: 3, perCategoryMax: 9 },
  supplement: { categories: ['culture'], minLead: 100, fallback: 'longest' },
};

test('selectEdition 頭條優先取有共識者，而非單純最高分', () => {
  const pool = [
    mk('hi', { tier: 'core', group: 'A', score: 100, consensus: 1, cat: 'top' }),
    mk('multi', { tier: 'core', group: 'B', score: 80, consensus: 3, cat: 'world' }),
    mk('x', { cat: 'tech', group: 'C', score: 50 }),
  ];
  const r = selectEdition(pool, LAYOUT);
  assert.equal(r.headline.id, 'multi');
  assert.equal(r.headlineTier, 'consensus+lead');
  assert.equal(r.headlineConsensus, 3);
});

test('selectEdition 無共識條目時降級而非空缺', () => {
  const pool = [
    mk('a', { tier: 'core', group: 'A', score: 100, consensus: 1, cat: 'top' }),
    mk('b', { cat: 'tech', group: 'B', score: 50 }),
  ];
  const r = selectEdition(pool, LAYOUT);
  assert.equal(r.headline.id, 'a');
  assert.equal(r.headlineTier, 'lead');
});

test('selectEdition 頭條與次條不同集團', () => {
  const pool = [
    mk('h', { tier: 'core', group: 'A', score: 100, consensus: 5, cat: 'top' }),
    mk('s1', { tier: 'core', group: 'A', score: 95 }),
    mk('s2', { tier: 'core', group: 'B', score: 90 }),
  ];
  const r = selectEdition(pool, LAYOUT);
  assert.equal(r.headline.group, 'A');
  assert.equal(r.secondary.id, 's2');
});

test('selectEdition 多類目版塊可跨類目取稿', () => {
  const layout = { ...LAYOUT, sections: [{ categories: ['top', 'world'], count: 2 }] };
  const pool = [
    mk('h', { tier: 'core', group: 'A', score: 100, consensus: 2, cat: 'top' }),
    mk('s', { tier: 'core', group: 'B', score: 95, cat: 'business' }),
    mk('w', { group: 'C', score: 70, cat: 'world' }),
    mk('t', { group: 'D', score: 60, cat: 'top' }),
  ];
  const r = selectEdition(pool, layout);
  const keys = r.sections[0].articles.map(a => a.id);
  assert.equal(r.sections[0].key, 'top');
  assert.ok(keys.includes('w') && keys.includes('t'), `實際取到 ${keys.join(',')}`);
});

test('selectEdition 同版源不足時放行同集團補位（不留版面空洞）', () => {
  const layout = { ...LAYOUT, sections: [{ key: 'sport', count: 2 }] };
  const pool = [
    mk('h', { tier: 'core', group: 'A', score: 100, consensus: 2, cat: 'top' }),
    mk('w', { tier: 'core', group: 'B', score: 95, cat: 'world' }),
    mk('sp1', { group: 'S', score: 40, cat: 'sport' }),
    mk('sp2', { group: 'S', score: 30, cat: 'sport' }),
  ];
  const r = selectEdition(pool, layout);
  const sports = r.sections.find(s => s.key === 'sport');
  assert.equal(sports.articles.length, 2);
  assert.deepEqual(sports.articles.map(a => a.id), ['sp1', 'sp2']);
});

test('selectEdition 次條受類目約束，不搶空供給稀薄的版塊', () => {
  const layout = { ...LAYOUT, sections: [{ key: 'culture', count: 1 }] };
  const pool = [
    mk('h', { tier: 'core', group: 'A', score: 100, consensus: 2, cat: 'top' }),
    mk('w', { tier: 'core', group: 'B', score: 95, cat: 'world' }),
    mk('only-culture', { group: 'C', score: 90, cat: 'culture' }),
  ];
  const r = selectEdition(pool, layout);
  assert.equal(r.secondary.id, 'w');
  assert.equal(r.sections.find(s => s.key === 'culture').articles[0].id, 'only-culture');
});

test('selectEdition 集團上限約束單一來源壟斷', () => {
  const pool = [
    mk('h', { tier: 'core', group: 'BIG', score: 100, consensus: 2, cat: 'top' }),
    ...Array.from({ length: 8 }, (_, i) => mk(`b${i}`, { group: 'BIG', score: 90 - i })),
    mk('oth', { group: 'SMALL', score: 10 }),
  ];
  const r = selectEdition(pool, LAYOUT);
  const used = [r.headline, r.secondary, ...r.sections.flatMap(s => s.articles), ...r.briefs].filter(Boolean);
  const bigCount = used.filter(i => i.group === 'BIG').length;
  assert.ok(bigCount <= r.groupCap, `BIG 取用 ${bigCount} 條，超過上限 ${r.groupCap}`);
});

test('selectEdition 副刊 fallback=longest 保證不空', () => {
  const layout = { ...LAYOUT, sections: [] };
  const pool = [
    mk('h', { tier: 'core', group: 'A', score: 100, consensus: 2, cat: 'top' }),
    mk('w', { tier: 'core', group: 'B', score: 95, cat: 'world' }),
    mk('lng', { group: 'C', score: 90, cat: 'tech', lead: 500 }),
  ];
  const r = selectEdition(pool, layout);
  assert.equal(r.supplement.id, 'lng');
});

test('selectEdition 副刊優先命中所配類目', () => {
  const layout = { ...LAYOUT, sections: [] };
  const pool = [
    mk('h', { tier: 'core', group: 'A', score: 100, consensus: 2, cat: 'top' }),
    mk('w', { tier: 'core', group: 'B', score: 95, cat: 'world' }),
    mk('cul', { group: 'C', score: 50, cat: 'culture', lead: 300 }),
    mk('lng', { group: 'D', score: 90, cat: 'tech', lead: 500 }),
  ];
  const r = selectEdition(pool, layout);
  assert.equal(r.supplement.id, 'cul');
});

test('selectEdition 簡訊按集團輪轉覆蓋多來源', () => {
  const pool = [
    mk('h', { tier: 'core', group: 'A', score: 100, consensus: 2, cat: 'top' }),
    mk('a1', { group: 'A', score: 90 }), mk('a2', { group: 'A', score: 89 }),
    mk('b1', { group: 'B', score: 50 }), mk('c1', { group: 'C', score: 40 }),
  ];
  const r = selectEdition(pool, LAYOUT);
  const groups = new Set(r.briefs.map(b => b.group));
  assert.ok(groups.size >= 2, `簡訊只覆蓋 ${groups.size} 個集團`);
});

test('selectEdition 空池優雅降級', () => {
  const r = selectEdition([], LAYOUT);
  assert.equal(r.headline, null);
  assert.equal(r.secondary, null);
  assert.equal(r.briefs.length, 0);
  assert.equal(r.sections.length, 0);
  assert.equal(r.supplement, null);
});

/* ---------- 加工層 ---------- */

test('buildBody 中文按句群均分为目标段数', () => {
  const out = buildBody('第一句话。第二句话。第三句话。第四句话。', { lang: 'zh', maxChars: 200 });
  assert.equal(out.length, 3);
});

test('buildBody 英文按句点切段（回歸：v1 缺少英文句界）', () => {
  const s = 'First sentence here. Second sentence here. Third sentence here. Fourth here.';
  const out = buildBody(s, { lang: 'en', maxChars: 500 });
  assert.equal(out.length, 3);
  assert.ok(out[0].includes('First sentence here.'));
});

test('buildBody 句子不足时退回整段', () => {
  const out = buildBody('Only one sentence here', { lang: 'en', maxChars: 100 });
  assert.equal(out.length, 1);
});

test('buildBody 空摘要返回空数组', () => {
  assert.deepEqual(buildBody(''), []);
});
