// 面向业务的登录态 API：登录闸门、微信登录、资料读写。
// 底层 request/token 存取在 api/http.ts；游客数据合并在 utils/localData.ts
import { mergeLocalData } from '@/utils/localData';
import { isLoggedIn, request, setToken } from './http';

export { getToken, getUserId, isLoggedIn, setToken, clearToken, request } from './http';

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
export interface Entitlement {
  tier: 'free' | 'pro';
  /** 仅用于界面展示，真正的权限判断在服务端 */
  isPro: boolean;
  paidUntil: string | null;
  expired: boolean;
}

export interface Me {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  createdAt?: string;
  entitlement?: Entitlement;
  /** 管理后台入口显隐用；真正权限在服务端 requireAdmin */
  isAdmin?: boolean;
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
          // 登录态就绪后，把游客期间攒在本机的数据一次性并入云端（PRD §6.5）
          try {
            const merged = await mergeLocalData();
            if (merged > 0) uni.showToast({ title: `已同步 ${merged} 条本机数据`, icon: 'none' });
          } catch {
            /* 合并失败不阻断登录，本机数据保留待下次重试 */
          }
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
