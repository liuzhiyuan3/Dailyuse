import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { refreshKeyword } from '../lib/news';
import { config } from '../config';

const KEYWORD_MAX = 20; // 与 subscribes.keyword 的 VarChar(20) 对齐

/** 每个用户每天的手动刷新配额（进程内计数，重启清零；单机够用） */
const refreshHits = new Map<string, { day: string; count: number }>();

function takeRefreshQuota(userId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const rec = refreshHits.get(userId);
  if (!rec || rec.day !== day) {
    refreshHits.set(userId, { day, count: 1 });
    return true;
  }
  if (rec.count >= config.news.refreshPerDay) return false;
  rec.count += 1;
  return true;
}

setInterval(() => {
  const day = new Date().toISOString().slice(0, 10);
  for (const [k, v] of refreshHits) if (v.day !== day) refreshHits.delete(k);
}, 60 * 60 * 1000).unref?.();

/** 关键词既要是当前用户订阅过的，也要符合长度约束——资讯缓存是全局的，但读入口按订阅收窄 */
async function assertSubscribed(userId: string, keyword: string): Promise<boolean> {
  const sub = await prisma.subscribe.findFirst({ where: { userId, keyword }, select: { id: true } });
  return Boolean(sub);
}

export const newsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/news', async (req, reply) => {
    const q = req.query as { keyword?: string; page?: string; pageSize?: string };
    const keyword = (q.keyword ?? '').trim();
    if (!keyword) return reply.code(400).send({ code: 400, message: '缺少 keyword' });
    if (keyword.length > KEYWORD_MAX) {
      return reply.code(400).send({ code: 400, message: `关键词最长 ${KEYWORD_MAX} 字` });
    }
    if (!(await assertSubscribed(req.user.sub, keyword))) {
      return reply.code(403).send({ code: 403, message: '请先订阅该关键词' });
    }

    const page = Math.max(Number(q.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 20, 1), 50);

    const [list, total] = await Promise.all([
      prisma.newsItem.findMany({
        where: { keyword },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.newsItem.count({ where: { keyword } }),
    ]);

    return { code: 0, data: { list, total, page, pageSize } };
  });

  /** 手动触发一次抓取（小程序下拉刷新用），按用户限次 */
  app.post('/news/refresh', async (req, reply) => {
    const body = (req.body ?? {}) as { keyword?: string };
    const keyword = (body.keyword ?? '').trim();
    if (!keyword) return reply.code(400).send({ code: 400, message: '缺少 keyword' });
    if (keyword.length > KEYWORD_MAX) {
      return reply.code(400).send({ code: 400, message: `关键词最长 ${KEYWORD_MAX} 字` });
    }
    if (!(await assertSubscribed(req.user.sub, keyword))) {
      return reply.code(403).send({ code: 403, message: '请先订阅该关键词' });
    }
    if (!takeRefreshQuota(req.user.sub)) {
      return reply.code(429).send({
        code: 429,
        message: `今天的手动刷新次数已用完（${config.news.refreshPerDay} 次/天）`,
      });
    }

    const added = await refreshKeyword(keyword);
    return { code: 0, data: { keyword, added } };
  });
};
