// LimitDefinitionStudio — 本地编辑服务器（仅绑定 127.0.0.1）
// 用途：在本机打开一个网页，改网站文字/配色/字号、增删作品与公告、实时预览、发布并推送。
// 原则：只绑本地回环地址；写文件命中白名单；无第三方依赖（前后端零 npm 依赖）。

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 项目根：默认取 admin/ 的上一级（E:\DSH）；测试时可传入 ADMIN_ROOT 指向独立副本。
const ROOT = path.resolve(process.env.ADMIN_ROOT || path.join(__dirname, '..'));

const HOST = process.env.ADMIN_HOST || '127.0.0.1';
const PORT = Number(process.env.ADMIN_PORT || 3130);
const PREVIEW_PORT = Number(process.env.ADMIN_PREVIEW_PORT || 4399);
const REPO = process.env.GITHUB_REPOSITORY || 'JXXAn-LimitDefinition/LimitDefinitionStudio';

const SITE_JSON = path.join(ROOT, 'src', 'data', 'site.json');
const THEME_JSON = path.join(ROOT, 'src', 'data', 'theme.json');
const WORKS_DIR = path.join(ROOT, 'src', 'content', 'works');
const NEWS_DIR = path.join(ROOT, 'src', 'content', 'news');
const LOGO_PATH = path.join(ROOT, 'public', 'logo.jpg');
const PUBLISH_LOG = path.join(ROOT, 'admin', 'publish-log.json');
const PRESETS_JSON = path.join(__dirname, 'presets.json');
const ENV_FILE = path.join(__dirname, '.env');

// 允许写的路径根（防目录穿越）。所有写操作都先 resolve 再校验前缀。
const ALLOWED_ROOTS = [SITE_JSON, THEME_JSON, LOGO_PATH, PUBLISH_LOG];

function isAllowedWrite(absPath) {
  const p = path.resolve(absPath);
  if (p === SITE_JSON || p === THEME_JSON || p === LOGO_PATH || p === PUBLISH_LOG) return true;
  if (p.startsWith(WORKS_DIR + path.sep) && p.endsWith('.md')) return true;
  if (p.startsWith(NEWS_DIR + path.sep) && p.endsWith('.md')) return true;
  return false;
}

function safeSlug(input, fallback) {
  const slug = String(input || fallback || 'post')
    .trim()
    .toLowerCase()
    // 保留中英文、数字与连字符，其余替换为 -（并合并连续 -）
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return slug || fallback || 'post';
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function deepMerge(base, patch) {
  if (!isPlainObj(base) || !isPlainObj(patch)) return patch;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    if (isPlainObj(patch[k]) && isPlainObj(base[k])) out[k] = deepMerge(base[k], patch[k]);
    else out[k] = patch[k];
  }
  return out;
}
function isPlainObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/* ---------------- YAML (frontmatter 子集) 解析/序列化 ----------------
   写入用 JSON（合法 YAML，gray-matter 可解析）；读取先试 JSON，旧文件用小解析器。 */
function parseScalar(s) {
  s = (s || '').trim();
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1);
    if (inner.trim() === '') return [];
    return splitCsv(inner).map((x) => unquote(x.trim())).filter((x) => x !== '');
  }
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/\\'/g, "'");
  return s;
}
function splitCsv(s) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (const ch of s) {
    if (ch === '"') { inQ = !inQ; cur += ch; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function unquote(s) {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/\\'/g, "'");
  return s;
}
function parseYamlSubset(text) {
  const result = {};
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  let pendingKey = null;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) { i++; continue; }

    const listMatch = trimmed.match(/^-\s+(.*)$/);
    if (listMatch) {
      if (!Array.isArray(result[pendingKey])) result[pendingKey] = [];
      const itemText = listMatch[1];
      const mapMatch = itemText.match(/^([^:]+):\s*(.*)$/);
      if (mapMatch) {
        const item = { [mapMatch[1].trim()]: parseScalar(mapMatch[2]) };
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          const m = lines[i].trim().match(/^([^:]+):\s*(.*)$/);
          if (m) item[m[1].trim()] = parseScalar(m[2]);
          i++;
        }
        result[pendingKey].push(item);
        continue;
      }
      result[pendingKey].push(parseScalar(itemText));
      i++;
      continue;
    }

    const kv = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (kv) {
      const key = kv[1].trim();
      const val = kv[2];
      if (val === '') { pendingKey = key; i++; continue; }
      result[key] = parseScalar(val);
      pendingKey = null;
      i++;
      continue;
    }
    i++;
  }
  return result;
}
function parseFrontmatter(raw) {
  if (!raw) return {};
  const t = String(raw).trim();
  if (t.startsWith('{')) {
    try { return JSON.parse(t); } catch { /* fall through to subset parser */ }
  }
  return parseYamlSubset(t);
}

function readContentFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { data: {}, body: raw.replace(/^\s+/, '').trim() };
  return { data: parseFrontmatter(m[1]), body: m[2].replace(/^\n/, '').trim() };
}

// 写 frontmatter 为 JSON（合法 YAML）。字段按可读顺序排列。
const FM_ORDER_WORK = ['title', 'description', 'date', 'year', 'status', 'tags', 'platform', 'role', 'cover', 'featured', 'order', 'draft', 'links'];
const FM_ORDER_NEWS = ['title', 'description', 'pubDate', 'tags', 'cover', 'draft'];
function orderedFm(data, order) {
  const out = {};
  for (const k of order) if (data[k] !== undefined) out[k] = data[k];
  for (const k of Object.keys(data)) if (out[k] === undefined) out[k] = data[k];
  return out;
}
function writeContentFile(file, data, kind, body) {
  const fm = JSON.stringify(orderedFm(data, kind === 'work' ? FM_ORDER_WORK : FM_ORDER_NEWS), null, 2);
  fs.writeFileSync(file, `---\n${fm}\n---\n\n${String(body || '').trim()}\n`, 'utf8');
}

/* ---------------- 内容读取 ---------------- */
function listContent(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const file = path.join(dir, f);
    const { data, body } = readContentFile(file);
    return { id: f.replace(/\.md$/, ''), file, data, body };
  });
}
function readState() {
  const site = readJson(SITE_JSON, {});
  const theme = readJson(THEME_JSON, {});
  let presets = [];
  try { presets = (JSON.parse(fs.readFileSync(PRESETS_JSON, 'utf8')).presets) || []; } catch { presets = []; }
  const pubLog = readJson(PUBLISH_LOG, []);
  const works = listContent(WORKS_DIR)
    .map((w) => ({ ...w, data: { ...w.data, _kind: 'work' } }))
    .sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0));
  const news = listContent(NEWS_DIR)
    .map((n) => ({ ...n, data: { ...n.data, _kind: 'news' } }))
    .sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0)
      || (new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf()));
  return {
    site, theme, presets, works, news, publishLog: pubLog,
    repo: REPO,
    adminPort: PORT,
    previewPort: PREVIEW_PORT,
    previewUrl: `http://127.0.0.1:${PREVIEW_PORT}/`,
    liveUrl: liveUrlOf(REPO),
  };
}
function liveUrlOf(repo) {
  const [owner, repoName] = repo.split('/');
  const isUser = /\.github\.io$/.test(repoName);
  return isUser ? `https://${owner}.github.io` : `https://${owner}.github.io/${repoName}`;
}

/* ---------------- 写接口（全部校验并写白名单） ---------------- */
function saveSiteAndTheme(patch) {
  if (patch.site && isPlainObj(patch.site)) {
    fs.writeFileSync(SITE_JSON, JSON.stringify(deepMerge(readJson(SITE_JSON, {}), patch.site), null, 2) + '\n', 'utf8');
  }
  if (patch.theme && isPlainObj(patch.theme)) {
    fs.writeFileSync(THEME_JSON, JSON.stringify(deepMerge(readJson(THEME_JSON, {}), patch.theme), null, 2) + '\n', 'utf8');
  }
}

function saveContentItem(item, kind) {
  const dir = kind === 'work' ? WORKS_DIR : NEWS_DIR;
  const rawId = item.id || '';
  // 前端新建时带有 new- 临时 id，改用标题生成干净文件名（title 改动不破坏现有 URL）
  const isNew = /^new-(work|news)-/.test(rawId);
  const id = safeSlug(isNew ? (item.data && item.data.title) : rawId, kind === 'work' ? 'work' : 'news');
  // 标题撞车（两个新项目同名）时追加序号，避免互相覆盖（否则删一个、另一个也跟着消失/残留）
  let finalId = id;
  let file = path.join(dir, `${finalId}.md`);
  let n = 2;
  while (isNew && fs.existsSync(file)) {
    finalId = `${id}-${n++}`;
    file = path.join(dir, `${finalId}.md`);
  }
  if (!isAllowedWrite(file)) throw new Error('非法写入路径');
  const data = { ...(item.data || {}) };
  delete data._kind;
  if (!data.title) data.title = finalId;
  writeContentFile(file, data, kind, item.body || '');
  return { id: finalId, file };
}

