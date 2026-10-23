// 生成工具宫格图标（Tabler 线稿 → PNG，蓝 / 灰两套）
// 用法：node scripts/gen-tool-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets', 'tools');
const OUT = path.join(__dirname, '..', 'src', 'static', 'tools');

const BLUE = '#3B5BDB';
const GRAY = '#8A94AB';

const ICONS = [
  ['todo', 'tool-circle-check.svg'],
  ['note', 'tool-note.svg'],
  ['wallet', 'tool-wallet.svg'],
  ['calendar', 'tool-calendar.svg'],
  ['news', 'tool-news.svg'],
  ['food', 'food.svg'],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [id, file] of ICONS) {
  const svg = fs.readFileSync(path.join(SRC, file), 'utf8');

  for (const [suffix, color] of [['', BLUE], ['-gray', GRAY]]) {
    const colored = svg
      .replace(/stroke="currentColor"/, `stroke="${color}"`)
      .replace(/stroke-width="2"/, 'stroke-width="1.9"');

    await sharp(Buffer.from(colored), { density: 384 })
      .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `${id}${suffix}.png`));

    console.log(`✔ ${id}${suffix}.png`);
  }
}

console.log(`输出: ${OUT}`);
