// 工具提醒共用的订阅消息配置与授权
// TODO: 换成微信后台创建的「待办/工具提醒」模板 ID
export const TOOL_TEMPLATE_ID = 'TODO_FILL_TODO_TEMPLATE_ID';

export function isTemplateConfigured() {
  return !TOOL_TEMPLATE_ID.startsWith('TODO');
}

/** 请求一次订阅授权；返回用户是否同意 */
export function requestReminderAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.requestSubscribeMessage({
      tmplIds: [TOOL_TEMPLATE_ID],
      success: (res: any) => resolve(res[TOOL_TEMPLATE_ID] === 'accept'),
      fail: () => resolve(false),
    });
    // #endif
    // #ifndef MP-WEIXIN
    resolve(true);
    // #endif
  });
}
