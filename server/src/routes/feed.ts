import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

/** 首页动态：从群组待办的最近改动推导，避免额外建事件表 */
export const feedRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/feed', async (req) => {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.sub },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    if (!groupIds.length) return { code: 0, data: { events: [] } };

    const todos = await prisma.groupTodo.findMany({
      where: {
        groupId: { in: groupIds },
        updatedAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { group: { select: { name: true } } },
    });

    const events = todos.map((t) => ({
      id: t.id,
      groupId: t.groupId,
      groupName: t.group.name,
      title: t.title,
      done: t.done,
      at: t.updatedAt,
    }));

    return { code: 0, data: { events } };
  });
};
