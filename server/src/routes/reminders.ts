import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { repeatDayInTimezone } from '../lib/reminderSchedule';

const TOOL_TYPES = ['todo', 'countdown', 'group_todo', 'note'];
const REPEATS = ['', 'daily', 'weekly', 'monthly'];

/**
 * 校验 targetId 归属：私人工具必须是本人的；
 * 群组待办必须是本人所在群的。否则可以拿别人的条目 ID 建提醒，
 * 到点推送时把别人的标题推给自己，造成越权读取。
 */
async function canAttach(toolType: string, targetId: string, userId: string): Promise<boolean> {
  if (toolType === 'todo') {
    return Boolean(await prisma.todo.findFirst({ where: { id: targetId, userId }, select: { id: true } }));
  }
  if (toolType === 'countdown') {
    return Boolean(
      await prisma.countdown.findFirst({ where: { id: targetId, userId }, select: { id: true } })
    );
  }
  if (toolType === 'note') {
    return Boolean(await prisma.note.findFirst({ where: { id: targetId, userId }, select: { id: true } }));
  }
  if (toolType === 'group_todo') {
    const t = await prisma.groupTodo.findUnique({ where: { id: targetId }, select: { groupId: true } });
    if (!t) return false;
    return Boolean(
      await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: t.groupId, userId } },
        select: { id: true },
      })
    );
  }
  return false;
}

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
    const body = (req.body ?? {}) as {
      toolType?: string;
      targetId?: string;
      remindAt?: string;
      repeat?: string;
      templateId?: string;
    };
    if (!body.toolType || !TOOL_TYPES.includes(body.toolType)) {
      return reply.code(400).send({ code: 400, message: `toolType 必须是 ${TOOL_TYPES.join(' / ')}` });
    }
    if (!body.targetId) {
      return reply.code(400).send({ code: 400, message: '缺少 targetId' });
    }
    if (!body.remindAt || Number.isNaN(Date.parse(body.remindAt))) {
      return reply.code(400).send({ code: 400, message: 'remindAt 不合法' });
    }
    // 定期提醒（便签等）：'' = 只提醒一次
    const repeat = body.repeat ?? '';
    if (!REPEATS.includes(repeat)) {
      return reply.code(400).send({ code: 400, message: `repeat 必须是 ${REPEATS.join(' / ')}` });
    }
    const templateId = typeof body.templateId === 'string' ? body.templateId.slice(0, 64) : '';

    if (!(await canAttach(body.toolType, body.targetId, req.user.sub))) {
      return reply.code(404).send({ code: 404, message: '提醒对象不存在' });
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId: req.user.sub,
        toolType: body.toolType,
        targetId: body.targetId,
        remindAt: new Date(body.remindAt),
        repeat,
        repeatDay: repeat === 'monthly' ? repeatDayInTimezone(new Date(body.remindAt)) : null,
        templateId,
        remain: 1,
      },
    });
    return { code: 0, data: reminder };
  });

  /** 改期 / 改周期或取消 */
  app.patch('/reminders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { remindAt?: string; status?: string; repeat?: string };
    const data: Record<string, unknown> = {};

    if (typeof body.remindAt === 'string') {
      if (Number.isNaN(Date.parse(body.remindAt))) {
        return reply.code(400).send({ code: 400, message: 'remindAt 不合法' });
      }
      data.remindAt = new Date(body.remindAt);
      data.status = 'pending';
    }
    if (typeof body.repeat === 'string') {
      if (!REPEATS.includes(body.repeat)) {
        return reply.code(400).send({ code: 400, message: `repeat 必须是 ${REPEATS.join(' / ')}` });
      }
      data.repeat = body.repeat;
    }
    if (body.status === 'canceled') data.status = 'canceled';
    if (!Object.keys(data).length) {
      return reply.code(400).send({ code: 400, message: '没有可更新的字段' });
    }

    if (data.remindAt || typeof body.repeat === 'string') {
      const existing = await prisma.reminder.findFirst({ where: { id, userId: req.user.sub } });
      if (!existing) return reply.code(404).send({ code: 404, message: '提醒不存在' });
      const repeat = body.repeat ?? existing.repeat;
      data.repeatDay = repeat === 'monthly'
        ? data.remindAt
          ? repeatDayInTimezone(data.remindAt as Date)
          : existing.repeatDay ?? repeatDayInTimezone(existing.remindAt)
        : null;
    }

    const result = await prisma.reminder.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '提醒不存在' });
    return { code: 0, data: { ok: true } };
  });

  /** 追加一次额度（用户再次授权后调用；客户端静默补额度会连调多次） */
  app.post('/reminders/:id/grant', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.reminder.findFirst({ where: { id, userId: req.user.sub } });
    if (!existing) return reply.code(404).send({ code: 404, message: '提醒不存在' });
    if (!existing.repeat && existing.status === 'sent') {
      return reply.code(400).send({ code: 400, message: '一次性提醒已发送，请重新设置提醒' });
    }
    // 上限 31（≈每日推送一个月）：防异常流程把额度堆爆
    if (existing.remain >= 31) {
      return reply.code(400).send({ code: 400, message: '推送额度已满，先用完再补充' });
    }

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
