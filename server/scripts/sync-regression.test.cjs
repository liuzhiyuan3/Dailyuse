const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports, globals = {}) {
  const sandbox = { exports: {}, Date, ...globals, require(name) {
    if (name in imports) return imports[name];
    if (name === 'node:crypto') return require(name);
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, sandbox);
  return sandbox.exports;
}

function localData(request, saved) {
  return load('../../miniapp/src/utils/localData.ts', { '@/api/http': { request } }, {
    uni: { getStorageSync: (key) => structuredClone(saved[key]), setStorageSync: (key, value) => { saved[key] = structuredClone(value); } },
  });
}

async function routes(file, name, prisma) {
  const handlers = {};
  const app = { addHook() {}, get() {}, patch() {}, delete() {}, post(route, handler) { handlers[route] = handler; } };
  await load(file, { '../plugins/db': { prisma } })[name](app);
  return async (route, body, userId = 'u1') => {
    let status = 200;
    const reply = { code(code) { status = code; return this; }, send(body) { return body; } };
    return { body: await handlers[route]({ user: { sub: userId }, body }, reply), status };
  };
}

test('guest todo upload includes all state in one atomic POST', async () => {
  const todo = { id: 'local-todo-1', title: 'done', category: 'default', done: true, doneAt: '2026-01-01T12:00:00Z', dueAt: '2026-01-03T12:00:00Z', createdAt: '2026-01-01T11:00:00Z' };
  const saved = { dailyuse_local_todos: [todo] };
  const calls = [];
  const api = localData(async (route, options) => { calls.push({ route, options }); return { id: 'cloud' }; }, saved);
  assert.equal(await api.mergeLocalData(), 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.data.doneAt, todo.doneAt);
  assert.equal(calls[0].options.data.done, true);
  assert.equal(calls[0].options.data.dueAt, todo.dueAt);
  assert.equal(calls[0].options.data.localId, todo.id);
  assert.equal(saved.dailyuse_local_todos.length, 0);
});

test('failed guest upload preserves complete local data for retry', async () => {
  const habit = { id: 'local-habit-1', name: 'read', days: ['2020-01-01', '2020-01-02'], createdAt: '2020-01-01T00:00:00Z' };
  const saved = { dailyuse_local_habits: [habit] };
  const api = localData(async () => { throw new Error('network'); }, saved);
  assert.equal(await api.mergeLocalData(), 0);
  assert.deepEqual(saved.dailyuse_local_habits, [habit]);
});

test('guest habit uploads historical days together without toggle requests', async () => {
  const habit = { id: 'local-habit-1', name: 'read', days: ['2020-01-01', '2020-01-02'], createdAt: '2020-01-01T00:00:00Z' };
  const saved = { dailyuse_local_habits: [habit] };
  const calls = [];
  const api = localData(async (route, options) => { calls.push({ route, options }); return { id: 'cloud' }; }, saved);
  assert.equal(await api.mergeLocalData(), 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0].options.data.days), habit.days);
  assert.equal(calls[0].options.data.localId, habit.id);
});

function model() {
  const rows = new Map();
  const api = {
    async count({ where }) { return [...rows.values()].filter((row) => row.userId === where.userId).length; },
    async findUnique({ where }) { return rows.get(where.id) || null; },
    async create({ data }) {
      const row = { ...data, id: data.id || `generated-${rows.size}`, logs: (data.logs?.create || []).map((log) => ({ ...log })), createdAt: data.createdAt || new Date() };
      rows.set(row.id, row);
      return row;
    },
    async upsert({ where, create }) { return rows.get(where.id) || api.create({ data: create }); },
  };
  return { api, rows };
}