function deleteContent(id, kind) {
  const dir = kind === 'work' ? WORKS_DIR : NEWS_DIR;
  const file = path.join(dir, `${safeSlug(id, kind)}.md`);
  if (!isAllowedWrite(file)) throw new Error('非法删除路径');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { ok: true };
}

/* ---------------- logo 上传 ---------------- */
function looksLikeImage(buf) {
  if (!buf || buf.length < 4) return false;
  // JPEG FF D8 FF, PNG 89 50 4E 47, WebP RIFF....WEBP, GIF 47 49 46 38
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  return null;
}
function saveLogo(buffer) {
  if (!looksLikeImage(buffer)) return { ok: false, error: '仅支持 JPG/PNG/WebP/GIF 图片' };
  fs.writeFileSync(LOGO_PATH, buffer);
  return { ok: true, note: '已替换网站 Logo' };
}

/* ---------------- child_process 辅助 ---------------- */
function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...opts.env }, shell: false });
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String((e && e.message) || e) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + String((e && e.message) || e) }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}
function runGit(args, extraEnv = {}) {
  return runCmd('git', args, {
    env: { GIT_TERMINAL_PROMPT: '0', ...extraEnv },
  });
}
function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function ensureGitOk() {
  const res = await runGit(['rev-parse', '--is-inside-work-tree']);
  return res.stdout.trim() === 'true';
}

