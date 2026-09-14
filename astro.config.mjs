import { defineConfig } from 'astro/config';

// 靜態輸出；路由 / 與 /issue/[date]/。零 JS，樣式全部走 public/。
export default defineConfig({
  site: 'https://dailynews.example.org',
});
