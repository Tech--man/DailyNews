import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrompt, parseRewriteResponse, sanitizeRewrite, maybeRewrite, FEWSHOT,
  buildTranslatePrompt, parseTranslateResponse, maybeTranslate,
} from '../scripts/rewrite.mjs';

/* ---------- 提示词 ---------- */

test('buildPrompt 含规则、few-shot 与 JSON 输出要求', () => {
  const { system, user } = buildPrompt(['标题甲', '标题乙']);
  assert.ok(system.includes('8至12字'));
  assert.ok(system.includes('不得使用感嘆號、問號'));
  for (const s of FEWSHOT) assert.ok(system.includes(s.title));
  assert.ok(user.includes('1. 标题甲'));
  assert.ok(user.includes('2. 标题乙'));
  assert.ok(user.includes('"i"'));
});

/* ---------- 响应解析 ---------- */

test('parseRewriteResponse 解析纯 JSON 数组', () => {
  const out = parseRewriteResponse('[{"i":1,"title":"甲"},{"i":2,"title":"乙"}]', 2);
  assert.deepEqual(out, ['甲', '乙']);
});

test('parseRewriteResponse 容忍夹在散文中的 JSON', () => {
  const out = parseRewriteResponse('改寫結果如下：\n[{"i":1,"title":"甲"}]\n以上。', 1);
  assert.deepEqual(out, ['甲']);
});

test('parseRewriteResponse 序号越界/缺字段按 null 兜底', () => {
  const out = parseRewriteResponse('[{"i":9,"title":"越界"},{"i":1},{"i":2,"title":"乙"}]', 2);
  assert.equal(out[0], null);
  assert.equal(out[1], '乙');
});

test('parseRewriteResponse 无 JSON 时返回 null', () => {
  assert.equal(parseRewriteResponse('抱歉我不明白', 1), null);
  assert.equal(parseRewriteResponse('[{"i":1,broken', 1), null);
});

/* ---------- 校验兜底 ---------- */

test('sanitizeRewrite 合格改写被采纳并去引号空白', () => {
  assert.equal(sanitizeRewrite('原标题', '「秋糧入倉 豐收定局」'), '秋糧入倉 豐收定局');
});

test('sanitizeRewrite 感叹/问号/句号一律回退原标题', () => {
  assert.equal(sanitizeRewrite('原标题', '太好了！'), '原标题');
  assert.equal(sanitizeRewrite('原标题', '真的嗎？'), '原标题');
  assert.equal(sanitizeRewrite('原标题', '句子完結。'), '原标题');
});

test('sanitizeRewrite 字数越界回退原标题', () => {
  assert.equal(sanitizeRewrite('原标题', '短'), '原标题');
  assert.equal(sanitizeRewrite('原标题', '這是一個遠遠超過十八個字的超長標題所以必須回退'), '原标题');
  assert.equal(sanitizeRewrite('原标题', null), '原标题');
});

/* ---------- 无 key 降级 ---------- */

test('maybeRewrite 未设 LLM_API_KEY 时返回 null（不发请求）', async () => {
  const out = await maybeRewrite(['标题'], {}, () => { throw new Error('不应发起请求'); });
  assert.equal(out, null);
});

test('maybeRewrite 空标题列表直接返回 null', async () => {
  assert.equal(await maybeRewrite([], { LLM_API_KEY: 'x' }), null);
});

test('maybeRewrite 正常链路（注入 fetch 桩，不触网）', async () => {
  const fake = async (url, init) => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '[{"i":1,"title":"秋糧入倉 豐收定局"}]' } }] }),
  });
  const out = await maybeRewrite(
    ['全国秋粮收获过八成 单产创历史新高'],
    { LLM_API_KEY: 'test-key', LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'test-model' },
    fake,
  );
  assert.deepEqual(out, ['秋糧入倉 豐收定局']);
});

test('maybeRewrite HTTP 失败抛异常由调用方降级', async () => {
  const fake = async () => ({ ok: false, status: 503 });
  await assert.rejects(
    maybeRewrite(['标题'], { LLM_API_KEY: 'x' }, fake),
    /LLM HTTP 503/,
  );
});

/* ---------- 跨語言翻譯（多語言版） ---------- */

test('buildTranslatePrompt 含目標語言與 JSON 輸出要求', () => {
  const { system, user } = buildTranslatePrompt([{ title: '标题甲', lead: '导语甲' }], 'en');
  assert.ok(system.includes('English'));
  assert.ok(user.includes('TITLE: 标题甲'));
  assert.ok(user.includes('SUMMARY: 导语甲'));
  assert.ok(user.includes('"i"'));
});

test('parseTranslateResponse 解析 title+lead 并容忍散文包裹', () => {
  const out = parseTranslateResponse('好的：\n[{"i":1,"title":"T","lead":"L"}]\n完毕', 1);
  assert.deepEqual(out, [{ title: 'T', lead: 'L' }]);
});

test('parseTranslateResponse 空 title 条目按 null 兜底（不冒充译文）', () => {
  const out = parseTranslateResponse('[{"i":1,"title":"   "},{"i":2,"title":"B"}]', 2);
  assert.equal(out[0], null);
  assert.deepEqual(out[1], { title: 'B', lead: '' });
});

test('parseTranslateResponse 无 JSON 时返回 null', () => {
  assert.equal(parseTranslateResponse('我不会翻译', 1), null);
});

test('maybeTranslate 未设 LLM_API_KEY 时返回 null（不发请求）', async () => {
  const out = await maybeTranslate([{ title: '甲', lead: '乙' }], 'en', {}, () => { throw new Error('不应发起请求'); });
  assert.equal(out, null);
});

test('maybeTranslate 正常链路（注入 fetch 桩，不触网）', async () => {
  const fake = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '[{"i":1,"title":"AI stocks slide","lead":"Markets fell."}]' } }] }),
  });
  const out = await maybeTranslate([{ title: 'AI股下跌', lead: '市场走低。' }], 'en', { LLM_API_KEY: 'k' }, fake);
  assert.deepEqual(out, [{ title: 'AI stocks slide', lead: 'Markets fell.' }]);
});

test('maybeTranslate HTTP 失败抛异常由调用方降级', async () => {
  const fake = async () => ({ ok: false, status: 429 });
  await assert.rejects(maybeTranslate([{ title: '甲' }], 'en', { LLM_API_KEY: 'k' }, fake), /LLM HTTP 429/);
});

test('maybeTranslate 空列表返回 null', async () => {
  assert.equal(await maybeTranslate([], 'en', { LLM_API_KEY: 'k' }), null);
});
