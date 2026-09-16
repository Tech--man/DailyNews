// 站點 UI 文案詞典。zh = 简体中文（默認），en = English。
// 內容文本（標題/導語/正文）來自 issues/<date>.json 的對應語言版，不在此處。
import { cnYear } from './dateCn.mjs';

export const LANGS = ['zh', 'en'];

/** 刊名：品牌美術字，兩種語言版共用（民國報頭字形）。
 *  注意：兩版的**層級互為鏡像**——zh 版中文刊名為大字、拉丁刊名為小字；
 *  en 版反之。取用方（Masthead）按 lang 決定誰作 h1，此處只提供字面。 */
export const WORDMARK = '每日新報';
export const WORDMARK_LATIN = 'The Daily News';

const zh = {
  htmlLang: 'zh-Hans',
  pageTitle: '每日新报',
  description: '每日新报——以报纸版式呈现当日新闻的静态站点。中文版与英文版各自独立编辑，内容并不相同。',
  founded: y => `创刊于${cnYear(y)}年 · 每日出版`,
  headlineKicker: '本报头条',
  briefsTitle: '今日简讯',
  supplementKicker: '副刊',
  translatedKicker: '域外译讯',
  sourcePrefix: '来源：',
  readOriginal: '阅读原文',
  original: '原文',
  sectionsLabel: '版面栏目',
  consensusNote: n => `${n} 家媒体报道`,
  // 版本差異聲明（顯著標識）：置於報頭之下，讀者進站第一眼可及。
  editionNoticeLabel: '读者须知',
  editionNoticeKey: '中、英两版内容并不相同，亦非逐篇互译',
  editionNoticeBody: '本报中文版与英文版各自独立编辑：中文版稿件选自中文媒体报道，英文版稿件选自英文媒体报道。两版互不参校，请分别阅读。',
  editionNoticeSwitch: '阅读英文版',
  editionNoticeClose: '关闭',
  archiveTitle: '过刊浏览',
  archiveEmpty: '尚无过刊。',
  prevIssue: '上一期',
  earliest: '已是最早一期',
  backHome: '回到头版',
  langSwitchText: 'English',
  // 廣告位：招租口徑（本刊不設訂閱，故不寫訂閱價格與投遞方式）。
  adHead: '广告招租',
  adBody: '本报行销遐迩，阅者遍及商学两界。兹有显著版位招租，商号启事、新张志庆、货品推销、招雇声明，均可刊登。价目从优，长期另有优待。租位请向本报广告部接洽。',
  adSign: '广告部谨启',
  sealLine1: '每日',
  sealLine2: '新報',
  sealIssue: n => `${n} 期`,
  disclaimer: '本报文字均整理自公开报道，仅存标题与摘要；原文版权归各来源所有。本站为静态排印试验，不代表任何机构立场。',
  colophonFine: '每日新报 Daily News · 中英两版独立编辑 · 复古排印实验',
};

const en = {
  htmlLang: 'en',
  pageTitle: 'The Daily News',
  description: 'The Daily News — a static newspaper-style digest of the day’s headlines. The English and Chinese editions are edited independently and differ in content.',
  founded: y => `Founded ${y} · Published daily`,
  headlineKicker: 'Top Story',
  briefsTitle: 'Briefs',
  supplementKicker: 'Features',
  translatedKicker: 'Translated Highlights',
  sourcePrefix: 'Source: ',
  readOriginal: 'Read original',
  original: 'original',
  sectionsLabel: 'Sections',
  consensusNote: n => `Reported by ${n} outlets`,
  // Notice of edition difference — placed directly beneath the masthead.
  editionNoticeLabel: 'A Note to Readers',
  editionNoticeKey: 'The two editions differ in content and are not translations of one another',
  editionNoticeBody: 'The Chinese and English editions are edited independently: the Chinese edition draws its reports from Chinese-language outlets, the English edition from English-language outlets. Neither is a version of the other.',
  editionNoticeSwitch: 'Read the Chinese edition',
  editionNoticeClose: 'Close',
  archiveTitle: 'Back Issues',
  archiveEmpty: 'No back issues yet.',
  prevIssue: 'Previous issue',
  earliest: 'Earliest issue',
  backHome: 'Front page',
  langSwitchText: '中文',
  // Advertising space to let — this paper carries no subscription, so no subscription rates.
  adHead: 'Advertising Space to Let',
  adBody: 'The Daily News circulates widely, and its readers are drawn from commerce and the professions. Conspicuous positions are to let: shop notices, announcements of new businesses, and advertisements of goods are all received. Rates are moderate, with favourable terms for long runs. Apply to the Advertising Department.',
  adSign: 'Advertising Department',
  sealLine1: '每日',
  sealLine2: '新報',
  sealIssue: n => `No. ${n}`,
  disclaimer: 'All text is compiled from public reporting and stores headlines and excerpts only; copyright remains with the original publishers. This is a static typographic experiment and does not represent any institution.',
  colophonFine: 'The Daily News · Chinese and English editions edited independently · a retro typographic experiment',
};

export const T = { zh, en };

export function t(lang) {
  return T[lang] ?? T.zh;
}

/** 站內連結前綴：綜合 site base 與語言段（zh 無前綴，en 為 en/） */
export function langPrefix(lang) {
  return lang === 'en' ? 'en/' : '';
}
