/**
 * 小程序包体预算检查。
 * 微信主包硬上限 2MB，这里留余量提前预警，避免上线前才发现塞不下。
 * 用法：node scripts/check-size.mjs [目录]（默认 dist/build/mp-weixin）
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'dist/build/mp-weixin';
const LIMIT_KB = Number(process.env.SIZE_LIMIT_KB || 1536);

function totalSize(path) {
  let sum = 0;
  for (const name of readdirSync(path)) {
    const p = join(path, name);
    const st = statSync(p);
    sum += st.isDirectory() ? totalSize(p) : st.size;
  }
  return sum;
}

let bytes;
try {
  bytes = totalSize(dir);
} catch {
  console.error(`✘ 找不到构建产物：${dir}（先跑 npm run build:mp-weixin）`);
  process.exit(1);
}

const kb = bytes / 1024;
console.log(`包体积: ${kb.toFixed(0)} KB / 预算 ${LIMIT_KB} KB`);

if (kb > LIMIT_KB) {
  console.error(`✘ 超出预算 ${(kb - LIMIT_KB).toFixed(0)} KB，检查是否引入了大图或多余依赖`);
  process.exit(1);
}
console.log('✔ 在预算内');
