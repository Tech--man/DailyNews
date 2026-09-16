// 讀取 issues/ 目錄：列出全部期次、載入指定期、取某語言版。
// 注意：Astro 打包後 import.meta.url 指向 dist/.prerender/，
// 故以項目根（cwd，可用 DAILYNEWS_ROOT 覆蓋）解析數據目錄。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ISSUES_DIR = join(process.env.DAILYNEWS_ROOT ?? process.cwd(), 'issues');

/** 全部期次日期，新→舊。排除 .meta.json（出刊元數據，不是期數據）。 */
export function listIssueDates() {
  return readdirSync(ISSUES_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.replace(/\.json$/, ''))
    .sort()
    .reverse();
}

export function loadIssue(date) {
  return JSON.parse(readFileSync(join(ISSUES_DIR, `${date}.json`), 'utf8'));
}

/** 取某語言版；缺失時回退到本期第一種語言，仍無則返回 null */
export function editionOf(issue, lang) {
  if (!issue?.editions) return null;
  return issue.editions[lang] ?? issue.editions[issue.languages?.[0]] ?? null;
}

/** 期號：自最早期次起算，第一期為 1。
 *  以磁盤上的實際出刊序列為準，**不用**期數據裡的 issue 欄位——
 *  那個欄位是「自虛構創刊日 2025-07-14 按日推算」的舊口徑，會給出與實際出刊期數無關的數（如 429）。
 *  缺期不跳號：第 N 期即出刊序列中的第 N 位，符合報紙「期」的語義。 */
export function issueNumberOf(date) {
  const dates = listIssueDates();   // 新 → 舊
  const idx = dates.indexOf(date);
  if (idx === -1) return null;
  return dates.length - idx;
}

/** 最新一期 */
export function latestIssue() {
  const [d] = listIssueDates();
  if (!d) throw new Error('issues/ 目錄為空，先運行 pnpm run build:issue');
  return { date: d, issue: loadIssue(d) };
}
