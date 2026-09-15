// 站點 UI 文案詞典。zh = 简体中文（默認），en = English。
// 內容文本（標題/導語/正文）來自 issues/<date>.json 的對應語言版，不在此處。
export const LANGS = ['zh', 'en'];

/** 刊名：品牌美術字，兩種語言版共用（民國報頭字形） */
export const WORDMARK = '每日新報';
export const WORDMARK_LATIN = 'The Daily News';

const zh = {
  htmlLang: 'zh-Hans',
  siteName: '每日新报',
  pageTitle: '每日新报',
  description: '每日新报——以报纸版式呈现当日新闻的静态站点。',
  founded: '创刊于二〇二五年 · 每日出版',
  price: '零售价 贰角',
  headlineKicker: '本报头条',
  briefsTitle: '今日简讯',
  supplementKicker: '副刊',
  translatedKicker: '域外译讯',
  sourcePrefix: '来源：',
  readOriginal: '阅读原文',
  original: '原文',
  sectionsLabel: '版面栏目',
  consensusNote: n => `${n} 家媒体报道`,
  archiveTitle: '过刊浏览',
  archiveEmpty: '尚无过刊。',
  archiveMeta: '共 %s 期',
  prevIssue: '上一期',
  earliest: '已是最早一期',
  backHome: '回到头版',
  langSwitchLabel: '语言',
  langSwitchText: 'English',
  adHead: '订阅启事',
  adBody: '本报每日清晨六时出版，荟集当日新闻要目与各版精华。全年订阅价洋十元正，邮费在内；零售每份贰角。订户请向各地邮局或报房接洽。',
  adSign: '广告部谨启',
  sealLine1: '每日',
  sealLine2: '新報',
  sealIssue: n => `${n} 期`,
  colophonNav: (issueCn, prevLink) => prevLink,
  disclaimer: '本报文字均整理自公开报道，仅存标题与摘要；原文版权归各来源所有。本站为静态排印试验，不代表任何机构立场。',
  colophonFine: '每日新报 Daily News · 复古排印试验 · 零脚本静态页面',
  weatherLabel: '天气',
};

const en = {
  htmlLang: 'en',
  siteName: 'The Daily News',
  pageTitle: 'The Daily News',
  description: 'The Daily News — a static newspaper-style daily digest of the day’s headlines.',
  founded: 'Founded 2025 · Published daily',
  price: 'Price 20 fen',
  headlineKicker: 'Top Story',
  briefsTitle: 'Briefs',
  supplementKicker: 'Features',
  translatedKicker: 'Translated Highlights',
  sourcePrefix: 'Source: ',
  readOriginal: 'Read original',
  original: 'original',
  sectionsLabel: 'Sections',
  consensusNote: n => `Reported by ${n} outlets`,
  archiveTitle: 'Back Issues',
  archiveEmpty: 'No back issues yet.',
  archiveMeta: '%s issues',
  prevIssue: 'Previous issue',
  earliest: 'Earliest issue',
  backHome: 'Front page',
  langSwitchLabel: 'Language',
  langSwitchText: '中文',
  adHead: 'Subscription Notice',
  adBody: 'Published daily at six in the morning, gathering the day’s leading reports and the best of every section. One year, ten dollars, postage included; single copies twenty fen. Subscriptions may be placed at any post office or newspaper office.',
  adSign: 'Advertising Department',
  sealLine1: '每日',
  sealLine2: '新報',
  sealIssue: n => `No. ${n}`,
  colophonNav: (issueCn, prevLink) => prevLink,
  disclaimer: 'All text is compiled from public reporting and stores headlines and excerpts only; copyright remains with the original publishers. This is a static typographic experiment and does not represent any institution.',
  colophonFine: 'The Daily News · a retro typographic experiment · zero-script static pages',
  weatherLabel: 'Weather',
};

export const T = { zh, en };

export function t(lang) {
  return T[lang] ?? T.zh;
}

/** 站內連結前綴：綜合 site base 與語言段（zh 無前綴，en 為 en/） */
export function langPrefix(lang) {
  return lang === 'en' ? 'en/' : '';
}
