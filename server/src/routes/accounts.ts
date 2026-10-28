import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';

// 以中国时区（UTC+8，无夏令时）计算月度边界，避免月初 0-8 点记到上个月
const TZ_OFFSET = 8 * 3600 * 1000;

function monthRange(month?: string) {
  const cn = new Date(Date.now() + TZ_OFFSET);
  const y = month ? Number(month.slice(0, 4)) : cn.getUTCFullYear();
  const m = month ? Number(month.slice(5, 7)) : cn.getUTCMonth() + 1;
  const start = new Date(Date.UTC(y, m - 1, 1) - TZ_OFFSET);
  const end = new Date(Date.UTC(y, m, 1) - TZ_OFFSET);
  return { gte: start, lt: end };
}

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/accounts', async (req) => {
    const { month } = req.query as { month?: string };
    const list = await prisma.account.findMany({
      where: { userId: req.user.sub, occurredAt: monthRange(month) },
      orderBy: { occurredAt: 'desc' },
    });
    return { code: 0, data: { list } };
  });

  app.get('/accounts/summary', async (req) => {
    const { month } = req.query as { month?: string };
    const rows = await prisma.account.groupBy({
      by: ['type'],
      where: { userId: req.user.sub, occurredAt: monthRange(month) },
      _sum: { amount: true },
    });

    let income = 0;
    let expense = 0;
    for (const r of rows) {
      const sum = Number(r._sum.amount ?? 0);
      if (r.type === 'income') income += sum;
      else expense += sum;
    }
    return {
      code: 0,
      data: { month: month || new Date().toISOString().slice(0, 7), income, expense, balance: income - expense },
    };
  });

  app.post('/accounts', async (req, reply) => {
    const body = (req.body ?? {}) as {
      type?: string;
      amount?: number | string;
      category?: string;
      remark?: string;
      occurredAt?: string;
    };
    const amount = Number(body.amount);
    if (!body.type || !['income', 'expense'].includes(body.type)) {
      return reply.code(400).send({ code: 400, message: '类型必须是 income 或 expense' });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
      return reply.code(400).send({ code: 400, message: '金额必须大于 0' });
    }
    if (body.occurredAt && Number.isNaN(Date.parse(body.occurredAt))) {
      return reply.code(400).send({ code: 400, message: '日期不合法' });
    }

    const account = await prisma.account.create({
      data: {
        userId: req.user.sub,
        type: body.type,
        amount,
        category: (body.category || '其他').slice(0, 32),
        remark: (body.remark || '').slice(0, 200),
        ...(body.occurredAt ? { occurredAt: new Date(body.occurredAt) } : {}),
      },
    });
    return { code: 0, data: account };
  });

  app.patch('/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      type?: string;
      amount?: number | string;
      category?: string;
      remark?: string;
      occurredAt?: string;
    };
    const data: Record<string, unknown> = {};

    if (typeof body.type === 'string') {
      if (!['income', 'expense'].includes(body.type)) {
        return reply.code(400).send({ code: 400, message: '类型必须是 income 或 expense' });
      }
      data.type = body.type;
    }
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
        return reply.code(400).send({ code: 400, message: '金额必须大于 0' });
      }
      data.amount = amount;
    }
    if (typeof body.category === 'string') data.category = body.category.slice(0, 32);
    if (typeof body.remark === 'string') data.remark = body.remark.slice(0, 200);
    if (typeof body.occurredAt === 'string') {
      if (Number.isNaN(Date.parse(body.occurredAt))) {
        return reply.code(400).send({ code: 400, message: '日期不合法' });
      }
      data.occurredAt = new Date(body.occurredAt);
    }
    if (!Object.keys(data).length) {
      return reply.code(400).send({ code: 400, message: '没有可更新的字段' });
    }

    const result = await prisma.account.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '记录不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.account.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '记录不存在' });
    return { code: 0, data: { ok: true } };
  });
};
