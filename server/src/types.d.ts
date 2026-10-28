import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 付费门禁，需 pro 权益；free 用户按 config.pay.enforced 决定放行还是 402 */
    requirePro: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 管理员守卫：小程序走 ADMIN_OPENIDS 白名单，网页后台走 admin token */
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // admin: true 只出现在网页后台登录签发的 token 里（小程序 token 恒为 undefined）
    payload: { sub: string; openid?: string; dev?: boolean; admin?: boolean };
    user: { sub: string; openid?: string; dev?: boolean; admin?: boolean };
  }
}
