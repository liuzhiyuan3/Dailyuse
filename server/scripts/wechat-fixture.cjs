// 仅供本地/CI 冒烟测试显式预加载，模拟微信传输响应，业务检测逻辑仍运行原代码。
const fetch = globalThis.fetch;
let waitingCheck;
let concurrentChecksReleased = false;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname !== 'api.weixin.qq.com') return fetch(input, options);
  if (url.pathname === '/sns/jscode2session') {
    return Response.json({ openid: `dev-${url.searchParams.get('js_code')}` });
  }
  if (url.pathname === '/cgi-bin/token') {
    return Response.json({ access_token: 'fixture-token', expires_in: 7200 });
  }
  if (url.pathname === '/wxa/msg_sec_check') {
    const { content } = JSON.parse(options.body);
    // 同时收到两笔检查再返回，确定性地复现编辑期间另一笔写入的竞争。
    if (content.includes('__test_delay__') && !concurrentChecksReleased) {
      await new Promise((resolve, reject) => {
        if (waitingCheck) {
          concurrentChecksReleased = true;
          waitingCheck();
          resolve();
          return;
        }
        const timer = setTimeout(() => { waitingCheck = undefined; reject(new Error('Missing concurrent fixture request')); }, 3000);
        waitingCheck = () => { clearTimeout(timer); waitingCheck = undefined; resolve(); };
      });
    }
    if (content.includes('__test_risk__')) return Response.json({ errcode: 87014 });
    if (content.includes('__test_unavailable__')) return Response.json({ errcode: 45009 });
    return Response.json({ errcode: 0, result: { suggest: 'pass' } });
  }
  if (url.pathname === '/cgi-bin/message/subscribe/send') return Response.json({ errcode: 0 });
  throw new Error(`Unexpected WeChat fixture URL: ${url.pathname}`);
};
