<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>

    <view v-else-if="!list.length" class="empty">
      <text class="eico">📢</text>
      <text class="et">还没有通知</text>
      <text class="es">有新消息时会在这里发布</text>
    </view>

    <view v-else class="list">
      <view v-for="a in list" :key="a.id" class="item">
        <view class="ihead">
          <text class="ititle">{{ a.title }}</text>
          <text class="itime">{{ fmt(a.createdAt) }}</text>
        </view>
        <text class="ibody">{{ a.content }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { request } from '@/api/request';

interface Announcement { id: string; title: string; content: string; createdAt: string }

const list = ref<Announcement[]>([]);
const loading = ref(true);

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 公告是公开接口，游客也能看
async function load() {
  try {
    const d = await request<{ list: Announcement[] }>('/announcements');
    list.value = d.list;
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

onShow(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 14px 18px 40px; box-sizing: border-box; background: var(--bg); }

.list {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 0 14px;
}
.item { padding: 14px 0; border-bottom: 1px solid var(--line); }
.item:last-child { border-bottom: none; }
.ihead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.ititle { font-size: 13px; font-weight: 600; }
.itime { flex: 0 0 auto; font-size: 9.5px; color: var(--muted); }
.ibody { display: block; margin-top: 8px; font-size: 11.5px; line-height: 1.8; color: var(--muted); white-space: pre-wrap; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 100px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }
</style>
