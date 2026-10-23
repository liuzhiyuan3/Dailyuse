'use strict';
/**
 * JSON 文件存储：内存缓存 + 原子写入（写临时文件再 rename）。
 * MVP 数据量小，免数据库；后续数据增长可平滑替换为 SQLite/PostgreSQL。
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const cache = new Map();

function fileFor(name) {
  return path.join(config.dataDir, `${name}.json`);
}

function read(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let value = fallback;
  try {
    value = JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`[storage] 读取 ${name}.json 失败，使用默认值:`, e.message);
    }
  }
  cache.set(name, value);
  return value;
}

function write(name, value) {
  const file = fileFor(name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file); // 原子替换，避免写一半损坏
  cache.set(name, value);
}

module.exports = { read, write };
