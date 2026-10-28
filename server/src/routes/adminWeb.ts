import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config';
import { ADMIN_PAGE } from '../web/adminPage';

/**
 * 网页管理后台：生产入口 https://admin.benefitgpt.top，由 nginx 将根路径代理到 /admin。
 * 本地仍打开 /admin（密码 = ADMIN_PASSWORD）。
 * 数据接口复用 /api/admin/*，token 由这里的 login 签发（payload.admin = true）。
 */
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const fails = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();

export const adminWebRoutes: FastifyPluginAsync = async (app) => {
  app.get('/admin', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(ADMIN_PAGE);
  });

  app.post('/api/admin-web/login', async (req, reply) => {
    if (!config.adminPassword) {
      return reply.code(503).send({ code: 503, message: '未配置 ADMIN_PASSWORD，网页管理后台未启用' });
    }

    const ip = req.ip;
    const now = Date.now();
    const rec = fails.get(ip);
    if (rec && rec.lockedUntil > now) {
      const mins = Math.ceil((rec.lockedUntil - now) / 60000);
      return reply.code(429).send({ code: 429, message: `尝试次数过多，请 ${mins} 分钟后再试` });
    }

    const body = (req.body ?? {}) as { password?: unknown };
    if (typeof body.password !== 'string' || body.password !== config.adminPassword) {
      const cur = rec && now - rec.firstAt < FAIL_WINDOW_MS ? rec : { count: 0, firstAt: now, lockedUntil: 0 };
      cur.count += 1;
      if (cur.count >= FAIL_LIMIT) {
        cur.lockedUntil = now + LOCK_MS;
      }
      fails.set(ip, cur);
      return reply.code(401).send({ code: 401, message: '密码不正确' });
    }

    fails.delete(ip);
    const token = app.jwt.sign({ sub: 'admin', admin: true }, { expiresIn: '12h' });
    return { code: 0, data: { token } };
  });
};
