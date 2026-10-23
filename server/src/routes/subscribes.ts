import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

export const subscribeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/subscribes', async (req) => {
    const list = await prisma.subscribe.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
    });

    // 每个关键词带上最近抓取时间和已抓条数，订阅管理页要用
    const enriched = await Promise.all(
      list.map(async (s) => {
        const [latest, newsCount] = await Promise.all([
          prisma.newsItem.findFirst({
            where: { keyword: s.keyword },
            orderBy: { fetchedAt: 'desc' },
            select: { fetchedAt: true },
          }),
          prisma.newsItem.count({ where: { keyword: s.keyword } }),
        ]);
        return {
          ...s,
          lastFetchedAt: latest?.fetchedAt ?? null,
          newsCount,
        };
      })
    );

    return { code: 0, data: { list: enriched } };
  });

  /** 授权一次 = 额度 +1；已存在则累加 */
  app.post('/subscribes', async (req, reply) => {
    const body = (req.body ?? {}) as { keyword?: string; templateId?: string };
    const keyword = (body.keyword ?? '').trim();
    const templateId = (body.templateId ?? '').trim();

    if (!keyword || keyword.length > 20) {
      return reply.code(400).send({ code: 400, message: '关键词需 1-20 字' });
    }
    if (!templateId) {
      return reply.code(400).send({ code: 400, message: '缺少订阅消息模板 templateId' });
    }

    const existing = await prisma.subscribe.findUnique({
      where: { userId_keyword: { userId: req.user.sub, keyword } },
    });

    if (existing) {
      const sub = await prisma.subscribe.update({
        where: { id: existing.id },
        data: { remain: { increment: 1 }, templateId },
      });
      return { code: 0, data: sub };
    }

    const sub = await prisma.subscribe.create({
      data: { userId: req.user.sub, keyword, templateId, remain: 1 },
    });
    return { code: 0, data: sub };
  });

  app.delete('/subscribes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.subscribe.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '订阅不存在' });
    return { code: 0, data: { ok: true } };
  });
};
