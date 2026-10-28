import { prisma } from './plugins/db';
import { sendSubscribeMessage } from './lib/wechat';
import { getWeatherNow } from './lib/qweather';
import { config } from './config';
import { nextOccurrence, repeatDayInTimezone } from './lib/reminderSchedule';

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

/** 按配置时区取 YYYY-MM-DD（天气模板的日期栏目用） */
function dateInTz(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function inQuietHours(d = new Date()) {
  const h = hourInTz(d);
  const { quietStartHour: s, quietEndHour: e } = config.push;
  if (s === e) return false;
  return s < e ? h >= s && h < e : h >= s || h < e;
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
  if (toolType === 'note') {
    const n = await prisma.note.findUnique({ where: { id: targetId } });
    return n?.title || n?.content?.slice(0, 20) || '便签提醒';
  }
  return '提醒';
}

function typeLabel(toolType: string) {
  if (toolType === 'countdown') return '倒数日提醒';
  if (toolType === 'group_todo') return '群组待办提醒';
  if (toolType === 'note') return '便签提醒';
  return '待办提醒';
}

/** 点推送后落到对应工具页 */
function pushPage(toolType: string) {
  if (toolType === 'countdown') return 'pages/countdown/index';
  if (toolType === 'group_todo') return 'pages/group/index';
  if (toolType === 'note') return 'pages/note/index';
  if (toolType === 'weather') return 'pages/weather/index';
  return 'pages/todo/index';
}

/**
 * 天气订阅推送字段：模板「天气提醒」的五个关键词。
 * phrase 类有 5 字上限、thing 类 20 字，超长截断。
 */
async function weatherPayload(r: { targetId: string; city: string | null }) {
  const w = await getWeatherNow(r.targetId);
  return {
    date1: { value: dateInTz() },
    phrase2: { value: (r.city || '本地').slice(0, 5) },
    phrase3: { value: w.text.slice(0, 5) },
    character_string4: { value: `${w.temp}°` },
    thing5: { value: `${w.text}，${w.temp}度，体感${w.feelsLike}度`.slice(0, 20) },
  };
}

let reminderRunning = false;

/** 提醒：到期且还有额度 → 推送 → 扣额度；定期提醒排下一次，额度用尽挂起等补充 */
async function reminderJob(logger: { info: (m: string) => void; error: (e: unknown) => void }) {
  if (reminderRunning) return;
  reminderRunning = true;
  try {
    await runReminders(logger);
  } finally {
    reminderRunning = false;
  }
}

async function runReminders(logger: { info: (m: string) => void; error: (e: unknown) => void }) {
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
    // 便签等自带模板的提醒不依赖全局配置；没自带又没配 WX_TEMPLATE_ID 的只能跳过
    if (!r.templateId && !config.wx.templateId) {
      logger.info('[jobs] 未配置 WX_TEMPLATE_ID 且该提醒无自带模板，已跳过');
      continue;
    }
    const user = await prisma.user.findUnique({ where: { id: r.userId } });
    if (!user) continue;

    try {
      const isWeather = r.toolType === 'weather';
      const title = isWeather ? r.city || '天气提醒' : await targetTitle(r.toolType, r.targetId);
      // 字段 key 必须与模板关键词一致，多了少了都会 47003：
      // - 工具提醒走「日程提醒」模板（thing5 标题 / thing2 内容 / date4 时间）
      // - 天气订阅走「天气提醒」模板（date1 日期 / phrase2 城市 / phrase3 天气 / character_string4 温度 / thing5 提示）
      const data = isWeather
        ? await weatherPayload(r)
        : {
            thing5: { value: title.slice(0, 20) },
            thing2: { value: typeLabel(r.toolType) },
            date4: { value: new Date().toISOString().slice(0, 19).replace('T', ' ') },
          };

      const res = await sendSubscribeMessage({
        openid: user.openid,
        // 便签/天气等自带模板的用自带值，老数据 / 工具类回退到全局模板
        templateId: r.templateId || config.wx.templateId,
        page: pushPage(r.toolType),
        data,
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
        if (r.repeat) {
          const repeatDay = r.repeat === 'monthly' ? r.repeatDay ?? repeatDayInTimezone(r.remindAt) : null;
          // 定期提醒：排下一次并保持 pending；额度耗尽时等 grant 补充后继续
          await prisma.reminder.update({
            where: { id: r.id },
            data: {
              remindAt: nextOccurrence(r.remindAt, r.repeat, repeatDay ?? undefined),
              repeatDay,
              remain: { decrement: 1 },
              status: 'pending',
            },
          });
        } else {
          await prisma.reminder.update({
            where: { id: r.id },
            data: { remain: { decrement: 1 }, status: 'sent' },
          });
        }
      } else if (res.errcode === 43101 || res.errcode === 43102) {
        // 用户拒收 / 模板失效：永久失败，停止重试
        await prisma.reminder.update({ where: { id: r.id }, data: { status: 'failed' } });
        logger.info(`[jobs] 提醒 ${r.id} 永久失败 (${res.errcode})`);
      } else {
        // 瞬时错误（微信侧抖动等）：保持 pending 但退避 10 分钟，
        // 否则会每分钟重试一次、每次都写一条 pushLog，表会被失败提醒刷爆
        await prisma.reminder.update({
          where: { id: r.id },
          data: { remindAt: new Date(Date.now() + 10 * 60 * 1000) },
        });
        logger.info(`[jobs] 提醒 ${r.id} 推送失败 (${res.errcode})，退避 10 分钟后重试`);
      }
    } catch (e) {
      // 天气源抖动 / 数据库错误等：同样退避，不让单条失败卡住整批
      logger.error(e);
      await prisma.reminder
        .update({ where: { id: r.id }, data: { remindAt: new Date(Date.now() + 10 * 60 * 1000) } })
        .catch(() => {});
    }
  }
}

export function startJobs(logger: { info: (m: string) => void; error: (e: unknown) => void }) {
  setInterval(() => void reminderJob(logger).catch((e) => logger.error(e)), REMINDER_INTERVAL).unref?.();
  logger.info('[jobs] 调度启动：提醒 1 分钟');
}
