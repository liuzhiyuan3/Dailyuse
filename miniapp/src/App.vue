<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { getToken, request } from '@/api/http';
import { isAlwaysAccept, silentAuth, templateOf } from '@/utils/reminderAuth';

onLaunch(() => {
  console.log('App Launch');
});

/**
 * 每日一次的静默额度补充（PRD：到点自动推送，不让用户天天点授权）：
 * 只对已勾选「总是保持以上选择」的模板生效——静默授权不会弹任何窗口；
 * 没勾选的用户不受影响，仍走各页面里的显式授权。
 */
async function autoTopUp() {
  // #ifdef MP-WEIXIN
  const today = new Date().toDateString();
  if (uni.getStorageSync('dailyuse_topup_day') === today) return;
  if (!getToken()) return;
  try {
    const d = await request<{ list: Array<{ id: string; toolType: string; remain: number; status: string; repeat?: string }> }>(
      '/reminders'
    );
    const pending = d.list.filter((r) => r.status === 'pending' && r.repeat);
    if (!pending.length) return;
    uni.setStorageSync('dailyuse_topup_day', today);

    const always = new Map<string, boolean>();
    for (const r of pending) {
      if (r.remain >= 3) continue;
      const tmpl = templateOf(r.toolType);
      if (!always.has(tmpl)) always.set(tmpl, await isAlwaysAccept(tmpl));
      if (!always.get(tmpl)) continue;
      if (await silentAuth(tmpl)) {
        await request(`/reminders/${r.id}/grant`, { method: 'POST' }).catch(() => {});
      }
    }
  } catch {
    /* 静默 */
  }
  // #endif
}

onShow(() => {
  // 首页监听这个事件:从后台切回且停在首页时,重新弹「最近未完成待办」横幅
  uni.$emit('app-foreground');
  void autoTopUp();
});
</script>

<style>
@import './styles/tokens.scss';
</style>
