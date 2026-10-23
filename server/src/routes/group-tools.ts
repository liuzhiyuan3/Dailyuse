import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

async function isMember(groupId: string, userId: string) {
  const m = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  return Boolean(m);
}

export const groupToolRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // ================= 购物清单 =================
  app.get('/groups/:id/items', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const { toolKey } = req.query as { toolKey?: string };
    const list = await prisma.groupListItem.findMany({
      where: { groupId: id, ...(toolKey ? { toolKey } : {}) },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    });
    return { code: 0, data: { list } };
  });

  app.post('/groups/:id/items', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { content?: string; toolKey?: string; note?: string };
    const content = (body.content ?? '').trim();
    if (!content || content.length > 120) {
      return reply.code(400).send({ code: 400, message: '内容需 1-120 字' });
    }
    const toolKey = (body.toolKey ?? 'list').slice(0, 40);
    const item = await prisma.groupListItem.create({
      data: {
        groupId: id,
        toolKey,
        content,
        note: (body.note ?? '').slice(0, 300),
        createdBy: req.user.sub,
      },
    });
    return { code: 0, data: item };
  });

  app.patch('/groups/:id/items/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { done?: boolean; content?: string; note?: string; pinned?: boolean };
    const data: Record<string, unknown> = {};
    if (typeof body.done === 'boolean') data.done = body.done;
    if (typeof body.content === 'string') data.content = body.content.trim();
    if (typeof body.note === 'string') data.note = body.note.slice(0, 300);
    if (typeof body.pinned === 'boolean') data.pinned = body.pinned;

    const result = await prisma.groupListItem.updateMany({
      where: { id: itemId, groupId: id },
      data,
    });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '清单项不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/groups/:id/items/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const result = await prisma.groupListItem.deleteMany({ where: { id: itemId, groupId: id } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '清单项不存在' });
    return { code: 0, data: { ok: true } };
  });

  // ================= AA 记账 =================
  app.get('/groups/:id/expenses', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }

    const [list, memberCount] = await Promise.all([
      prisma.groupExpense.findMany({ where: { groupId: id }, orderBy: { createdAt: 'desc' } }),
      prisma.groupMember.count({ where: { groupId: id } }),
    ]);

    const count = Math.max(memberCount, 1);
    let total = 0;
    let myPaid = 0;
    for (const e of list) {
      const amount = Number(e.amount);
      total += amount;
      if (e.payerId === req.user.sub) myPaid += amount;
    }
    const myShare = total / count;

    return {
      code: 0,
      data: {
        list,
        summary: {
          total,
          memberCount: count,
          myPaid,
          myShare,
          // 正数：别人该给我；负数：我该给别人
          balance: myPaid - myShare,
        },
      },
    };
  });

  app.post('/groups/:id/expenses', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { title?: string; amount?: number | string };
    const title = (body.title ?? '').trim();
    const amount = Number(body.amount);
    if (!title) return reply.code(400).send({ code: 400, message: '填写用途' });
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ code: 400, message: '金额必须大于 0' });
    }

    const expense = await prisma.groupExpense.create({
      data: { groupId: id, title, amount, payerId: req.user.sub },
    });
    return { code: 0, data: expense };
  });

  app.delete('/groups/:id/expenses/:expenseId', async (req, reply) => {
    const { id, expenseId } = req.params as { id: string; expenseId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const result = await prisma.groupExpense.deleteMany({ where: { id: expenseId, groupId: id } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '记录不存在' });
    return { code: 0, data: { ok: true } };
  });

  // ================= 活动 =================
  app.get('/groups/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const list = await prisma.groupEvent.findMany({
      where: { groupId: id },
      orderBy: { startAt: 'asc' },
    });
    return { code: 0, data: { list } };
  });

  app.post('/groups/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { title?: string; startAt?: string; place?: string };
    const title = (body.title ?? '').trim();
    if (!title) return reply.code(400).send({ code: 400, message: '填写活动名称' });
    if (!body.startAt || Number.isNaN(Date.parse(body.startAt))) {
      return reply.code(400).send({ code: 400, message: '时间不合法' });
    }

    const event = await prisma.groupEvent.create({
      data: {
        groupId: id,
        title,
        startAt: new Date(body.startAt),
        place: (body.place ?? '').slice(0, 120),
        createdBy: req.user.sub,
      },
    });
    return { code: 0, data: event };
  });

  app.delete('/groups/:id/events/:eventId', async (req, reply) => {
    const { id, eventId } = req.params as { id: string; eventId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const result = await prisma.groupEvent.deleteMany({ where: { id: eventId, groupId: id } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '活动不存在' });
    return { code: 0, data: { ok: true } };
  });

  // ================= 工具配置（可增删） =================
  const ALLOWED_KINDS = [
    'todo',
    'list',
    'expense',
    'event',
    'score',
    'order',
    'notice',
    'recipe',
    'link',
    'parcel',
    'duty',
    'wish',
    'custom',
  ];

  // 付费门禁示例：自定义群工具属于 pro 功能。
  // 其余要收费的接口照这个样子加 `{ preHandler: app.requirePro }` 即可，
  // 是否真的拦人由 PAY_ENFORCED 决定（默认关，接了支付再打开）。
  app.patch('/groups/:id/tools', { preHandler: app.requirePro }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }

    const body = (req.body ?? {}) as {
      tools?: Array<{ key?: string; label?: string; kind?: string }>;
    };
    if (!Array.isArray(body.tools)) {
      return reply.code(400).send({ code: 400, message: 'tools 必须是数组' });
    }

    const seen = new Set<string>();
    const clean: Array<{ key: string; label: string; kind: string }> = [];

    for (const t of body.tools) {
      const key = String(t?.key ?? '').trim().slice(0, 40);
      const label = String(t?.label ?? '').trim().slice(0, 20);
      const kind = String(t?.kind ?? '');
      if (!key || !label || !ALLOWED_KINDS.includes(kind)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({ key, label, kind });
    }

    if (!clean.length) {
      return reply.code(400).send({ code: 400, message: '至少保留一个工具' });
    }

    const group = await prisma.group.update({
      where: { id },
      data: { tools: JSON.stringify(clean) },
    });
    return { code: 0, data: { tools: clean } };
  });

  // ================= 计分 =================
  app.get('/groups/:id/scores', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }

    const [members, grouped, recent] = await Promise.all([
      prisma.groupMember.findMany({
        where: { groupId: id },
        include: { user: { select: { id: true, nickname: true } } },
      }),
      prisma.groupScore.groupBy({
        by: ['userId'],
        where: { groupId: id },
        _sum: { delta: true },
      }),
      prisma.groupScore.findMany({
        where: { groupId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const totals = members.map((m) => ({
      userId: m.user.id,
      nickname: m.user.nickname,
      score: Number(grouped.find((g) => g.userId === m.user.id)?._sum.delta ?? 0),
    }));

    return { code: 0, data: { totals, recent } };
  });

  app.post('/groups/:id/scores', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { userId?: string; delta?: number; reason?: string };
    const delta = Number(body.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
      return reply.code(400).send({ code: 400, message: '分值需为 -100~100 的整数' });
    }

    const record = await prisma.groupScore.create({
      data: {
        groupId: id,
        userId: body.userId || req.user.sub,
        delta,
        reason: (body.reason ?? '').slice(0, 80),
        createdBy: req.user.sub,
      },
    });
    return { code: 0, data: record };
  });

  // ================= 点餐 =================
  app.get('/groups/:id/orders', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const list = await prisma.groupOrder.findMany({
      where: { groupId: id },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    });
    return { code: 0, data: { list } };
  });

  app.post('/groups/:id/orders', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { content?: string };
    const content = (body.content ?? '').trim();
    if (!content || content.length > 80) {
      return reply.code(400).send({ code: 400, message: '内容需 1-80 字' });
    }
    const order = await prisma.groupOrder.create({
      data: { groupId: id, content, createdBy: req.user.sub },
    });
    return { code: 0, data: order };
  });

  app.patch('/groups/:id/orders/:orderId', async (req, reply) => {
    const { id, orderId } = req.params as { id: string; orderId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { done?: boolean };
    if (typeof body.done !== 'boolean') {
      return reply.code(400).send({ code: 400, message: '缺少 done' });
    }
    const result = await prisma.groupOrder.updateMany({
      where: { id: orderId, groupId: id },
      data: { done: body.done },
    });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '记录不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/groups/:id/orders/:orderId', async (req, reply) => {
    const { id, orderId } = req.params as { id: string; orderId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const result = await prisma.groupOrder.deleteMany({ where: { id: orderId, groupId: id } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '记录不存在' });
    return { code: 0, data: { ok: true } };
  });
};
