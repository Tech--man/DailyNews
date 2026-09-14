// 公曆日期 → 報紙中文體（二〇二六年九月十五日 / 星期二 / 第〇四二九期）
const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WEEKS = ['日', '一', '二', '三', '四', '五', '六'];

function cnNumber(n) {
  if (n <= 10) return n === 10 ? '十' : DIGITS[n];
  if (n < 20) return '十' + DIGITS[n % 10];
  if (n % 10 === 0) return DIGITS[Math.floor(n / 10)] + '十';
  return DIGITS[Math.floor(n / 10)] + '十' + DIGITS[n % 10];
}

export function cnDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const year = String(y).split('').map(c => DIGITS[Number(c)]).join('');
  return `${year}年${cnNumber(m)}月${cnNumber(d)}日`;
}

export function cnWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return '星期' + WEEKS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 期號 → 「第〇四二九期」樣式（四位，不足補〇） */
export function cnIssue(no) {
  return '第' + String(no).padStart(4, '0').split('').map(c => DIGITS[Number(c)]).join('') + '期';
}
