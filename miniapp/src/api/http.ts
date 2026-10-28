// 底层 HTTP 与 token 存取：不含登录/业务逻辑，供 api/request 与 utils/localData 复用
// （拆出来是为了避免 request -> localData -> request 的循环依赖）
const BASE = import.meta.env.VITE_API_BASE || 'https://lzy.benefitgpt.top/api';
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

        // 402：付费门禁。文案与服务端保持一致，界面据此引导升级。
        if (res.statusCode === 402) {
          const err = new Error(body?.message || '该功能需要专业版') as Error & { code?: number };
          err.code = 402;
          uni.$emit('need-pro', body?.data);
          reject(err);
          return;
        }

        if (res.statusCode >= 400 || (body && body.code !== 0)) {
          reject(new Error(body?.message || `请求失败 ${res.statusCode}`));
          return;
        }

        resolve(body ? body.data : (undefined as unknown as T));
      },
      fail: (err) => reject(new Error(err.errMsg || '网络异常')),
    });
  });
}
