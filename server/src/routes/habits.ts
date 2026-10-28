import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { createHash } from 'node:crypto';

// Prisma 的 @db.Date 按 Date 的 UTC 日期部分入库，所以统一用「UTC 午夜」表示一个日历日，
// 避免非 UTC 时区下本地 0 点被截成前一天。
function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** 日历日 → YYYY-MM-DD（按 UTC 部分） */
function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 当地「今天」的 UTC 午夜表示 */
function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** YYYY-MM-DD → UTC 午夜 */
function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** 连续打卡天数：从今天（或昨天）往回数连续有记录的天数 */
function streakOf(days: Set<string>): number {
  let cursor = todayUTC().getTime();
  // 今天还没打时，从昨天起算（今天的进度不该把连击清零）
  if (!days.has(dayKey(new Date(cursor)))) cursor -= 86400000;
  let streak = 0;
  while (days.has(dayKey(new Date(cursor)))) {
    streak++;
    cursor -= 86400000;
  }
  return streak;
}

/** 最近 7 天（含今天）的打卡情况，老到新 */
function lastWeek(days: Set<string>): boolean[] {
  const today = todayUTC().getTime();
  const out: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    out.push(days.has(dayKey(new Date(today - i * 86400000))));
  }
  return out;
}

export const habitRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/habits', async (req) => {
    const [habits, logs] = await Promise.all([
      prisma.habit.findMany({
        where: { userId: req.user.sub, archived: false },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.habitLog.findMany({
        where: { userId: req.user.sub },
        orderBy: { day: 'desc' },
        select: { habitId: true, day: true },
      }),
    ]);

    const byHabit = new Map<string, Set<string>>();
    for (const log of logs) {
      if (!byHabit.has(log.habitId)) byHabit.set(log.habitId, new Set());
      byHabit.get(log.habitId)!.add(dayKey(log.day));
    }

    const today = dayKey(todayUTC());
    const list = habits.map((h) => {
      const days = byHabit.get(h.id) ?? new Set<string>();
      return {
        id: h.id,
        name: h.name,
        createdAt: h.createdAt,
        today: days.has(today),
        streak: streakOf(days),
        total: days.size,
        week: lastWeek(days),
      };
    });
    return { code: 0, data: { list } };
  });

  app.post('/habits', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: unknown; localId?: unknown; days?: unknown; createdAt?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 60) {
      return reply.code(400).send({ code: 400, message: '名称需 1-60 字' });
    }
    if (body.localId !== undefined && (typeof body.localId !== 'string' || !/^local-[a-z0-9-]{1,80}$/.test(body.localId))) {
      return reply.code(400).send({ code: 400, message: 'localId 不合法' });
    }
    if (body.createdAt != null && (typeof body.createdAt !== 'string' || Number.isNaN(Date.parse(body.createdAt)))) {
      return reply.code(400).send({ code: 400, message: 'createdAt 不合法' });
    }
    if (body.days !== undefined && (!Array.isArray(body.days) || body.days.length > 10000)) {
      return reply.code(400).send({ code: 400, message: '打卡日期列表不合法' });
    }
    const days = new Set<string>();
    for (const value of (body.days ?? []) as unknown[]) {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return reply.code(400).send({ code: 400, message: '打卡日期不合法' });
      }
      const day = parseDay(value);
      if (Number.isNaN(day.getTime()) || dayKey(day) !== value || day > todayUTC()) {
        return reply.code(400).send({ code: 400, message: '打卡日期不合法' });
      }
      days.add(value);
    }
    const id = body.localId
      ? `guest-${createHash('sha256').update(`${req.user.sub}\0${body.localId}`).digest('hex')}`
      : undefined;
    const include = { logs: { select: { day: true } } };
    let habit = id ? await prisma.habit.findUnique({ where: { id }, include }) : null;
    if (!habit) {
      const count = await prisma.habit.count({ where: { userId: req.user.sub, archived: false } });
      if (count >= 20) {
        return reply.code(400).send({ code: 400, message: '最多 20 个打卡项' });
      }
      const data = {
        ...(id ? { id } : {}),
        userId: req.user.sub,
        name,
        ...(typeof body.createdAt === 'string' ? { createdAt: new Date(body.createdAt) } : {}),
        // 嵌套创建由 Prisma 放在同一事务中，日志失败时不会留下空的打卡项。
        logs: { create: [...days].map((day) => ({ userId: req.user.sub, day: parseDay(day) })) },
      };
      try {
        habit = id
          ? await prisma.habit.upsert({ where: { id }, update: {}, create: data, include })
          : await prisma.habit.create({ data, include });
      } catch (error) {
        // 带嵌套写入的 upsert 可能在并发首次导入时触发唯一键冲突。
        if (!id || (error as { code?: string }).code !== 'P2002') throw error;
        habit = await prisma.habit.findUnique({ where: { id }, include });
        if (!habit) throw error;
      }
    }
    const loggedDays = new Set(habit.logs.map((log) => dayKey(log.day)));
    const { logs: _logs, ...item } = habit;
    return { code: 0, data: { ...item, today: loggedDays.has(dayKey(todayUTC())), streak: streakOf(loggedDays), total: loggedDays.size, week: lastWeek(loggedDays) } };
  });

  app.patch('/habits/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string };
    const data: Record<string, unknown> = {};
    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name || name.length > 60) {
        return reply.code(400).send({ code: 400, message: '名称需 1-60 字' });
      }
      data.name = name;
    }
    const result = await prisma.habit.updateMany({ where: { id, userId: req.user.sub }, data });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '打卡项不存在' });
    return { code: 0, data: { ok: true } };
  });

  app.delete('/habits/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await prisma.habit.deleteMany({ where: { id, userId: req.user.sub } });
    if (result.count === 0) return reply.code(404).send({ code: 404, message: '打卡项不存在' });
    return { code: 0, data: { ok: true } };
  });

  // 切换某天的打卡状态（默认今天）；day 传 YYYY-MM-DD，供登录后合并游客数据用
  app.post('/habits/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { day?: string };
    const habit = await prisma.habit.findFirst({ where: { id, userId: req.user.sub } });
    if (!habit) return reply.code(404).send({ code: 404, message: '打卡项不存在' });

    const day = body.day && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? parseDay(body.day) : todayUTC();
    // 只允许补/退 7 天内的记录，防止把 day 填成很久以前刷连击
    const diff = todayUTC().getTime() - day.getTime();
    if (diff < 0 || diff > 7 * 86400000) {
      return reply.code(400).send({ code: 400, message: '只能记录最近 7 天' });
    }

    const existing = await prisma.habitLog.findUnique({
      where: { habitId_day: { habitId: id, day } },
    });
    if (existing) {
      await prisma.habitLog.delete({ where: { id: existing.id } });
      return { code: 0, data: { done: false, day: dayKey(day) } };
    }
    await prisma.habitLog.create({ data: { habitId: id, userId: req.user.sub, day } });
    return { code: 0, data: { done: true, day: dayKey(day) } };
  });
};
