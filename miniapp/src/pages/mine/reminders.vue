<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后查看提醒" subtitle="提醒与你的账号绑定" />
    <block v-else>
      <view v-if="!list.length" class="empty">
        <text class="eico">🔔</text>
        <text class="et">还没有提醒</text>
        <text class="es">在待办或倒数日里点铃铛设置</text>
      </view>

      <view v-else class="list">
        <view v-for="r in list" :key="r.id" class="row">
          <view class="left">
            <text class="rt">{{ typeLabel(r.toolType) }}</text>
            <text class="rs">{{ fmt(r.remindAt) }}</text>
          </view>
          <view class="right">
            <text class="badge" :class="r.status">{{ statusLabel(r) }}</text>
            <text class="del" @tap="remove(r)">删除</text>
          </view>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

interface Reminder {
  id: string;
  toolType: string;
  targetId: string;
  remindAt: string;
  remain: number;
  status: string;
}

const list = ref<Reminder[]>([]);

function typeLabel(t: string) {
  if (t === 'todo') return '待办提醒';
  if (t === 'countdown') return '倒数日提醒';
  if (t === 'group_todo') return '群组待办提醒';
  return '提醒';
}

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function statusLabel(r: Reminder) {
  if (r.status === 'sent') return '已推送';
  if (r.status === 'failed') return '已失效';
  if (r.status === 'canceled') return '已取消';
  return r.remain > 0 ? `待提醒 · 余 ${r.remain}` : '额度已用完';
}

async function load() {
  try {
    const d = await request<{ list: Reminder[] }>('/reminders');
    list.value = d.list;
  } catch {
    list.value = [];
  }
}

function remove(r: Reminder) {
  uni.showModal({
    title: '删除提醒',
    content: '删除后不会再收到这条提醒。',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await request(`/reminders/${r.id}`, { method: 'DELETE' });
        list.value = list.value.filter((x) => x.id !== r.id);
      } catch (e) {
        uni.showToast({ title: (e as Error).message, icon: 'none' });
      }
    },
  });
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 12px 18px; box-sizing: border-box; background: var(--bg); }

.list { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0 14px; }
.row { display: flex; align-items: center; gap: 10px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: none; }
.left { flex: 1; min-width: 0; }
.rt { font-size: 12.5px; }
.rs { display: block; margin-top: 4px; font-size: 10px; color: var(--muted); }
.right { display: flex; align-items: center; gap: 10px; }
.badge { font-size: 9.5px; padding: 3px 8px; border-radius: 999px; background: var(--line); color: var(--muted); }
.badge.pending { background: rgba(59, 91, 219, .1); color: var(--accent); }
.badge.failed { background: rgba(224, 49, 49, .1); color: #E03131; }
.del { font-size: 10px; color: #E03131; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 100px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }
</style>
