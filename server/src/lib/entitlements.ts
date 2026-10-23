/**
 * 权益解析：付费骨架的唯一判定入口。
 *
 * 约定（别破坏它）：
 * 1. 权益状态只来自数据库 users.tier / users.paid_until，绝不读客户端传上来的任何字段。
 * 2. paid_until 到期后自动降级为 free，不需要定时任务回写 tier。
 * 3. 真正的收费开关是 config.pay.enforced；关着的时候门禁只记日志、不放行不拦截。
 */

export type Tier = 'free' | 'pro';

export interface Entitlement {
  tier: Tier;
  /** 是否真的享有 pro 权益（tier=pro 且未过期） */
  isPro: boolean;
  paidUntil: Date | null;
  expired: boolean;
}

interface UserTierFields {
  tier?: string | null;
  paidUntil?: Date | null;
}

export function resolveEntitlement(user: UserTierFields): Entitlement {
  const tier: Tier = user.tier === 'pro' ? 'pro' : 'free';
  const paidUntil = user.paidUntil ?? null;
  const expired = tier === 'pro' && paidUntil !== null && paidUntil.getTime() <= Date.now();

  return {
    tier,
    isPro: tier === 'pro' && !expired,
    paidUntil,
    expired,
  };
}
