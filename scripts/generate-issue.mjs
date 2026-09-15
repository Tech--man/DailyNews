// 出刊編排 v2：抓取 RSS → 規範化 → 時效 → 去噪 → 分類 → 多源共識 → 打分 → 配額選稿 → 雙語言版
// 用法：node scripts/generate-issue.mjs [YYYY-MM-DD] [--dry-run] [--lang zh|en]
// 只存標題+摘要+原文鏈接，不存全文（版權約束）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  smartTruncate, dedupeByTitle, classifyV2, withScores, filterFresh,
  computeConsensus, isNoise, selectEdition, buildBody, lunarLine, wmoDesc, categoryLabel, localizeText,
} from './lib.mjs';
import { collectFeeds, assertPublicHttpUrl } from './feed.mjs';
import { renderOg } from './og.mjs';
import { maybeRewrite, maybeTranslate } from './rewrite.mjs';

export { assertPublicHttpUrl };

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config/feeds.json'), 'utf8'));

/* ---------- 日期與期號 ---------- */

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 創刊日 2025-07-14：2026-09-14 恰為第 428 期，與 M1 版面一致
const ISSUE_EPOCH = Date.UTC(2025, 6, 14);
export function issueNo(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - ISSUE_EPOCH) / 864e5 + 1;
}

/* ---------- 天氣（open-meteo，免 key） ---------- */

async function fetchWeather(cfg, timeoutMs, lang) {
  const city = lang === 'en' ? (cfg.cityEn ?? cfg.city) : cfg.city;
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const geo = JSON.parse(await (await fetch(geoUrl, { signal: AbortSignal.timeout(timeoutMs) })).text());
  const hit = geo?.results?.[0];
  if (!hit) throw new Error(`地理編碼無結果：${city}`);

  const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}`
    + `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FShanghai&forecast_days=1`;
  const fc = JSON.parse(await (await fetch(fcUrl, { signal: AbortSignal.timeout(timeoutMs) })).text());
  const d = fc?.daily;
  if (!d?.temperature_2m_max?.length || !d?.temperature_2m_min?.length) throw new Error('預報數據為空');

  return {
    city,
    temp: `${Math.round(d.temperature_2m_min[0])}~${Math.round(d.temperature_2m_max[0])}℃`,
    desc: wmoDesc(d.weather_code?.[0], lang),
    lat: hit.latitude,
    lon: hit.longitude,
  };
}

/* ---------- 單語言版選稿 ---------- */

/**
 * 某語言版的完整選稿鏈：時效 → 去噪 → 分類 → 共識 → 打分 → 去重 → 配額選稿。
 * 共識必須在去重之前算——去重會合併同題條目，之後就算不出「幾家獨立報導」。
 */
export function buildEdition(pool, lang, layout, { now, maxAgeHours, groupCapRatio }) {
  const funnel = { fetched: pool.length };
  let items = pool.filter(it => (it.lang ?? 'zh') === lang);
  funnel.lang = items.length;

  items = filterFresh(items, now, { maxAgeHours });
  funnel.fresh = items.length;

  items = items.filter(it => !isNoise(it));
  funnel.denoised = items.length;

  items = items.map(it => ({ ...it, category: classifyV2(it.title, it.sourceCategory, lang) }));

  const consensus = computeConsensus(items);
  items = items.map((it, i) => ({ ...it, consensus: consensus[i] }));

  items = withScores(items, now, { maxAgeHours });
  items = dedupeByTitle(items);
  funnel.deduped = items.length;

  const picked = selectEdition(items, layout, { groupCapRatio });

  const compose = (it, leadChars, withBody = false) => it && {
    title: localizeText(it.title, lang),
    lead: localizeText(smartTruncate(it.summary, leadChars, { lang }), lang),
    ...(withBody ? { body: buildBody(it.summary, { lang, maxChars: 900 }).map(p => localizeText(p, lang)) } : {}),
    source: it.source,
    group: it.group,
    link: it.link,
    category: it.category,
    categoryLabel: categoryLabel(it.category, lang),
    ...(it.image ? { image: it.image } : {}),
    ...(it.consensus > 1 ? { consensus: it.consensus } : {}),
  };

  const edition = {
    lang,
    headline: compose(picked.headline, 160, true),
    secondary: compose(picked.secondary, 160),
    sections: picked.sections.map(s => ({
      key: s.key,
      label: categoryLabel(s.key, lang),
      articles: s.articles.map(a => compose(a, 220)),
    })),
    briefs: picked.briefs.map(b => ({
      title: localizeText(b.title, lang),
      lead: localizeText(smartTruncate(b.summary, 70, { lang }), lang),
      category: b.category,
      categoryLabel: categoryLabel(b.category, lang),
      source: b.source,
      link: b.link,
    })),
    supplement: compose(picked.supplement, 220, true),
  };

  const visible = [
    edition.headline, edition.secondary,
    ...edition.sections.flatMap(s => s.articles),
    ...edition.briefs, edition.supplement,
  ].filter(Boolean);

  const groups = {};
  for (const it of visible) {
    const g = it.group ?? it.source;
    groups[g] = (groups[g] ?? 0) + 1;
  }
  const cats = {};
  for (const it of visible) cats[it.category] = (cats[it.category] ?? 0) + 1;
  const maxGroup = Math.max(0, ...Object.values(groups));

  edition.stats = {
    visible: visible.length,
    sections: edition.sections.length,
    briefs: edition.briefs.length,
    groups: Object.keys(groups).length,
    maxGroupShare: visible.length ? Math.round(maxGroup / visible.length * 100) : 0,
    categories: Object.keys(cats).length,
    topGroups: Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`),
    headlineTier: picked.headlineTier,
    headlineConsensus: picked.headlineConsensus,
    groupCap: picked.groupCap,
  };
  return { edition, funnel, pool: items };
}

