# Limit Definition Studio — 官网

> **超越未知，定义极限。**

极限定义游戏工作室（Limit Definition Studio）的官方展示站点。

## 技术栈

- **Astro**（静态生成）— 内容型展示，SEO 友好，产物为纯静态 HTML。
- **pnpm** 包管理。
- 自研 CSS 设计系统（无 UI 框架），深色高对比 + 黑/白/红 品牌调性。
- `@astrojs/sitemap` 自动生成站点地图。

## 开发

```bash
pnpm install       # 安装依赖
pnpm dev           # 本地开发（默认 http://localhost:4321）
pnpm build         # 静态构建，输出到 dist/
pnpm preview       # 本地预览构建产物
pnpm check         # 类型检查（需额外安装 @astrojs/check + typescript）
```

> 构建脚本：`astro build`。若你在受限环境（如沙箱）下遇到 `spawn EPERM`（Vite 需启动 esbuild 子进程），需授予构建进程访问权限或在正常终端执行。

## 目录结构

```
src/
  content/
    works/        作品条目（markdown，frontmatter + 正文）
    news/         动态/开发日志（markdown）
  lib/content.ts  用 Vite import.meta.glob 读取内容（稳定、无需内容层）
  layouts/        BaseLayout（meta/OG/Nav/Footer）
  components/     Nav/Footer/Hero/ProjectCard/TeamCard/NewsCard/SectionHeading/Cta
  pages/          路由（/ /works/[slug] /about /team /contact /news/[slug] /404）
  styles/         global.css（设计 token + 基础样式）
public/           logo.jpg / robots.txt
```

## 更新内容

- **作品**：在 `src/content/works/` 新增 `<slug>.md`，frontmatter 支持：
  `title, description, date, year, status(released|in-development|prototype), tags, platform, role, featured, order, cover, links[{label,url}]`。
- **动态/日志**：在 `src/content/news/` 新增 `<slug>.md`，frontmatter 支持：
  `title, description, pubDate, tags, cover, draft`。
- 卡片自动读取，修改后运行 `pnpm build` 即可。

## 部署（GitHub Pages）

1. 把仓库推到 GitHub，默认分支设为 `main`。
2. 仓库 **Settings → Pages**：Source 选 **GitHub Actions**。
3. 推送后自动触发 `.github/workflows/deploy.yml`，产出 `dist/` 并发布：`https://<user>.github.io/<repo>/`。

### 自定义域名（可选）

- 上传 `CNAME` 到 `public/` 或 Pages 里绑定域名；并在 DNS 加 CNAME 记录。
- 更新 `astro.config.mjs` 里的 `site` 为你的正式域名（会影响 sitemap 与绝对链接）。
- 子路径部署已由 workflow 自动计算 `BASE_PATH`；放到 `*.github.io` 根仓库时自动为 `/`。

### 上线前检查

参考 `.dsh/site-requirements.yml` 的验收清单，并确保：
- `pnpm build` 通过；`dist/` 内容完整。
- 三档响应式与键盘/对比度自查。
- 每页 meta/OG、`sitemap`、`robots.txt` 齐全。

## 品牌

基于工作室图标 （已拷入 `src/assets` 与 `public`）。规范英文名 **LimitDefinitionStudio**，核心理念 **超越未知，定义极限**。

---

*项目需求基线见 `.dsh/site-requirements.yml`（本地维护，已被 gitignore）。*
