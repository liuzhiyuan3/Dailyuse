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
import { wheelRoutes } from './routes/wheels';
import { habitRoutes } from './routes/habits';
import { groupRoutes } from './routes/groups';
import { groupToolRoutes } from './routes/group-tools';
import { reminderRoutes } from './routes/reminders';
import { weatherRoutes } from './routes/weather';
import { feedRoutes } from './routes/feed';
import { foodRoutes } from './routes/foods';
import { feedbackRoutes } from './routes/feedback';
import { announcementRoutes } from './routes/announcements';
import { adminRoutes } from './routes/admin';
import { adminWebRoutes } from './routes/adminWeb';
import { startJobs } from './jobs';
import { config } from './config';
import { ContentCheckUnavailableError } from './lib/seccheck';

async function main() {
  // 上线底线检查：生产环境绝不能用默认 JWT 密钥或缺数据库配置启动
  if (config.nodeEnv === 'production') {
    if (!process.env.JWT_SECRET || config.jwtSecret === 'dev-secret-change-me') {
      console.error('[config] 生产环境必须设置 JWT_SECRET（不能是默认值）');
      process.exit(1);
    }
    if (!config.databaseUrl) {
      console.error('[config] 生产环境必须设置 DATABASE_URL');
      process.exit(1);
    }
  }

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
    // 5xx 的原始报错（Prisma/内部路径）不回给客户端，避免泄露实现细节
    const message = err instanceof ContentCheckUnavailableError
      ? err.message
      : status >= 500 ? '服务器内部错误' : e.message || '请求失败';
    reply.code(status).send({ code: status, message });
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
  await app.register(wheelRoutes, { prefix: '/api' });
  await app.register(habitRoutes, { prefix: '/api' });
  await app.register(groupRoutes, { prefix: '/api' });
  await app.register(groupToolRoutes, { prefix: '/api' });
  await app.register(reminderRoutes, { prefix: '/api' });
  await app.register(weatherRoutes, { prefix: '/api' });
  await app.register(feedRoutes, { prefix: '/api' });
  await app.register(foodRoutes, { prefix: '/api' });
  await app.register(feedbackRoutes, { prefix: '/api' });
  await app.register(announcementRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api' });
  // 网页管理后台：页面挂在 /admin（非 /api 前缀），登录接口自己带 /api 前缀
  await app.register(adminWebRoutes);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Dailyuse API listening on :${config.port}`);
  startJobs(app.log);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
