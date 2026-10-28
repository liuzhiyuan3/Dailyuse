import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { createHash } from 'node:crypto';

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
    const body = (req.body ?? {}) as {
      title?: unknown; category?: unknown; dueAt?: unknown; done?: unknown;
      doneAt?: unknown; createdAt?: unknown; localId?: unknown;
    };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 200) {
      return reply.code(400).send({ code: 400, message: '标题需 1-200 字' });
    }
    if (body.done !== undefined && typeof body.done !== 'boolean') {
      return reply.code(400).send({ code: 400, message: 'done 必须是布尔值' });
    }
    for (const field of ['dueAt', 'doneAt', 'createdAt'] as const) {
      if (body[field] != null && (typeof body[field] !== 'string' || Number.isNaN(Date.parse(body[field] as string)))) {
        return reply.code(400).send({ code: 400, message: `${field} 不合法` });
      }
    }
    if (body.localId !== undefined && (typeof body.localId !== 'string' || !/^local-[a-z0-9-]{1,80}$/.test(body.localId))) {
      return reply.code(400).send({ code: 400, message: 'localId 不合法' });
    }
    const id = body.localId
      ? `guest-${createHash('sha256').update(`${req.user.sub}\0${body.localId}`).digest('hex')}`
      : undefined;
    const data = {
      ...(id ? { id } : {}),
      userId: req.user.sub,
      title,
      category: (typeof body.category === 'string' && body.category ? body.category : 'default').slice(0, 32),
      dueAt: typeof body.dueAt === 'string' ? new Date(body.dueAt) : null,
      done: body.done === true,
      doneAt: body.done === true ? (typeof body.doneAt === 'string' ? new Date(body.doneAt) : new Date()) : null,
      ...(typeof body.createdAt === 'string' ? { createdAt: new Date(body.createdAt) } : {}),
    };
    // 导入重试只返回已创建的记录，避免响应丢失后重复创建或覆盖云端修改。
    let todo;
    try {
      todo = id
        ? await prisma.todo.upsert({ where: { id }, update: {}, create: data })
        : await prisma.todo.create({ data });
    } catch (error) {
      if (!id || (error as { code?: string }).code !== 'P2002') throw error;
      todo = await prisma.todo.findUnique({ where: { id } });
      if (!todo) throw error;
    }
    return { code: 0, data: todo };
  });

  app.patch('/todos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { title?: string; done?: boolean; category?: string; dueAt?: string | null };
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 200);
    if (typeof body.done === 'boolean') {
      data.done = body.done;
      // 勾选记完成时间、取消清空：前端据此把隔天完成项收进「历史」
      data.doneAt = body.done ? new Date() : null;
    }
    if (typeof body.category === 'string') data.category = body.category.slice(0, 32);
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
