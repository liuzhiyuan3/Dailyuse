/**
 * 手动调整用户权益（运维 / 测试用，不走 HTTP，不暴露任何后门接口）。
 *
 *   node scripts/set-tier.mjs --openid dev-local --tier pro --days 365
 *   node scripts/set-tier.mjs --openid dev-local --tier pro            # 永久
 *   node scripts/set-tier.mjs --openid dev-local --tier free           # 降级
 *   node scripts/set-tier.mjs --list                                   # 看当前所有用户
 */
import { PrismaClient } from '@prisma/client';

process.loadEnvFile?.('.env');

const prisma = new PrismaClient();

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] || '' : fallback;
}

async function main() {
  if (process.argv.includes('--list')) {
    const users = await prisma.user.findMany({
      select: { openid: true, nickname: true, tier: true, paidUntil: true },
      orderBy: { createdAt: 'asc' },
    });
    console.table(
      users.map((u) => ({
        openid: u.openid,
        nickname: u.nickname ?? '',
        tier: u.tier,
        paidUntil: u.paidUntil?.toISOString() ?? '永久/无',
      }))
    );
    return;
  }

  const openid = arg('openid');
  const tier = arg('tier');

  if (!openid || !['free', 'pro'].includes(tier)) {
    console.error('用法: node scripts/set-tier.mjs --openid <openid> --tier <free|pro> [--days N]');
    console.error('      node scripts/set-tier.mjs --list');
    process.exit(1);
  }

  const days = Number(arg('days', '0'));
  const paidUntil = tier === 'pro' && days > 0 ? new Date(Date.now() + days * 86400_000) : null;

  const user = await prisma.user.findUnique({ where: { openid }, select: { id: true } });
  if (!user) {
    console.error(`找不到 openid=${openid} 的用户`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { openid },
    data: { tier, paidUntil },
    select: { openid: true, tier: true, paidUntil: true },
  });

  console.log(
    `✔ ${updated.openid} -> tier=${updated.tier}, paidUntil=${updated.paidUntil?.toISOString() ?? '永久'}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
