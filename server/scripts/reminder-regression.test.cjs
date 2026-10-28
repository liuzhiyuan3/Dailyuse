const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ repeat = '', remain = 3, now = '2027-01-31T02:00:00Z', send } = {}) {
  const RealDate = Date;
  let clock = RealDate.parse(now);
  class Clock extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const row = { id: 'r1', userId: 'u1', toolType: 'note', targetId: 'n1', templateId: 'test', repeat, repeatDay: null, remain, status: 'pending', remindAt: new Clock('2027-01-31T01:00:00Z') };
  let sends = 0;
  const prisma = {
    reminder: {
      async findMany() { return row.status === 'pending' && row.remain > 0 && row.remindAt <= new Clock() ? [{ ...row }] : []; },
      async update({ data }) {
        for (const [key, value] of Object.entries(data)) {
          row[key] = value && typeof value === 'object' && 'decrement' in value ? row[key] - value.decrement : value;
        }
        return row;
      },
    },
    user: { async findUnique() { return { openid: 'test' }; } },
    note: { async findUnique() { return { title: 'test' }; } },
    pushLog: { async create() {} },
  };
  const config = { timezone: 'Asia/Shanghai', wx: { templateId: 'test' }, push: { quietStartHour: 0, quietEndHour: 0 } };
  function load(file, expose = '') {
    const sandbox = { exports: {}, Date: Clock, Intl, setInterval, require(name) {
      if (name.endsWith('/plugins/db')) return { prisma };
      if (name.endsWith('/config')) return { config };
      if (name.endsWith('/lib/wechat')) return { sendSubscribeMessage: async () => { sends++; if (send) await send(row); return { ok: true }; } };
      if (name.endsWith('/lib/qweather')) return {};
      return load(path.resolve(path.dirname(file), `${name}.ts`));
    } };
    const source = fs.readFileSync(file, 'utf8') + expose;
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
    return sandbox.exports;
  }
  const jobs = load(path.join(__dirname, '../src/jobs.ts'), '\nexports.__test = { reminderJob, nextOccurrence };').__test;
  return { row, jobs, prisma, load, sends: () => sends, clock: (iso) => { clock = RealDate.parse(iso); }, run: () => jobs.reminderJob({ info() {}, error(e) { throw e; } }) };
}

test('one-shot reminder sends only once even with multiple credits', async () => {
  const h = harness();
  await h.run(); await h.run(); await h.run();
  assert.equal(h.sends(), 1);
  assert.equal(h.row.status, 'sent');
  assert.equal(h.row.remain, 2);
});

test('overlapping rounds do not send the same reminder twice', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const h = harness({ repeat: 'daily', send: () => pending });
  const first = h.run();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const second = h.run();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  release();
  await Promise.all([first, second]);
  assert.equal(h.sends(), 1);
  assert.equal(h.row.remain, 2);
});

test('sending preserves credits granted while the request is in flight', async () => {
  const h = harness({ repeat: 'daily', remain: 2, send: (row) => { row.remain++; } });
  await h.run();
  assert.equal(h.row.remain, 2);
});

test('month-end schedules clamp to February then recover the original day', () => {
  const h = harness();
  const feb = h.jobs.nextOccurrence(new Date('2027-01-31T01:00:00Z'), 'monthly', 31);
  assert.equal(feb.toISOString(), '2027-02-28T01:00:00.000Z');
  h.clock('2027-02-28T02:00:00Z');
  assert.equal(h.jobs.nextOccurrence(feb, 'monthly', 31).toISOString(), '2027-03-31T01:00:00.000Z');
});

test('monthly recurrence uses the configured local calendar across UTC midnight', () => {
  const h = harness({ now: '2028-01-30T17:30:00Z' });
  assert.equal(h.jobs.nextOccurrence(new Date('2028-01-30T17:00:00Z'), 'monthly', 31).toISOString(), '2028-02-28T17:00:00.000Z');
});

test('monthly catch-up keeps the original day across several missed months', () => {
  const h = harness({ now: '2027-04-29T02:00:00Z' });
  assert.equal(h.jobs.nextOccurrence(new Date('2027-01-31T01:00:00Z'), 'monthly', 31).toISOString(), '2027-04-30T01:00:00.000Z');
});

