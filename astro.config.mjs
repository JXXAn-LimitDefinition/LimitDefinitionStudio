// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 在 CI（GitHub Actions）里根据仓库名自动推导 site 与 base；本地开发用默认值。
// 这样无论仓库名大小写/是否换名，产物地址都正确。
const [owner = 'JXXAn-LimitDefinition', repoName = 'LimitDefinitionStudio'] = (
  process.env.GITHUB_REPOSITORY || 'JXXAn-LimitDefinition/LimitDefinitionStudio'
).split('/');
const isUserSite = /\.github\.io$/.test(repoName);

const base = process.env.BASE_PATH || (isUserSite ? '/' : `/${repoName}/`);
const SITE =
  process.env.SITE_URL ||
  (isUserSite ? `https://${owner}.github.io` : `https://${owner}.github.io/${repoName}`);

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
