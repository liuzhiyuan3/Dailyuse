// 冒烟测试：node scripts/smoke.mjs（需先启动服务）
const BASE = process.env.BASE || 'http://127.0.0.1:3000/api';

let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log('  ✔', name);
  } else {
    fail++;
    console.log('  ✘', name, extra);
  }
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(code) {
  const r = await call('/auth/login', { method: 'POST', body: { code } });
  return r.json?.data?.token;
}

async function main() {
  console.log(`\n=== 冒烟测试 ${BASE} ===\n`);

  const health = await call('/health');
  check('健康检查', health.status === 200 && health.json?.data?.db === 'up', JSON.stringify(health.json));

  const stamp = Date.now().toString(36);
  const tokenA = await login(`smoke-a-${stamp}`);
  const tokenB = await login(`smoke-b-${stamp}`);
  check('登录 A', Boolean(tokenA));
  check('登录 B 且与 A 不同', Boolean(tokenB) && tokenA !== tokenB);

  const noAuth = await call('/todos');
  check('未登录返回 401', noAuth.status === 401);

  // 待办
  const created = await call('/todos', { method: 'POST', token: tokenA, body: { title: '冒烟待办' } });
  const todoId = created.json?.data?.id;
  check('创建待办', Boolean(todoId));

  const list = await call('/todos', { token: tokenA });
  check('待办列表', list.json?.data?.list?.some((t) => t.id === todoId));

  const patched = await call(`/todos/${todoId}`, { method: 'PATCH', token: tokenA, body: { done: true } });
  check('勾选待办', patched.json?.data?.ok === true);

  const cross = await call(`/todos/${todoId}`, { method: 'DELETE', token: tokenB });
  check('越权删除被拒', cross.status === 404);

  // 便签
  const note = await call('/notes', { method: 'POST', token: tokenA, body: { title: '标题', content: '内容', pinned: true } });
  check('创建便签', Boolean(note.json?.data?.id));
  const noteList = await call('/notes', { token: tokenA });
  check('便签列表置顶在前', noteList.json?.data?.list?.[0]?.pinned === true);

  // 记账
  const acc = await call('/accounts', {
    method: 'POST',
    token: tokenA,
    body: { type: 'expense', amount: 88.5, category: '餐饮', remark: '午饭' },
  });
  check('记一笔', Boolean(acc.json?.data?.id));
  const sum = await call('/accounts/summary', { token: tokenA });
  check('月度汇总', Number(sum.json?.data?.expense) === 88.5, JSON.stringify(sum.json?.data));

  // 倒数日
  const target = new Date();
  target.setDate(target.getDate() + 10);
  const cd = await call('/countdowns', {
    method: 'POST',
    token: tokenA,
    body: { name: '生日', targetDate: target.toISOString().slice(0, 10) },
  });
  check('创建倒数日', Boolean(cd.json?.data?.id));

  // 群组
  const g = await call('/groups', { method: 'POST', token: tokenA, body: { name: '冒烟群' } });
  const gid = g.json?.data?.id;
  const invite = g.json?.data?.inviteCode;
  check('创建群组', Boolean(gid) && Boolean(invite));

  const joined = await call('/groups/join', { method: 'POST', token: tokenB, body: { inviteCode: invite } });
  check('B 加入群组', joined.json?.data?.id === gid);

  const detail = await call(`/groups/${gid}`, { token: tokenA });
  check('群详情含 2 名成员', detail.json?.data?.members?.length === 2);

  const gt = await call(`/groups/${gid}/todos`, { method: 'POST', token: tokenA, body: { title: '买炭火' } });
  check('新增集体待办', Boolean(gt.json?.data?.id));

  const outsider = await call(`/groups/${gid}`, { token: (await login(`smoke-c-${stamp}`)) });
  check('非成员访问群组被拒', outsider.status === 403);

  // 资讯订阅（关键词带时间戳，保证可重复执行）
  const keyword = `AI${stamp}`;
  const sub1 = await call('/subscribes', { method: 'POST', token: tokenA, body: { keyword, templateId: 'TPL' } });
  check('订阅关键词', sub1.json?.data?.remain === 1);
  const sub2 = await call('/subscribes', { method: 'POST', token: tokenA, body: { keyword, templateId: 'TPL' } });
  check('重复订阅累加额度', sub2.json?.data?.remain === 2, JSON.stringify(sub2.json?.data));

  const refreshed = await call('/news/refresh', { method: 'POST', token: tokenA, body: { keyword } });
  check('抓取资讯', (refreshed.json?.data?.added ?? 0) > 0);
  const news = await call(`/news?keyword=${encodeURIComponent(keyword)}`, { token: tokenA });
  check('资讯列表可查', (news.json?.data?.list?.length ?? 0) > 0);

  // 未订阅的他人关键词：不能读缓存，也不能拿它去触发抓取（防止变成免费抓取代理）
  const foreign = `ZZ${stamp}`;
  const newsForeign = await call(`/news?keyword=${encodeURIComponent(foreign)}`, { token: tokenA });
  check('未订阅关键词读资讯被拒', newsForeign.status === 403);
  const refreshForeign = await call('/news/refresh', { method: 'POST', token: tokenA, body: { keyword: foreign } });
  check('未订阅关键词抓取被拒', refreshForeign.status === 403);

  // 提醒
  const remindAt = new Date(Date.now() + 3600000).toISOString();
  const rem = await call('/reminders', {
    method: 'POST',
    token: tokenA,
    body: { toolType: 'todo', targetId: todoId, remindAt },
  });
  const rid = rem.json?.data?.id;
  check('创建提醒', Boolean(rid));
  const grant = await call(`/reminders/${rid}/grant`, { method: 'POST', token: tokenA });
  check('追加提醒额度', grant.json?.data?.remain === 2);
  const del = await call(`/reminders/${rid}`, { method: 'DELETE', token: tokenA });
  check('删除提醒', del.json?.data?.ok === true);

  // 级联：删待办应同时清掉该待办的提醒
  const t2 = await call('/todos', { method: 'POST', token: tokenA, body: { title: '级联测试' } });
  const t2id = t2.json?.data?.id;
  const r2 = await call('/reminders', {
    method: 'POST',
    token: tokenA,
    body: { toolType: 'todo', targetId: t2id, remindAt },
  });
  const rid2 = r2.json?.data?.id;
  await call(`/todos/${t2id}`, { method: 'DELETE', token: tokenA });
  const remaining = await call('/reminders', { token: tokenA });
  check(
    '删待办级联清提醒',
    !(remaining.json?.data?.list ?? []).some((x) => x.id === rid2)
  );

  // 提醒改期
  const r3 = await call('/reminders', {
    method: 'POST',
    token: tokenA,
    body: { toolType: 'todo', targetId: todoId, remindAt },
  });
  const patchedR = await call(`/reminders/${r3.json?.data?.id}`, {
    method: 'PATCH',
    token: tokenA,
    body: { remindAt: new Date(Date.now() + 7200000).toISOString() },
  });
  check('提醒改期', patchedR.json?.data?.ok === true);

  // 记账编辑
  const acc2 = await call('/accounts', {
    method: 'POST',
    token: tokenA,
    body: { type: 'expense', amount: 10, category: '交通' },
  });
  const patchedAcc = await call(`/accounts/${acc2.json?.data?.id}`, {
    method: 'PATCH',
    token: tokenA,
    body: { amount: 20, remark: '改过' },
  });
  check('记账编辑', patchedAcc.json?.data?.ok === true);

  // 群组动态
  const feed = await call('/feed', { token: tokenA });
  check('群组动态', Array.isArray(feed.json?.data?.events) && feed.json.data.events.length > 0);

  // 群主移除成员
  const detail2 = await call(`/groups/${gid}`, { token: tokenA });
  const other = (detail2.json?.data?.members ?? []).find((m) => m.user.id !== detail2.json.data.ownerId);
  if (other) {
    const rm = await call(`/groups/${gid}/members/${other.user.id}`, {
      method: 'DELETE',
      token: tokenA,
    });
    check('群主移除成员', rm.json?.data?.ok === true);
  }

  // 解散群组 + 级联清理群待办提醒
  const g2 = await call('/groups', { method: 'POST', token: tokenA, body: { name: '待解散' } });
  const g2id = g2.json?.data?.id;
  const gt2 = await call(`/groups/${g2id}/todos`, {
    method: 'POST',
    token: tokenA,
    body: { title: '解散前待办' },
  });
  const gr = await call('/reminders', {
    method: 'POST',
    token: tokenA,
    body: { toolType: 'group_todo', targetId: gt2.json?.data?.id, remindAt },
  });
  const gRid = gr.json?.data?.id;

  const disband = await call(`/groups/${g2id}`, { method: 'DELETE', token: tokenA });
  check('解散群组', disband.json?.data?.ok === true);

  const afterDisband = await call('/reminders', { token: tokenA });
  check(
    '解散级联清群提醒',
    !(afterDisband.json?.data?.list ?? []).some((x) => x.id === gRid)
  );

  // ===== 登录资料（/auth/me）=====
  const me = await call('/auth/me', { token: tokenA });
  check('读取当前用户', me.status === 200 && Boolean(me.json?.data?.user?.id), JSON.stringify(me.json));

  // 付费骨架：新用户默认 free；客户端改不动 tier
  const ent = me.json?.data?.user?.entitlement;
  check('新用户默认免费版', ent?.tier === 'free' && ent?.isPro === false, JSON.stringify(ent));
  const escalate = await call('/auth/me', {
    method: 'PATCH',
    token: tokenA,
    body: { nickname: '阿甲', tier: 'pro', paidUntil: '2099-01-01T00:00:00.000Z' },
  });
  check(
    '客户端无法自封 pro',
    escalate.json?.data?.user?.entitlement?.isPro === false,
    JSON.stringify(escalate.json?.data?.user?.entitlement)
  );

  const meAnon = await call('/auth/me');
  check('未登录读资料被拒', meAnon.status === 401);

  const rename = await call('/auth/me', { method: 'PATCH', token: tokenA, body: { nickname: ' 阿甲 ' } });
  check(
    '改昵称并去空格',
    rename.json?.data?.user?.nickname === '阿甲',
    JSON.stringify(rename.json)
  );

  const badAvatar = await call('/auth/me', {
    method: 'PATCH',
    token: tokenA,
    body: { avatarUrl: 'javascript:alert(1)' },
  });
  check('非法头像地址被拒', badAvatar.status === 400);

  const longName = await call('/auth/me', {
    method: 'PATCH',
    token: tokenA,
    body: { nickname: 'x'.repeat(25) },
  });
  check('超长昵称被拒', longName.status === 400);

  const emptyPatch = await call('/auth/me', { method: 'PATCH', token: tokenA, body: {} });
  check('空更新被拒', emptyPatch.status === 400);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('冒烟测试异常:', e);
  process.exit(1);
});
