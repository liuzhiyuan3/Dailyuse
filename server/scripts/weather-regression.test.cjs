const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function weatherApp() {
  let rows = [];
  let nextId = 0;
  let tail = Promise.resolve();
  const reminder = {
    async deleteMany({ where }) {
      rows = rows.filter((r) => r.userId !== where.userId || r.status !== where.status);
    },
    async create({ data }) {
      const row = { ...data, id: String(++nextId), status: 'pending' };
      rows.push(row);
      return row;
    },
  };
  const prisma = {
    reminder,
    async $transaction(run) {
      let unlock;
      let previous;
      const tx = {
        reminder,
        user: {
          async update() {
            previous = tail;
            tail = new Promise((resolve) => { unlock = resolve; });
            await previous;
          },
        },
      };
      try { return await run(tx); } finally { unlock?.(); }
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/weather.ts'), 'utf8');
  const sandbox = {
    exports: {},
    require(name) {
      if (name === '../plugins/db') return { prisma };
      if (name === '../config') return { config: { wx: { weatherTemplateId: 'test' } } };
      if (name === '../lib/qweather') return { qweatherConfigured: true };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, sandbox);
  const handlers = {};
  const app = { addHook() {}, get() {}, delete() {}, post(route, handler) { handlers[route] = handler; } };
  return {
    ready: sandbox.exports.weatherRoutes(app),
    async subscribe(userId, city) {
      return handlers['/weather/subscription']({
        user: { sub: userId }, body: { city, location: '101010100' },
      }, { code() { throw new Error('Unexpected error response'); } });
    },
    rows: () => rows,
  };
}

test('concurrent weather subscriptions leave one pending reminder per user', async () => {
  const app = weatherApp();
  await app.ready;
  await Promise.all([app.subscribe('u1', '北京'), app.subscribe('u1', '上海')]);
  assert.equal(app.rows().length, 1);
  assert.equal(app.rows()[0].city, '上海');
});

test('replacing a weather subscription does not delete another user subscription', async () => {
  const app = weatherApp();
  await app.ready;
  await app.subscribe('u2', '广州');
  await app.subscribe('u1', '北京');
  await app.subscribe('u1', '上海');
  assert.equal(app.rows().length, 2);
  assert.equal(app.rows().find((r) => r.userId === 'u2').city, '广州');
});
