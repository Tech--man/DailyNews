// LLM 標題改寫（可選增強）。
// 金鑰僅從環境變量讀取，源碼不含任何憑據字面量：
//   LLM_API_KEY   設置後才啟用改寫；未設置時整體跳過（保留原標題）
//   LLM_BASE_URL  默認 https://api.openai.com/v1（OpenAI 兼容 /chat/completions）
//   LLM_MODEL     默認 gpt-4o-mini
// 改寫要求（規劃稿）：8–12 字報紙體、不用感嘆號問句、書面語。
// 任何失敗（網絡/解析/校驗）都降級為原標題，不阻斷出刊。

/** few-shot 樣例：繁體、報紙體、空格分句、無感嘆問號 */
export const FEWSHOT = [
  { i: 1, original: '全国秋粮收获过八成 单产创历史新高', title: '秋糧入倉 豐收業已定局' },
  { i: 2, original: '研究团队发布量子计算原型机 相干时间延长三倍', title: '量子原型機問世 相干延三倍' },
  { i: 3, original: '美股三大指数收跌 纳指跌幅超过1%', title: '美股收跌 納指跌逾百分一' },
  { i: 4, original: '冷空气本周中过境 江南多地气温骤降', title: '冷空氣週中過境 江南驟涼' },
];

const RULES = [
  '將下列新聞標題改寫為民國報紙風格的繁體標題。',
  '要求：8至12字（可用空格分句，空格不計入字數）；書面語；',
  '不得使用感嘆號、問號、句號；只可使用原文明確包含的信息，不得添油加醋；',
  '數字、主體與關鍵動作必須保留。',
].join('');

/** 構建請求消息體（純函數，可單測） */
export function buildPrompt(titles) {
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const shots = FEWSHOT.map(s => `${s.i}. ${s.original} → ${s.title}`).join('\n');
  return {
    system: `${RULES}\n\n範例：\n${shots}`,
    user: `改寫以下 ${titles.length} 條標題，只輸出 JSON 數組：[{"i":序號,"title":"改寫結果"}]，不要輸出其他文字。\n${list}`,
  };
}

/** 從模型回復中解析 JSON 數組；失敗返回 null */
export function parseRewriteResponse(text, n) {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end <= start) return null;
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const out = new Array(n).fill(null);
    for (const it of arr) {
      const i = Number(it?.i);
      if (Number.isInteger(i) && i >= 1 && i <= n && typeof it?.title === 'string') {
        out[i - 1] = it.title;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 校驗並兜底：不合格（含感嘆問號句號、字數越界、空值）一律回退原標題。
 * 字數按規劃要求 8–12 為目標，兜底放寬至 3–18（去除空格後計）。
 */
export function sanitizeRewrite(original, candidate) {
  if (!candidate) return original;
  // 只剝包裹性引號與空白，不剝句末標點——含感嘆/問號/句號即視為風格違規，整條棄用
  const s = String(candidate).trim()
    .replace(/^[「『"'：:，,、\s]+/, '')
    .replace(/[」』"'\s]+$/, '')
    .trim();
  if (!s) return original;
  if (/[！？!?。]/.test(s)) return original;
  const len = s.replace(/\s+/g, '').length;
  if (len < 3 || len > 18) return original;
  return s;
}

/**
 * 批量改寫。未設 LLM_API_KEY 時返回 null（調用方跳過）；
 * 請求或解析失敗拋異常，由調用方降級。
 * fetch 可注入以便測試。
 */
export async function maybeRewrite(titles, env = process.env, fetchImpl = globalThis.fetch) {
  const apiKey = env.LLM_API_KEY;
  if (!apiKey || titles.length === 0) return null;
  const base = (env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = env.LLM_MODEL ?? 'gpt-4o-mini';
  const { system, user } = buildPrompt(titles);

  const res = await fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(Number(env.LLM_TIMEOUT_MS ?? 30000)),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  const parsed = parseRewriteResponse(text, titles.length);
  if (!parsed) throw new Error('LLM 回復解析失敗');
  return parsed.map((c, i) => sanitizeRewrite(titles[i], c));
}
