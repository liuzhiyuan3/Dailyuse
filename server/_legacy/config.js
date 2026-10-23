'use strict';
/**
 * 配置：全部从环境变量读取，零依赖。
 * 微信未配置 appid/secret 时，登录与推送自动走 mock 模式，便于本地跑通全流程。
 */
const path = require('path');

function intEnv(name, fallback) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) ? v : fallback;
}

const config = {
  port: intEnv('PORT', 3000),
  dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),

  wx: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
  },

  news: {
    source: (process.env.NEWS_SOURCE || 'mock').toLowerCase(),
    apiUrl: process.env.NEWS_API_URL || '',
    apiKey: process.env.NEWS_API_KEY || '',
    apiListPath: process.env.NEWS_API_LIST_PATH || 'list',
    keepPerKeyword: intEnv('NEWS_KEEP_PER_KEYWORD', 50),
  },

  scheduler: {
    intervalMs: intEnv('FETCH_INTERVAL_MS', 30 * 60 * 1000),
    pushPerKeywordPerDay: intEnv('PUSH_PER_KEYWORD_PER_DAY', 3),
    quietStartHour: intEnv('QUIET_START_HOUR', 22),
    quietEndHour: intEnv('QUIET_END_HOUR', 8),
  },
};

config.wxConfigured = Boolean(config.wx.appid && config.wx.secret);

module.exports = config;
