import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

const TITLE_MAX = 60;
const CONTENT_MAX = 2000;

/** 管理后台：看用户反馈 + 发布/撤下公告。权限来自 ADMIN_OPENIDS（见 plugins/auth 的 requireAdmin） */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAdmin);

  /* ---------- 用户反馈 ---------- */
  app.get('/admin/feedback', async (req) => {
    const q = req.query as { status?: string };
    const status = q.status === 'new' || q.status === 'handled' ? q.status : undefined;

    const list = await prisma.feedback.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { nickname: true } } },
    });
    return {
      code: 0,
      data: {
        // openid 绝不外泄，昵称可空
        list: list.map((f) => ({
          id: f.id,
          kind: f.kind,
          content: f.content,
          status: f.status,
          createdAt: f.createdAt,
          nickname: f.user?.nickname ?? '',
        })),
      },
    };
  });

  app.patch('/admin/feedback/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { status?: string };
    if (body.status !== 'new' && body.status !== 'handled') {
      return reply.code(400).send({ code: 400, message: 'status 须为 new / handled' });
    }
    const result = await prisma.feedback.updateMany({
      where: { id },
      data: { status: body.status },
    });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '反馈不存在' });
    return { code: 0, data: { ok: true } };
  });

  /* ---------- 公告 ---------- */
  app.get('/admin/announcements', async () => {
    const list = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return { code: 0, data: { list } };
  });

  app.post('/admin/announcements', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string; content?: string };
    const title = (body.title ?? '').trim();
    const content = (body.content ?? '').trim();
    if (!title || title.length > TITLE_MAX) {
      return reply.code(400).send({ code: 400, message: `标题需 1-${TITLE_MAX} 字` });
    }
    if (!content || content.length > CONTENT_MAX) {
      return reply.code(400).send({ code: 400, message: `正文需 1-${CONTENT_MAX} 字` });
    }

    const item = await prisma.announcement.create({ data: { title, content } });
    return { code: 0, data: item };
  });

  app.delete('/admin/announcements/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.announcement.deleteMany({ where: { id } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '公告不存在' });
    return { code: 0, data: { ok: true } };
  });

  /* ---------- 用户概览（只读，openid 不出库）---------- */
  app.get('/admin/users', async () => {
    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          nickname: true,
          tier: true,
          createdAt: true,
          _count: { select: { todos: true } },
        },
      }),
    ]);
    return {
      code: 0,
      data: {
        total,
        users: users.map((u) => ({
          nickname: u.nickname ?? '',
          tier: u.tier,
          createdAt: u.createdAt,
          todos: u._count.todos,
        })),
      },
    };
  });
};
