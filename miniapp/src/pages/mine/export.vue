<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后导出数据" subtitle="导出你在云端保存的全部数据" />
    <block v-else>
      <view v-if="loading" class="empty">生成中…</view>

      <block v-else>
        <view class="sum">
          <view class="st-row">
            <text class="st">数据概览</text>
            <text class="st-time">{{ exportedAt }}</text>
          </view>
          <view class="rows">
            <view v-for="s in sections" :key="s.label" class="srow">
              <text class="sk">{{ s.label }}</text>
              <text class="kv num">{{ s.count }} 条</text>
            </view>
          </view>
        </view>

        <view class="actions">
          <view class="btn" hover-class="btn-hover" @tap="copy">复制全部 JSON</view>
          <view class="tip">复制后可粘贴到备忘录 / 电脑保存；数据量大时生成需几秒。</view>
        </view>

        <view class="preview">
          <view class="phead">预览（前 2000 字符）</view>
          <scroll-view scroll-y class="pbody">
            <text class="ptext" selectable user-select>{{ preview }}</text>
          </scroll-view>
        </view>
      </block>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

interface ExportData {
  exportedAt: string;
  todos: unknown[];
  notes: unknown[];
  accounts: unknown[];
  countdowns: unknown[];
  reminders: unknown[];
  foods: unknown[];
  groups: unknown[];
}

const loading = ref(false);
const data = ref<ExportData | null>(null);
const raw = ref('');

const sections = computed(() => [
  { label: '待办', count: data.value?.todos.length ?? 0 },
  { label: '便签', count: data.value?.notes.length ?? 0 },
  { label: '记账', count: data.value?.accounts.length ?? 0 },
  { label: '倒数日', count: data.value?.countdowns.length ?? 0 },
  { label: '提醒', count: data.value?.reminders.length ?? 0 },
  { label: '美食记录', count: data.value?.foods.length ?? 0 },
  { label: '群组', count: data.value?.groups.length ?? 0 },
]);

const preview = computed(() => (raw.value ? raw.value.slice(0, 2000) : ''));

const exportedAt = computed(() => {
  const iso = data.value?.exportedAt;
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} 生成`;
});

async function load() {
  loading.value = true;
  try {
    const d = await request<ExportData>('/auth/export');
    data.value = d;
    raw.value = JSON.stringify(d, null, 2);
  } catch (e) {
    uni.showToast({ title: (e as Error).message.slice(0, 40), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function copy() {
  if (!raw.value) return;
  uni.setClipboardData({
    data: raw.value,
    success: () => uni.showToast({ title: '已复制，去备忘录粘贴保存', icon: 'none' }),
  });
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 14px 18px 30px; box-sizing: border-box; background: var(--bg); }

.sum {
  padding: 14px 16px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.st-row { display: flex; align-items: baseline; justify-content: space-between; }
.st { font-size: 13px; font-weight: 600; }
.st-time { font-size: 9.5px; color: var(--muted); }
.rows { margin-top: 10px; display: flex; flex-wrap: wrap; }
.srow { width: 25%; margin: 8px 0; display: flex; flex-direction: column; gap: 3px; }
.sk { font-size: 10px; color: var(--muted); }
.kv { font-size: 14px; font-weight: 600; color: var(--accent); }

.actions { margin-top: 12px; }
.btn {
  padding: 13px; text-align: center;
  border-radius: var(--radius); background: var(--grad); color: #fff;
  font-size: 12.5px; font-weight: 600;
  box-shadow: 0 8px 18px rgba(59, 91, 219, .24);
}
.btn-hover { transform: scale(.98); }
.tip { margin-top: 8px; font-size: 10px; color: var(--muted); text-align: center; }

.preview {
  margin-top: 14px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 12px 14px;
}
.phead { font-size: 11px; font-weight: 600; color: var(--muted); }
.pbody { margin-top: 8px; height: 300px; background: var(--bg); border-radius: 10px; padding: 10px; box-sizing: border-box; }
.ptext { font-size: 10px; line-height: 1.6; color: var(--fg); word-break: break-all; }

.empty { padding: 80px 0; text-align: center; font-size: 12px; color: var(--muted); }
</style>
