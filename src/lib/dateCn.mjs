// 日期格式化的中英兩套。zh 用報紙中文體（二〇二六年九月十五日 / 第〇四二九期），
// en 用英文長日期（September 15, 2026 / No. 429）。
const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WEEKS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function cnNumber(n) {
  if (n <= 10) return n === 10 ? '十' : DIGITS[n];
  if (n < 20) return '十' + DIGITS[n % 10];
  if (n % 10 === 0) return DIGITS[Math.floor(n / 10)] + '十';
  return DIGITS[Math.floor(n / 10)] + '十' + DIGITS[n % 10];
}

const parts = dateStr => String(dateStr).split('-').map(Number);

export function cnDate(dateStr) {
  const [y, m, d] = parts(dateStr);
  const year = String(y).split('').map(c => DIGITS[Number(c)]).join('');
  return `${year}年${cnNumber(m)}月${cnNumber(d)}日`;
}

export function cnWeek(dateStr) {
  const [y, m, d] = parts(dateStr);
  return '星期' + WEEKS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 期號 → 「第〇四二九期」樣式（四位，不足補〇） */
export function cnIssue(no) {
  return '第' + String(no).padStart(4, '0').split('').map(c => DIGITS[Number(c)]).join('') + '期';
}

export function enDate(dateStr) {
  const [y, m, d] = parts(dateStr);
  return `${MONTHS_EN[m - 1]} ${d}, ${y}`;
}

export function enWeek(dateStr) {
  const [y, m, d] = parts(dateStr);
  return WEEKS_EN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function enIssue(no) {
  return `No. ${no}`;
}

/** 按語言取日期 / 星期 / 期號的格式化函數 */
export function fmt(lang) {
  return lang === 'en'
    ? { date: enDate, week: enWeek, issue: enIssue }
    : { date: cnDate, week: cnWeek, issue: cnIssue };
}
