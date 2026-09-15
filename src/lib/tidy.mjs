// 文本潔淨（渲染前最後一道）：清洗數據源混入的標點空格缺陷。
// 無論上游（RSS 摘要 / LLM 改寫）混入什麼，見報文字一律乾淨——
// 這是「不管內容如何，排版始終成立」在文字層的延伸。
// 純函數；tests/fit.test.mjs 有用例。

export function tidy(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\s{2,}/g, ' ')                                  // 疊空格
    .replace(/\s+([,.:;!?%、。，；：！？…）】》」』”’])/g, '$1')   // 標點前空格
    // 全角標點後空格（中文排版無此空格）。彎引號 “”‘’ 不入此類——
    // 它們與英文閉引號同碼位，' development 這類合法空格不能吞。
    .replace(/([、。，；：！？）】》」』])[ \t]+/g, '$1')
    .replace(/([A-Za-z0-9]) +(-[A-Za-z0-9])/g, '$1$2')        // 被拆開的連字符（AI -linked → AI-linked）
    .replace(/([\p{L}])['’] s\b/gu, '$1’s')                   // 被拆開的所有格（world' s → world's；不誤傷 actors' scenes）
    .trim();
}
