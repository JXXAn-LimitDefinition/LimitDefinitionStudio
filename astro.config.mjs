// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages 项目站点可工作于子路径；默认 '/'（用户仓库根）。部署时按仓库名调整 base。
const base = process.env.BASE_PATH || '/';

// site 用于生成绝对 URL 与 sitemap。上线前替换为真实域名/Pages 地址。
const SITE = 'https://limitdefinitionstudio.github.io';

export default defineConfig({
  site: SITE,
  base,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'one-dark-pro',
    },
  },
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
});
