import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

/** 公告只读接口：登录不强制——游客也能看到通知，发布走 /admin/announcements */
export const announcementRoutes: FastifyPluginAsync = async (app) => {
  app.get('/announcements', async () => {
    const list = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { code: 0, data: { list } };
  });
};
