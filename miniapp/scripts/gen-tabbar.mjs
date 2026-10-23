// 从 Tabler 图标（MIT）生成 tabBar PNG 81x81
// 源文件：assets/tabbar/*.svg；输出：src/static/tabbar/*.png
// 用法：node scripts/gen-tabbar.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets', 'tabbar');
const OUT = path.join(__dirname, '..', 'src', 'static', 'tabbar');

const GRAY = '#8A94AB';
const BLUE = '#3B5BDB';

const ICONS = [
  ['tools', 'layout-grid.svg'],
  ['todo', 'checkbox.svg'],
  ['mine', 'user.svg'],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [name, file] of ICONS) {
  const svg = fs.readFileSync(path.join(SRC, file), 'utf8');

  for (const [suffix, color] of [['', GRAY], ['-active', BLUE]]) {
    const colored = svg
      .replace(/stroke="currentColor"/, `stroke="${color}"`)
      .replace(/stroke-width="2"/, 'stroke-width="1.8"');

    await sharp(Buffer.from(colored), { density: 384 })
      .resize(81, 81, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `${name}${suffix}.png`));

    console.log(`✔ ${name}${suffix}.png`);
  }
}

console.log(`输出: ${OUT}`);
