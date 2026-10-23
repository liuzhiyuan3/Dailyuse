/**
 * 带超时的 fetch。
 * 默认的 fetch 没有任何超时——对端不回包时请求会一直挂着，
 * 打满连接槽就是一次免费 DoS。所有出站请求一律走这里。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, { ...init, signal });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`请求超时（${timeoutMs}ms）：${new URL(url).host}`);
    }
    throw e;
  }
}
