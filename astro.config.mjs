// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages 项目站点可工作于子路径；默认 '/'（用户仓库根）。部署时按仓库名调整 base。
const base = process.env.BASE_PATH || '/';

// site 用于生成绝对 URL 与 sitemap。此处为 GitHub Pages 项目站点地址；若换仓库名或绑自定义域名，改这里。
const SITE = 'https://jxxan-limitdefinition.github.io/limitdefinitionstudio';

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
