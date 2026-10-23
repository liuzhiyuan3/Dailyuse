const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';
const TOKEN_KEY = 'dailyuse_token';
const USER_KEY = 'dailyuse_user_id';

export function getToken(): string {
  return uni.getStorageSync(TOKEN_KEY) || '';
}

export function getUserId(): string {
  return uni.getStorageSync(USER_KEY) || '';
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export function setToken(token: string, userId?: string) {
  uni.setStorageSync(TOKEN_KEY, token);
  if (userId) uni.setStorageSync(USER_KEY, userId);
}

export function clearToken() {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(USER_KEY);
}

interface ApiResp<T> {
  code: number;
  data: T;
  message?: string;
}

/** 401 统一处理：清 token + 广播，页面据此切到登录引导 */
function handleUnauthorized() {
  clearToken();
  uni.$emit('need-login');
}

export function request<T>(path: string, options: Partial<UniApp.RequestOptions> = {}): Promise<T> {
  const token = getToken();
  const hasBody = options.data !== undefined && options.data !== null;

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${BASE}${path}`,
      method: (options.method as any) || 'GET',
      data: options.data,
      header: {
        // 无 body 时不发 Content-Type，避免服务端把空 JSON 判成 400
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {}),
      },
      success: (res) => {
        const body = res.data as ApiResp<T>;

        if (res.statusCode === 401) {
          handleUnauthorized();
          const err = new Error('登录已过期，请重新登录') as Error & { code?: number };
          err.code = 401;
          reject(err);
          return;
        }

        if (res.statusCode >= 400 || (body && body.code !== 0)) {
          reject(new Error(body?.message || `请求失败 ${res.statusCode}`));
          return;
        }

        resolve(body.data);
      },
      fail: (err) => reject(new Error(err.errMsg || '网络异常')),
    });
  });
}

let prompting = false;

/**
 * 受限操作前的登录闸门：
 * - 已登录直接放行
 * - 未登录弹确认框，确认后走微信登录；成功返回 true
 */
export function ensureLogin(tip = '登录后才能使用该功能'): Promise<boolean> {
  if (isLoggedIn()) return Promise.resolve(true);
  if (prompting) return Promise.resolve(false);

  prompting = true;

  return new Promise((resolve) => {
    const done = (value: boolean) => {
      prompting = false;
      resolve(value);
    };

    uni.showModal({
      title: '需要登录',
      content: tip,
      confirmText: '微信登录',
      cancelText: '再看看',
      success: async (res) => {
        if (!res.confirm) return done(false);
        try {
          await login();
          uni.showToast({ title: '登录成功', icon: 'success' });
          uni.$emit('login-success');
          done(true);
        } catch {
          uni.showToast({ title: '登录失败，请重试', icon: 'none' });
          done(false);
        }
      },
      fail: () => done(false),
    });
  });
}

/** 微信登录：wx.login → code 换 token */
export interface Me {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  createdAt?: string;
}

export interface LoginResult {
  token: string;
  user: Me;
  /** wx = 真实微信登录；dev = 服务端调试登录（未配 WX_SECRET） */
  loginMode: 'wx' | 'dev';
}

export function login(): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: async (res) => {
        try {
          const data = await request<LoginResult>('/auth/login', {
            method: 'POST',
            data: { code: res.code },
          });
          setToken(data.token, data.user?.id);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      },
      fail: (err) => reject(new Error(err.errMsg || '微信登录被取消')),
    });
  });
}

/** 拉当前用户资料，顺带校验 token 是否还有效（失效会走 401 分支清 token） */
export function fetchMe(): Promise<{ user: Me; loginMode: 'wx' | 'dev' }> {
  return request<{ user: Me; loginMode: 'wx' | 'dev' }>('/auth/me');
}

/** 更新昵称 / 头像；传 null 表示清空 */
export function updateMe(patch: { nickname?: string | null; avatarUrl?: string | null }): Promise<{ user: Me }> {
  return request<{ user: Me }>('/auth/me', { method: 'PATCH', data: patch });
}
