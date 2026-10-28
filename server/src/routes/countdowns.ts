import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

export const countdownRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/countdowns', async (req) => {
    const list = await prisma.countdown.findMany({
      where: { userId: req.user.sub },
      orderBy: [{ pinned: 'desc' }, { targetDate: 'asc' }],
    });
    return { code: 0, data: { list } };
  });

  app.post('/countdowns', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string; targetDate?: string; pinned?: boolean };
    const name = (body.name ?? '').trim();
    if (!name || name.length > 80) {
      return reply.code(400).send({ code: 400, message: '名称需 1-80 字' });
    }
    if (!body.targetDate || Number.isNaN(Date.parse(body.targetDate))) {
      return reply.code(400).send({ code: 400, message: '目标日期不合法' });
    }

    const item = await prisma.countdown.create({
      data: {
        userId: req.user.sub,
        name,
        targetDate: new Date(body.targetDate),
        pinned: Boolean(body.pinned),
      },
    });
    return { code: 0, data: item };
  });

  app.patch('/countdowns/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string; targetDate?: string; pinned?: boolean };
    const data: Record<string, unknown> = {};
    if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 80);
    if (typeof body.targetDate === 'string') {
      if (Number.isNaN(Date.parse(body.targetDate))) {
        return reply.code(400).send({ code: 400, message: '目标日期不合法' });
      }
      data.targetDate = new Date(body.targetDate);
    }
    if (typeof body.pinned === 'boolean') data.pinned = body.pinned;

    const result = await prisma.countdown.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '倒数日不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/countdowns/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.countdown.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '倒数日不存在' });
    await prisma.reminder.deleteMany({
      where: { userId: req.user.sub, toolType: 'countdown', targetId: id },
    });
    return { code: 0, data: { ok: true } };
  });
};
