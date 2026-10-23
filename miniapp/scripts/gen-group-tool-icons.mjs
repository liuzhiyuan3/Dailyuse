// 生成群组工具切换图标（蓝 / 白两套）
// 用法：node scripts/gen-group-tool-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets', 'group-tools');
const OUT = path.join(__dirname, '..', 'src', 'static', 'group-tools');

const KEYS = [
  'todo', 'list', 'expense', 'event', 'score', 'order',
  'notice', 'recipe', 'link', 'parcel', 'duty', 'wish', 'custom',
];

const COLORS = [
  ['', '#3B5BDB'],
  ['-white', '#FFFFFF'],
];

fs.mkdirSync(OUT, { recursive: true });

for (const key of KEYS) {
  const file = path.join(SRC, `${key}.svg`);
  if (!fs.existsSync(file)) {
    console.warn(`跳过 ${key}（无源文件）`);
    continue;
  }
  const svg = fs.readFileSync(file, 'utf8');

  for (const [suffix, color] of COLORS) {
    const colored = svg
      .replace(/stroke="currentColor"/, `stroke="${color}"`)
      .replace(/stroke-width="2"/, 'stroke-width="1.9"');

    await sharp(Buffer.from(colored), { density: 384 })
      .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `${key}${suffix}.png`));

    console.log(`✔ ${key}${suffix}.png`);
  }
}

console.log(`输出: ${OUT}`);
