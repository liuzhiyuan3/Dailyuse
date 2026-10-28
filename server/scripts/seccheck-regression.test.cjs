const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function checkHarness({ configured = true, production = true, body = { errcode: 0, result: { suggest: 'pass' } }, httpOK = true, tokenError, fetchError, jsonError } = {}) {
  const calls = [];
  const sandbox = {
    exports: {}, console: { warn() {} },
    require(name) {
      if (name === '../config') return { wxConfigured: configured, config: { nodeEnv: production ? 'production' : 'development' } };
      if (name === './wechat') return { getAccessToken: async () => {
        if (tokenError) throw new Error('token failed');
        return 'test-token';
      } };
      if (name === './http') return { fetchWithTimeout: async (url, options) => {
        calls.push(JSON.parse(options.body));
        if (fetchError) throw new Error('request timeout');
        return { ok: httpOK, json: async () => {
          if (jsonError) throw new Error('invalid JSON');
          return body;
        } };
      } };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/seccheck.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, sandbox);
  return { check: sandbox.exports.assertContentSafe, calls };
}

test('only an explicit successful content verdict permits publishing', async () => {
  const h = checkHarness();
  await h.check('  正常文本  ', 'test-openid');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].content, '正常文本');
  assert.equal(h.calls[0].openid, 'test-openid');
});

for (const suggest of ['risky', 'review']) {
  test(`a ${suggest} verdict rejects the content`, async () => {
    await assert.rejects(checkHarness({ body: { errcode: 0, result: { suggest } } }).check('text', 'test-openid'), { statusCode: 400 });
  });
}

test('the legacy risk error code rejects content without a result object', async () => {
  await assert.rejects(checkHarness({ body: { errcode: 87014 } }).check('text', 'test-openid'), { statusCode: 400 });
});

for (const [name, options] of [
  ['upstream error code', { body: { errcode: 40003 } }],
  ['conflicting success verdict and upstream error', { body: { errcode: 45009, result: { suggest: 'pass' } } }],
  ['failed HTTP status', { httpOK: false }],
  ['missing verdict', { body: { errcode: 0 } }],
  ['missing success code', { body: { result: { suggest: 'pass' } } }],
  ['unknown verdict', { body: { errcode: 0, result: { suggest: 'unknown' } } }],
  ['null response', { body: null }],
  ['invalid JSON', { jsonError: true }],
  ['request failure', { fetchError: true }],
  ['access-token failure', { tokenError: true }],
]) {
  test(`${name} blocks publishing with a retryable service error`, async () => {
    await assert.rejects(checkHarness(options).check('text', 'test-openid'), { statusCode: 503 });
  });
}

test('production without WeChat configuration blocks publishing', async () => {
  await assert.rejects(checkHarness({ configured: false }).check('text', 'test-openid'), { statusCode: 503 });
});

test('unconfigured development retains local mock behavior', async () => {
  const h = checkHarness({ configured: false, production: false });
  await h.check('text', '');
  assert.equal(h.calls.length, 0);
});

test('configured checking requires an openid before making a request', async () => {
  const h = checkHarness();
  await assert.rejects(h.check('text', ''), { statusCode: 503 });
  assert.equal(h.calls.length, 0);
});

test('oversized content is rejected instead of approving only its prefix', async () => {
  const h = checkHarness();
  await assert.rejects(h.check('正'.repeat(2500) + '未检测尾部', 'test-openid'), { statusCode: 400 });
  assert.equal(h.calls.length, 0);
});

test('empty optional text does not call the upstream service', async () => {
  const h = checkHarness();
  await h.check('   ', 'test-openid');
  assert.equal(h.calls.length, 0);
});
