import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 付费门禁，需 pro 权益；free 用户按 config.pay.enforced 决定放行还是 402 */
    requirePro: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; openid: string; dev?: boolean };
    user: { sub: string; openid: string; dev?: boolean };
  }
}
