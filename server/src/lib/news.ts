import crypto from 'node:crypto';
import { prisma } from '../plugins/db';
import { config } from '../config';
import { fetchWithTimeout } from './http';

export interface RawNews {
  title?: string;
  summary?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
}

export function hashUrl(url: string) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 40);
}

/** 演示源：无外部依赖，每次至少产出一条可去重的新条目 */
function mockNews(keyword: string): RawNews[] {
  const ts = Date.now();
  const count = ts % 3;
  const out: RawNews[] = [];
  for (let i = 0; i <= count; i++) {
    const seq = Math.floor(ts / 1000) + i;
    const time = new Date(seq * 1000).toISOString();
    out.push({
      title: `【${keyword}】快讯 ${time.slice(11, 19)}`,
      summary: `关于「${keyword}」的演示资讯，接入真实源后此处为摘要。`,
      url: `https://example.com/news/${encodeURIComponent(keyword)}/${seq}`,
      source: 'mock',
      publishedAt: time,
    });
  }
  return out;
}

/**
 * 新闻源优先级：
 * 1. NEWS_API_URL（JSON API，{keyword} 占位）
 * 2. NEWS_RSS_URLS（逗号分隔的 RSS，按关键词过滤标题/摘要）
 * 3. 演示源
 */
async function fetchFromSource(keyword: string): Promise<RawNews[]> {
  const apiUrl = process.env.NEWS_API_URL || '';
  if (apiUrl) return fetchFromApi(apiUrl, keyword);

  const rss = await fetchFromRss(keyword);
  if (rss.length) return rss;

  return mockNews(keyword);
}

async function fetchFromApi(apiUrl: string, keyword: string): Promise<RawNews[]> {
  const url = apiUrl.replace('{keyword}', encodeURIComponent(keyword));
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.NEWS_API_KEY) headers.Authorization = `Bearer ${process.env.NEWS_API_KEY}`;

  const res = await fetchWithTimeout(url, { headers }, config.news.fetchTimeoutMs);
  if (!res.ok) throw new Error(`新闻源 HTTP ${res.status}`);

  const data: unknown = await res.json();
  if (Array.isArray(data)) return data as RawNews[];
  const obj = data as { list?: RawNews[]; data?: RawNews[] };
  return obj.list ?? obj.data ?? [];
}

function pickTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function stripTags(s: string) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRss(xml: string, keyword: string): RawNews[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const kw = keyword.trim().toLowerCase();
  const out: RawNews[] = [];

  for (const block of blocks) {
    const title = stripTags(pickTag(block, 'title'));
    const link = pickTag(block, 'link');
    const desc = stripTags(pickTag(block, 'description'));
    const pub = pickTag(block, 'pubDate');

    if (!title || !link) continue;
    if (kw && !`${title} ${desc}`.toLowerCase().includes(kw)) continue;

    let source = 'rss';
    try {
      source = new URL(link).hostname;
    } catch {
      /* 保留 rss */
    }

    out.push({
      title,
      summary: desc.slice(0, 200),
      url: link,
      source,
      publishedAt: pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : undefined,
    });
  }
  return out;
}

async function fetchFromRss(keyword: string): Promise<RawNews[]> {
  const urls = (process.env.NEWS_RSS_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!urls.length) return [];

  const out: RawNews[] = [];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(
        url,
        { headers: { 'User-Agent': 'Dailyuse/0.1 (+mini-program)' } },
        config.news.fetchTimeoutMs
      );
      if (!res.ok) continue;
      out.push(...parseRss(await res.text(), keyword));
    } catch {
      /* 单个源失败不影响其他 */
    }
  }
  return out;
}

/** 抓取某关键词并入库去重，返回新增条数 */
export async function refreshKeyword(keyword: string): Promise<number> {
  const raws = await fetchFromSource(keyword);
  let added = 0;

  for (const r of raws) {
    const url = (r.url ?? '').trim();
    const title = (r.title ?? '').trim();
    if (!url || !title) continue;

    const urlHash = hashUrl(url);
    const exists = await prisma.newsItem.findUnique({ where: { urlHash } });
    if (exists) continue;

    await prisma.newsItem.create({
      data: {
        keyword,
        title: title.slice(0, 200),
        summary: (r.summary ?? '').slice(0, 400),
        url,
        urlHash,
        source: (r.source ?? 'unknown').slice(0, 64),
        publishedAt: r.publishedAt && !Number.isNaN(Date.parse(r.publishedAt))
          ? new Date(r.publishedAt)
          : new Date(),
      },
    });
    added++;
  }
  return added;
}
