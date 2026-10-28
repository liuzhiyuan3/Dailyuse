import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { config } from '../config';
import { getWeatherNow, qweatherConfigured, searchCities } from '../lib/qweather';

/** 和风 LocationID：6-12 位字母数字（如 101010100） */
const LOC_RE = /^[0-9A-Za-z]{4,16}$/;

/**
 * 每日天气订阅。实现上是一条 toolType=weather 的 Reminder（repeat=daily），
 * 复用提醒框架的额度（remain）、补充授权（grant）与定时推送（jobs）。
 */
export const weatherRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** 城市搜索：被和风请求限制挡住时返回空列表，前端回退到内置城市 */
  app.get('/weather/cities', async (req) => {
    const { q } = req.query as { q?: string };
    const kw = (q ?? '').trim().slice(0, 20);
    if (!kw || !qweatherConfigured) return { code: 0, data: { list: [] } };
    const list = await searchCities(kw);
    return { code: 0, data: { list } };
  });

  /** 实时天气（页面预览用） */
  app.get('/weather/now', async (req, reply) => {
    const { location } = req.query as { location?: string };
    const loc = (location ?? '').trim();
    if (!LOC_RE.test(loc)) {
      return reply.code(400).send({ code: 400, message: 'location 不合法' });
    }
    if (!qweatherConfigured) {
      return reply.code(503).send({ code: 503, message: '天气服务未配置' });
    }
    try {
      const now = await getWeatherNow(loc);
      return { code: 0, data: { now } };
    } catch (e) {
      req.log.warn(e, '[weather] 实时天气查询失败');
      return reply.code(502).send({ code: 502, message: '天气查询失败，请稍后再试' });
    }
  });

  /** 我的天气订阅（一人一条） */
  app.get('/weather/subscription', async (req) => {
    const sub = await prisma.reminder.findFirst({
      where: { userId: req.user.sub, toolType: 'weather', status: 'pending' },
      orderBy: { remindAt: 'asc' },
    });
    return {
      code: 0,
      data: sub
        ? { id: sub.id, city: sub.city ?? '', location: sub.targetId, remain: sub.remain, remindAt: sub.remindAt }
        : null,
    };
  });

  /** 订阅 / 换城市（调用前前端应已拿到一次订阅授权；旧订阅会被替换） */
  app.post('/weather/subscription', async (req, reply) => {
    if (!qweatherConfigured || !config.wx.weatherTemplateId) {
      return reply.code(503).send({ code: 503, message: '天气推送暂未开通' });
    }
    const body = (req.body ?? {}) as { city?: string; location?: string };
    const city = (body.city ?? '').trim();
    const loc = (body.location ?? '').trim();
    if (!city || city.length > 24) {
      return reply.code(400).send({ code: 400, message: '城市名需 1-24 字' });
    }
    if (!LOC_RE.test(loc)) {
      return reply.code(400).send({ code: 400, message: 'location 不合法' });
    }

    const sub = await prisma.$transaction(async (tx) => {
      // 锁住用户行，让同一用户的并发替换串行完成；不同 API 进程也共享此锁。
      await tx.user.update({ where: { id: req.user.sub }, data: { updatedAt: new Date() } });
      // 一人一条：换城市替换旧订阅，旧额度作废。
      await tx.reminder.deleteMany({
        where: { userId: req.user.sub, toolType: 'weather', status: 'pending' },
      });
      return tx.reminder.create({
        data: {
          userId: req.user.sub,
          toolType: 'weather',
          targetId: loc,
          city,
          remindAt: nextMorningPush(),
          repeat: 'daily',
          templateId: config.wx.weatherTemplateId,
          remain: 1,
        },
      });
    });
    return {
      code: 0,
      data: { id: sub.id, city, location: loc, remain: sub.remain, remindAt: sub.remindAt },
    };
  });

  /** 取消订阅 */
  app.delete('/weather/subscription', async (req) => {
    await prisma.reminder.deleteMany({
      where: { userId: req.user.sub, toolType: 'weather', status: 'pending' },
    });
    return { code: 0, data: { ok: true } };
  });
};

/**
 * 下一个推送时刻：东八区 07:30。已过今天的 7:30 就排明天。
 * （07:30 落在默认免打扰时段 22:00-08:00 内，实际会顺延到 08:00 后发出；
 *  想准点 7:30 收到，把 QUIET_END_HOUR 调成 7。）
 */
function nextMorningPush(): Date {
  const now = Date.now() + 8 * 3600 * 1000;
  const d = new Date(now);
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  let t = new Date(`${ymd}T07:30:00+08:00`);
  if (t.getTime() <= Date.now()) t = new Date(t.getTime() + 86400000);
  return t;
}
