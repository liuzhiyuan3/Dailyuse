// 生成工具宫格图标（Lucide 线稿 → PNG，彩色 / 灰两套）
// 彩色版 = 每个工具的专属色；灰版 = 未添加状态。宫格的浅色底在首页 CSS 里配同色系。
// 用法：node scripts/gen-tool-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets', 'tools');
const OUT = path.join(__dirname, '..', 'src', 'static', 'tools');

const GRAY = '#8A94AB';

/** [id, 源文件, 专属色] —— 与首页 allTools 的 bg 浅色底配对使用 */
const ICONS = [
  ['todo', 'tool-todo.svg', '#3B5BDB'],
  ['note', 'tool-note.svg', '#15AABF'],
  ['wallet', 'tool-wallet.svg', '#37B24D'],
  ['calendar', 'tool-calendar.svg', '#F59F00'],
  ['food', 'food.svg', '#FF6B6B'],
  ['wheel', 'tool-wheel.svg', '#9C36B5'],
  ['habit', 'tool-habit.svg', '#E8590C'],
  ['timer', 'tool-timer.svg', '#5C7CFA'],
  ['weather', 'tool-weather.svg', '#22B8CF'],
  ['news', 'tool-news.svg', '#8A94AB'],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [id, file, color] of ICONS) {
  if (!fs.existsSync(path.join(SRC, file))) {
    console.log(`⚠ 跳过 ${id}：缺少 ${file}`);
    continue;
  }
  const svg = fs.readFileSync(path.join(SRC, file), 'utf8');

  for (const [suffix, stroke] of [['', color], ['-gray', GRAY]]) {
    // Lucide/Tabler 的线稿把描边色放在根节点 stroke="currentColor"，替换一次即可
    const colored = svg.replace(/stroke="currentColor"/, `stroke="${stroke}"`);

    await sharp(Buffer.from(colored), { density: 384 })
      .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `${id}${suffix}.png`));

    console.log(`✔ ${id}${suffix}.png`);
  }
}

console.log(`输出: ${OUT}`);
