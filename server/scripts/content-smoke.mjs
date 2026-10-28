// 配合 --require ./scripts/wechat-fixture.cjs 启动的 API，验证真实内容检测链路。
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:3000/api';
let token;
let groupId;
let passed = 0;
async function call(path, method = 'GET', data) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  return { status: res.status, body: await res.json() };
}
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✔ ${name}`);
}

try {
  const login = await call('/auth/login', 'POST', { code: `content-smoke-${Date.now()}` });
  assert.equal(login.status, 200);
  token = login.body.data.token;
  const group = await call('/groups', 'POST', { name: '内容发布回归' });
  assert.equal(group.status, 200);
  groupId = group.body.data.id;
  const itemsPath = `/groups/${groupId}/items`;
  const item = await call(itemsPath, 'POST', { content: '原始内容', note: '原始备注' });
  assert.equal(item.status, 200);
  const itemPath = `${itemsPath}/${item.body.data.id}`;

  const risk = await call(itemPath, 'PATCH', { content: '__test_risk__' });
  check('编辑风险内容被拒绝', () => assert.equal(risk.status, 400));
  const unchanged = await call(itemsPath);
  check('拒绝后原内容保持不变', () => assert.equal(unchanged.body.data.list[0].content, '原始内容'));
  const unavailable = await call(itemPath, 'PATCH', { note: '__test_unavailable__' });
  check('检测服务异常返回503和可重试提示', () => {
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.message, '内容检测暂不可用，请稍后重试');
  });
  const unchangedNote = await call(itemsPath);
  check('检测异常不会写入备注', () => assert.equal(unchangedNote.body.data.list[0].note, '原始备注'));
  const accepted = await call(itemPath, 'PATCH', { content: '修改后内容', note: '修改后备注' });
  check('检测通过后允许修改', () => assert.equal(accepted.status, 200));
  const updated = await call(itemsPath);
  check('保存检测通过的完整内容', () => {
    assert.equal(updated.body.data.list[0].content, '修改后内容');
    assert.equal(updated.body.data.list[0].note, '修改后备注');
  });
  const blockedCreate = await call(itemsPath, 'POST', { content: '__test_risk__' });
  check('新建风险内容也被拒绝', () => assert.equal(blockedCreate.status, 400));
  const scoresPath = `/groups/${groupId}/scores`;
  const score = await call(scoresPath, 'POST', { delta: 1, reason: '__test_risk__' });
  check('计分原因必须通过内容检测', () => assert.equal(score.status, 400));
  const badScore = await call(scoresPath, 'POST', { delta: 1, reason: '__test_unavailable__' });
  check('计分检测异常时阻止写入', () => assert.equal(badScore.status, 503));
  const scores = await call(scoresPath);
  check('被拒绝的计分不产生记录', () => assert.equal(scores.body.data.recent.length, 0));
  const concurrentChanges = [{ content: '并发内容 __test_delay__' }, { note: '并发备注 __test_delay__' }];
  const conflicts = await Promise.all(concurrentChanges.map((data) => call(itemPath, 'PATCH', data)));
  check('并发文本编辑冲突返回409', () => assert.deepEqual(conflicts.map((r) => r.status).sort(), [200, 409]));
  const current = (await call(itemsPath)).body.data.list[0];
  check('并发编辑不会拼接未经共同检测的内容', () => assert.equal(
    Number(current.content === concurrentChanges[0].content) + Number(current.note === concurrentChanges[1].note), 1,
  ));
  const retry = await call(itemPath, 'PATCH', concurrentChanges[conflicts.findIndex((r) => r.status === 409)]);
  check('冲突后重新检测并重试可成功', () => assert.equal(retry.status, 200));
  const done = await call(itemPath, 'PATCH', { done: true });
  check('纯状态更新正常工作', () => assert.equal(done.status, 200));
  console.log(`内容检测冒烟：${passed} 项通过`);
} finally {
  if (groupId) await call(`/groups/${groupId}`, 'DELETE');
  if (token) await call('/auth/me', 'DELETE');
}
