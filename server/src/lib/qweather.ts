// 和风天气（QWeather）：每日天气推送的数据来源。
// 所有出站请求走 fetchWithTimeout；Node 的 fetch 自动处理 gzip 响应。
import { config } from '../config';
import { fetchWithTimeout } from './http';

export const qweatherConfigured = Boolean(config.qweather.key && config.qweather.host);

export interface NowWeather {
  temp: string;
  text: string;
  humidity: string;
  windDir: string;
  windScale: string;
  feelsLike: string;
  obsTime: string;
}

/** 实时天气。location 为和风 LocationID（如 101010100） */
export async function getWeatherNow(location: string): Promise<NowWeather> {
  const res = await fetchWithTimeout(
    `https://${config.qweather.host}/v7/weather/now?location=${encodeURIComponent(location)}`,
    { headers: { 'X-QW-Api-Key': config.qweather.key } },
    6000
  );
  const d = (await res.json()) as {
    code?: string;
    now?: Record<string, string>;
  };
  if (d.code !== '200' || !d.now) {
    throw new Error(`和风天气查询失败: ${d.code ?? res.status}`);
  }
  return {
    temp: d.now.temp ?? '',
    text: d.now.text ?? '',
    humidity: d.now.humidity ?? '',
    windDir: d.now.windDir ?? '',
    windScale: d.now.windScale ?? '',
    feelsLike: d.now.feelsLike ?? '',
    obsTime: d.now.obsTime ?? '',
  };
}

export interface CityHit {
  id: string;
  name: string;
}

/** 城市搜索（GeoAPI）。被账号的请求限制挡住或无结果时返回空列表，不报错——小程序端会回退到内置城市。 */
export async function searchCities(q: string): Promise<CityHit[]> {
  try {
    const res = await fetchWithTimeout(
      `https://${config.qweather.host}/geo/v2/city/lookup?location=${encodeURIComponent(q)}&range=cn&number=10`,
      { headers: { 'X-QW-Api-Key': config.qweather.key } },
      6000
    );
    const d = (await res.json()) as {
      code?: string;
      location?: Array<{ id: string; name: string; adm1?: string; adm2?: string }>;
    };
    if (d.code !== '200' || !Array.isArray(d.location)) return [];
    return d.location.map((l) => ({
      id: l.id,
      name: [l.adm1, l.adm2 !== l.name ? l.adm2 : '', l.name].filter(Boolean).join(' '),
    }));
  } catch {
    return [];
  }
}
