// 配置集中管理；Node 20.12+ 自带 loadEnvFile，不引 dotenv
try {
  process.loadEnvFile('.env');
} catch {
  /* 没有 .env 时使用默认值 */
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  devOpenId: process.env.DEV_OPENID || '',
  /**
   * 可信代理。默认只信本机回环（nginx 与 api 同机部署的场景）。
   * 若 nginx 跑在容器里，改成它所在网络到宿主机的网关地址，例如 172.17.0.1。
   * 绝不能写 true —— 那等于让客户端自带 X-Forwarded-For 决定 req.ip，限流会被绕过。
   */
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY || '127.0.0.1,::1'),
  /** CORS 白名单，逗号分隔。小程序请求不带 Origin，用不到 CORS，留空即完全关闭。 */
  corsOrigin: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  news: {
    /** 单个用户每天可手动触发抓取的次数上限 */
    refreshPerDay: Number(process.env.NEWS_REFRESH_PER_DAY || 20),
    /** 单次外网抓取超时（毫秒） */
    fetchTimeoutMs: Number(process.env.NEWS_FETCH_TIMEOUT_MS || 8000),
  },
  wx: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
    templateId: process.env.WX_TEMPLATE_ID || '',
  },
  push: {
    perKeywordPerDay: Number(process.env.PUSH_PER_KEYWORD_PER_DAY || 3),
    quietStartHour: Number(process.env.QUIET_START_HOUR || 22),
    quietEndHour: Number(process.env.QUIET_END_HOUR || 8),
  },
  // 推送免打扰按此时区判断，避免容器默认 UTC 导致白天被静音
  timezone: process.env.TZ || 'Asia/Shanghai',
};

/** 'true'/'false' 交给 Fastify 语义；其他按 IP/CIDR 列表处理 */
function parseTrustProxy(raw: string): boolean | string | string[] {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  const list = v.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

/** 配了 appid + secret 才算真正接通微信 */
export const wxConfigured = Boolean(config.wx.appid && config.wx.secret);

/**
 * 登录模式：
 * - wx  ：真实微信登录，code 交给 jscode2session 换 openid
 * - dev ：调试登录，不请求微信，openid 由 DEV_OPENID 或 `dev-<code>` 生成
 */
export const loginMode: 'wx' | 'dev' = wxConfigured ? 'wx' : 'dev';

/**
 * 调试登录是否放行。
 * 生产环境默认禁止——否则任何人都能伪造 code 换到 token。
 * 确需在预发环境使用，显式设置 ALLOW_DEV_LOGIN=1。
 */
export const devLoginAllowed =
  loginMode === 'dev' && (nodeEnv !== 'production' || process.env.ALLOW_DEV_LOGIN === '1');
