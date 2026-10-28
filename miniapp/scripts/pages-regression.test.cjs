const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

process.env.TZ = 'Asia/Shanghai';

function loadPage(page, names, storage = new Map(), initial = '2026-10-28T12:00:00+08:00') {
  let now = new Date(initial).getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const hooks = [];
  const vue = {
    ref: (value) => ({ value }),
    computed: (read) => ({ get value() { return read(); } }),
    onUnmounted() {},
  };
  const sandbox = {
    exports: {}, Date: Clock, setInterval: () => 1, clearInterval() {},
    uni: {
      getStorageSync: (key) => storage.has(key) ? JSON.parse(storage.get(key)) : '',
      setStorageSync: (key, value) => storage.set(key, JSON.stringify(value)),
      vibrateLong() {}, showToast() {},
    },
    require(name) {
      if (name === 'vue') return vue;
      if (name === '@dcloudio/uni-app') return { onShow: (fn) => hooks.push(fn) };
      if (name === '@/composables/useAuthGate') return { useAuthGate: () => ({ logged: vue.ref(false) }) };
      return {};
    },
  };
  const source = fs.readFileSync(path.join(__dirname, `../src/pages/${page}/index.vue`), 'utf8')
    .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const output = ts.transpileModule(`${source}\nglobalThis.page = { ${names.join(', ')} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, sandbox);
  return { ...sandbox.page, advance: (ms) => { now += ms; }, show: () => hooks.forEach((fn) => fn()) };
}

const timerNames = ['pick', 'toggleCd', 'tick', 'resetCd', 'remainMs', 'running', 'paused', 'done'];

test('an unstarted preset survives leaving and reopening the timer', () => {
  const storage = new Map();
  loadPage('timer', timerNames, storage).pick(5);
  const page = loadPage('timer', timerNames, storage);
  assert.equal(page.remainMs.value, 300000);
  assert.equal(page.paused.value, false);
  page.toggleCd();
  page.tick();
  assert.equal(page.done.value, false);
});

test('reset survives reopening as ready with its full duration', () => {
  const storage = new Map();
  const page = loadPage('timer', timerNames, storage);
  page.pick(5);
  page.toggleCd();
  page.advance(30000);
  page.tick();
  page.resetCd();
  const restored = loadPage('timer', timerNames, storage);
  assert.equal(restored.remainMs.value, 300000);
  assert.equal(restored.paused.value, false);
  assert.equal(restored.done.value, false);
});

test('a paused timer preserves its remaining duration and can resume', () => {
  const storage = new Map();
  const page = loadPage('timer', timerNames, storage);
  page.pick(5);
  page.toggleCd();
  page.advance(31000);
  page.tick();
  page.toggleCd();
  const restored = loadPage('timer', timerNames, storage);
  assert.equal(restored.remainMs.value, 269000);
  assert.equal(restored.paused.value, true);
  restored.toggleCd();
  restored.advance(1000);
  restored.tick();
  assert.equal(restored.remainMs.value, 268000);
});

test('running and expired timers recover from their actual deadline', () => {
  const storage = new Map();
  const page = loadPage('timer', timerNames, storage);
  page.pick(1);
  page.toggleCd();
  const running = loadPage('timer', timerNames, storage, '2026-10-28T12:00:30+08:00');
  assert.equal(running.running.value, true);
  assert.equal(running.remainMs.value, 30000);
  const expired = loadPage('timer', timerNames, storage, '2026-10-28T12:02:00+08:00');
  assert.equal(expired.done.value, true);
  assert.equal(expired.remainMs.value, 0);
});

test('completed timers remain completed after reopening', () => {
  const storage = new Map();
  const page = loadPage('timer', timerNames, storage);
  page.pick(1);
  page.toggleCd();
  page.advance(60000);
  page.tick();
  const restored = loadPage('timer', timerNames, storage);
  assert.equal(restored.done.value, true);
  assert.equal(restored.paused.value, false);
});

test('legacy zero-remaining idle cache recovers its selected preset', () => {
  const storage = new Map([['dailyuse_timer', JSON.stringify({ endTime: 0, remain: 0, total: 300000 })]]);
  const restored = loadPage('timer', timerNames, storage);
  assert.equal(restored.remainMs.value, 300000);
  assert.equal(restored.paused.value, false);
});

function todo(id, dueAt, createdAt = '2026-10-28T12:00:00+08:00') {
  return { id, done: false, dueAt, createdAt };
}
function ids(page) { return Array.from(page.filtered.value, (item) => item.id); }

test('today uses local midnight boundaries and excludes future dates', () => {
  const page = loadPage('todo', ['seg', 'list', 'filtered']);
  page.seg.value = 'today';
  page.list.value = [
    todo('yesterday', '2026-10-27T23:59:59+08:00'),
    todo('start', '2026-10-28T00:00:00+08:00'),
    todo('end', '2026-10-28T23:59:59+08:00'),
    todo('tomorrow', '2026-10-29T00:00:00+08:00'),
    todo('next-month', '2026-11-28T12:00:00+08:00'),
    todo('undated-today', null),
    todo('undated-yesterday', null, '2026-10-27T23:59:59+08:00'),
  ];
  assert.deepEqual(ids(page), ['start', 'end', 'undated-today']);
});

test('week runs Monday through Sunday and preserves undated tasks', () => {
  const page = loadPage('todo', ['seg', 'list', 'filtered']);
  page.seg.value = 'week';
  page.list.value = [
    todo('previous-week', '2026-10-25T23:59:59+08:00'),
    todo('monday', '2026-10-26T00:00:00+08:00'),
    todo('sunday', '2026-11-01T23:59:59+08:00'),
    todo('next-week', '2026-11-02T00:00:00+08:00'),
    todo('undated', null, '2026-01-01T00:00:00+08:00'),
  ];
  assert.deepEqual(ids(page), ['monday', 'sunday', 'undated']);
});

test('Sunday still belongs to the week that started the preceding Monday', () => {
  const page = loadPage('todo', ['seg', 'list', 'filtered'], new Map(), '2026-11-01T12:00:00+08:00');
  page.seg.value = 'week';
  page.list.value = [
    todo('monday', '2026-10-26T00:00:00+08:00'),
    todo('next-monday', '2026-11-02T00:00:00+08:00'),
  ];
  assert.deepEqual(ids(page), ['monday']);
});

test('all and history retain their existing completion behavior', () => {
  const page = loadPage('todo', ['seg', 'list', 'filtered']);
  page.list.value = [
    todo('future', '2026-12-01T00:00:00+08:00'),
    { ...todo('done-today', null), done: true, doneAt: '2026-10-28T10:00:00+08:00' },
    { ...todo('history', null), done: true, doneAt: '2026-10-27T10:00:00+08:00' },
  ];
  assert.deepEqual(ids(page), ['future', 'done-today']);
  page.seg.value = 'history';
  assert.deepEqual(ids(page), ['history']);
});
