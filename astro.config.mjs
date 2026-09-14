import { defineConfig } from 'astro/config';

// 靜態輸出；路由 / 與 /issue/[date]/。零 JS，樣式全部走 public/。
// GitHub Pages 項目頁部署在 <user>.github.io/DailyNews/ 子路徑下，
// 站內連結統一經 src/lib/base.mjs 的 BASE 前綴（本地 dev base='/' 不受影響）。
export default defineConfig({
  site: 'https://tech--man.github.io',
  base: '/DailyNews',
});
