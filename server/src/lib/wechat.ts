import { config, wxConfigured, devLoginAllowed } from '../config';
import { fetchWithTimeout } from './http';

/** 调试登录被服务端策略拦下（生产环境未配 secret 时的默认行为） */
export class DevLoginDisabledError extends Error {
  constructor() {
    super('服务端未配置微信登录（缺少 WX_SECRET），且当前环境不允许调试登录');
    this.name = 'DevLoginDisabledError';
  }
}

/** 用 wx.login 的 code 换 openid；未配置 secret 时按 code 生成开发用户，便于本地联调 */
export async function code2Session(code: string): Promise<string> {
  if (!wxConfigured) {
    if (!devLoginAllowed) throw new DevLoginDisabledError();
    // 固定 DEV_OPENID 可让本机每次登录都是同一账号，便于调试
    return config.devOpenId || `dev-${code}`;
  }

  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${config.wx.appid}&secret=${config.wx.secret}` +
    `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

  const res = await fetchWithTimeout(url, {}, 6000);
  const data = (await res.json()) as { openid?: string; errcode?: number; errmsg?: string };
  if (data.errcode || !data.openid) {
    throw new Error(`code2session 失败: ${data.errcode} ${data.errmsg}`);
  }
  return data.openid;
}

// ========== access_token（缓存 2 小时，提前 200 秒过期） ==========
let tokenCache = { value: '', expiresAt: 0 };

export async function getAccessToken(): Promise<string> {
  if (!wxConfigured) return 'mock-access-token';

  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt) return tokenCache.value;

  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential' +
    `&appid=${config.wx.appid}&secret=${config.wx.secret}`;
  const res = await fetchWithTimeout(url, {}, 6000);
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (data.errcode || !data.access_token) {
    throw new Error(`获取 access_token 失败: ${data.errcode} ${data.errmsg}`);
  }

  tokenCache = {
    value: data.access_token,
    expiresAt: now + ((data.expires_in ?? 7200) - 200) * 1000,
  };
  return tokenCache.value;
}

interface SendOptions {
  openid: string;
  templateId: string;
  page?: string;
  data: Record<string, { value: string }>;
}

/** 下发订阅消息；未配置微信时只打日志，方便本地验证流程 */
export async function sendSubscribeMessage(opts: SendOptions): Promise<{ ok: boolean; errcode?: number }> {
  if (!wxConfigured) {
    console.log(`[wechat][mock] -> ${opts.openid} | ${opts.templateId} | ${JSON.stringify(opts.data)}`);
    return { ok: true };
  }

  const token = await getAccessToken();
  const res = await fetchWithTimeout(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: opts.openid,
        template_id: opts.templateId,
        page: opts.page ?? '',
        data: opts.data,
      }),
    },
    8000
  );
  const data = (await res.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    console.error(`[wechat] 推送失败 ${data.errcode} ${data.errmsg}`);
    return { ok: false, errcode: data.errcode };
  }
  return { ok: true };
}
