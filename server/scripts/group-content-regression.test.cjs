const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function harness({ reject = 0, member = true, checkHook } = {}) {
  const checks = [];
  const writes = [];
  const item = { id: 'item-1', groupId: 'group-1', content: '原内容', note: '原备注' };
  const create = async ({ data }) => { writes.push(structuredClone(data)); return data; };
  const prisma = {
    groupMember: { async findUnique() { return member ? { id: 'member-1' } : null; } },
    groupListItem: {
      create,
      async findFirst({ where }) { return where.id === item.id && where.groupId === item.groupId ? { ...item } : null; },
      async updateMany({ where, data }) {
        if (where.id !== item.id || where.groupId !== item.groupId) return { count: 0 };
        if (where.content !== undefined && where.content !== item.content) return { count: 0 };
        if (where.note !== undefined && where.note !== item.note) return { count: 0 };
        writes.push(structuredClone(data)); Object.assign(item, data); return { count: 1 };
      },
    },
    groupScore: { create },
    groupEvent: { create },
    group: { async update({ data }) { writes.push(structuredClone(data)); return data; } },
  };
  const sandbox = { exports: {}, require(name) {
    if (name === '../plugins/db') return { prisma };
    if (name === '../lib/seccheck') return { async assertContentSafe(text, openid) {
      checks.push({ text, openid });
      if (reject) throw Object.assign(new Error('检测拒绝'), { statusCode: reject });
      if (checkHook) await checkHook(text, checks.length);
    } };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/routes/group-tools.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, sandbox);
  const handlers = {};
  const app = { addHook() {}, authenticate() {}, requirePro() {} };
  for (const method of ['get', 'post', 'patch', 'delete']) {
    app[method] = (route, ...rest) => { handlers[`${method} ${route}`] = rest.at(-1); };
  }
  await sandbox.exports.groupToolRoutes(app);
  return {
    checks, writes, item,
    async call(method, route, body, params = {}) {
      let status = 200;
      const reply = { code(value) { status = value; return this; }, send(value) { return value; } };
      const result = await handlers[`${method} ${route}`]({
        user: { sub: 'user-1', openid: 'openid-1' },
        params: { id: 'group-1', itemId: 'item-1', ...params }, body,
      }, reply);
      return { status, body: result };
    },
  };
}

for (const status of [400, 503]) {
  test(`editing shared content never writes when checking rejects with ${status}`, async () => {
    const app = await harness({ reject: status });
    await assert.rejects(app.call('patch', '/groups/:id/items/:itemId', { content: '新内容' }), { statusCode: status });
    assert.equal(app.writes.length, 0);
    assert.equal(app.checks[0].text, '新内容 原备注');
  });
}

test('editing only a note checks it together with the retained content', async () => {
  const app = await harness();
  const result = await app.call('patch', '/groups/:id/items/:itemId', { note: '新备注' });
  assert.equal(result.status, 200);
  assert.equal(app.checks[0]?.text, '原内容 新备注');
  assert.equal(app.checks[0]?.openid, 'openid-1');
  assert.equal(app.item.note, '新备注');
});

test('editing both fields checks the exact trimmed and truncated stored text', async () => {
  const app = await harness();
  await app.call('patch', '/groups/:id/items/:itemId', { content: ' 新内容 ', note: 'n'.repeat(300) + '不会入库的后缀' });
  assert.equal(app.checks[0]?.text, `${app.item.content} ${app.item.note}`);
  assert.equal(app.item.content, '新内容');
  assert.equal(app.item.note.length, 300);
});

test('pure completion and pin updates remain usable without a content check', async () => {
  const app = await harness({ reject: 503 });
  const result = await app.call('patch', '/groups/:id/items/:itemId', { done: true, pinned: true });
  assert.equal(result.status, 200);
  assert.equal(app.checks.length, 0);
  assert.equal(app.item.done, true);
  assert.equal(app.item.pinned, true);
});

test('missing and other-group items return 404 without checking or writing their contents', async () => {
  for (const params of [{ itemId: 'missing' }, { id: 'other-group' }]) {
    const app = await harness({ reject: 503 });
    const result = await app.call('patch', '/groups/:id/items/:itemId', { content: '新内容' }, params);
    assert.equal(result.status, 404);
    assert.equal(app.checks.length, 0);
    assert.equal(app.writes.length, 0);
  }
});

test('non-members cannot trigger content checks or writes', async () => {
  const app = await harness({ member: false });
  const result = await app.call('patch', '/groups/:id/items/:itemId', { note: '新备注' });
  assert.equal(result.status, 403);
  assert.equal(app.checks.length, 0);
  assert.equal(app.writes.length, 0);
});

test('new list items check only the actual stored content and note', async () => {
  const app = await harness();
  await app.call('post', '/groups/:id/items', { content: ' 清单 ', note: 'n'.repeat(300) + '未存储' });
  assert.equal(app.checks[0]?.text, `${app.writes[0].content} ${app.writes[0].note}`);
});

for (const status of [400, 503]) {
  test(`score reasons do not publish when checking rejects with ${status}`, async () => {
    const app = await harness({ reject: status });
    await assert.rejects(app.call('post', '/groups/:id/scores', { delta: 1, reason: '计分说明' }), { statusCode: status });
    assert.equal(app.writes.length, 0);
  });
}

test('score reasons are checked after truncation and can publish when accepted', async () => {
  const app = await harness();
  const result = await app.call('post', '/groups/:id/scores', { delta: 1, reason: 'r'.repeat(80) + '未存储' });
  assert.equal(result.status, 200);
  assert.equal(app.checks[0]?.text, app.writes[0].reason);
});

test('events check their actual stored place rather than the unbounded input', async () => {
  const app = await harness();
  await app.call('post', '/groups/:id/events', { title: '活动', startAt: '2027-01-01', place: 'p'.repeat(120) + '未存储' });
  assert.equal(app.checks[0]?.text, `${app.writes[0].title} ${app.writes[0].place}`);
});

test('custom tool labels are checked after normalizing the persisted labels', async () => {
  const app = await harness();
  const result = await app.call('patch', '/groups/:id/tools', { tools: [{ key: 'custom', label: '  自定义  ', kind: 'custom' }] });
  assert.equal(result.status, 200);
  const stored = JSON.parse(app.writes[0].tools);
  assert.equal(app.checks[0]?.text, stored[0].label);
});

test('concurrent text edits cannot persist an unchecked field combination', async () => {
  let release;
  let checked;
  const waiting = new Promise((resolve) => { checked = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const app = await harness({ async checkHook(_text, count) {
    if (count === 1) { checked(); await blocked; }
  } });
  const first = app.call('patch', '/groups/:id/items/:itemId', { content: '新内容' });
  await waiting;
  const second = await app.call('patch', '/groups/:id/items/:itemId', { note: '新备注' });
  release();
  assert.equal(second.status, 200);
  assert.equal((await first).status, 409);
  assert.equal(app.item.content, '原内容');
  assert.equal(app.item.note, '新备注');
  assert.equal(app.writes.length, 1);
});
