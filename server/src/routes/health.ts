import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { loginMode, devLoginAllowed } from '../config';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    let db = 'down';
    try {
      await prisma.$queryRaw`select 1`;
      db = 'up';
    } catch {
      /* 数据库不可达 */
    }
    const ok = db === 'up';
    // Docker 和部署就绪探测都使用 HTTP 状态，数据库不可用时必须返回失败。
    reply.code(ok ? 200 : 503);
    return {
      code: ok ? 0 : 503,
      data: {
        ok,
        db,
        // wx=真实微信登录；dev=调试登录（不请求微信）
        loginMode,
        // false 表示调试登录被策略拒绝，此时登录接口会返回 503
        devLogin: devLoginAllowed,
        wechat: loginMode === 'wx' ? 'configured' : 'dev-mode',
        time: new Date().toISOString(),
      },
    };
  });
};
