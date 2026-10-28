import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

const KINDS = ['bug', 'idea', 'tool', 'other'];
const CONTENT_MIN = 5;
const CONTENT_MAX = 500;
const PER_USER_PER_DAY = 5;

/** 每用户每日反馈上限（进程内计数，重启清零；全局 120 次/分钟限流之上再加一层防刷） */
const hits = new Map<string, { day: string; count: number }>();

function takeQuota(userId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(userId);
  if (!rec || rec.day !== day) {
    hits.set(userId, { day, count: 1 });
    return true;
  }
  if (rec.count >= PER_USER_PER_DAY) return false;
  rec.count += 1;
  return true;
}

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /**
   * 用户反馈：报问题 / 提建议 / 想要什么新工具。
   * 不提供查询接口——内容只有管理员在 /admin/feedback 里看，避免用户互窥。
   */
  app.post('/feedback', async (req, reply) => {
    const body = (req.body ?? {}) as { kind?: string; content?: string };
    const kind = (body.kind ?? '').trim();
    const content = (body.content ?? '').trim();

    if (!KINDS.includes(kind)) {
      return reply.code(400).send({ code: 400, message: '反馈类型不合法' });
    }
    if (content.length < CONTENT_MIN || content.length > CONTENT_MAX) {
      return reply.code(400).send({ code: 400, message: `内容需 ${CONTENT_MIN}-${CONTENT_MAX} 字` });
    }
    if (!takeQuota(req.user.sub)) {
      return reply.code(429).send({ code: 429, message: `今天已提交 ${PER_USER_PER_DAY} 条，明天再来` });
    }

    const item = await prisma.feedback.create({
      data: { userId: req.user.sub, kind, content },
      select: { id: true, kind: true, createdAt: true },
    });
    return { code: 0, data: item, message: 'ok' };
  });
};
