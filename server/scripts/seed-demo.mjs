// 本地演示数据：node scripts/seed-demo.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000/api';

async function call(path, opt = {}) {
  const res = await fetch(BASE + path, {
    method: opt.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opt.token ? { Authorization: 'Bearer ' + opt.token } : {}),
    },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

(async () => {
  const login = await call('/auth/login', { method: 'POST', body: { code: 'demo' } });
  const token = login.json?.data?.token;
  if (!token) throw new Error('登录失败');
  const t = (p, o = {}) => call(p, { ...o, token });

  // 待办
  for (const title of ['写周报', '买牛奶和面包', '给奶奶打电话', '预约体检']) {
    await t('/todos', { method: 'POST', body: { title } });
  }
  const todos = (await t('/todos')).json.data.list;
  if (todos[0]) await t('/todos/' + todos[0].id, { method: 'PATCH', body: { done: true } });
  if (todos[1]) await t('/todos/' + todos[1].id, { method: 'PATCH', body: { dueAt: new Date().toISOString() } });

  // 便签
  await t('/notes', { method: 'POST', body: { title: '周末清单', content: '帐篷、炭火、驱蚊液', pinned: true } });
  await t('/notes', { method: 'POST', body: { title: '常用地址', content: '公司：3 号楼 12 层' } });

  // 记账
  for (const a of [
    { type: 'expense', amount: 45, category: '餐饮', remark: '午饭' },
    { type: 'expense', amount: 12, category: '交通', remark: '地铁' },
    { type: 'expense', amount: 299, category: '购物', remark: '耳机' },
    { type: 'income', amount: 8000, category: '工资', remark: '本月' },
  ]) {
    await t('/accounts', { method: 'POST', body: a });
  }

  // 倒数日
  await t('/countdowns', { method: 'POST', body: { name: '生日', targetDate: daysFromNow(10), pinned: true } });
  await t('/countdowns', { method: 'POST', body: { name: '还信用卡', targetDate: daysFromNow(3) } });

  // 美食
  for (const f of [
    { kind: 'ate', content: '豆浆油条' },
    { kind: 'ate', content: '番茄牛腩面' },
    { kind: 'want', content: '日式咖喱' },
    { kind: 'want', content: '楼下的烤肉' },
  ]) {
    await t('/foods', { method: 'POST', body: f });
  }

  // 群组
  const g = await t('/groups', { method: 'POST', body: { name: '一家人' } });
  const gid = g.json?.data?.id;

  await t('/groups/' + gid + '/tools', {
    method: 'PATCH',
    body: {
      tools: [
        { key: 'todo', label: '待办', kind: 'todo' },
        { key: 'list', label: '清单', kind: 'list' },
        { key: 'expense', label: '记账', kind: 'expense' },
        { key: 'notice', label: '公告', kind: 'notice' },
        { key: 'recipe', label: '菜谱', kind: 'recipe' },
        { key: 'parcel', label: '快递', kind: 'parcel' },
        { key: 'score', label: '计分', kind: 'score' },
        { key: 'order', label: '点餐', kind: 'order' },
      ],
    },
  });

  for (const title of ['交水电费', '买周末的菜', '取快递']) {
    await t('/groups/' + gid + '/todos', { method: 'POST', body: { title } });
  }

  const addItem = (content, note, toolKey) =>
    t('/groups/' + gid + '/items', { method: 'POST', body: { content, note, toolKey } });

  await addItem('牛奶', '', 'list');
  await addItem('鸡蛋', '', 'list');
  await addItem('面包', '', 'list');
  await addItem('本周六下午大扫除，全家参加', '10/24 14:00', 'notice');
  await addItem('番茄牛腩面', '先炒番茄出汁，加水煮面，最后放牛腩', 'recipe');
  await addItem('猫粮', 'SF1234567890', 'parcel');

  for (const e of [
    { title: '超市采购', amount: 128 },
    { title: '外卖', amount: 56 },
  ]) {
    await t('/groups/' + gid + '/expenses', { method: 'POST', body: e });
  }

  await t('/groups/' + gid + '/events', {
    method: 'POST',
    body: { title: '周六露营', startAt: daysFromNow(2) + 'T09:00:00', place: '城郊营地' },
  });

  await t('/groups/' + gid + '/orders', { method: 'POST', body: { content: '火锅' } });
  await t('/groups/' + gid + '/orders', { method: 'POST', body: { content: '烤肉' } });

  // 资讯
  for (const kw of ['AI', '房价']) {
    await t('/subscribes', { method: 'POST', body: { keyword: kw, templateId: 'TPL' } });
    await t('/news/refresh', { method: 'POST', body: { keyword: kw } });
  }

  const summary = (await t('/accounts/summary')).json.data;
  const todoList = (await t('/todos')).json.data.list;
  console.log('待办', todoList.length, '（未完成', todoList.filter((x) => !x.done).length, '）');
  console.log('本月支出 ¥' + summary.expense, '收入 ¥' + summary.income);
  console.log('群组 id:', gid);
  console.log('种子数据完成');
})();