test('todo import preserves completion date and retries after lost response without duplicate or overwrite', async () => {
  const db = model();
  const post = await routes('../src/routes/todos.ts', 'todoRoutes', { todo: db.api });
  const payload = { localId: 'local-todo-1', title: 'done', done: true, doneAt: '2020-01-01T12:00:00Z', createdAt: '2020-01-01T11:00:00Z', dueAt: '2020-01-03T12:00:00Z' };
  const first = await post('/todos', payload);
  assert.equal(first.status, 200);
  assert.equal(first.body.data.done, true);
  assert.equal(first.body.data.doneAt.toISOString(), payload.doneAt.replace('Z', '.000Z'));
  first.body.data.title = 'edited on cloud';
  const retry = await post('/todos', payload);
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal(retry.body.data.title, 'edited on cloud');
  assert.equal(db.rows.size, 1);
  const otherUser = await post('/todos', payload, 'u2');
  assert.notEqual(otherUser.body.data.id, first.body.data.id);
});

test('habit import atomically preserves history and repeated import never toggles it off', async () => {
  const db = model();
  const post = await routes('../src/routes/habits.ts', 'habitRoutes', { habit: db.api });
  const payload = { localId: 'local-habit-1', name: 'read', createdAt: '2020-01-01T00:00:00Z', days: ['2020-01-01', '2020-01-02', '2020-01-02'] };
  const first = await post('/habits', payload);
  assert.equal(first.status, 200);
  assert.equal(first.body.data.total, 2);
  const row = db.rows.get(first.body.data.id);
  assert.equal(row.logs.length, 2);
  const retry = await post('/habits', payload);
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal(retry.body.data.total, 2);
  assert.equal(db.rows.size, 1);
  const otherUser = await post('/habits', payload, 'u2');
  assert.notEqual(otherUser.body.data.id, first.body.data.id);
});

test('invalid todo state and habit calendar dates are rejected before writes', async () => {
  const todos = model();
  const postTodo = await routes('../src/routes/todos.ts', 'todoRoutes', { todo: todos.api });
  assert.equal((await postTodo('/todos', { title: 'a', done: 'yes' })).status, 400);
  assert.equal((await postTodo('/todos', { title: 'a', doneAt: 'bad date' })).status, 400);
  assert.equal(todos.rows.size, 0);
  const habits = model();
  const postHabit = await routes('../src/routes/habits.ts', 'habitRoutes', { habit: habits.api });
  assert.equal((await postHabit('/habits', { name: 'read', days: ['2026-02-30'] })).status, 400);
  assert.equal((await postHabit('/habits', { name: 'read', days: ['2999-01-01'] })).status, 400);
  assert.equal(habits.rows.size, 0);
});

for (const tool of ['todos', 'habits']) {
  test(`${tool} response lost after commit keeps local copy and retry creates no duplicate`, async () => {
    const db = model();
    const post = await routes(`../src/routes/${tool}.ts`, tool === 'todos' ? 'todoRoutes' : 'habitRoutes', {
      [tool === 'todos' ? 'todo' : 'habit']: db.api,
    });
    const item = tool === 'todos'
      ? { id: 'local-todo-1', title: 'done', done: true, doneAt: '2020-01-01T12:00:00Z', createdAt: '2020-01-01T11:00:00Z' }
      : { id: 'local-habit-1', name: 'read', days: ['2020-01-01'], createdAt: '2020-01-01T00:00:00Z' };
    const saved = { [`dailyuse_local_${tool}`]: [item] };
    let lost = true;
    const api = localData(async (route, { data }) => {
      const response = await post(route, data);
      assert.equal(response.status, 200);
      if (lost) { lost = false; throw new Error('response lost after commit'); }
      return response.body.data;
    }, saved);
    assert.equal(await api.mergeLocalData(), 0);
    assert.equal(saved[`dailyuse_local_${tool}`].length, 1);
    assert.equal(db.rows.size, 1);
    assert.equal(await api.mergeLocalData(), 1);
    assert.equal(saved[`dailyuse_local_${tool}`].length, 0);
    assert.equal(db.rows.size, 1);
    if (tool === 'habits') assert.equal([...db.rows.values()][0].logs.length, 1);
  });
}
