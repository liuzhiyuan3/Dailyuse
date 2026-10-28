import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

/** 校验并规整选项列表；不合法返回 null */
function cleanItems(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const items = raw
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((x) => x.slice(0, 30));
  if (items.length < 2 || new Set(items).size !== items.length) return null;
  return items;
}

export const wheelRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/wheels', async (req) => {
    const list = await prisma.wheel.findMany({
      where: { userId: req.user.sub },
      orderBy: { updatedAt: 'desc' },
    });
    return { code: 0, data: { list } };
  });

  app.post('/wheels', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string; items?: unknown };
    const title = (body.title ?? '转盘').trim().slice(0, 40) || '转盘';
    const items = cleanItems(body.items);
    if (!items) {
      return reply.code(400).send({ code: 400, message: '选项需 2-12 条且不重复' });
    }

    const wheel = await prisma.wheel.create({
      data: { userId: req.user.sub, title, items: JSON.stringify(items) },
    });
    return { code: 0, data: wheel };
  });

  app.patch('/wheels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { title?: string; items?: unknown };
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') {
      data.title = body.title.trim().slice(0, 40) || '转盘';
    }
    if (body.items !== undefined) {
      const items = cleanItems(body.items);
      if (!items) {
        return reply.code(400).send({ code: 400, message: '选项需 2-12 条且不重复' });
      }
      data.items = JSON.stringify(items);
    }

    const result = await prisma.wheel.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '转盘不存在' });
    const wheel = await prisma.wheel.findUnique({ where: { id } });
    return { code: 0, data: wheel };
  });

  app.delete('/wheels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.wheel.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '转盘不存在' });
    return { code: 0, data: { ok: true } };
  });
};
