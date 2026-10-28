// 工具提醒共用的订阅消息配置与授权
// 「日程提醒」模板（wx60d29579ccb8a0d9）：thing5 标题 / thing2 内容 / date4 时间，三个关键词。
// 待办、倒数日、群组待办、便签提醒统一走它（推送字段在 server/src/jobs.ts，两边要一起改）。
import { request } from '@/api/http';

export const TOOL_TEMPLATE_ID = 'Ikheu0AS_vPuZxEjvfbAsdsrhLyQ31m8R7J4UEzhLC8';
export const NOTE_TEMPLATE_ID = 'Ikheu0AS_vPuZxEjvfbAsdsrhLyQ31m8R7J4UEzhLC8';
// 天气订阅专用「天气提醒」模板；必须与 server/.env 的 WX_WEATHER_TEMPLATE_ID 一致
export const WEATHER_TEMPLATE_ID = 'oTNc4BxvPJ0mIVCBVQG8gLgz2vuzbq0qdjDNuSCZHXY';

/** 提醒类型 → 授权用的模板 ID（自动补额度时按此分组） */
export function templateOf(toolType: string): string {
  if (toolType === 'note') return NOTE_TEMPLATE_ID;
  if (toolType === 'weather') return WEATHER_TEMPLATE_ID;
  return TOOL_TEMPLATE_ID;
}

export function isTemplateConfigured(tmplId: string = TOOL_TEMPLATE_ID) {
  return !tmplId.startsWith('TODO');
}

/** 请求一次订阅授权；返回用户是否同意（会弹微信授权框） */
export function requestReminderAuth(tmplId: string = TOOL_TEMPLATE_ID): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res: any) => resolve(res[tmplId] === 'accept'),
      fail: () => resolve(false),
    });
    // #endif
    // #ifndef MP-WEIXIN
    resolve(true);
    // #endif
  });
}

/** 用户是否已对该模板勾选「总是保持以上选择」并同意（此后授权不再弹窗） */
export function isAlwaysAccept(tmplId: string): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.getSetting({
      withSubscriptions: true,
      success: (s: any) => resolve(s?.subscriptionsSetting?.itemSettings?.[tmplId] === 'accept'),
      fail: () => resolve(false),
    } as UniApp.GetSettingOptions);
    // #endif
    // #ifndef MP-WEIXIN
    resolve(false);
    // #endif
  });
}

/** 静默授权一次（只在已勾选「总是保持以上选择」时调用，微信不再弹窗） */
export function silentAuth(tmplId: string): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res: any) => resolve(res[tmplId] === 'accept'),
      fail: () => resolve(false),
    });
    // #endif
    // #ifndef MP-WEIXIN
    resolve(true);
    // #endif
  });
}

/**
 * 授权一次，带首次引导：
 * - 已勾选「总是保持以上选择」→ 完全静默，设置提醒不再弹任何窗口，到点自动推送
 * - 未勾选 → 首次弹一次说明（建议勾选总是允许），之后弹微信授权框
 */
export async function authWithHint(tmplId: string = TOOL_TEMPLATE_ID): Promise<boolean> {
  if (await isAlwaysAccept(tmplId)) return silentAuth(tmplId);

  if (!uni.getStorageSync('dailyuse_sub_hint')) {
    await new Promise<void>((r) => {
      uni.showModal({
        title: '开启到点提醒',
        content:
          '微信要求每次推送前获得你的授权。建议在接下来弹出的授权框里勾选「总是保持以上选择」，以后设置提醒不再弹窗，到点自动推送。',
        confirmText: '知道了',
        showCancel: false,
        success: () => r(),
        fail: () => r(),
      });
    });
    uni.setStorageSync('dailyuse_sub_hint', 1);
  }
  return requestReminderAuth(tmplId);
}

/**
 * 静默补充推送额度（只在已勾选「总是保持以上选择」时有效，不打扰用户）：
 * 连续静默授权到目标额度，并逐次调服务端 grant。返回实际补充的次数。
 */
export async function silentTopUp(
  tmplId: string,
  reminderId: string,
  current: number,
  target: number
): Promise<number> {
  if (current >= target) return 0;
  if (!(await isAlwaysAccept(tmplId))) return 0;

  let got = 0;
  for (let i = current; i < target; i++) {
    if (!(await silentAuth(tmplId))) break;
    got++;
  }
  for (let i = 0; i < got; i++) {
    try {
      await request(`/reminders/${reminderId}/grant`, { method: 'POST' });
    } catch {
      break;
    }
  }
  return got;
}
