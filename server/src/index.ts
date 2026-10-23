import Fastify from 'fastify';
import cors from '@fastify/cors';
import authPlugin from './plugins/auth';
import rateLimitPlugin from './plugins/ratelimit';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { todoRoutes } from './routes/todos';
import { noteRoutes } from './routes/notes';
import { accountRoutes } from './routes/accounts';
import { countdownRoutes } from './routes/countdowns';
import { subscribeRoutes } from './routes/subscribes';
import { newsRoutes } from './routes/news';
import { groupRoutes } from './routes/groups';
import { groupToolRoutes } from './routes/group-tools';
import { reminderRoutes } from './routes/reminders';
import { feedRoutes } from './routes/feed';
import { foodRoutes } from './routes/foods';
import { startJobs } from './jobs';
import { config } from './config';

async function main() {
  // trustProxy：只信任部署里那台反向代理，取真实客户端 IP 做限流。
  // 写成 true 会让客户端自带的 X-Forwarded-For 生效，限流随手就能绕过。
  const app = Fastify({ logger: true, trustProxy: config.trustProxy });

  // 允许空 body 的 JSON 请求（DELETE / 无参 POST），否则 Fastify 5 会直接 400
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = body as string;
    if (!raw || !raw.trim()) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error);
    }
  });

  // CORS：小程序请求不带 Origin，本来不需要 CORS。只有配了 CORS_ORIGIN 白名单才开。
  await app.register(cors, {
    origin: config.corsOrigin.length ? config.corsOrigin : false,
  });
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    const e = err as Error & { statusCode?: number };
    const status = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500;
    reply.code(status).send({ code: status, message: e.message || '服务器内部错误' });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ code: 404, message: `接口不存在: ${req.method} ${req.url}` });
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(todoRoutes, { prefix: '/api' });
  await app.register(noteRoutes, { prefix: '/api' });
  await app.register(accountRoutes, { prefix: '/api' });
  await app.register(countdownRoutes, { prefix: '/api' });
  await app.register(subscribeRoutes, { prefix: '/api' });
  await app.register(newsRoutes, { prefix: '/api' });
  await app.register(groupRoutes, { prefix: '/api' });
  await app.register(groupToolRoutes, { prefix: '/api' });
  await app.register(reminderRoutes, { prefix: '/api' });
  await app.register(feedRoutes, { prefix: '/api' });
  await app.register(foodRoutes, { prefix: '/api' });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Dailyuse API listening on :${config.port}`);
  startJobs(app.log);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
