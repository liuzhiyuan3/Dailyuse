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

  // 勾选写完成时间、取消清空（主列表隔天收进历史用）
  const doneList = await call('/todos', { token: tokenA });
  const doneItem = (doneList.json?.data?.list ?? []).find((t) => t.id === todoId);
  check('勾选后带完成时间', Boolean(doneItem?.doneAt));

  const undone = await call(`/todos/${todoId}`, { method: 'PATCH', token: tokenA, body: { done: false } });
  check('取消勾选', undone.json?.data?.ok === true);
  const undoneList = await call('/todos', { token: tokenA });
  const undoneItem = (undoneList.json?.data?.list ?? []).find((t) => t.id === todoId);
  check('取消后完成时间清空', undoneItem?.doneAt == null);

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

  // ===== 转盘 =====
  const wheelBad = await call('/wheels', {
    method: 'POST',
    token: tokenA,
    body: { title: '转盘', items: ['只有一个'] },
  });
  check('转盘选项不足被拒', wheelBad.status === 400);

  const wheel = await call('/wheels', {
    method: 'POST',
    token: tokenA,
    body: { title: '今天吃什么', items: ['火锅', '烤肉', '日料'] },
  });
  const wheelId = wheel.json?.data?.id;
  check('创建转盘', Boolean(wheelId));

  const wheelList = await call('/wheels', { token: tokenA });
  check(
    '转盘列表',
    wheelList.json?.data?.list?.some((w) => w.id === wheelId && JSON.parse(w.items).length === 3)
  );

  const wheelPatch = await call(`/wheels/${wheelId}`, {
    method: 'PATCH',
    token: tokenA,
    body: { items: ['火锅', '烤肉'] },
  });
  check('编辑转盘', wheelPatch.status === 200);

  const wheelCross = await call(`/wheels/${wheelId}`, { method: 'DELETE', token: tokenB });
  check('越权删转盘被拒', wheelCross.status === 404);

  // ===== 打卡 =====
  const habit = await call('/habits', { method: 'POST', token: tokenA, body: { name: '每天喝水' } });
  const habitId = habit.json?.data?.id;
  check('创建打卡项', Boolean(habitId));

  const tg1 = await call(`/habits/${habitId}/toggle`, { method: 'POST', token: tokenA, body: {} });
  check('今日打卡', tg1.json?.data?.done === true);
  const tg2 = await call(`/habits/${habitId}/toggle`, { method: 'POST', token: tokenA, body: {} });
  check('取消打卡', tg2.json?.data?.done === false);

  // 补昨天 + 再打今天 → 连击 2
  const py = (n) => String(n).padStart(2, '0');
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yKey = `${yest.getFullYear()}-${py(yest.getMonth() + 1)}-${py(yest.getDate())}`;
  await call(`/habits/${habitId}/toggle`, { method: 'POST', token: tokenA, body: { day: yKey } });
  await call(`/habits/${habitId}/toggle`, { method: 'POST', token: tokenA, body: {} });
  const habitList = await call('/habits', { token: tokenA });
  const hRow = (habitList.json?.data?.list ?? []).find((h) => h.id === habitId);
  check(
    '打卡连击计算（昨天+今天=2）',
    hRow?.streak === 2 && hRow?.today === true && hRow?.week?.[6] === true && hRow?.total === 2,
    JSON.stringify(hRow)
  );

  const habitFar = await call(`/habits/${habitId}/toggle`, {
    method: 'POST',
    token: tokenA,
    body: { day: '2020-01-01' },
  });
  check('超过 7 天补卡被拒', habitFar.status === 400);

  // 游客导入：完整状态原子写入，响应丢失后按 localId 重试不重复建项。
  const importedTodoBody = {
    localId: `local-smoke-${stamp}-todo`, title: '游客已完成待办', done: true,
    createdAt: '2020-01-01T01:00:00.000Z', doneAt: '2020-01-02T02:00:00.000Z', dueAt: '2020-01-02T03:00:00.000Z',
  };
  const importedTodo = await call('/todos', { method: 'POST', token: tokenA, body: importedTodoBody });
  const importedTodoId = importedTodo.json?.data?.id;
  check('游客待办原子保留完成状态与原日期', importedTodo.status === 200 && importedTodo.json?.data?.done === true &&
    importedTodo.json?.data?.doneAt === importedTodoBody.doneAt && importedTodo.json?.data?.dueAt === importedTodoBody.dueAt);
  await call(`/todos/${importedTodoId}`, { method: 'PATCH', token: tokenA, body: { title: '云端已编辑' } });
  const importedTodoRetry = await call('/todos', { method: 'POST', token: tokenA, body: importedTodoBody });
  check('游客待办重试不重复且不覆盖云端编辑', importedTodoRetry.json?.data?.id === importedTodoId &&
    importedTodoRetry.json?.data?.title === '云端已编辑');
  const importedTodoB = await call('/todos', { method: 'POST', token: tokenB, body: importedTodoBody });
  check('不同用户相同本地标识互不影响', importedTodoB.status === 200 && Boolean(importedTodoB.json?.data?.id) &&
    importedTodoB.json.data.id !== importedTodoId);
  const importedHabitBody = { localId: `local-smoke-${stamp}-habit`, name: '游客历史打卡', days: ['2020-01-01', yKey] };
  const importedHabits = await Promise.all(Array.from({ length: 4 }, () => call('/habits', {
    method: 'POST', token: tokenA, body: importedHabitBody,
  })));
  const importedHabitId = importedHabits[0].json?.data?.id;
  check('并发导入打卡保留历史且只创建一项', Boolean(importedHabitId) && importedHabits.every((r) =>
    r.status === 200 && r.json?.data?.id === importedHabitId && r.json?.data?.total === 2));
  const importedHabitRetry = await call('/habits', { method: 'POST', token: tokenA, body: importedHabitBody });
  check('重试导入不会反转已有打卡', importedHabitRetry.json?.data?.id === importedHabitId && importedHabitRetry.json?.data?.total === 2);

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

  // ===== 群投票 =====
  const pollBad = await call(`/groups/${gid}/polls`, {
    method: 'POST',
    token: tokenA,
    body: { question: '只有一个选项', options: ['A'] },
  });
  check('投票选项不足被拒', pollBad.status === 400);

  const dl = new Date(Date.now() + 3600000).toISOString();
  const poll = await call(`/groups/${gid}/polls`, {
    method: 'POST',
    token: tokenA,
    body: { question: '晚饭吃什么', options: ['火锅', '烧烤', '日料'], multi: false, deadline: dl },
  });
  const pollId = poll.json?.data?.id;
  const optIds = (poll.json?.data?.options ?? []).map((o) => o.id);
  check('发起单选投票', Boolean(pollId) && optIds.length === 3);

  const voteB = await call(`/groups/${gid}/polls/${pollId}/vote`, {
    method: 'POST',
    token: tokenB,
    body: { optionIds: [optIds[0]] },
  });
  check('B 投票', voteB.json?.data?.ok === true);

  const voteMulti = await call(`/groups/${gid}/polls/${pollId}/vote`, {
    method: 'POST',
    token: tokenB,
    body: { optionIds: [optIds[0], optIds[1]] },
  });
  check('单选取多项被拒', voteMulti.status === 400);

  const voteBad = await call(`/groups/${gid}/polls/${pollId}/vote`, {
    method: 'POST',
    token: tokenB,
    body: { optionIds: ['not-exist'] },
  });
  check('无效选项被拒', voteBad.status === 400);

  const pollsB = await call(`/groups/${gid}/polls`, { token: tokenB });
  const pB = (pollsB.json?.data?.list ?? []).find((p) => p.id === pollId);
  check(
    '投票结果计数与我的票',
    pB?.myOptionIds?.[0] === optIds[0] && pB?.options?.[0]?.count === 1 && pB?.votedCount === 1 && pB?.closed === false,
    JSON.stringify(pB)
  );

  // 覆盖式改票：B 改投第 2 项，第 1 项计数应清零
  await call(`/groups/${gid}/polls/${pollId}/vote`, {
    method: 'POST',
    token: tokenB,
    body: { optionIds: [optIds[1]] },
  });
  const pollsB2 = await call(`/groups/${gid}/polls`, { token: tokenB });
  const pB2 = (pollsB2.json?.data?.list ?? []).find((p) => p.id === pollId);
  check(
    '改票后旧票清零',
    pB2?.myOptionIds?.[0] === optIds[1] && pB2?.options?.[0]?.count === 0 && pB2?.options?.[1]?.count === 1,
    JSON.stringify(pB2)
  );

  // 多选投票
  const mpoll = await call(`/groups/${gid}/polls`, {
    method: 'POST',
    token: tokenA,
    body: { question: '带什么', options: ['帐篷', '炉子'], multi: true },
  });
  const moptIds = (mpoll.json?.data?.options ?? []).map((o) => o.id);
  const mvote = await call(`/groups/${gid}/polls/${mpoll.json?.data?.id}/vote`, {
    method: 'POST',
    token: tokenB,
    body: { optionIds: moptIds },
  });
  check('多选投票', mvote.json?.data?.ok === true);

  const past = await call(`/groups/${gid}/polls`, {
    method: 'POST',
    token: tokenA,
    body: { question: '立刻截止', options: ['A', 'B'], deadline: new Date(Date.now() - 1000).toISOString() },
  });
  check('截止时间早于现在被拒', past.status === 400);

  // 1.5 秒后截止的投票，等它过期再投 → 拒绝
  const soon = await call(`/groups/${gid}/polls`, {
    method: 'POST',
    token: tokenA,
    body: { question: '马上截止', options: ['A', 'B'], deadline: new Date(Date.now() + 1500).toISOString() },
  });
  await new Promise((r) => setTimeout(r, 2200));
  const lateVote = await call(`/groups/${gid}/polls/${soon.json?.data?.id}/vote`, {
    method: 'POST',
    token: tokenB,
    body: { optionIds: [soon.json?.data?.options?.[0]?.id] },
  });
  check('截止后投票被拒', lateVote.status === 400);

  const delByB = await call(`/groups/${gid}/polls/${pollId}`, { method: 'DELETE', token: tokenB });
  check('非发起人删投票被拒', delByB.status === 403);
  const delPoll = await call(`/groups/${gid}/polls/${pollId}`, { method: 'DELETE', token: tokenA });
  check('发起人删除投票', delPoll.json?.data?.ok === true);

  // ===== 群倒数日 =====
  const gcdBad = await call(`/groups/${gid}/countdowns`, {
    method: 'POST',
    token: tokenA,
    body: { name: '', targetDate: '2030-01-01' },
  });
  check('群倒数日名称为空被拒', gcdBad.status === 400);

  const gcd = await call(`/groups/${gid}/countdowns`, {
    method: 'POST',
    token: tokenA,
    body: { name: '结婚纪念日', targetDate: '2030-05-01' },
  });
  const gcdId = gcd.json?.data?.id;
  check('创建群倒数日', Boolean(gcdId));

  const gcdList = await call(`/groups/${gid}/countdowns`, { token: tokenB });
  check('群倒数日列表全员可见', (gcdList.json?.data?.list ?? []).some((c) => c.id === gcdId));

  const gcdDel = await call(`/groups/${gid}/countdowns/${gcdId}`, { method: 'DELETE', token: tokenB });
  check('成员删除群倒数日', gcdDel.json?.data?.ok === true);

  // ===== 群接龙 =====
  const chainBad = await call(`/groups/${gid}/chains`, {
    method: 'POST',
    token: tokenA,
    body: { title: '' },
  });
  check('接龙标题为空被拒', chainBad.status === 400);

  const chain = await call(`/groups/${gid}/chains`, {
    method: 'POST',
    token: tokenA,
    body: { title: '周六爬山报名' },
  });
  const chainId = chain.json?.data?.id;
  check('发起接龙', Boolean(chainId));

  const j1 = await call(`/groups/${gid}/chains/${chainId}/entries`, {
    method: 'POST',
    token: tokenA,
    body: { remark: '带两瓶水' },
  });
  check('A 接龙', Boolean(j1.json?.data?.id));

  const j2 = await call(`/groups/${gid}/chains/${chainId}/entries`, {
    method: 'POST',
    token: tokenB,
    body: { remark: '' },
  });
  check('B 接龙', Boolean(j2.json?.data?.id));

  // 重复提交 = 更新备注（一人一条，按加入顺序编号）
  await call(`/groups/${gid}/chains/${chainId}/entries`, {
    method: 'POST',
    token: tokenA,
    body: { remark: '带三瓶水' },
  });
  const chainsList = await call(`/groups/${gid}/chains`, { token: tokenA });
  const cRow = (chainsList.json?.data?.list ?? []).find((x) => x.id === chainId);
  check(
    '接龙一人一条且备注可更新',
    cRow?.entries?.length === 2 && cRow?.entries?.[0]?.remark === '带三瓶水' && Boolean(cRow?.myEntry),
    JSON.stringify(cRow?.entries)
  );

  const closeByB = await call(`/groups/${gid}/chains/${chainId}`, {
    method: 'PATCH',
    token: tokenB,
    body: { closed: true },
  });
  check('非发起人截止被拒', closeByB.status === 403);

  await call(`/groups/${gid}/chains/${chainId}`, {
    method: 'PATCH',
    token: tokenA,
    body: { closed: true },
  });
  const afterClose = await call(`/groups/${gid}/chains/${chainId}/entries`, {
    method: 'POST',
    token: tokenB,
    body: { remark: '再接' },
  });
  check('截止后接龙被拒', afterClose.status === 400);

  const listB = await call(`/groups/${gid}/chains`, { token: tokenB });
  const myB = (listB.json?.data?.list ?? []).find((x) => x.id === chainId)?.myEntry;
  const quit = await call(`/groups/${gid}/chains/${chainId}/entries/${myB?.id}`, {
    method: 'DELETE',
    token: tokenB,
  });
  check('B 退出自己的接龙', quit.json?.data?.ok === true);

  const chainDelByB = await call(`/groups/${gid}/chains/${chainId}`, { method: 'DELETE', token: tokenB });
  check('非发起人删接龙被拒', chainDelByB.status === 403);

  const delChain = await call(`/groups/${gid}/chains/${chainId}`, { method: 'DELETE', token: tokenA });
  check('发起人删除接龙', delChain.json?.data?.ok === true);


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

  // 便签定期提醒
  const noteRem = await call('/reminders', {
    method: 'POST',
    token: tokenA,
    body: {
      toolType: 'note',
      targetId: note.json?.data?.id,
      remindAt,
      repeat: 'daily',
      templateId: 'TPL_NOTE',
    },
  });
  check(
    '创建便签定期提醒',
    noteRem.json?.data?.repeat === 'daily' && noteRem.json?.data?.templateId === 'TPL_NOTE',
    JSON.stringify(noteRem.json?.data)
  );

  const badRepeat = await call('/reminders', {
    method: 'POST',
    token: tokenA,
    body: { toolType: 'note', targetId: note.json?.data?.id, remindAt, repeat: 'yearly' },
  });
  check('非法周期被拒', badRepeat.status === 400);

  const noteForDel = await call('/notes', { method: 'POST', token: tokenA, body: { title: '将被删的便签' } });
  const nr2 = await call('/reminders', {
    method: 'POST',
    token: tokenA,
    body: { toolType: 'note', targetId: noteForDel.json?.data?.id, remindAt },
  });
  await call(`/notes/${noteForDel.json?.data?.id}`, { method: 'DELETE', token: tokenA });
  const afterNoteDel = await call('/reminders', { token: tokenA });
  check(
    '删便签级联清提醒',
    !(afterNoteDel.json?.data?.list ?? []).some((x) => x.id === nr2.json?.data?.id)
  );

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

  // ===== 群组列表（含成员昵称预览）=====
  const myGroups = await call('/groups', { token: tokenA });
  check(
    '群组列表含成员昵称预览',
    myGroups.json?.data?.groups?.some(
      (x) => x.memberNames?.includes('阿甲') && typeof x.memberCount === 'number'
    ),
    JSON.stringify(myGroups.json?.data?.groups?.[0])
  );

  // ===== 数据导出 =====
  const exportA = await call('/auth/export', { token: tokenA });
  const exp = exportA.json?.data;
  check(
    '数据导出含全部分区',
    exportA.status === 200 &&
      ['todos', 'notes', 'accounts', 'countdowns', 'reminders', 'foods', 'wheels', 'habits', 'habitLogs', 'groups'].every(
        (k) => Array.isArray(exp?.[k])
      ),
    JSON.stringify(exportA.json).slice(0, 120)
  );
  check('导出内容含刚建的待办', exp?.todos?.some((t) => t.title === '冒烟待办') === true);
  check('导出不泄露 openid', JSON.stringify(exportA.json).includes('openid') === false);

  const exportNoAuth = await call('/auth/export');
  check('未登录导出被拒', exportNoAuth.status === 401);

  // ===== 天气订阅 =====
  const wxBadLoc = await call('/weather/now?location=../../etc', { token: tokenA });
  check('天气 location 不合法被拒', wxBadLoc.status === 400);

  const wxNow = await call('/weather/now?location=101020100', { token: tokenA });
  check('实时天气可查', wxNow.status === 200 && Boolean(wxNow.json?.data?.now?.temp), JSON.stringify(wxNow.json).slice(0, 100));

  const wxCities = await call('/weather/cities?q=%E6%9D%AD%E5%B7%9E', { token: tokenA });
  check('城市搜索返回列表', wxCities.status === 200 && Array.isArray(wxCities.json?.data?.list));

  const wxSubBad = await call('/weather/subscription', {
    method: 'POST',
    token: tokenA,
    body: { city: '上海', location: 'not an id!' },
  });
  check('天气订阅 location 非法被拒', wxSubBad.status === 400);

  const wxSub = await call('/weather/subscription', {
    method: 'POST',
    token: tokenA,
    body: { city: '上海', location: '101020100' },
  });
  check('订阅天气推送', wxSub.status === 200 && wxSub.json?.data?.city === '上海' && wxSub.json?.data?.remain === 1);

  const wxSubList = await call('/reminders', { token: tokenA });
  check('天气订阅出现在提醒列表', wxSubList.json?.data?.list?.some((r) => r.toolType === 'weather' && r.repeat === 'daily') === true);

  const wxSub2 = await call('/weather/subscription', {
    method: 'POST',
    token: tokenA,
    body: { city: '北京', location: '101010100' },
  });
  const wxSubCount = await call('/reminders', { token: tokenA });
  check('换城市后仍只有一条订阅', wxSub2.json?.data?.city === '北京' &&
    wxSubCount.json?.data?.list?.filter((r) => r.toolType === 'weather' && r.status === 'pending').length === 1);

  // 换城市会替换旧订阅：旧 id 的 grant 应 404，新订阅 grant 后额度 +1
  const wxGrantOld = await call(`/reminders/${wxSub.json?.data?.id}/grant`, { method: 'POST', token: tokenA });
  check('被替换的旧订阅不可再操作', wxGrantOld.status === 404);

  const wxGrant = await call(`/reminders/${wxSub2.json?.data?.id}/grant`, { method: 'POST', token: tokenA });
  check('天气订阅可补充额度', wxGrant.json?.data?.remain === 2);

  const concurrentSubs = await Promise.all(Array.from({ length: 8 }, (_, i) => call('/weather/subscription', {
    method: 'POST', token: tokenA, body: { city: `测试城市${i}`, location: '101010100' },
  })));
  const concurrentReminders = await call('/reminders', { token: tokenA });
  check('并发换城市不产生重复天气订阅', concurrentSubs.every((r) => r.status === 200) &&
    concurrentReminders.json?.data?.list?.filter((r) => r.toolType === 'weather' && r.status === 'pending').length === 1);

  const wxDel = await call('/weather/subscription', { method: 'DELETE', token: tokenA });
  const wxAfter = await call('/weather/subscription', { token: tokenA });
  check('取消天气订阅', wxDel.json?.data?.ok === true && wxAfter.json?.data === null);

  // ===== 反馈与管理员公告（需以 ADMIN_OPENIDS=dev-admin 启动服务；login('admin') => openid dev-admin）=====
  const fbBad = await call('/feedback', {
    method: 'POST',
    token: tokenA,
    body: { kind: 'haha', content: '至少五个字的内容' },
  });
  check('反馈类型不合法被拒', fbBad.status === 400);

  const fb = await call('/feedback', {
    method: 'POST',
    token: tokenA,
    body: { kind: 'tool', content: '希望加一个喝水提醒工具' },
  });
  check('提交反馈', Boolean(fb.json?.data?.id));

  const annAll = await call('/announcements');
  check('公告列表可匿名读', annAll.status === 200 && Array.isArray(annAll.json?.data?.list));

  const annNoAdmin = await call('/admin/announcements', {
    method: 'POST',
    token: tokenA,
    body: { title: '越权', content: '不应该成功' },
  });
  check('非管理员发公告被拒', annNoAdmin.status === 403);

  const tokenAdmin = await login('admin');
  const ann = await call('/admin/announcements', {
    method: 'POST',
    token: tokenAdmin,
    body: { title: `冒烟公告 ${stamp}`, content: '冒烟测试发布的公告内容' },
  });
  check('管理员发布公告', Boolean(ann.json?.data?.id));

  const annPublic = await call('/announcements');
  check(
    '公告对所有人可见',
    (annPublic.json?.data?.list ?? []).some((x) => x.title === `冒烟公告 ${stamp}`)
  );

  const fbList = await call('/admin/feedback', { token: tokenAdmin });
  check(
    '管理员查看反馈',
    (fbList.json?.data?.list ?? []).some((x) => x.content === '希望加一个喝水提醒工具')
  );

  // ===== 网页管理后台（需以 ADMIN_PASSWORD=dev-pass 启动服务）=====
  const webBad = await call('/admin-web/login', { method: 'POST', body: { password: 'wrong' } });
  check('网页后台错密码被拒', webBad.status === 401);

  const web = await call('/admin-web/login', { method: 'POST', body: { password: 'dev-pass' } });
  const webToken = web.json?.data?.token;
  check('网页后台密码换 token', Boolean(webToken));

  const webList = await call('/admin/feedback', { token: webToken });
  check(
    '网页 admin token 可访问管理接口',
    webList.status === 200 && Array.isArray(webList.json?.data?.list)
  );

  const webUsers = await call('/admin/users', { token: webToken });
  check(
    '用户概览不泄露 openid',
    webUsers.status === 200 && JSON.stringify(webUsers.json).includes('openid') === false
  );

  // ===== 账号注销（放在最后：B 的数据会被级联删除）=====
  const delB = await call('/auth/me', { method: 'DELETE', token: tokenB });
  check('注销账号 B', delB.json?.data?.ok === true, JSON.stringify(delB.json));

  const meB = await call('/auth/me', { token: tokenB });
  check('注销后旧 token 失效', meB.status === 401);

  const delBAgain = await call('/auth/me', { method: 'DELETE', token: tokenB });
  check('重复注销被拒', delBAgain.status === 401);

  const meA2 = await call('/auth/me', { token: tokenA });
  check('注销 B 不影响 A', meA2.status === 200 && meA2.json?.data?.user?.id != null);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('冒烟测试异常:', e);
  process.exit(1);
});
