<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后管理订阅" subtitle="订阅与你的账号绑定" />
    <block v-else>
      <view class="tip">一次授权只对应一次推送，用完点「补充」再授权</view>

      <view v-if="!list.length" class="empty">
        <text class="eico">📰</text>
        <text class="et">还没有订阅</text>
        <text class="es">去资讯页订阅一个关键词</text>
      </view>

      <view v-else class="list">
        <view v-for="s in list" :key="s.id" class="row">
          <view class="left">
            <view class="kw">{{ s.keyword }}</view>
            <view class="meta">{{ s.newsCount }} 条 · {{ ago(s.lastFetchedAt) }}</view>
          </view>
          <view class="right">
            <view class="bal" :class="{ zero: s.remain === 0 }">{{ s.remain }} 次</view>
            <view class="gbtn" @tap="grant(s)">补充</view>
            <text class="del" @tap="remove(s)">删除</text>
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
import { isTemplateConfigured, requestReminderAuth } from '@/utils/reminderAuth';

interface SubItem {
  id: string;
  keyword: string;
  templateId: string;
  remain: number;
  newsCount: number;
  lastFetchedAt: string | null;
}

const list = ref<SubItem[]>([]);

function ago(iso: string | null) {
  if (!iso) return '还没抓取';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚更新';
  if (m < 60) return `${m} 分钟前更新`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前更新`;
  return `${Math.floor(h / 24)} 天前更新`;
}

async function load() {
  try {
    const d = await request<{ list: SubItem[] }>('/subscribes');
    list.value = d.list;
  } catch {
    list.value = [];
  }
}

async function grant(s: SubItem) {
  if (!isTemplateConfigured()) {
    uni.showModal({
      title: '未配置推送模板',
      content: '需先在小程序后台创建订阅消息模板，把 ID 填入 utils/reminderAuth.ts。',
      showCancel: false,
    });
    return;
  }
  try {
    if (!(await requestReminderAuth())) {
      uni.showToast({ title: '需要允许通知', icon: 'none' });
      return;
    }
    await request('/subscribes', {
      method: 'POST',
      data: { keyword: s.keyword, templateId: s.templateId },
    });
    await load();
    uni.showToast({ title: '额度已补充', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

function remove(s: SubItem) {
  uni.showModal({
    title: '删除订阅',
    content: `不再接收「${s.keyword}」的资讯？`,
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await request(`/subscribes/${s.id}`, { method: 'DELETE' });
        list.value = list.value.filter((x) => x.id !== s.id);
      } catch (e) {
        uni.showToast({ title: (e as Error).message, icon: 'none' });
      }
    },
  });
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 14px 18px 40px; box-sizing: border-box; background: var(--bg); }

.tip {
  padding: 10px 12px; margin-bottom: 12px;
  border-radius: 10px; background: rgba(59, 91, 219, .06);
  font-size: 10.5px; line-height: 1.6; color: var(--muted);
}

.list { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0 14px; }
.row { display: flex; align-items: center; gap: 10px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: none; }
.left { flex: 1; min-width: 0; }
.kw { font-size: 13px; font-weight: 600; color: var(--fg); }
.meta { margin-top: 4px; font-size: 10px; color: var(--muted); }
.right { display: flex; align-items: center; gap: 8px; }
.bal {
  padding: 3px 8px; border-radius: 999px;
  background: rgba(59, 91, 219, .1); color: var(--accent);
  font-size: 10px; font-weight: 600;
}
.bal.zero { background: var(--line); color: var(--muted); }
.gbtn {
  padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--accent); color: var(--accent);
  font-size: 10px; font-weight: 600;
}
.del { font-size: 10px; color: #E03131; padding: 2px 4px; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 100px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }
</style>
