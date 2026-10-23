import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

/**
 * 待办 CRUD：作为工具模块的范本。
 * 所有查询/更新都强制带 userId，防越权。
 */
export const todoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/todos', async (req) => {
    const list = await prisma.todo.findMany({
      where: { userId: req.user.sub },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    });
    return { code: 0, data: { list } };
  });

  app.post('/todos', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string; category?: string; dueAt?: string };
    const title = (body.title ?? '').trim();
    if (!title) return reply.code(400).send({ code: 400, message: '标题不能为空' });

    const todo = await prisma.todo.create({
      data: {
        userId: req.user.sub,
        title,
        category: body.category || 'default',
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      },
    });
    return { code: 0, data: todo };
  });

  app.patch('/todos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { title?: string; done?: boolean; category?: string; dueAt?: string | null };
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') data.title = body.title.trim();
    if (typeof body.done === 'boolean') data.done = body.done;
    if (typeof body.category === 'string') data.category = body.category;
    if (body.dueAt === null) data.dueAt = null;
    else if (typeof body.dueAt === 'string') {
      if (Number.isNaN(Date.parse(body.dueAt))) {
        return reply.code(400).send({ code: 400, message: 'dueAt 不合法' });
      }
      data.dueAt = new Date(body.dueAt);
    }

    const result = await prisma.todo.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '待办不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/todos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.todo.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '待办不存在' });
    // 级联清理该待办的提醒，避免删了还推
    await prisma.reminder.deleteMany({
      where: { userId: req.user.sub, toolType: 'todo', targetId: id },
    });
    return { code: 0, data: { ok: true } };
  });
};
