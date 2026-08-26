/* LimitDefinitionStudio — 本地编辑器前端 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let S = null; // 全局状态：site / theme / works / news / deletedWorkIds / deletedNewsIds
  let PIN_OK = false;
  let previewTouched = false;

  /* ---------- 路径读写 helper ---------- */
  function segs(path) {
    return path.split('.').flatMap((s) => {
      const m = s.match(/^([^\[]+)\[(\d+)\]$/);
      return m ? [m[1], Number(m[2])] : [s];
    });
  }
  function setPath(root, path, val) {
    const ss = segs(path);
    let cur = root;
    for (let i = 0; i < ss.length - 1; i++) {
      if (cur[ss[i]] == null) cur[ss[i]] = {};
      cur = cur[ss[i]];
    }
    cur[ss[ss.length - 1]] = val;
  }
  function getPath(root, path) {
    let cur = root;
    for (const s of segs(path)) { if (cur == null) return undefined; cur = cur[s]; }
    return cur;
  }
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

  /* ---------- 表单字段渲染 ---------- */
  function field(label, path, value, o = {}) {
    const type = o.type || 'text';
    const attrs = `data-path="${esc(path)}"`;
    const listAttr = o.list ? ' data-list="1"' : '';
    const numAttr = o.num ? ' data-num="1"' : '';
    let input;
    if (type === 'textarea') input = `<textarea ${attrs} rows="${o.rows || 3}">${esc(value)}</textarea>`;
    else if (type === 'select') input = `<select ${attrs}>${(o.options || []).map((op) => `<option value="${esc(op)}" ${String(op) === String(value) ? 'selected' : ''}>${esc(op)}</option>`).join('')}</select>`;
    else input = `<input type="${type}" ${attrs}${listAttr}${numAttr} value="${esc(value)}">`;
    return `<div class="form-group"><label>${esc(label)}</label>${input}${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}</div>`;
  }

  function repeatCard(title, pathBase, fields, onRemove) {
    const items = getPath(S, pathBase) || [];
    const inner = items.map((it, i) => {
      const body = fields(i).map((f) => f).join('');
      return `<div class="card">
        <div class="card-head"><span class="card-title">${esc(title)} #${i + 1}</span>
          <button class="btn tiny danger" data-remove="${esc(pathBase)}" data-index="${i}">删除</button>
        </div>
        <div class="card-body">${body}</div>
      </div>`;
    }).join('');
    return `<div class="sec-title">${esc(title)}清单 <button class="btn tiny" data-add="${esc(pathBase)}">＋ 新增</button></div>${inner || '<p class="muted">（暂无）</p>'}`;
  }

  /* ---------- 内容面板 ---------- */
  function renderContent() {
    const s = S.site;
    let h = '';
    h += `<div class="sec-title">品牌</div>`;
    h += `<div class="row c2">${field('英文名', 'site.brand.name', s.brand.name)}${field('中文名', 'site.brand.nameCn', s.brand.nameCn)}</div>`;
    h += `<div class="row c2">${field('品牌标语', 'site.brand.tagline', s.brand.tagline)}${field('副标语', 'site.brand.subtitle', s.brand.subtitle)}</div>`;

    h += `<div class="sec-title">首页首屏（Hero）</div>`;
    h += field('小标题 kicker', 'site.hero.kicker', s.hero.kicker);
    h += field('主标题', 'site.hero.title', s.hero.title);
    h += field('副标题', 'site.hero.subtitle', s.hero.subtitle);
    h += field('一句话介绍', 'site.hero.lede', s.hero.lede, { type: 'textarea', rows: 2 });

    h += `<div class="sec-title">板块标题</div>`;
    h += `<div class="row c3">${field('作品·kicker', 'site.sections.works.kicker', s.sections.works.kicker)}${field('作品·标题', 'site.sections.works.title', s.sections.works.title)}${field('作品·英文', 'site.sections.works.en', s.sections.works.en)}</div>`;
    h += `<div class="row c3">${field('作品·查看更多', 'site.sections.works.seeAll', s.sections.works.seeAll)}${field('团队·kicker', 'site.sections.team.kicker', s.sections.team.kicker)}${field('团队·标题', 'site.sections.team.title', s.sections.team.title)}</div>`;
    h += `<div class="row c3">${field('动态·kicker', 'site.sections.news.kicker', s.sections.news.kicker)}${field('动态·标题', 'site.sections.news.title', s.sections.news.title)}${field('动态·英文', 'site.sections.news.en', s.sections.news.en)}</div>`;

    h += `<div class="sec-title">定位</div>`;
    h += field('定位·kicker', 'site.positioning.kicker', s.positioning.kicker);
    h += field('定位·标题', 'site.positioning.title', s.positioning.title, { type: 'textarea', rows: 2 });
    h += repeatCard('定位项', 'site.positioning.items', (i) => [
      field('标题', `site.positioning.items[${i}].title`, s.positioning.items[i].title),
      field('描述', `site.positioning.items[${i}].desc`, s.positioning.items[i].desc, { type: 'textarea', rows: 2 }),
    ]);

    h += `<div class="sec-title">关于我们</div>`;
    h += `<div class="row c2">${field('标题', 'site.about.heading', s.about.heading)}${field('kicker', 'site.about.kicker', s.about.kicker)}</div>`;
    h += field('口号', 'site.about.slogan', s.about.slogan);
    h += field('正文', 'site.about.lead', s.about.lead, { type: 'textarea', rows: 4 });
    h += field('理念·标题', 'site.about.missionTitle', s.about.missionTitle);
    h += field('理念', 'site.about.mission', s.about.mission, { type: 'textarea', rows: 3 });

    h += `<div class="sec-title">能力范围</div>`;
    h += field('kicker', 'site.capabilities.kicker', s.capabilities.kicker);
    h += field('标题', 'site.capabilities.title', s.capabilities.title);
    h += repeatCard('能力项', 'site.capabilities.items', (i) => [
      field('标题', `site.capabilities.items[${i}].title`, s.capabilities.items[i].title),
      field('描述', `site.capabilities.items[${i}].desc`, s.capabilities.items[i].desc, { type: 'textarea', rows: 2 }),
    ]);

    h += `<div class="sec-title">历程</div>`;
    h += repeatCard('历程项', 'site.timeline.items', (i) => [
      field('年份', `site.timeline.items[${i}].year`, s.timeline.items[i].year),
      field('内容', `site.timeline.items[${i}].text`, s.timeline.items[i].text, { type: 'textarea', rows: 2 }),
    ]);

    h += `<div class="sec-title">团队</div>`;
    h += repeatCard('成员', 'site.team', (i) => [
      field('姓名', `site.team[${i}].name`, s.team[i].name),
      field('职位', `site.team[${i}].role`, s.team[i].role),
      field('简介', `site.team[${i}].bio`, s.team[i].bio, { type: 'textarea', rows: 3 }),
    ]);

    h += `<div class="sec-title">联系 / 合作</div>`;
    h += `<div class="row c2">${field('kicker', 'site.contact.kicker', s.contact.kicker)}${field('标题', 'site.contact.title', s.contact.title)}</div>`;
    h += field('英文', 'site.contact.en', s.contact.en);
    h += field('引导语', 'site.contact.lead', s.contact.lead, { type: 'textarea', rows: 2 });
    h += field('邮箱', 'site.contact.email', s.contact.email);
    h += field('表单提示', 'site.contact.formNote', s.contact.formNote);
    h += repeatCard('社交链接', 'site.contact.socials', (i) => [
      field('平台', `site.contact.socials[${i}].label`, s.contact.socials[i].label),
      field('账号', `site.contact.socials[${i}].handle`, s.contact.socials[i].handle),
      field('链接 URL', `site.contact.socials[${i}].url`, s.contact.socials[i].url),
    ]);

    h += `<div class="sec-title">页脚</div>`;
    h += field('哲学标语', 'site.footer.philosophy', s.footer.philosophy);
    h += field('备注', 'site.footer.note', s.footer.note);

    $('#panel-content').innerHTML = h;
  }

  /* ---------- 主题面板 ---------- */
  function renderTheme() {
    const theme = S.theme;
    const c = theme.colors;
    let h = '';
    h += `<div class="sec-title">预设主题</div><div class="presets">`;
    (S.presets || []).forEach((p) => {
      const active = (c.accent || '').toLowerCase() === (p.theme.colors.accent || '').toLowerCase();
      h += `<div class="preset ${active ? 'active' : ''}" data-preset="${esc(p.key)}">
        <div class="swatch">
          <span style="background:${esc(p.theme.colors.accent)}"></span>
          <span style="background:${esc(p.theme.colors.bg)}"></span>
          <span style="background:${esc(p.theme.colors.surface)}"></span>
          <span style="background:${esc(p.theme.colors.text)}"></span>
        </div>
        <div class="preset-label">${esc(p.label)}</div>
        <div class="preset-desc">${esc(p.desc)}</div>
      </div>`;
    });
    h += `</div>`;

    h += `<div class="sec-title">颜色（高级）</div>`;
    h += `<div class="row c2">${field('主色', 'theme.colors.accent', c.accent, { type: 'color' })}${field('主色深', 'theme.colors.accentDeep', c.accentDeep, { type: 'color' })}</div>`;
    h += `<div class="row c2">${field('背景', 'theme.colors.bg', c.bg, { type: 'color' })}${field('次背景', 'theme.colors.bg2', c.bg2, { type: 'color' })}</div>`;
    h += `<div class="row c2">${field('卡片', 'theme.colors.surface', c.surface, { type: 'color' })}${field('描边', 'theme.colors.border', c.border, { type: 'color' })}</div>`;
    h += `<div class="row c2">${field('文字', 'theme.colors.text', c.text, { type: 'color' })}${field('弱文字', 'theme.colors.textSoft', c.textSoft, { type: 'color' })}</div>`;
    h += field('更弱的文字', 'theme.colors.textMuted', c.textMuted, { type: 'color' });

    h += `<div class="sec-title">字号（高级）</div>`;
    h += field('超大标题', 'theme.sizes.hero', theme.sizes.hero, { hint: '例: clamp(2.6rem,7vw,5.4rem)' });
    h += field('一级标题', 'theme.sizes.h1', theme.sizes.h1);
    h += field('二级标题', 'theme.sizes.h2', theme.sizes.h2);
    h += field('三级标题', 'theme.sizes.h3', theme.sizes.h3);
    h += field('正文', 'theme.sizes.body', theme.sizes.body);
    h += field('小字', 'theme.sizes.small', theme.sizes.small);

    h += `<div class="sec-title">动画与圆角</div>`;
    h += `<div class="row c2">${field('圆角', 'theme.radius.base', theme.radius.base)}${field('大圆角', 'theme.radius.lg', theme.radius.lg)}</div>`;
    h += field('动效时长', 'theme.motion.speed', theme.motion.speed, { hint: '例: 0.5s' });

    $('#panel-theme').innerHTML = h;
  }

  /* ---------- 作品 / 动态 面板 ---------- */
  const WORK_STATUS = ['in-development', 'released', 'prototype'];
  const STATUS_LABEL = { 'in-development': '开发中', released: '已发布', prototype: '原型' };

  function renderWorks() {
    const items = S.works;
    let h = `<div class="sec-title">作品（${items.length}） <button class="btn tiny" data-new-work="1">＋ 新建作品</button></div>`;
    h += `<div class="hint">勾选「草稿」的作品不会出现在线上预览与正式网站。</div>`;
    if (!items.length) h += `<p class="muted">（还没有作品，点右上角新建）</p>`;
    items.forEach((w, i) => {
      const d = w.data || {};
      const isDraft = !!d.draft;
      h += `<div class="item" data-item="${i}">
        <div class="item-head" data-toggle="${i}">
          <span class="item-title">${esc(d.title || w.id)}</span>
          ${isDraft ? '<span class="item-badge">草稿</span>' : ''}
          <span class="item-actions">
            <button class="btn tiny danger" data-del-work="${i}">删除</button>
            <button class="btn tiny" data-toggle="${i}">展开/收起</button>
          </span>
        </div>
        <div class="item-body hidden">
          <div class="inner">
            <div class="row c2">${field('标题', `works[${i}].data.title`, d.title)}${field('日期', `works[${i}].data.date`, d.date, { type: 'date' })}</div>
            <div class="row c2">${field('年份', `works[${i}].data.year`, d.year, { type: 'number' })}${field('状态', `works[${i}].data.status`, d.status, { type: 'select', options: WORK_STATUS })}</div>
            ${field('描述', `works[${i}].data.description`, d.description, { type: 'textarea', rows: 3 })}
            <div class="row c2">${field('标签（逗号分隔）', `works[${i}].data.tags`, (d.tags || []).join(', '), { list: 1 })}${field('平台（逗号分隔）', `works[${i}].data.platform`, (d.platform || []).join(', '), { list: 1 })}</div>
            <div class="row c2">${field('担当角色', `works[${i}].data.role`, d.role || '')}${field('封面图路径（可选）', `works[${i}].data.cover`, d.cover || '')}</div>
            <div class="row c2">
              <label class="row"><input type="checkbox" data-path="works[${i}].data.featured" data-check="1" ${d.featured ? 'checked' : ''}> 首页推荐</label>
              <label class="row"><input type="checkbox" data-path="works[${i}].data.draft" data-check="1" ${isDraft ? 'checked' : ''}> 草稿（不发布）</label>
            </div>
            <div class="form-group"><label>正文（Markdown）</label><textarea data-path="works[${i}].body" rows="10">${esc(w.body || '')}</textarea>
              <div class="hint">支持 **加粗**、## 标题、- 列表、> 引用。右边预览即成品。</div></div>
          </div>
        </div>
      </div>`;
    });
    $('#panel-works').innerHTML = h;
  }

  function renderNews() {
    const items = S.news;
    let h = `<div class="sec-title">动态 / 公告（${items.length}） <button class="btn tiny" data-new-news="1">＋ 新建公告</button></div>`;
    h += `<div class="hint">勾选「草稿」的公告不会发布到线上。</div>`;
    if (!items.length) h += `<p class="muted">（还没有动态，点右上角新建）</p>`;
    items.forEach((n, i) => {
      const d = n.data || {};
      const isDraft = !!d.draft;
      h += `<div class="item" data-item="${i}">
        <div class="item-head" data-toggle="${i}">
          <span class="item-title">${esc(d.title || n.id)}</span>
          ${isDraft ? '<span class="item-badge">草稿</span>' : ''}
          <span class="item-actions">
            <button class="btn tiny danger" data-del-news="${i}">删除</button>
            <button class="btn tiny" data-toggle="${i}">展开/收起</button>
          </span>
        </div>
        <div class="item-body hidden">
          <div class="inner">
            <div class="row c2">${field('标题', `news[${i}].data.title`, d.title)}${field('日期', `news[${i}].data.pubDate`, d.pubDate, { type: 'date' })}</div>
            ${field('描述', `news[${i}].data.description`, d.description, { type: 'textarea', rows: 3 })}
            ${field('标签（逗号分隔）', `news[${i}].data.tags`, (d.tags || []).join(', '), { list: 1 })}
            <label class="row"><input type="checkbox" data-path="news[${i}].data.draft" data-check="1" ${isDraft ? 'checked' : ''}> 草稿（不发布）</label>
            <div class="form-group"><label>正文（Markdown）</label><textarea data-path="news[${i}].body" rows="8">${esc(n.body || '')}</textarea></div>
          </div>
        </div>
      </div>`;
    });
    $('#panel-news').innerHTML = h;
  }

  /* ---------- 设置面板 ---------- */
  function renderSettings() {
    let h = '';
    h += `<div class="sec-title">网站 Logo（图片）</div>`;
    h += `<div class="card"><div class="card-head"><span class="card-title">上传替换 Logo</span></div>
      <div class="card-body">
        <input type="file" id="logo-file" accept="image/jpeg,image/png,image/webp,image/gif">
        <button class="btn" id="btn-upload-logo">上传并应用</button>
        <div class="hint">上传后会立即替换全站 Logo（保存后发布生效）。支持 JPG/PNG/WebP/GIF。</div>
      </div></div>`;

    h += `<div class="sec-title">历史版本（可回滚）</div>`;
    h += `<div id="history-list">加载中…</div>`;

    h += `<div class="sec-title">预览服务</div>`;
    h += `<div class="card"><div class="card-body">
      <button class="btn tiny" id="btn-preview-start">启动 / 重启预览</button>
      <button class="btn tiny" id="btn-open-preview">在新窗口打开预览</button>
      <div class="hint">预览地址：${esc(S.previewUrl)}</div>
    </div></div>`;

    h += `<div class="sec-title">关于发布</div>`;
    h += `<div class="hint">「保存」只改本地并刷新预览；「发布上线」会构建并在 GitHub 上重新部署。<br>第一次使用需在电脑上装好 Node、pnpm、git 并登录 GitHub。</div>`;

    $('#panel-settings').innerHTML = h;
    loadHistory();
  }

  /* ---------- 收集表单 -> S ---------- */
  function collect() {
    $$('[data-path]').forEach((el) => {
      const path = el.dataset.path;
      let val = el.value;
      if (el.dataset.check !== undefined) val = el.checked;
      else if (el.dataset.list) val = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (el.dataset.num) val = Number(el.value) || 0;
      setPath(S, path, val);
    });
  }

  function makeBody() {
    collect();
    return {
      site: S.site,
      theme: S.theme,
      works: S.works.map((w) => ({ id: w.id, data: w.data, body: w.body })),
      news: S.news.map((n) => ({ id: n.id, data: n.data, body: n.body })),
      deletedWorkIds: S.deletedWorkIds || [],
      deletedNewsIds: S.deletedNewsIds || [],
    };
  }

  function clearDeletes() { S.deletedWorkIds = []; S.deletedNewsIds = []; }

  /* ---------- 与服务器交互 ---------- */
  async function api(path, opts = {}) {
    const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
    const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `请求失败(${res.status})`);
      err.status = res.status; // 记录 HTTP 状态，便于区分“需要 PIN”与其他错误
      throw err;
    }
    return data;
  }

  /* ---------- 通知 ---------- */
  let toastTimer;
  function toast(msg, kind = 'ok') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + kind;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  function setDot(state) {
    const d = $('#status-dot');
    d.className = 'dot ' + state;
  }

  /* ---------- 保存 ---------- */
  async function doSave() {
    try {
      const payload = makeBody();
      await api('/api/save-all', { method: 'POST', body: payload });
      clearDeletes();
      setDot('ok');
      toast('已保存，预览已刷新');
    } catch (e) {
      setDot('err');
      toast('保存失败：' + e.message, 'err');
    }
  }

  // 防抖自动保存（实现「边改边看」——文件写入触发预览热更新）
  let autoSaveTimer;
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => doSave(), 700);
  }

  /* ---------- 发布 ---------- */
  async function doPublish() {
    if (!confirm('发布上线：会先保存当前改动，构建并在 GitHub 上重新部署网站。确定？')) return;
    setDot('warn');
    toast('发布中，请稍候…');
    try {
      const p = makeBody();
      await api('/api/save-all', { method: 'POST', body: p });
      clearDeletes();
      const r = await api('/api/publish', { method: 'POST', body: {} });
      setDot(r.ok ? 'ok' : ('err'));
      if (r.ok) {
        toast('发布成功：' + r.tag);
      } else {
        toast('发布失败：' + (r.error || '未知错误'), 'err');
      }
      showLog(r.log);
      refreshIframe();
    } catch (e) {
      setDot('err');
      toast('发布出错：' + e.message, 'err');
    }
  }

  function showLog(log) {
    if (!log || !log.length) return;
    const text = log.map((l) => `[${l.step}] ${l.code !== undefined ? 'code=' + l.code : ''} ${l.tag || ''}\n` + (l.stderr || l.stdout || '')).join('\n');
    // 粘贴到设置页一个临时区域
    let box = $('#publish-log-box');
    if (!box) {
      const div = document.createElement('div');
      div.id = 'publish-log-box';
      div.innerHTML = `<div class="sec-title">最近一次发布日志 <button class="btn tiny" id="btn-close-log">关闭</button></div><pre class="log"></pre>`;
      $('#panel-settings').prepend(div);
      box = $('#publish-log-box');
      $('#btn-close-log').onclick = () => box.remove();
    }
    box.querySelector('pre.log').textContent = text;
    switchTab('settings');
  }

  /* ---------- 回滚 ---------- */
  async function doRollback(tag) {
    if (!confirm(`回滚到 ${tag}？会覆盖当前未发布改动（并先自动存档）。确定？`)) return;
    try {
      const r = await api('/api/rollback', { method: 'POST', body: { tag } });
      if (r.ok) { toast('已回滚到 ' + r.tag); refreshIframe(); await loadHistory(); }
      else toast('回滚失败：' + (r.error || ''), 'err');
      showLog(r.log);
    } catch (e) { toast('回滚出错：' + e.message, 'err'); }
  }

  /* ---------- 历史 ---------- */
  async function loadHistory() {
    try {
      const r = await api('/api/history');
      const list = r.tags || [];
      const box = $('#history-list');
      if (!box) return;
      if (!list.length) { box.innerHTML = '<p class="muted">还没有已发布版本（点「发布上线」后会记录）。</p>'; return; }
      box.innerHTML = list.slice(0, 15).map((t) => `<div class="history-item"><span>${esc(t)}</span><button class="btn tiny danger" data-rollback="${esc(t)}">回滚到此</button></div>`).join('');
    } catch (e) { const b = $('#history-list'); if (b) b.innerHTML = '<p class="muted">加载失败</p>'; }
  }

  /* ---------- Logo ---------- */
  async function uploadLogo() {
    const file = $('#logo-file').files[0];
    if (!file) { toast('请先选择一张图片', 'err'); return; }
    const buf = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    try {
      const r = await api('/api/logo', { method: 'POST', body: { fileName: file.name, base64 } });
      toast(r.note || 'Logo 已替换');
      refreshIframe();
      scheduleAutoSave();
    } catch (e) { toast('上传失败：' + e.message, 'err'); }
  }

  /* ---------- 预览 ---------- */
  function refreshIframe() {
    const f = $('#preview-frame');
    if (f && f.src) f.src = f.src;
  }

  /* ---------- Tab ---------- */
  function switchTab(tab) {
    $$('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
  }
  function bindClicks() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      const tab = t.closest('.tab');
      if (tab) { switchTab(tab.dataset.tab); return; }

      const add = t.closest('[data-add]');
      if (add) { addItem(add.dataset.add, add.dataset.add); return; }

      const remove = t.closest('[data-remove]');
      if (remove) { removeItem(remove.dataset.remove, Number(remove.dataset.index)); return; }

      const preset = t.closest('[data-preset]');
      if (preset) { applyPreset(preset.dataset.preset); return; }

      const newWork = t.closest('[data-new-work]');
      if (newWork) { addWork(); return; }
      const newNews = t.closest('[data-new-news]');
      if (newNews) { addNews(); return; }

      const delWork = t.closest('[data-del-work]');
      if (delWork) { removeWork(Number(delWork.dataset.delWork)); return; }
      const delNews = t.closest('[data-del-news]');
      if (delNews) { removeNews(Number(delNews.dataset.delNews)); return; }

      const toggle = t.closest('[data-toggle]');
      if (toggle) { const b = toggle.closest('.item').querySelector('.item-body'); b.classList.toggle('hidden'); return; }

      const rb = t.closest('[data-rollback]');
      if (rb) { doRollback(rb.dataset.rollback); return; }
    });
  }

  /* ---- 数组增删 ---- */
  function addItem(pathBase, label) {
    const arr = getPath(S, pathBase);
    if (!Array.isArray(arr)) return;
    arr.push({});
    collectFromActive();
    renderAll();
    toast('已新增一项（点击内容区填写）');
  }
  function removeItem(pathBase, idx) {
    const arr = getPath(S, pathBase);
    if (!Array.isArray(arr)) return;
    arr.splice(idx, 1);
    renderAll();
  }
  // 只收集内容/主题（数组卡片所在面板）里的值到 S，避免丢失已输入内容
  function collectFromActive() {
    ['#panel-content', '#panel-theme'].forEach((sel) => {
      $$(`${sel} [data-path]`).forEach((el) => {
        const path = el.dataset.path;
        let val = el.value;
        if (el.dataset.list) val = el.value.split(',').map((s) => s.trim()).filter(Boolean);
        else if (el.dataset.num) val = Number(el.value) || 0;
        setPath(S, path, val);
      });
    });
  }

  function applyPreset(key) {
    const p = (S.presets || []).find((x) => x.key === key);
    if (p) { S.theme = clone(p.theme); renderTheme(); toast('已应用『' + p.label + '』（点保存生效）'); }
  }

  function addWork() {
    const d = { title: '新作品', description: '', date: new Date().toISOString().slice(0, 10), year: new Date().getFullYear(), status: 'in-development', tags: [], platform: [], role: '', featured: false, order: (S.works.length + 1), draft: false };
    const w = { id: 'new-work-' + Date.now(), data: d, body: '' };
    S.works.push(w);
    renderWorks();
    switchTab('works');
  }
  function removeWork(i) {
    const w = S.works[i];
    if (!confirm(`删除作品「${w.data.title}」？`)) return;
    S.deletedWorkIds = S.deletedWorkIds || [];
    S.deletedWorkIds.push(w.id);
    S.works.splice(i, 1);
    renderWorks();
  }
  function addNews() {
    const d = { title: '新公告', description: '', pubDate: new Date().toISOString().slice(0, 10), tags: [], draft: false };
    const n = { id: 'new-news-' + Date.now(), data: d, body: '' };
    S.news.push(n);
    renderNews();
    switchTab('news');
  }
  function removeNews(i) {
    const n = S.news[i];
    if (!confirm(`删除公告「${n.data.title}」？`)) return;
    S.deletedNewsIds = S.deletedNewsIds || [];
    S.deletedNewsIds.push(n.id);
    S.news.splice(i, 1);
    renderNews();
  }

  function renderAll() {
    renderContent();
    renderTheme();
    renderWorks();
    renderNews();
    renderSettings();
  }

  /* ---------- 加载初始化 ---------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function init2() {
    // 一进来先给个友好的“正在启动”画面（不弹 PIN、不需要任何输入）
    showGate(null, { title: '正在启动编辑器', sub: '正在连接本机编辑服务，请稍候…（通常几秒就好）' });
    let needPin = false;
    // 首次进入服务器可能还在启动：持续重试，服务一旦就绪就自动进入
    const attempts = 25; // 每次约 700ms，合计约 17 秒
    for (let i = 0; i < attempts; i++) {
      try {
        const r = await api('/api/state');
        S = buildS(r);
        startApp();
        return;
      } catch (e) {
        if (e.status === 401) { needPin = true; break; } // 真正需要 PIN
        await sleep(700);                                 // 服务器还在启动，等一下再试
      }
    }
    if (needPin) {
      showGate(true);
    } else {
      // 一直没连上：给出重试提示
      showGate(false, { title: '还没连上编辑服务', sub: '编辑器似乎还没就绪。请稍候几秒后点“重试”，或按 F5 刷新。' });
    }
  }
  // mode：true=PIN 输入框；false=失败重试提示；null=等待/启动中提示
  function showGate(mode, copy) {
    const gate = $('#pin-gate');
    gate.classList.remove('hidden');
    const showPin = mode === true;
    $('#pin-form').classList.toggle('hidden', !showPin);
    $('#pin-fallback').classList.toggle('hidden', showPin);
    if (copy) {
      $('#pin-title').textContent = copy.title;
      $('#pin-sub').textContent = copy.sub;
    } else if (showPin) {
      $('#pin-title').textContent = '输入访问 PIN';
      $('#pin-sub').textContent = '这是一个只有你能打开的本机编辑入口。';
    }
    if (showPin) {
      $('#pin-enter').onclick = async () => {
        const v = $('#pin-input').value;
        try {
          const r = await api('/api/state', { headers: { 'x-admin-pin': v } });
          S = buildS(r); startApp();
        } catch (err) { $('#pin-error').classList.remove('hidden'); }
      };
      $('#pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#pin-enter').click(); });
    } else {
      $('#btn-retry').onclick = init2;
    }
  }
  function buildS(r) {
    const s = {
      site: clone(r.site), theme: clone(r.theme), works: clone(r.works), news: clone(r.news),
      presets: r.presets || [], deletedWorkIds: [], deletedNewsIds: [],
      previewUrl: r.previewUrl, previewPort: r.previewPort,
    };
    return s;
  }
  function startApp() {
    $('#app').classList.remove('hidden');
    $('#pin-gate').classList.add('hidden');
    bindClicks();
    $$('#tabs .tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('#btn-save').addEventListener('click', doSave);
    $('#btn-publish').addEventListener('click', doPublish);
    $('#btn-refresh').addEventListener('click', refreshIframe);
    document.addEventListener('input', (e) => { if (e.target.closest('[data-path]')) scheduleAutoSave(); });
    $('#btn-upload-logo').addEventListener('click', uploadLogo);
    $('#btn-preview-start').addEventListener('click', () => api('/api/preview/start', { method: 'POST' }).then(() => { toast('预览服务已启动'); refreshIframe(); }).catch((e) => toast(e.message, 'err')));
    $('#btn-open-preview').addEventListener('click', () => window.open(S.previewUrl, '_blank'));
    $('#preview-link').addEventListener('click', () => window.open(S.previewUrl, '_blank'));
    $('#preview-frame').src = S.previewUrl;
    renderAll();
  }

  init2();
})();
