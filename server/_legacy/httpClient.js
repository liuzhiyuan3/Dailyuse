'use strict';
/**
 * 极简 HTTP JSON 客户端（基于内置 http/https），用于调微信 API 与新闻源。
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

function requestJson(rawUrl, options = {}) {
  const { method = 'GET', body, headers = {}, timeout = 8000 } = options;
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(rawUrl);
    } catch (e) {
      reject(new Error(`非法 URL: ${rawUrl}`));
      return;
    }
    const lib = url.protocol === 'http:' ? http : https;
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: `${url.pathname}${url.search}`,
        method,
        timeout,
        headers: {
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (_) {
            /* 非 JSON 响应保留原文 */
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json !== null ? json : { raw: text });
          } else {
            const err = new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`);
            err.statusCode = res.statusCode;
            err.body = json;
            reject(err);
          }
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { requestJson };
