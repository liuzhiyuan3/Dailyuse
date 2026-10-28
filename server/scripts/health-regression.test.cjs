const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const Fastify = require('fastify');

async function healthApp(t, { available = true, loginMode = 'wx', devLoginAllowed = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/health.ts'), 'utf8');
  const sandbox = {
    exports: {},
    require(name) {
      if (name === '../plugins/db') return { prisma: {
        async $queryRaw() {
          if (!available) throw new Error('postgresql://private-user:private-password@private-db');
          return [{ result: 1 }];
        },
      } };
      if (name === '../config') return { loginMode, devLoginAllowed };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, sandbox);
  const app = Fastify();
  t.after(() => app.close());
  await app.register(sandbox.exports.healthRoutes, { prefix: '/api' });
  await app.ready();
  return { app, setAvailable(value) { available = value; } };
}

test('healthy database returns HTTP 200 with the existing login metadata', async (t) => {
  const { app } = await healthApp(t);
  const response = await app.inject('/api/health');
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.code, 0);
  assert.deepEqual({ ...body.data, time: undefined }, {
    ok: true, db: 'up', loginMode: 'wx', devLogin: false, wechat: 'configured', time: undefined,
  });
  assert.equal(Number.isNaN(Date.parse(body.data.time)), false);
});

test('unavailable database returns HTTP 503 without leaking connection details', async (t) => {
  const { app } = await healthApp(t, { available: false, loginMode: 'dev', devLoginAllowed: true });
  const response = await app.inject('/api/health');
  assert.equal(response.statusCode, 503);
  const body = response.json();
  assert.equal(body.code, 503);
  assert.deepEqual({ ...body.data, time: undefined }, {
    ok: false, db: 'down', loginMode: 'dev', devLogin: true, wechat: 'dev-mode', time: undefined,
  });
  assert.equal(response.body.includes('private-'), false);
});

test('readiness changes from failed to healthy after the database recovers', async (t) => {
  const { app, setAvailable } = await healthApp(t, { available: false });
  const down = await app.inject('/api/health');
  assert.equal(down.statusCode, 503);
  setAvailable(true);
  const up = await app.inject('/api/health');
  assert.equal(up.statusCode, 200);
  assert.equal(up.json().data.ok, true);
});

test('the Docker HTTP-status probe fails when the database is unavailable', async (t) => {
  const { app } = await healthApp(t, { available: false });
  const response = await app.inject('/api/health');
  const fetchResponse = new Response(response.body, { status: response.statusCode });
  assert.equal(fetchResponse.ok ? 0 : 1, 1);
});
