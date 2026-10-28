// 一条命令起本地开发：启动 uni 编译 → 等首次产物 app.json 落盘 → 再拉起微信开发者工具。
// 解决「打开工具时编译还没完成，报 app.json 未找到」的时序问题。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const miniapp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distAppJson = path.join(miniapp, 'dist/dev/mp-weixin/app.json');
const devtoolsCli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

const child = spawn('npx', ['uni', '-p', 'mp-weixin'], {
  cwd: miniapp,
  stdio: 'inherit',
});

async function waitFirstBuild(seconds = 120) {
  for (let i = 0; i < seconds; i++) {
    if (existsSync(distAppJson)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return existsSync(distAppJson);
}

function openDevtools() {
  return new Promise((resolve) => {
    if (!existsSync(devtoolsCli)) {
      console.error('⚠ 未找到微信开发者工具 CLI（macOS 默认路径），请手动导入 dist/dev/mp-weixin');
      return resolve(false);
    }
    const cli = spawn(devtoolsCli, ['open', '--project', path.dirname(distAppJson)], {
      stdio: 'inherit',
    });
    cli.on('error', () => {
      console.error('⚠ 拉起开发者工具失败，请手动导入 dist/dev/mp-weixin');
      resolve(false);
    });
    cli.on('exit', (code) => {
      if (code === 0) {
        console.log('✔ 微信开发者工具已打开（项目 dist/dev/mp-weixin）');
        resolve(true);
      } else {
        console.error(`⚠ 开发者工具 CLI 退出码 ${code}：若提示需要服务端口，到工具「设置 → 安全设置」开启后重试`);
        resolve(false);
      }
    });
  });
}

console.log('… 等待首次编译产物（app.json）');
if (await waitFirstBuild()) {
  await openDevtools();
} else {
  console.error('⚠ 120 秒内未见编译产物，编译可能失败，先看上方日志');
}

child.on('exit', (code) => process.exit(code ?? 0));
