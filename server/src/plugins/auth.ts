import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config';
import { prisma } from './db';
import { resolveEntitlement } from '../lib/entitlements';

export default fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    // 7 天：JWT 无状态、无法吊销，有效期就是 token 泄露后的可滥用窗口。
    // 真需要"立即失效"，得给用户表加 tokenVersion 并在 authenticate 里比对（多一次查询）。
    sign: { expiresIn: '7d' },
  });

  // 统一鉴权守卫：挂在需要登录的路由插件上
  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ code: 401, message: '未登录或登录已过期' });
    }
  });

  /**
   * 付费门禁：挂在需要 pro 的路由上（route 级 preHandler 在 authenticate 之后执行）。
   * 权益只从数据库读，请求体里的 tier 一概不看。
   */
  app.decorate('requirePro', async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { tier: true, paidUntil: true },
    });

    if (!user) {
      return reply.code(401).send({ code: 401, message: '用户不存在，请重新登录' });
    }

    const ent = resolveEntitlement(user);

    if (!config.pay.enforced) {
      // 还没接支付：放行，但留痕，方便统计「如果收费会被拦掉多少请求」
      if (!ent.isPro) {
        req.log.info(
          { userId: req.user.sub, route: req.url, paywall: 'dry-run' },
          '[paywall] 未开启收费，free 用户放行'
        );
      }
      return;
    }

    if (!ent.isPro) {
      return reply.code(402).send({
        code: 402,
        message: ent.expired ? '专业版已到期' : '该功能需要专业版',
        data: { needTier: 'pro', currentTier: ent.tier, paidUntil: ent.paidUntil },
      });
    }
  });

  /**
   * 管理员守卫，两种身份二选一：
   * - 小程序：openid 在 ADMIN_OPENIDS 白名单里
   * - 网页后台：/admin 页用 ADMIN_PASSWORD 换来的 admin token（payload.admin === true）
   */
  app.decorate('requireAdmin', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ code: 401, message: '未登录或登录已过期' });
    }
    if (req.user.admin === true) return;
    if (req.user.openid && config.adminOpenids.includes(req.user.openid)) return;
    return reply.code(403).send({ code: 403, message: '需要管理员权限' });
  });
});
