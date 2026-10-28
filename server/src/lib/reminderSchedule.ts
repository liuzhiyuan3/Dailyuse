import { config } from '../config';

/** 用配置时区的墙上时间运算，避免 UTC 容器在本地月末算到错误日期。 */
function localCalendar(date: Date) {
  const values = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(values.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'), date.getUTCMilliseconds()));
}

/** 将代表本地墙上时间的 UTC 日期转回实际时刻，兼容配置时区的偏移变化。 */
function fromLocalCalendar(local: Date) {
  let time = local.getTime();
  for (let i = 0; i < 3; i++) {
    const delta = local.getTime() - localCalendar(new Date(time)).getTime();
    if (!delta) break;
    time += delta;
  }
  return new Date(time);
}

export function repeatDayInTimezone(date: Date) {
  return localCalendar(date).getUTCDate();
}

/** 月末夹紧但保留原始日锚点：1/31 → 2/28 → 3/31。跳过已错过的周期。 */
export function nextOccurrence(from: Date, repeat: string, repeatDay = repeatDayInTimezone(from)): Date {
  const local = localCalendar(from);
  let next: Date;
  do {
    if (repeat === 'daily') local.setUTCDate(local.getUTCDate() + 1);
    else if (repeat === 'weekly') local.setUTCDate(local.getUTCDate() + 7);
    else if (repeat === 'monthly') {
      local.setUTCDate(1);
      local.setUTCMonth(local.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
      local.setUTCDate(Math.min(repeatDay, lastDay));
    } else throw new Error(`不支持的提醒周期: ${repeat}`);
    next = fromLocalCalendar(local);
  } while (next.getTime() <= Date.now());
  return next;
}