/* ---------- 主流程 ---------- */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const langIdx = args.indexOf('--lang');
  const langArg = langIdx >= 0 ? args[langIdx + 1] : null;
  const dateStr = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? localDateStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.error(`日期參數不合法：${dateStr}`);
    process.exit(2);
  }

  const limits = CONFIG.limits;
  const languages = langArg ? [langArg] : (CONFIG.languages ?? ['zh']);
  const now = Date.now();
  const zhSrc = CONFIG.feeds.filter(f => f.lang === 'zh').length;
  const enSrc = CONFIG.feeds.filter(f => f.lang === 'en').length;

  console.log(`\n每日新報 · 第 ${issueNo(dateStr)} 期 · ${dateStr}${dryRun ? '  ［DRY RUN］' : ''}`);
  console.log(`源池 ${CONFIG.feeds.length} 源 / ${new Set(CONFIG.feeds.map(f => f.group)).size} 集團（zh ${zhSrc} 源 / en ${enSrc} 源）`);

  const { pool, failed, okCount, total } = await collectFeeds(CONFIG.feeds, limits, { now });
  console.log(`抓取：✓ ${okCount}/${total} 源，素材 ${pool.length} 條`);
  if (failed.length) console.log(`  ✗ ${failed.map(f => `${f.name}(${f.reason})`).join('  ')}`);
  if (okCount < (limits.minFeedsOk ?? 3)) {
    console.error(`可用源不足（${okCount}/${total}，要求 ≥${limits.minFeedsOk}）`);
    process.exit(1);
  }

  const editions = {};
  const funnels = {};
  for (const lang of languages) {
    const layout = CONFIG.layout?.[lang] ?? CONFIG.layout?.zh;
    const { edition, funnel } = buildEdition(pool, lang, layout, {
      now,
      maxAgeHours: limits.maxAgeHours ?? 36,
      groupCapRatio: limits.groupCapRatio ?? 0.2,
    });
    editions[lang] = edition;
    funnels[lang] = funnel;

    const s = edition.stats;
    console.log(`\n［${lang} 版］語種素材 ${funnel.lang} → 新鮮 ${funnel.fresh} → 去噪 ${funnel.denoised}`
      + ` → 去重 ${funnel.deduped} → 上版 ${s.visible} 條`);
    console.log(`  欄目 ${s.sections} 個 · 簡訊 ${s.briefs} 條 · 來源集團 ${s.groups} 個`
      + ` · 單集團最大 ${s.maxGroupShare}%（上限 ${s.groupCap} 條）· 覆蓋類目 ${s.categories} 個`);
    console.log(`  頭條：「${(edition.headline?.title ?? '').slice(0, 30)}」`);
    console.log(`        選稿檔位 ${s.headlineTier} · 多源共識 ${s.headlineConsensus} 家獨立集團報導`);
    console.log(`  主要集團：${s.topGroups.join('  ')}`);
  }

  // LLM 標題改寫（可選）：中文版 8–12 字報紙體；未設 key 全跳過
  const zh = editions.zh;
  if (zh) {
    const targets = [zh.headline, zh.secondary, ...zh.sections.flatMap(s => s.articles)].filter(Boolean);
    try {
      const rewrites = await maybeRewrite(targets.map(t => t.title));
      if (!rewrites) console.log('\nLLM 未啟用（未設 LLM_API_KEY），保留原標題');
      else targets.forEach((a, i) => {
        if (rewrites[i] && rewrites[i] !== a.title) {
          console.log(`  ✎ 「${a.title.slice(0, 24)}」→「${rewrites[i]}」`);
          a.title = rewrites[i];
        }
      });
    } catch (e) {
      console.warn(`  ⚠ 標題改寫失敗（保留原標題）：${e.message?.slice(0, 150)}`);
    }
  }

  // 跨語言精選（可選）：把 A 語言版頭部稿件譯入 B 語言版，補足單語素材不足
  if (languages.length > 1) {
    for (const lang of languages) {
      const other = languages.find(l => l !== lang);
      const src = editions[other];
      if (!src) continue;
      const cands = [src.headline, src.secondary, ...src.sections.flatMap(s => s.articles).slice(0, 3)]
        .filter(Boolean).slice(0, 4)
        .map(a => ({ title: a.title, lead: a.lead, source: a.source, link: a.link, category: a.category }));
      if (!cands.length) continue;
      try {
        const out = await maybeTranslate(cands, lang);
        if (out) {
          editions[lang].translated = out
            .map((t, i) => (t ? {
              title: t.title, lead: t.lead,
              source: cands[i].source, link: cands[i].link,
              category: cands[i].category, categoryLabel: categoryLabel(cands[i].category, lang),
              translatedFrom: other,
            } : null))
            .filter(Boolean);
          console.log(`  ⇄ 跨語言精選 ${other} → ${lang}：${editions[lang].translated.length} 條`);
        }
      } catch (e) {
        console.warn(`  ⚠ 跨語言翻譯失敗（跳過）：${e.message?.slice(0, 120)}`);
      }
    }
  }

  // 天氣：免 key 源，失敗降級為 null（渲染層隱藏天氣方塊）
  let weather = null;
  try {
    const byLang = {};
    for (const lang of languages) byLang[lang] = await fetchWeather(CONFIG.weather ?? {}, limits.fetchTimeoutMs, lang);
    weather = byLang;
    console.log(`\n✓ 天氣 ${weather[languages[0]].city} ${weather[languages[0]].desc} ${weather[languages[0]].temp}`);
  } catch (e) {
    console.warn(`⚠ 天氣獲取失敗（忽略）：${e.message}`);
  }

  const issue = {
    issue: issueNo(dateStr),
    date: dateStr,
    languages,
    lunar: Object.fromEntries(languages.map(l => [l, lunarLine(dateStr, l)])),
    weather,
    editions,
    meta: {
      generatedAt: new Date(now).toISOString(),
      sources: {
        configured: total,
        ok: okCount,
        zhSources: zhSrc,
        enSources: enSrc,
        failed: failed.map(f => ({ name: f.name, reason: f.reason })),
      },
      funnels,
      layout: Object.fromEntries(languages.map(l => [l, editions[l]?.stats])),
    },
  };

  if (dryRun) {
    console.log('\n［DRY RUN］不寫文件。');
    return;
  }

  const outDir = join(ROOT, 'issues');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${dateStr}.json`);
  writeFileSync(outPath, JSON.stringify(issue, null, 2) + '\n');
  writeFileSync(join(outDir, `${dateStr}.meta.json`), JSON.stringify(issue.meta, null, 2) + '\n');

  // OG 分享圖：每語言一張，失敗降級為警告（站點仍可構建，僅 og:image 缺失）
  for (const lang of languages) {
    try {
      console.log(`✓ ${await renderOg(issue, dateStr, { lang })}`);
    } catch (e) {
      console.warn(`⚠ OG 圖（${lang}）生成失敗（忽略）：${e.message?.slice(0, 200)}`);
    }
  }

  console.log(`\n已寫出 ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
