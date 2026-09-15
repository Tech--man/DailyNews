// OG 圖生成 CLI：
//   node scripts/generate-og.mjs            # 全部期次
//   node scripts/generate-og.mjs 2026-09-15 # 指定日期
import { listIssueDates, loadIssue } from '../src/lib/issues.mjs';
import { renderOg } from './og.mjs';

const arg = process.argv[2];
const dates = arg && arg !== '--all' ? [arg] : listIssueDates();
if (!dates.length) {
  console.error('issues/ 無期數據，先運行 pnpm run build:issue');
  process.exit(1);
}

const fonts = await import('./og.mjs').then(m => m.ensureFonts());
for (const date of dates) {
  const issue = loadIssue(date);
  for (const lang of issue.languages ?? ['zh']) {
    const out = await renderOg(issue, date, { lang, fonts });
    console.log(`✓ ${out}`);
  }
}
