// 仅供冒烟测试预加载：天气请求留在进程内，不依赖外网或真实凭据。
const fetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname !== 'weather.test') return fetch(input, options);
  if (url.pathname === '/v7/weather/now') {
    return Response.json({
      code: '200',
      now: { temp: '23', text: '晴', humidity: '50', windDir: '东风', windScale: '2', feelsLike: '24', obsTime: new Date().toISOString() },
    });
  }
  if (url.pathname === '/geo/v2/city/lookup') {
    return Response.json({ code: '200', location: [{ id: '101210101', name: '杭州' }] });
  }
  throw new Error(`Unexpected weather fixture URL: ${url.pathname}`);
};
