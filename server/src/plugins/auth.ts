import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config';

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
});
