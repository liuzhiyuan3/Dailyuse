import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

const TOOL_TYPES = ['todo', 'countdown', 'group_todo'];

export const reminderRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/reminders', async (req) => {
    const list = await prisma.reminder.findMany({
      where: { userId: req.user.sub },
      orderBy: { remindAt: 'asc' },
    });
    return { code: 0, data: { list } };
  });

  /** 建提醒即视为消耗一次授权：remain 从 1 开始 */
  app.post('/reminders', async (req, reply) => {
    const body = (req.body ?? {}) as { toolType?: string; targetId?: string; remindAt?: string };
    if (!body.toolType || !TOOL_TYPES.includes(body.toolType)) {
      return reply.code(400).send({ code: 400, message: `toolType 必须是 ${TOOL_TYPES.join(' / ')}` });
    }
    if (!body.targetId) {
      return reply.code(400).send({ code: 400, message: '缺少 targetId' });
    }
    if (!body.remindAt || Number.isNaN(Date.parse(body.remindAt))) {
      return reply.code(400).send({ code: 400, message: 'remindAt 不合法' });
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId: req.user.sub,
        toolType: body.toolType,
        targetId: body.targetId,
        remindAt: new Date(body.remindAt),
        remain: 1,
      },
    });
    return { code: 0, data: reminder };
  });

  /** 改期或取消 */
  app.patch('/reminders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { remindAt?: string; status?: string };
    const data: Record<string, unknown> = {};

    if (typeof body.remindAt === 'string') {
      if (Number.isNaN(Date.parse(body.remindAt))) {
        return reply.code(400).send({ code: 400, message: 'remindAt 不合法' });
      }
      data.remindAt = new Date(body.remindAt);
      data.status = 'pending';
    }
    if (body.status === 'canceled') data.status = 'canceled';
    if (!Object.keys(data).length) {
      return reply.code(400).send({ code: 400, message: '没有可更新的字段' });
    }

    const result = await prisma.reminder.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '提醒不存在' });
    return { code: 0, data: { ok: true } };
  });

  /** 追加一次额度（用户再次授权后调用） */
  app.post('/reminders/:id/grant', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.reminder.findFirst({ where: { id, userId: req.user.sub } });
    if (!existing) return reply.code(404).send({ code: 404, message: '提醒不存在' });

    const reminder = await prisma.reminder.update({
      where: { id },
      data: { remain: { increment: 1 }, status: 'pending' },
    });
    return { code: 0, data: reminder };
  });

  app.delete('/reminders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.reminder.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '提醒不存在' });
    return { code: 0, data: { ok: true } };
  });
};
