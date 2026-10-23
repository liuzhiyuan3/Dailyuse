import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

/** 邀请码：10 位十六进制 = 40 bit，纯数字爆破在限流下不现实 */
function makeCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function isMember(groupId: string, userId: string) {
  const m = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  return Boolean(m);
}

export const groupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** 我的群组（含成员数 / 待办完成数） */
  app.get('/groups', async (req) => {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.sub },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = await Promise.all(
      memberships.map(async (m) => {
        const [memberCount, todoCount, doneCount] = await Promise.all([
          prisma.groupMember.count({ where: { groupId: m.groupId } }),
          prisma.groupTodo.count({ where: { groupId: m.groupId } }),
          prisma.groupTodo.count({ where: { groupId: m.groupId, done: true } }),
        ]);
        return {
          id: m.group.id,
          name: m.group.name,
          role: m.role,
          inviteCode: m.group.inviteCode,
          memberCount,
          todoCount,
          doneCount,
          createdAt: m.group.createdAt,
        };
      })
    );

    return { code: 0, data: { groups } };
  });

  app.post('/groups', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string };
    const name = (body.name ?? '').trim();
    if (!name || name.length > 40) {
      return reply.code(400).send({ code: 400, message: '群名需 1-40 字' });
    }

    const group = await prisma.group.create({
      data: {
        name,
        ownerId: req.user.sub,
        inviteCode: makeCode(),
        members: { create: { userId: req.user.sub, role: 'owner' } },
      },
    });
    return { code: 0, data: group };
  });

  app.post('/groups/join', async (req, reply) => {
    const body = (req.body ?? {}) as { inviteCode?: string };
    const code = (body.inviteCode ?? '').trim().toUpperCase();
    const group = await prisma.group.findUnique({ where: { inviteCode: code } });
    if (!group) return reply.code(404).send({ code: 404, message: '邀请码无效' });

    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: req.user.sub } },
      update: {},
      create: { groupId: group.id, userId: req.user.sub, role: 'member' },
    });
    return { code: 0, data: { id: group.id, name: group.name } };
  });

  app.get('/groups/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
        },
        todos: { orderBy: [{ done: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!group) return reply.code(404).send({ code: 404, message: '群组不存在' });
    return { code: 0, data: group };
  });

  app.post('/groups/:id/todos', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }

    const body = (req.body ?? {}) as { title?: string; assigneeId?: string; dueAt?: string };
    const title = (body.title ?? '').trim();
    if (!title) return reply.code(400).send({ code: 400, message: '标题不能为空' });

    const todo = await prisma.groupTodo.create({
      data: {
        groupId: id,
        title,
        createdBy: req.user.sub,
        assigneeId: body.assigneeId || null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      },
    });
    return { code: 0, data: todo };
  });

  app.patch('/groups/:id/todos/:todoId', async (req, reply) => {
    const { id, todoId } = req.params as { id: string; todoId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }

    const body = (req.body ?? {}) as { done?: boolean; title?: string; assigneeId?: string };
    const data: Record<string, unknown> = {};
    if (typeof body.done === 'boolean') data.done = body.done;
    if (typeof body.title === 'string') data.title = body.title;
    if (typeof body.assigneeId === 'string') data.assigneeId = body.assigneeId;

    const result = await prisma.groupTodo.updateMany({ where: { id: todoId, groupId: id }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '待办不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/groups/:id/todos/:todoId', async (req, reply) => {
    const { id, todoId } = req.params as { id: string; todoId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }

    const result = await prisma.groupTodo.deleteMany({ where: { id: todoId, groupId: id } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '待办不存在' });
    // 清掉挂在它上面的提醒，避免推给已删除的待办
    await prisma.reminder.deleteMany({ where: { toolType: 'group_todo', targetId: todoId } });
    return { code: 0, data: { ok: true } };
  });

  /** 解散群组（仅群主） */
  app.delete('/groups/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return reply.code(404).send({ code: 404, message: '群组不存在' });
    if (group.ownerId !== req.user.sub) {
      return reply.code(403).send({ code: 403, message: '只有群主可以解散' });
    }

    const todos = await prisma.groupTodo.findMany({ where: { groupId: id }, select: { id: true } });
    if (todos.length) {
      await prisma.reminder.deleteMany({
        where: { toolType: 'group_todo', targetId: { in: todos.map((t) => t.id) } },
      });
    }
    await prisma.group.delete({ where: { id } });
    return { code: 0, data: { ok: true } };
  });

  /** 退出群组（群主需先解散或转让） */
  app.delete('/groups/:id/leave', async (req, reply) => {
    const { id } = req.params as { id: string };
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return reply.code(404).send({ code: 404, message: '群组不存在' });
    if (group.ownerId === req.user.sub) {
      return reply.code(400).send({ code: 400, message: '群主不能退出，请先解散群组' });
    }
    const result = await prisma.groupMember.deleteMany({ where: { groupId: id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '你不在该群组' });

    const todos = await prisma.groupTodo.findMany({ where: { groupId: id }, select: { id: true } });
    if (todos.length) {
      await prisma.reminder.deleteMany({
        where: {
          userId: req.user.sub,
          toolType: 'group_todo',
          targetId: { in: todos.map((t) => t.id) },
        },
      });
    }
    return { code: 0, data: { ok: true } };
  });

  /** 移除成员（仅群主） */
  app.delete('/groups/:id/members/:userId', async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return reply.code(404).send({ code: 404, message: '群组不存在' });
    if (group.ownerId !== req.user.sub) {
      return reply.code(403).send({ code: 403, message: '只有群主可以移除成员' });
    }
    if (userId === group.ownerId) {
      return reply.code(400).send({ code: 400, message: '不能移除群主' });
    }
    const result = await prisma.groupMember.deleteMany({ where: { groupId: id, userId } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '成员不存在' });

    const todos = await prisma.groupTodo.findMany({ where: { groupId: id }, select: { id: true } });
    if (todos.length) {
      await prisma.reminder.deleteMany({
        where: { userId, toolType: 'group_todo', targetId: { in: todos.map((t) => t.id) } },
      });
    }
    return { code: 0, data: { ok: true } };
  });
};
