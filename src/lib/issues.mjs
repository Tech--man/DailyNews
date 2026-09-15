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

/** 最新一期 */
export function latestIssue() {
  const [d] = listIssueDates();
  if (!d) throw new Error('issues/ 目錄為空，先運行 pnpm run build:issue');
  return { date: d, issue: loadIssue(d) };
}