test('legacy monthly reminder stores its local day when first sent', async () => {
  const h = harness({ repeat: 'monthly' });
  await h.run();
  assert.equal(h.row.repeatDay, 31);
  assert.equal(h.row.remindAt.toISOString(), '2027-02-28T01:00:00.000Z');
});

test('a failed round releases the scheduler guard', async () => {
  const h = harness();
  const find = h.prisma.reminder.findMany;
  h.prisma.reminder.findMany = async () => { throw new Error('database unavailable'); };
  await assert.rejects(h.run(), /database unavailable/);
  h.prisma.reminder.findMany = find;
  await h.run();
  assert.equal(h.sends(), 1);
});

test('daily and weekly repeats advance without changing local time', () => {
  const h = harness();
  assert.equal(h.jobs.nextOccurrence(new Date('2027-01-31T01:00:00Z'), 'daily').toISOString(), '2027-02-01T01:00:00.000Z');
  assert.equal(h.jobs.nextOccurrence(new Date('2027-01-31T01:00:00Z'), 'weekly').toISOString(), '2027-02-07T01:00:00.000Z');
});

test('automatic top-up grants only recurring reminders', async () => {
  const grants = [];
  const source = fs.readFileSync(path.join(__dirname, '../../miniapp/src/App.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const sandbox = { exports: {}, uni: { getStorageSync() {}, setStorageSync() {} }, require(name) {
    if (name === '@dcloudio/uni-app') return { onLaunch() {}, onShow() {} };
    if (name === '@/api/http') return {
      getToken: () => 'test',
      async request(route) {
        if (route === '/reminders') return { list: [
          { id: 'once', toolType: 'note', status: 'pending', remain: 1, repeat: '' },
          { id: 'daily', toolType: 'note', status: 'pending', remain: 1, repeat: 'daily' },
        ] };
        grants.push(route);
      },
    };
    if (name === '@/utils/reminderAuth') return { isAlwaysAccept: async () => true, silentAuth: async () => true, templateOf: () => 'test' };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(source + '\nexports.__test = autoTopUp;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  await sandbox.exports.__test();
  assert.deepEqual(grants, ['/reminders/daily/grant']);
});

async function reminderRoutes(h) {
  const handlers = {};
  h.prisma.note.findFirst = async () => ({ id: 'n1' });
  h.prisma.reminder.findFirst = async () => h.row;
  h.prisma.reminder.create = async ({ data }) => ({ id: 'new', ...data });
  h.prisma.reminder.updateMany = async ({ data }) => { Object.assign(h.row, data); return { count: 1 }; };
  const app = { addHook() {}, get() {}, delete() {}, post(route, handler) { handlers[`POST ${route}`] = handler; }, patch(route, handler) { handlers[`PATCH ${route}`] = handler; } };
  await h.load(path.join(__dirname, '../src/routes/reminders.ts')).reminderRoutes(app);
  return async (method, route, body) => {
    const reply = { status: 200, code(status) { this.status = status; return this; }, send(data) { return data; } };
    const response = await handlers[`${method} ${route}`]({ user: { sub: 'u1' }, params: { id: 'r1' }, body }, reply);
    return { status: reply.status, response };
  };
}

test('creating and rescheduling monthly reminders records the local calendar day', async () => {
  const h = harness();
  const call = await reminderRoutes(h);
  const created = await call('POST', '/reminders', { toolType: 'note', targetId: 'n1', remindAt: '2027-01-30T17:00:00Z', repeat: 'monthly' });
  assert.equal(created.response.data.repeatDay, 31);
  h.row.repeat = 'monthly'; h.row.repeatDay = 31;
  await call('PATCH', '/reminders/:id', { remindAt: '2027-02-14T17:00:00Z' });
  assert.equal(h.row.repeatDay, 15);
});

test('changing repeat mode sets and clears the monthly anchor', async () => {
  const h = harness({ repeat: 'daily' });
  const call = await reminderRoutes(h);
  await call('PATCH', '/reminders/:id', { repeat: 'monthly' });
  assert.equal(h.row.repeatDay, 31);
  await call('PATCH', '/reminders/:id', { repeat: 'daily' });
  assert.equal(h.row.repeatDay, null);
});

test('a completed one-shot cannot be reactivated by a stale credit grant', async () => {
  const h = harness();
  h.row.status = 'sent';
  const call = await reminderRoutes(h);
  assert.equal((await call('POST', '/reminders/:id/grant', {})).status, 400);
  assert.equal(h.row.status, 'sent');
});
