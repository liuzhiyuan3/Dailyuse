// 微信内容安全检测（msg_sec_check v2）：共享文字只有得到明确通过结果才可发布。
// 个人工具数据不经过此共享内容发布检查。
import { config, wxConfigured } from '../config';
import { getAccessToken } from './wechat';
import { fetchWithTimeout } from './http';

/** 用户输入统一拦在这类错误上；带 statusCode=400，交给全局错误处理器直接回给客户端 */
export class ContentRiskError extends Error {
  statusCode = 400;
  constructor(message = '内容包含违规风险，请修改后重试') {
    super(message);
    this.name = 'ContentRiskError';
  }
}

export class ContentCheckUnavailableError extends Error {
  statusCode = 503;
  constructor() {
    super('内容检测暂不可用，请稍后重试');
    this.name = 'ContentCheckUnavailableError';
  }
}

const MAX_LEN = 2500;

/**
 * 检测一段将要公开展示的用户输入；不过审抛 ContentRiskError。
 * 检测服务异常时拒绝本次发布，避免未检测的内容直接写入共享数据。
 */
export async function assertContentSafe(text: string, openid: string): Promise<void> {
  const content = (text ?? '').trim();
  if (!content) return;
  if (content.length > MAX_LEN) throw new ContentRiskError(`内容不能超过 ${MAX_LEN} 个字`);
  if (!wxConfigured) {
    if (config.nodeEnv === 'production') throw new ContentCheckUnavailableError();
    return; // 未配置微信的本地开发保留模拟模式。
  }
  if (!openid.trim()) throw new ContentCheckUnavailableError();

  try {
    const token = await getAccessToken();
    if (!token) throw new ContentCheckUnavailableError();
    const res = await fetchWithTimeout(
      `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // scene=2（评论）；openid 必传，微信按用户维度做风控
        body: JSON.stringify({ version: 2, scene: 2, openid, content }),
      },
      5000
    );
    if (!res.ok) throw new ContentCheckUnavailableError();
    const data = (await res.json()) as {
      errcode?: number;
      result?: { suggest?: string };
    };

    if (data?.errcode === 87014) throw new ContentRiskError();
    if (data?.errcode !== 0) throw new ContentCheckUnavailableError();
    const suggest = data.result?.suggest;
    if (suggest === 'risky' || suggest === 'review') throw new ContentRiskError();
    if (suggest !== 'pass') throw new ContentCheckUnavailableError();
  } catch (e) {
    if (e instanceof ContentRiskError) throw e;
    // 不记录原始请求或异常，避免正文、openid、access_token 进入日志。
    console.warn('[seccheck] 检测服务不可用，已阻止本次发布');
    throw new ContentCheckUnavailableError();
  }
}
