import { prisma } from './plugins/db';
import { refreshKeyword } from './lib/news';
import { sendSubscribeMessage } from './lib/wechat';
import { config, wxConfigured } from './config';

const NEWS_INTERVAL = 30 * 60 * 1000;
const REMINDER_INTERVAL = 60 * 1000;

/** 按配置时区取小时（容器默认 UTC，不能直接用 getHours） */
function hourInTz(d = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return Number(h);
}

function inQuietHours(d = new Date()) {
  const h = hourInTz(d);
  const { quietStartHour: s, quietEndHour: e } = config.push;
  if (s === e) return false;
  return s < e ? h >= s && h < e : h >= s || h < e;
}

/** 资讯：抓取被订阅的关键词 → 有新增 → 消耗额度推送 */
async function newsJob(logger: { info: (m: string) => void; error: (e: unknown) => void }) {
  const subs = await prisma.subscribe.findMany({ where: { remain: { gt: 0 } } });
  const keywords = [...new Set(subs.map((s) => s.keyword))];

  for (const keyword of keywords) {
    try {
      const added = await refreshKeyword(keyword);
      if (added === 0) continue;

      if (inQuietHours()) {
        logger.info(`[jobs] 免打扰时段，暂不推送「${keyword}」`);
        continue;
      }

      const latest = await prisma.newsItem.findFirst({
        where: { keyword },
        orderBy: { publishedAt: 'desc' },
      });
      if (!latest) continue;

      const targets = await prisma.subscribe.findMany({
        where: { keyword, remain: { gt: 0 } },
      });

      for (const sub of targets) {
        const user = await prisma.user.findUnique({ where: { id: sub.userId } });
        if (!user) continue;

        // 频控：滚动 24 小时内该用户该关键词已推条数
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const sentCount = await prisma.pushLog.count({
          where: {
            userId: sub.userId,
            keyword,
            channel: 'news',
            status: 'sent',
            sentAt: { gte: since },
          },
        });
        if (sentCount >= config.push.perKeywordPerDay) continue;

        const res = await sendSubscribeMessage({
          openid: user.openid,
          templateId: sub.templateId,
          page: `pages/news/index?keyword=${encodeURIComponent(keyword)}`,
          data: {
            thing1: { value: latest.title.slice(0, 20) },
            thing2: { value: `「${keyword}」有 ${added} 条更新` },
            time3: { value: new Date().toISOString().slice(0, 19).replace('T', ' ') },
          },
        });

        await prisma.pushLog.create({
          data: {
            userId: sub.userId,
            channel: 'news',
            keyword,
            newsId: latest.id,
            status: res.ok ? 'sent' : 'failed',
          },
        });

        if (res.ok) {
          await prisma.subscribe.update({
            where: { id: sub.id },
            data: { remain: { decrement: 1 } },
          });
        }
      }
    } catch (e) {
      logger.error(e);
    }
  }
}

async function targetTitle(toolType: string, targetId: string) {
  if (toolType === 'todo') {
    const t = await prisma.todo.findUnique({ where: { id: targetId } });
    return t?.title ?? '待办提醒';
  }
  if (toolType === 'countdown') {
    const c = await prisma.countdown.findUnique({ where: { id: targetId } });
    return c?.name ?? '倒数日提醒';
  }
  if (toolType === 'group_todo') {
    const g = await prisma.groupTodo.findUnique({ where: { id: targetId } });
    return g?.title ?? '群组待办提醒';
  }
  return '提醒';
}

/** 提醒：到期且还有额度 → 推送 → 扣额度，额度用尽标记 sent */
async function reminderJob(logger: { info: (m: string) => void; error: (e: unknown) => void }) {
  if (wxConfigured && !config.wx.templateId) {
    logger.info('[jobs] 未配置 WX_TEMPLATE_ID，工具提醒已跳过');
    return;
  }
  const due = await prisma.reminder.findMany({
    where: { status: 'pending', remindAt: { lte: new Date() }, remain: { gt: 0 } },
    take: 50,
  });
  if (!due.length) return;
  if (inQuietHours()) {
    logger.info(`[jobs] 免打扰时段，${due.length} 条提醒顺延`);
    return;
  }

  for (const r of due) {
    const user = await prisma.user.findUnique({ where: { id: r.userId } });
    if (!user) continue;

    const title = await targetTitle(r.toolType, r.targetId);
    const res = await sendSubscribeMessage({
      openid: user.openid,
      templateId: config.wx.templateId,
      page: 'pages/todo/index',
      data: {
        thing1: { value: title.slice(0, 20) },
        thing2: { value: r.toolType === 'group_todo' ? '群组待办提醒' : '待办提醒' },
        time3: { value: new Date().toISOString().slice(0, 19).replace('T', ' ') },
      },
    });

    await prisma.pushLog.create({
      data: {
        userId: r.userId,
        channel: 'reminder',
        reminderId: r.id,
        status: res.ok ? 'sent' : 'failed',
      },
    });

    if (res.ok) {
      const left = r.remain - 1;
      await prisma.reminder.update({
        where: { id: r.id },
        data: { remain: left, status: left > 0 ? 'pending' : 'sent' },
      });
    } else if (res.errcode === 43101 || res.errcode === 43102) {
      // 用户拒收 / 模板失效：永久失败，停止重试
      await prisma.reminder.update({ where: { id: r.id }, data: { status: 'failed' } });
      logger.info(`[jobs] 提醒 ${r.id} 永久失败 (${res.errcode})`);
    }
    // 其他错误保持 pending，下轮重试
  }
}

export function startJobs(logger: { info: (m: string) => void; error: (e: unknown) => void }) {
  setInterval(() => void newsJob(logger).catch((e) => logger.error(e)), NEWS_INTERVAL).unref?.();
  setInterval(() => void reminderJob(logger).catch((e) => logger.error(e)), REMINDER_INTERVAL).unref?.();
  logger.info('[jobs] 调度启动：资讯 30 分钟 / 提醒 1 分钟');
}