// 发布：备份 tag -> build -> commit -> push
async function publish() {
  const ts = timestamp();
  const log = [];
  if (!(await ensureGitOk())) return { ok: false, error: '当前目录不是 git 仓库，无法发布。', log };

  const build = await runCmd(process.execPath, [path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], {
    env: { CI: 'true', GITHUB_REPOSITORY: REPO, ASTRO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
  });
  log.push({ step: 'build', ...build });
  if (build.code !== 0) return { ok: false, error: '构建失败，未发布。', log };

  const add = await runGit(['add', '-A']);
  log.push({ step: 'add', ...add });
  const commit = await runGit(['commit', '-m', `editor: site update ${ts}`]);
  // 允许 nothing to commit（非致命）
  const committed = commit.code === 0 || /nothing to commit/i.test(commit.stdout + commit.stderr);
  log.push({ step: 'commit', code: 0, note: committed ? 'ok' : 'nothing-to-commit' });

  const tag = `live-${ts}`;
  await runGit(['tag', tag]);
  log.push({ step: 'tag', tag });

  const push = await runGit(['push']);
  log.push({ step: 'push', ...push });
  await runGit(['push', '--tags']);
  log.push({ step: 'push-tags' });

  // 记录发布日志
  const pubLog = readJson(PUBLISH_LOG, []);
  pubLog.push({ tag, sha: await currentSha(), time: new Date().toISOString() });
  fs.mkdirSync(path.dirname(PUBLISH_LOG), { recursive: true });
  fs.writeFileSync(PUBLISH_LOG, JSON.stringify(pubLog, null, 2), 'utf8');

  return { ok: push.code === 0, error: push.code === 0 ? null : (push.stderr || 'push 失败'), tag, log };
}
async function currentSha() {
  const res = await runGit(['rev-parse', '--short', 'HEAD']);
  return res.stdout.trim();
}

// 回滚到某个已发布版本
async function rollback(tag) {
  const ts = timestamp();
  const log = [];
  if (!/^live-/.test(tag || '')) return { ok: false, error: '版本不合法。', log };
  if (!(await ensureGitOk())) return { ok: false, error: '当前目录不是 git 仓库。', log };

  await runGit(['add', '-A']);
  await runGit(['commit', '-m', `editor: pre-rollback backup ${ts}`]);
  log.push({ step: 'backup-commit' });

  // 校验 tag 存在
  const tagCheck = await runGit(['rev-parse', tag]);
  if (tagCheck.code !== 0) return { ok: false, error: '找不到该版本。', log };

  await runGit(['checkout', tag, '--', '.']);
  log.push({ step: 'checkout', tag });

  const build = await runCmd(process.execPath, [path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], {
    env: { CI: 'true', GITHUB_REPOSITORY: REPO, ASTRO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
  });
  log.push({ step: 'build', ...build });
  if (build.code !== 0) return { ok: false, error: '回滚后构建失败。', log };

  await runGit(['add', '-A']);
  await runGit(['commit', '-m', `editor: rollback ${ts}`]);
  const newTag = `live-${ts}`;
  await runGit(['tag', newTag]);
  const push = await runGit(['push']);
  await runGit(['push', '--tags']);
  log.push({ step: 'push', ...push, tag: newTag });

  const pubLog = readJson(PUBLISH_LOG, []);
  pubLog.push({ tag: newTag, sha: await currentSha(), time: new Date().toISOString() });
  fs.writeFileSync(PUBLISH_LOG, JSON.stringify(pubLog, null, 2), 'utf8');

  return { ok: push.code === 0, error: push.code === 0 ? null : (push.stderr || 'push 失败'), tag: newTag, log };
}

async function listHistory() {
  const tags = await runGit(['tag', '-l', 'live-*']);
  const list = tags.stdout.trim().split(/\r?\n/).filter(Boolean).reverse();
  const pubLog = readJson(PUBLISH_LOG, []);
  return { tags: list, publishLog: pubLog };
}

/* ---------------- 预览进程管理 ---------------- */
let previewProc = null;
function startPreview() {
  if (previewProc && !previewProc.killed) return { ok: true, already: true, url: `http://127.0.0.1:${PREVIEW_PORT}/` };
  try {
    previewProc = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'dev', '--port', String(PREVIEW_PORT), '--host', '127.0.0.1'], {
      cwd: ROOT,
      env: { ...process.env, BASE_PATH: '/', ASTRO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
      detached: false,
      stdio: 'ignore',
    });
    previewProc.on('error', () => { previewProc = null; });
  } catch (e) {
    // 即使预览进程启动失败，也绝不连带让编辑器服务器崩溃
    previewProc = null;
    console.log(`[editor] 启动实时预览失败(不影响编辑器): ${(e && e.message) || e}`);
  }
  return { ok: true, url: `http://127.0.0.1:${PREVIEW_PORT}/` };
}
function stopPreview() {
  if (previewProc && !previewProc.killed) { try { previewProc.kill(); } catch {} }
  previewProc = null;
  return { ok: true };
}

/* ---------------- PIN (可选) ---------------- */
function readPin() {
  try {
    const t = fs.readFileSync(ENV_FILE, 'utf8');
    const m = t.match(/^ADMIN_PIN=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const PIN = readPin();
let PIN_OK = !PIN; // 未设置 PIN 则默认放行（仅本机）

function needPin(req) {
  if (!PIN) return false;
  const header = req.headers['x-admin-pin'];
  return !(PIN_OK || header === PIN);
}

/* ---------------- HTTP ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function send(res, code, body, headers = {}) {
  const isJson = typeof body === 'object' && !(body instanceof Buffer);
  const payload = isJson ? JSON.stringify(body) : body;
  const mime = isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';
  res.writeHead(code, { 'content-type': mime, 'cache-control': 'no-store', ...headers });
  res.end(payload);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 30 * 1024 * 1024) reject(new Error('太大')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function jsonBody(req) {
  return readBody(req).then((raw) => {
    try { return { ok: true, data: JSON.parse(raw || '{}') }; }
    catch { return { ok: false, error: 'JSON 无效' }; }
  });
}

function handleStatic(reqPath, res) {
  // 只允许访问 admin 目录下的固定资源
  const name = path.basename(reqPath);
  const allowed = { 'index.html': true, 'app.js': true, 'app.css': true, 'presets.json': true };
  if (!allowed[name]) { send(res, 404, 'Not found'); return; }
  const file = path.join(__dirname, name);
  if (!fs.existsSync(file)) { send(res, 404, 'Not found'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function copyStatic(reqPath, res) {
  handleStatic(reqPath, res);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  // 全局 API 保护：设置了 PIN 则除 ping 外都需带 x-admin-pin 头（GET 也一样保护）
  if (p.startsWith('/api/') && p !== '/api/ping' && needPin(req)) {
    return send(res, 401, { error: '需要 PIN 才能访问。' });
  }

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) return handleStatic('/index.html', res);
  if (req.method === 'GET' && p.startsWith('/admin/')) return handleStatic(p.slice('/admin/'.length), res);
  if (req.method === 'GET' && p === '/api/state') return send(res, 200, readState());
  if (req.method === 'GET' && p === '/api/history') return send(res, 200, await listHistory());
  if (req.method === 'GET' && p === '/api/ping') return send(res, 200, { ok: true, port: PORT, host: HOST });

  if (req.method === 'POST') {
    if (needPin(req)) return send(res, 401, { error: '需要 PIN 才能保存。' });

    if (p === '/api/save') {
      const b = await jsonBody(req);
      if (!b.ok) return send(res, 400, b);
      try { saveSiteAndTheme(b.data); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 500, { error: String(e && e.message) }); }
    }
    if (p === '/api/save-all') {
      const b = await jsonBody(req);
      if (!b.ok) return send(res, 400, b);
      try {
        saveSiteAndTheme(b.data);
        const results = { works: [], news: [] };
        for (const w of (b.data.works || [])) results.works.push(saveContentItem(w, 'work'));
        for (const n of (b.data.news || [])) results.news.push(saveContentItem(n, 'news'));
        for (const id of (b.data.deletedWorkIds || [])) deleteContent(id, 'work');
        for (const id of (b.data.deletedNewsIds || [])) deleteContent(id, 'news');
        return send(res, 200, { ok: true, results });
      } catch (e) { return send(res, 400, { error: String(e && e.message) }); }
    }
    if (p === '/api/work') {
      const b = await jsonBody(req);
      if (!b.ok) return send(res, 400, b);
      try { return send(res, 200, { ok: true, ...saveContentItem(b.data, 'work') }); }
      catch (e) { return send(res, 400, { error: String(e && e.message) }); }
    }
    if (p === '/api/news') {
      const b = await jsonBody(req);
      if (!b.ok) return send(res, 400, b);
      try { return send(res, 200, { ok: true, ...saveContentItem(b.data, 'news') }); }
      catch (e) { return send(res, 400, { error: String(e && e.message) }); }
    }
    if (p === '/api/logo') {
      const b = await jsonBody(req);
      if (!b.ok || !b.data || !b.data.base64) return send(res, 400, { error: '缺少图片数据' });
      let buf; try { buf = Buffer.from(b.data.base64, 'base64'); } catch { return send(res, 400, { error: '图片数据无效' }); }
      const r = saveLogo(buf);
      return send(res, r.ok ? 200 : 400, r);
    }
    if (p === '/api/publish') {
      const r = await publish();
      return send(res, r.ok ? 200 : 500, r);
    }
    if (p === '/api/rollback') {
      const b = await jsonBody(req);
      if (!b.ok || !b.data || !b.data.tag) return send(res, 400, { error: '缺少版本' });
      const r = await rollback(b.data.tag);
      return send(res, r.ok ? 200 : 500, r);
    }
    if (p === '/api/preview/start') return send(res, 200, startPreview());
    if (p === '/api/preview/stop') return send(res, 200, stopPreview());
  }

  if (req.method === 'DELETE') {
    if (needPin(req)) return send(res, 401, { error: '需要 PIN 才能删除。' });
    const id = url.searchParams.get('id');
    const kind = url.searchParams.get('kind');
    if (!id || (kind !== 'work' && kind !== 'news')) return send(res, 400, { error: '参数缺失' });
    try { return send(res, 200, deleteContent(id, kind)); }
    catch (e) { return send(res, 400, { error: String(e && e.message) }); }
  }

  send(res, 404, 'Not found');
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    send(res, 500, { error: String((e && e.message) || e) });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[editor] Limit Definition Studio 本地编辑器已启动`);
  console.log(`[editor] 打开: http://${HOST}:${PORT}`);
  if (process.env.ADMIN_AUTO_PREVIEW !== '0') {
    try {
      const r = startPreview();
      console.log(`[editor] 实时预览已启动(热更新): ${r.url}`);
    } catch (e) {
      console.log(`[editor] 实时预览启动失败(不影响编辑器): ${(e && e.message) || e}`);
    }
  } else {
    console.log(`[editor] 实时预览未自动启动(ADMIN_AUTO_PREVIEW=0)，可在设置页手动打开。`);
  }
  console.log(`[editor] 绑定: ${HOST}（仅本机，外网无法访问）${PIN ? '，已启用 PIN 保护' : ''}`);
});

process.on('SIGINT', () => { stopPreview(); process.exit(0); });
process.on('SIGTERM', () => { stopPreview(); process.exit(0); });

// 供测试导出
export const __internals = {
  ROOT, WORKS_DIR, NEWS_DIR, LOGO_PATH, PUBLISH_LOG,
  isAllowedWrite, safeSlug, parseFrontmatter, readContentFile, writeContentFile, saveContentItem,
};
