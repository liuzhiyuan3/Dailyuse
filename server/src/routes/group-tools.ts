import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { assertContentSafe } from '../lib/seccheck';

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
    const note = (body.note ?? '').slice(0, 300);
    await assertContentSafe(`${content} ${note}`, req.user.openid ?? '');
    const toolKey = (body.toolKey ?? 'list').slice(0, 40);
    const item = await prisma.groupListItem.create({
      data: {
        groupId: id,
        toolKey,
        content,
        note,
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
    if (typeof body.content === 'string') {
      const content = body.content.trim();
      if (!content || content.length > 120) {
        return reply.code(400).send({ code: 400, message: '内容需 1-120 字' });
      }
      data.content = content;
    }
    if (typeof body.note === 'string') data.note = body.note.slice(0, 300);
    if (typeof body.pinned === 'boolean') data.pinned = body.pinned;

    let checkedItem: { content: string; note: string } | null = null;
    if (typeof data.content === 'string' || typeof data.note === 'string') {
      checkedItem = await prisma.groupListItem.findFirst({
        where: { id: itemId, groupId: id },
        select: { content: true, note: true },
      });
      if (!checkedItem) return reply.code(404).send({ code: 404, message: '清单项不存在' });
      const content = typeof data.content === 'string' ? data.content : checkedItem.content;
      const note = typeof data.note === 'string' ? data.note : checkedItem.note;
      await assertContentSafe(`${content} ${note}`, req.user.openid ?? '');
    }

    const result = await prisma.groupListItem.updateMany({
      // 检测期间发生文字编辑时拒绝旧快照，避免拼出未检测的字段组合。
      where: { id: itemId, groupId: id, ...(checkedItem ?? {}) },
      data,
    });
    if (result.count === 0) {
      return checkedItem
        ? reply.code(409).send({ code: 409, message: '内容已被更新，请刷新后重试' })
        : reply.code(404).send({ code: 404, message: '清单项不存在' });
    }
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
    if (!title || title.length > 120) {
      return reply.code(400).send({ code: 400, message: '用途需 1-120 字' });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
      return reply.code(400).send({ code: 400, message: '金额必须大于 0' });
    }
    await assertContentSafe(title, req.user.openid ?? '');

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
    const place = (body.place ?? '').slice(0, 120);
    await assertContentSafe(`${title} ${place}`, req.user.openid ?? '');

    const event = await prisma.groupEvent.create({
      data: {
        groupId: id,
        title,
        startAt: new Date(body.startAt),
        place,
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
    'poll',
    'countdown',
    'chain',
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
    // 只检测实际保存、对全组可见的工具名。
    for (const tool of clean) await assertContentSafe(tool.label, req.user.openid ?? '');

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

    const reason = (body.reason ?? '').slice(0, 80);
    await assertContentSafe(reason, req.user.openid ?? '');
    const record = await prisma.groupScore.create({
      data: {
        groupId: id,
        userId: body.userId || req.user.sub,
        delta,
        reason,
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
    await assertContentSafe(content, req.user.openid ?? '');
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

  // ================= 投票 =================
  app.get('/groups/:id/polls', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const polls = await prisma.groupPoll.findMany({
      where: { groupId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        options: {
          orderBy: { sort: 'asc' },
          include: { votes: { select: { userId: true } } },
        },
      },
    });

    const now = Date.now();
    const list = polls.map((p) => {
      const voters = new Set<string>();
      for (const o of p.options) for (const v of o.votes) voters.add(v.userId);
      return {
        id: p.id,
        question: p.question,
        multi: p.multi,
        deadline: p.deadline,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        closed: p.deadline ? p.deadline.getTime() <= now : false,
        votedCount: voters.size,
        myOptionIds: p.options
          .filter((o) => o.votes.some((v) => v.userId === req.user.sub))
          .map((o) => o.id),
        options: p.options.map((o) => ({
          id: o.id,
          content: o.content,
          count: o.votes.length,
        })),
      };
    });
    return { code: 0, data: { list } };
  });

  app.post('/groups/:id/polls', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as {
      question?: string;
      options?: unknown;
      multi?: boolean;
      deadline?: string;
    };
    const question = (body.question ?? '').trim();
    if (!question || question.length > 120) {
      return reply.code(400).send({ code: 400, message: '问题需 1-120 字' });
    }
    if (!Array.isArray(body.options)) {
      return reply.code(400).send({ code: 400, message: 'options 必须是数组' });
    }
    const options = [...new Set(
      (body.options as unknown[])
        .map((x) => String(x ?? '').trim().slice(0, 60))
        .filter(Boolean)
    )].slice(0, 10);
    if (options.length < 2) {
      return reply.code(400).send({ code: 400, message: '至少 2 个选项' });
    }

    let deadline: Date | null = null;
    if (body.deadline) {
      const t = Date.parse(body.deadline);
      if (Number.isNaN(t) || t <= Date.now()) {
        return reply.code(400).send({ code: 400, message: '截止时间必须晚于现在' });
      }
      deadline = new Date(t);
    }

    // 群内互相可见，问题与选项逐个过检
    await assertContentSafe([question, ...options].join(' '), req.user.openid ?? '');

    const poll = await prisma.groupPoll.create({
      data: {
        groupId: id,
        question,
        multi: Boolean(body.multi),
        deadline,
        createdBy: req.user.sub,
        options: {
          create: options.map((content, sort) => ({ content, sort })),
        },
      },
      include: { options: { orderBy: { sort: 'asc' } } },
    });
    return {
      code: 0,
      data: {
        ...poll,
        closed: false,
        votedCount: 0,
        myOptionIds: [] as string[],
        options: poll.options.map((o) => ({ id: o.id, content: o.content, count: 0 })),
      },
    };
  });

  // 投票：整单提交（单选 1 项 / 多选 1-N 项），重复提交覆盖旧票
  app.post('/groups/:id/polls/:pollId/vote', async (req, reply) => {
    const { id, pollId } = req.params as { id: string; pollId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { optionIds?: unknown };
    const optionIds = Array.isArray(body.optionIds)
      ? [...new Set((body.optionIds as unknown[]).map((x) => String(x)))]
      : [];
    if (!optionIds.length) {
      return reply.code(400).send({ code: 400, message: '至少选一项' });
    }

    const poll = await prisma.groupPoll.findFirst({
      where: { id: pollId, groupId: id },
      include: { options: true },
    });
    if (!poll) return reply.code(404).send({ code: 404, message: '投票不存在' });
    if (poll.deadline && poll.deadline.getTime() <= Date.now()) {
      return reply.code(400).send({ code: 400, message: '投票已截止' });
    }
    if (!poll.multi && optionIds.length > 1) {
      return reply.code(400).send({ code: 400, message: '该投票为单选' });
    }
    const valid = new Set(poll.options.map((o) => o.id));
    if (!optionIds.every((oid) => valid.has(oid))) {
      return reply.code(400).send({ code: 400, message: '包含无效选项' });
    }

    // 先清掉该用户在这个投票下的旧票，再写新票（覆盖式提交）
    await prisma.$transaction([
      prisma.groupPollVote.deleteMany({ where: { pollId, userId: req.user.sub } }),
      prisma.groupPollVote.createMany({
        data: optionIds.map((optionId) => ({
          pollId,
          optionId,
          userId: req.user.sub,
        })),
      }),
    ]);
    return { code: 0, data: { ok: true } };
  });

  app.delete('/groups/:id/polls/:pollId', async (req, reply) => {
    const { id, pollId } = req.params as { id: string; pollId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    // 发起人或群主可删
    const poll = await prisma.groupPoll.findFirst({ where: { id: pollId, groupId: id } });
    if (!poll) return reply.code(404).send({ code: 404, message: '投票不存在' });
    const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
    if (poll.createdBy !== req.user.sub && group?.ownerId !== req.user.sub) {
      return reply.code(403).send({ code: 403, message: '只有发起人或群主可以删除' });
    }
    await prisma.groupPoll.delete({ where: { id: pollId } });
    return { code: 0, data: { ok: true } };
  });

  // ================= 群倒数日 =================
  app.get('/groups/:id/countdowns', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const list = await prisma.groupCountdown.findMany({
      where: { groupId: id },
      orderBy: { targetDate: 'asc' },
    });
    return { code: 0, data: { list } };
  });

  app.post('/groups/:id/countdowns', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { name?: string; targetDate?: string };
    const name = (body.name ?? '').trim();
    if (!name || name.length > 80) {
      return reply.code(400).send({ code: 400, message: '名称需 1-80 字' });
    }
    if (!body.targetDate || Number.isNaN(Date.parse(body.targetDate))) {
      return reply.code(400).send({ code: 400, message: '目标日期不合法' });
    }
    await assertContentSafe(name, req.user.openid ?? '');

    const item = await prisma.groupCountdown.create({
      data: {
        groupId: id,
        name,
        targetDate: new Date(body.targetDate),
        createdBy: req.user.sub,
      },
    });
    return { code: 0, data: item };
  });

  app.delete('/groups/:id/countdowns/:cdId', async (req, reply) => {
    const { id, cdId } = req.params as { id: string; cdId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const result = await prisma.groupCountdown.deleteMany({ where: { id: cdId, groupId: id } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '倒数日不存在' });
    return { code: 0, data: { ok: true } };
  });

  // ================= 接龙 =================
  app.get('/groups/:id/chains', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const list = await prisma.groupChain.findMany({
      where: { groupId: id },
      orderBy: { createdAt: 'desc' },
      include: { entries: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      code: 0,
      data: {
        list: list.map((c) => ({
          ...c,
          myEntry: c.entries.find((e) => e.userId === req.user.sub) ?? null,
        })),
      },
    };
  });

  app.post('/groups/:id/chains', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const body = (req.body ?? {}) as { title?: string };
    const title = (body.title ?? '').trim();
    if (!title || title.length > 120) {
      return reply.code(400).send({ code: 400, message: '标题需 1-120 字' });
    }
    await assertContentSafe(title, req.user.openid ?? '');

    const chain = await prisma.groupChain.create({
      data: { groupId: id, title, createdBy: req.user.sub },
      include: { entries: true },
    });
    return { code: 0, data: { ...chain, myEntry: null } };
  });

  // 加入/更新我的接龙（一人一条，重复提交覆盖备注）
  app.post('/groups/:id/chains/:chainId/entries', async (req, reply) => {
    const { id, chainId } = req.params as { id: string; chainId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const chain = await prisma.groupChain.findFirst({ where: { id: chainId, groupId: id } });
    if (!chain) return reply.code(404).send({ code: 404, message: '接龙不存在' });
    if (chain.closed) return reply.code(400).send({ code: 400, message: '接龙已截止' });

    const body = (req.body ?? {}) as { remark?: string };
    const remark = (body.remark ?? '').trim().slice(0, 120);
    await assertContentSafe(remark, req.user.openid ?? '');

    const entry = await prisma.groupChainEntry.upsert({
      where: { chainId_userId: { chainId, userId: req.user.sub } },
      create: { chainId, userId: req.user.sub, remark },
      update: { remark },
    });
    return { code: 0, data: entry };
  });

  // 退出接龙：本人可退自己的；接龙发起人/群主可清任意条目
  app.delete('/groups/:id/chains/:chainId/entries/:entryId', async (req, reply) => {
    const { id, chainId, entryId } = req.params as { id: string; chainId: string; entryId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const chain = await prisma.groupChain.findFirst({ where: { id: chainId, groupId: id } });
    if (!chain) return reply.code(404).send({ code: 404, message: '接龙不存在' });

    const entry = await prisma.groupChainEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.chainId !== chainId) {
      return reply.code(404).send({ code: 404, message: '条目不存在' });
    }
    if (entry.userId !== req.user.sub && chain.createdBy !== req.user.sub) {
      const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
      if (group?.ownerId !== req.user.sub) {
        return reply.code(403).send({ code: 403, message: '只能退出自己的接龙' });
      }
    }
    await prisma.groupChainEntry.delete({ where: { id: entryId } });
    return { code: 0, data: { ok: true } };
  });

  // 截止/重新开放接龙：发起人或群主
  app.patch('/groups/:id/chains/:chainId', async (req, reply) => {
    const { id, chainId } = req.params as { id: string; chainId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const chain = await prisma.groupChain.findFirst({ where: { id: chainId, groupId: id } });
    if (!chain) return reply.code(404).send({ code: 404, message: '接龙不存在' });

    const body = (req.body ?? {}) as { closed?: boolean };
    if (typeof body.closed !== 'boolean') {
      return reply.code(400).send({ code: 400, message: '缺少 closed' });
    }
    if (chain.createdBy !== req.user.sub) {
      const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
      if (group?.ownerId !== req.user.sub) {
        return reply.code(403).send({ code: 403, message: '只有发起人或群主可以操作' });
      }
    }
    await prisma.groupChain.update({ where: { id: chainId }, data: { closed: body.closed } });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/groups/:id/chains/:chainId', async (req, reply) => {
    const { id, chainId } = req.params as { id: string; chainId: string };
    if (!(await isMember(id, req.user.sub))) {
      return reply.code(403).send({ code: 403, message: '你不在该群组' });
    }
    const chain = await prisma.groupChain.findFirst({ where: { id: chainId, groupId: id } });
    if (!chain) return reply.code(404).send({ code: 404, message: '接龙不存在' });
    if (chain.createdBy !== req.user.sub) {
      const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
      if (group?.ownerId !== req.user.sub) {
        return reply.code(403).send({ code: 403, message: '只有发起人或群主可以删除' });
      }
    }
    await prisma.groupChain.delete({ where: { id: chainId } });
    return { code: 0, data: { ok: true } };
  });
};
