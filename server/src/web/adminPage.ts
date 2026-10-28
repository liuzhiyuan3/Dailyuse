// 网页管理后台单页。刻意不引任何构建工具/外部资源：一个字符串、同源 fetch、localStorage 存 token。
// 模板字符串里不能再出现反引号与 ${，页面内 JS 一律用单引号 + 字符串拼接。
export const ADMIN_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dailyuse 管理后台</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #F4F6FB; color: #1F2A44; }
  a { color: #3B5BDB; }

  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .login { width: 340px; padding: 28px; background: #fff; border-radius: 16px; box-shadow: 0 12px 32px rgba(22,32,58,.1); }
  .login h1 { font-size: 18px; margin-bottom: 4px; }
  .login p { font-size: 12px; color: #8A94AB; margin-bottom: 18px; }
  .login input { width: 100%; height: 42px; padding: 0 14px; border: 1px solid #E3E8F2; border-radius: 10px; font-size: 14px; outline: none; }
  .login input:focus { border-color: #3B5BDB; }
  .login button { width: 100%; height: 42px; margin-top: 14px; border: none; border-radius: 10px; background: linear-gradient(135deg,#5C7CFA,#3B5BDB); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
  .err { margin-top: 10px; font-size: 12px; color: #E03131; text-align: center; }

  .top { display: flex; align-items: center; gap: 10px; padding: 14px 22px; background: #fff; border-bottom: 1px solid #E3E8F2; position: sticky; top: 0; z-index: 5; }
  .top h1 { font-size: 16px; flex: 1; }
  .logout { font-size: 12px; color: #8A94AB; cursor: pointer; }
  .tabs { display: flex; gap: 8px; padding: 14px 22px 0; }
  .tab { padding: 8px 18px; border-radius: 999px; font-size: 13px; color: #8A94AB; background: #fff; border: 1px solid #E3E8F2; cursor: pointer; }
  .tab.on { background: #3B5BDB; border-color: transparent; color: #fff; font-weight: 600; }
  .wrap { padding: 16px 22px 40px; max-width: 860px; }

  .card { background: #fff; border: 1px solid #E3E8F2; border-radius: 14px; padding: 16px; margin-bottom: 14px; box-shadow: 0 4px 14px rgba(59,91,219,.05); }
  .card input.title { width: 100%; height: 40px; padding: 0 12px; border: 1px solid #E3E8F2; border-radius: 10px; font-size: 14px; outline: none; }
  .card textarea { width: 100%; height: 110px; margin-top: 10px; padding: 10px 12px; border: 1px solid #E3E8F2; border-radius: 10px; font-size: 13px; resize: vertical; outline: none; font-family: inherit; }
  .card button { margin-top: 12px; padding: 10px 26px; border: none; border-radius: 10px; background: linear-gradient(135deg,#5C7CFA,#3B5BDB); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }

  .list { background: #fff; border: 1px solid #E3E8F2; border-radius: 14px; box-shadow: 0 4px 14px rgba(59,91,219,.05); }
  .row { padding: 14px 16px; border-bottom: 1px solid #EEF1F7; }
  .row:last-child { border-bottom: none; }
  .row-head { display: flex; align-items: center; gap: 8px; }
  .row-title { font-size: 14px; font-weight: 600; flex: 1; }
  .row-sub { font-size: 12px; color: #8A94AB; margin-top: 6px; }
  .row-body { font-size: 13px; line-height: 1.7; margin-top: 8px; white-space: pre-wrap; }
  .tag { font-size: 11px; padding: 2px 9px; border-radius: 999px; background: rgba(59,91,219,.1); color: #3B5BDB; font-weight: 600; }
  .tag.bug { background: rgba(224,49,49,.1); color: #E03131; }
  .tag.tool { background: rgba(245,159,0,.14); color: #B8860B; }
  .tag.done { background: rgba(55,178,77,.12); color: #2F9E44; }
  .tag.tier-pro { background: #FFE8A3; color: #8A5A00; }
  .mini { font-size: 12px; color: #3B5BDB; cursor: pointer; }
  .mini.danger { color: #E03131; }
  .filters { display: flex; gap: 8px; margin-bottom: 12px; }
  .f { padding: 6px 14px; border-radius: 999px; border: 1px solid #E3E8F2; font-size: 12px; color: #8A94AB; background: #fff; cursor: pointer; }
  .f.on { background: rgba(59,91,219,.1); border-color: transparent; color: #3B5BDB; font-weight: 600; }
  .empty { padding: 40px 0; text-align: center; font-size: 13px; color: #8A94AB; }
  .stats { display: flex; gap: 12px; margin-bottom: 14px; }
  .stat { flex: 1; background: #fff; border: 1px solid #E3E8F2; border-radius: 14px; padding: 14px 16px; }
  .stat .k { font-size: 12px; color: #8A94AB; }
  .stat .v { font-size: 22px; font-weight: 700; color: #3B5BDB; margin-top: 4px; }
</style>
</head>
<body>

<div id="login" class="login-wrap" style="display:none">
  <div class="login">
    <h1>Dailyuse 管理后台</h1>
    <p>发布通知、查看用户反馈</p>
    <input id="pwd" type="password" placeholder="管理密码" autofocus>
    <button id="btn-login">登 录</button>
    <div id="login-err" class="err"></div>
  </div>
</div>

<div id="app" style="display:none">
  <div class="top">
    <h1>Dailyuse 管理后台</h1>
    <span class="logout" id="btn-logout">退出</span>
  </div>
  <div class="tabs">
    <div class="tab on" data-tab="notice">公告</div>
    <div class="tab" data-tab="feedback">用户反馈</div>
    <div class="tab" data-tab="users">用户</div>
  </div>
  <div class="wrap">

    <div id="view-notice">
      <div class="card">
        <input class="title" id="ann-title" maxlength="60" placeholder="通知标题（60 字内）">
        <textarea id="ann-content" maxlength="2000" placeholder="通知内容，发布后用户在首页和「消息通知」里都能看到"></textarea>
        <button id="btn-publish">发布通知</button>
      </div>
      <div id="ann-list" class="list"></div>
    </div>

    <div id="view-feedback" style="display:none">
      <div class="stats">
        <div class="stat"><div class="k">待处理反馈</div><div class="v" id="stat-new">-</div></div>
        <div class="stat"><div class="k">已处理</div><div class="v" id="stat-done">-</div></div>
      </div>
      <div class="filters">
        <div class="f on" data-st="">全部</div>
        <div class="f" data-st="new">待处理</div>
        <div class="f" data-st="handled">已处理</div>
      </div>
      <div id="fb-list" class="list"></div>
    </div>

    <div id="view-users" style="display:none">
      <div class="stats">
        <div class="stat"><div class="k">注册用户</div><div class="v" id="stat-users">-</div></div>
      </div>
      <div id="user-list" class="list"></div>
    </div>

  </div>
</div>

<script>
var API = '/api';
var TOKEN_KEY = 'dailyuse_admin_token';
var token = localStorage.getItem(TOKEN_KEY) || '';
var fbStatus = '';

function api(path, opts) {
  opts = opts || {};
  return fetch(API + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (r) {
    if (r.status === 401) { logout(); throw new Error('登录已过期'); }
    return r.json();
  }).then(function (j) {
    if (j.code !== 0) throw new Error(j.message || '请求失败');
    return j.data;
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function fmt(iso) {
  var d = new Date(iso);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function showLogin() {
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadNotices(); loadFeedback(); loadUsers();
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  token = '';
  showLogin();
}

function doLogin() {
  var pwd = document.getElementById('pwd').value;
  var err = document.getElementById('login-err');
  err.textContent = '';
  fetch(API + '/admin-web/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  }).then(function (r) { return r.json().then(function (j) { return { ok: r.status === 200, j: j }; }); })
    .then(function (res) {
      if (!res.ok) { err.textContent = res.j.message || '登录失败'; return; }
      token = res.j.data.token;
      localStorage.setItem(TOKEN_KEY, token);
      showApp();
    })
    .catch(function () { err.textContent = '网络异常'; });
}

/* ---------- 公告 ---------- */
function loadNotices() {
  api('/admin/announcements').then(function (d) {
    var el = document.getElementById('ann-list');
    if (!d.list.length) { el.innerHTML = '<div class="empty">还没有发过通知</div>'; return; }
    el.innerHTML = d.list.map(function (a) {
      return '<div class="row"><div class="row-head"><span class="row-title">' + esc(a.title) + '</span>' +
        '<span class="mini danger" onclick="removeAnn(\\'' + a.id + '\\')">撤下</span></div>' +
        '<div class="row-body">' + esc(a.content) + '</div>' +
        '<div class="row-sub">' + fmt(a.createdAt) + '</div></div>';
    }).join('');
  }).catch(function (e) { document.getElementById('ann-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
}

function publish() {
  var t = document.getElementById('ann-title').value.trim();
  var c = document.getElementById('ann-content').value.trim();
  if (!t || !c) { alert('标题和内容都要填'); return; }
  api('/admin/announcements', { method: 'POST', body: { title: t, content: c } })
    .then(function () { document.getElementById('ann-title').value = ''; document.getElementById('ann-content').value = ''; loadNotices(); })
    .catch(function (e) { alert(e.message); });
}

function removeAnn(id) {
  if (!confirm('确认撤下这条通知？')) return;
  api('/admin/announcements/' + id, { method: 'DELETE' }).then(loadNotices).catch(function (e) { alert(e.message); });
}

/* ---------- 反馈 ---------- */
var KINDS = { bug: '遇到问题', idea: '功能建议', tool: '想要新工具', other: '其他' };

function loadFeedback() {
  api('/admin/feedback' + (fbStatus ? '?status=' + fbStatus : '')).then(function (d) {
    var news = 0, done = 0;
    d.list.forEach(function (f) { if (f.status === 'new') news++; else done++; });
    document.getElementById('stat-new').textContent = news;
    document.getElementById('stat-done').textContent = done;
    var el = document.getElementById('fb-list');
    if (!d.list.length) { el.innerHTML = '<div class="empty">没有符合条件的反馈</div>'; return; }
    el.innerHTML = d.list.map(function (f) {
      var cls = f.status === 'handled' ? 'tag done' : 'tag';
      var label = f.status === 'handled' ? '已处理' : '待处理';
      return '<div class="row"><div class="row-head">' +
        '<span class="tag ' + esc(f.kind) + '">' + (KINDS[f.kind] || '其他') + '</span>' +
        '<span class="row-sub" style="margin:0;flex:1">' + esc(f.nickname || '未设昵称') + '</span>' +
        '<span class="' + cls + '">' + label + '</span>' +
        '<span class="mini" onclick="toggleFb(\\'' + f.id + '\\',' + (f.status === 'handled' ? '\\\'new\\\'' : '\\\'handled\\\'') + ')">' +
        (f.status === 'handled' ? '标记待处理' : '标记已处理') + '</span></div>' +
        '<div class="row-body">' + esc(f.content) + '</div>' +
        '<div class="row-sub">' + fmt(f.createdAt) + '</div></div>';
    }).join('');
  }).catch(function (e) { document.getElementById('fb-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
}

function toggleFb(id, next) {
  api('/admin/feedback/' + id, { method: 'PATCH', body: { status: next } }).then(loadFeedback).catch(function (e) { alert(e.message); });
}

/* ---------- 用户 ---------- */
function loadUsers() {
  api('/admin/users').then(function (d) {
    document.getElementById('stat-users').textContent = d.total;
    var el = document.getElementById('user-list');
    if (!d.users.length) { el.innerHTML = '<div class="empty">还没有用户</div>'; return; }
    el.innerHTML = d.users.map(function (u) {
      var tier = u.tier === 'pro' ? '<span class="tag tier-pro">pro</span>' : '<span class="tag">free</span>';
      return '<div class="row"><div class="row-head"><span class="row-title">' + esc(u.nickname || '未设昵称') + '</span>' + tier + '</div>' +
        '<div class="row-sub">待办 ' + u.todos + ' 条 · 注册于 ' + fmt(u.createdAt) + '</div></div>';
    }).join('');
  }).catch(function (e) { document.getElementById('user-list').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
}

/* ---------- 事件绑定 ---------- */
document.getElementById('btn-login').onclick = doLogin;
document.getElementById('pwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('btn-logout').onclick = logout;
document.getElementById('btn-publish').onclick = publish;

Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
  t.onclick = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.remove('on'); });
    t.classList.add('on');
    ['notice', 'feedback', 'users'].forEach(function (v) {
      document.getElementById('view-' + v).style.display = v === t.getAttribute('data-tab') ? 'block' : 'none';
    });
  };
});

Array.prototype.forEach.call(document.querySelectorAll('.f'), function (f) {
  f.onclick = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.f'), function (x) { x.classList.remove('on'); });
    f.classList.add('on');
    fbStatus = f.getAttribute('data-st');
    loadFeedback();
  };
});

if (token) { api('/admin/feedback').then(showApp).catch(showApp); } else { showLogin(); }
</script>
</body>
</html>`;
