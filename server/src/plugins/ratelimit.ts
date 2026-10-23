import fp from 'fastify-plugin';

/**
 * 零依赖限流：按 IP + 路径做 60 秒滑动窗口。
 * 健康检查不限制，便于探活与监控。
 */
const WINDOW_MS = 60_000;
const LIMIT = 120;

const buckets = new Map<string, number[]>();

export default fp(async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/api/health') return;

    const key = `${req.ip}:${path}`;
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

    if (hits.length >= LIMIT) {
      return reply.code(429).send({ code: 429, message: '请求过于频繁，请稍后再试' });
    }

    hits.push(now);
    buckets.set(key, hits);
  });

  // 周期清理，防止 Map 无限增长
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, hits] of buckets) {
      const kept = hits.filter((t) => now - t < WINDOW_MS);
      if (kept.length) buckets.set(key, kept);
      else buckets.delete(key);
    }
  }, WINDOW_MS);
  timer.unref?.();
});
