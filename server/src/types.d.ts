import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; openid: string; dev?: boolean };
    user: { sub: string; openid: string; dev?: boolean };
  }
}
