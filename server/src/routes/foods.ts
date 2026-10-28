import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

const KINDS = ['ate', 'want'];

export const foodRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/foods', async (req) => {
    const { kind, date } = req.query as { kind?: string; date?: string };
    const where: {
      userId: string;
      kind?: string;
      createdAt?: { gte: Date; lt: Date };
    } = { userId: req.user.sub };

    if (kind && KINDS.includes(kind)) where.kind = kind;

    if (date) {
      const start = new Date(`${date}T00:00:00+08:00`);
      if (!Number.isNaN(start.getTime())) {
        where.createdAt = { gte: start, lt: new Date(start.getTime() + 86400000) };
      }
    }

    const list = await prisma.foodRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { code: 0, data: { list } };
  });

  app.post('/foods', async (req, reply) => {
    const body = (req.body ?? {}) as { kind?: string; content?: string; note?: string };
    const kind = body.kind || 'ate';
    if (!KINDS.includes(kind)) {
      return reply.code(400).send({ code: 400, message: 'kind 必须是 ate 或 want' });
    }
    const content = (body.content ?? '').trim();
    if (!content || content.length > 120) {
      return reply.code(400).send({ code: 400, message: '内容需 1-120 字' });
    }

    const record = await prisma.foodRecord.create({
      data: { userId: req.user.sub, kind, content, note: (body.note || '').slice(0, 300) },
    });
    return { code: 0, data: record };
  });

  /** 想吃 → 吃到了：生成一条「吃了」，并移除愿望 */
  app.post('/foods/:id/eaten', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await prisma.foodRecord.findFirst({ where: { id, userId: req.user.sub } });
    if (!item) return reply.code(404).send({ code: 404, message: '记录不存在' });
    if (item.kind !== 'want') {
      return reply.code(400).send({ code: 400, message: '只有「想吃」可以标记为已吃' });
    }

    await prisma.$transaction([
      prisma.foodRecord.create({
        data: { userId: req.user.sub, kind: 'ate', content: item.content, note: item.note },
      }),
      prisma.foodRecord.delete({ where: { id } }),
    ]);
    return { code: 0, data: { ok: true } };
  });

  app.delete('/foods/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.foodRecord.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '记录不存在' });
    return { code: 0, data: { ok: true } };
  });
};
