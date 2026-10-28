const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function minePage() {
  const navigate = [];
  const modals = [];
  const sandbox = {
    exports: {},
    uni: {
      getSystemInfoSync: () => ({ platform: 'android' }),
      navigateTo: (options) => navigate.push(options.url),
      showModal: (options) => modals.push(options),
      showToast() {},
    },
    require(name) {
      if (name === 'vue') return {
        ref: (value) => ({ value }),
        computed: (read) => ({ get value() { return read(); } }),
      };
      if (name === '@/composables/useAuthGate') return { useAuthGate: () => ({ logged: { value: true } }) };
      if (name === '@/api/request') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  const script = fs.readFileSync(path.join(__dirname, '../src/pages/mine/index.vue'), 'utf8')
    .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(ts.transpileModule(`${script}\nglobalThis.page = { profile, menuList, tierLabel, todo };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, sandbox);
  return { ...sandbox.page, navigate, modals };
}

test('free accounts expose usable menus without an unfinished purchase action', () => {
  const page = minePage();
  page.profile.value = { entitlement: { tier: 'free', isPro: false } };
  assert.deepEqual(Array.from(page.menuList.value, (item) => item.t), ['提醒设置', '我的群组', '消息通知', '数据导出', '关于']);
  assert.equal(page.tierLabel.value, '免费版');
  for (const item of page.menuList.value) page.todo(item.t);
  assert.equal(page.navigate.length, 5);
  assert.equal(page.modals.length, 0);
});

test('administrator menus preserve the management route and existing entitlement label', () => {
  const page = minePage();
  page.profile.value = { isAdmin: true, entitlement: { tier: 'pro', isPro: true, paidUntil: null } };
  assert.equal(page.menuList.value[0].t, '管理后台');
  page.todo(page.menuList.value[0].t);
  assert.deepEqual(page.navigate, ['/pages/admin/index']);
  assert.equal(page.tierLabel.value, '专业版');
  page.profile.value = { entitlement: { tier: 'pro', isPro: false } };
  assert.equal(page.menuList.value.some((item) => item.t === '管理后台'), false);
  assert.equal(page.tierLabel.value, '专业版已过期');
});
