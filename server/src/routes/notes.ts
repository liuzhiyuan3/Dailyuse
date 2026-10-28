import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

export const noteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  const TITLE_MAX = 120;
  const CONTENT_MAX = 5000;

  app.get('/notes', async (req) => {
    const list = await prisma.note.findMany({
      where: { userId: req.user.sub },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return { code: 0, data: { list } };
  });

  app.post('/notes', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string; content?: string; pinned?: boolean };
    const title = (body.title ?? '').trim().slice(0, TITLE_MAX);
    const content = (body.content ?? '').trim().slice(0, CONTENT_MAX);
    if (!title && !content) {
      return reply.code(400).send({ code: 400, message: '标题或内容不能为空' });
    }
    const note = await prisma.note.create({
      data: { userId: req.user.sub, title, content, pinned: Boolean(body.pinned) },
    });
    return { code: 0, data: note };
  });

  app.patch('/notes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { title?: string; content?: string; pinned?: boolean };
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') data.title = body.title.slice(0, TITLE_MAX);
    if (typeof body.content === 'string') data.content = body.content.slice(0, CONTENT_MAX);
    if (typeof body.pinned === 'boolean') data.pinned = body.pinned;

    const result = await prisma.note.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '便签不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/notes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.note.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '便签不存在' });
    // 与待办一致：删条目时清掉它的提醒
    await prisma.reminder.deleteMany({
      where: { userId: req.user.sub, toolType: 'note', targetId: id },
    });
    return { code: 0, data: { ok: true } };
  });
};
