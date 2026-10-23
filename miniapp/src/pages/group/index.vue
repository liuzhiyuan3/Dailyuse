<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后查看群组" subtitle="群组待办需要成员身份" />
    <block v-else>
      <view v-if="!groups.length" class="empty">
        <text class="eico">👥</text>
        <text class="et">还没有群组</text>
        <text class="es">创建一个，和朋友共享待办</text>
      </view>

      <view v-else class="list">
        <view v-for="g in groups" :key="g.id" class="row" @tap="open(g)">
          <view class="rtop">
            <text class="rname">{{ g.name }}</text>
            <text class="rpct">{{ pct(g) }}%</text>
          </view>
          <view class="rmeta">{{ g.memberCount }} 人 · {{ g.doneCount }}/{{ g.todoCount }} 完成</view>
          <view class="rbar"><view class="rfill" :style="{ width: pct(g) + '%' }" /></view>
        </view>
      </view>

      <view class="fab" @tap="create">＋</view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

interface GroupItem {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  todoCount: number;
  doneCount: number;
}

const groups = ref<GroupItem[]>([]);

function pct(g: GroupItem) {
  return g.todoCount ? Math.round((g.doneCount / g.todoCount) * 100) : 0;
}

async function load() {
  try {
    const d = await request<{ groups: GroupItem[] }>('/groups');
    groups.value = d.groups;
  } catch {
    groups.value = [];
  }
}

function open(g: GroupItem) {
  uni.navigateTo({ url: `/pages/group/detail?id=${g.id}` });
}

function create() {
  uni.showModal({
    title: '创建群组',
    editable: true,
    placeholderText: '群组名称',
    success: async (res) => {
      const content = (res as any).content as string | undefined;
      if (!res.confirm || !content || !content.trim()) return;
      try {
        const g = await request<{ id: string }>('/groups', {
          method: 'POST',
          data: { name: content.trim() },
        });
        await load();
        uni.navigateTo({ url: `/pages/group/detail?id=${g.id}` });
      } catch (e) {
        uni.showToast({ title: (e as Error).message, icon: 'none' });
      }
    },
  });
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 12px 18px 90px; box-sizing: border-box; background: var(--bg); }

.list { display: flex; flex-direction: column; gap: 10px; }
.row {
  padding: 14px; background: var(--card);
  border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.rtop { display: flex; justify-content: space-between; align-items: baseline; }
.rname { font-size: 14px; font-weight: 600; }
.rpct { font-size: 12px; color: var(--accent); font-weight: 600; }
.rmeta { margin-top: 6px; font-size: 10.5px; color: var(--muted); }
.rbar { height: 5px; margin-top: 10px; border-radius: 3px; background: var(--line); overflow: hidden; }
.rfill { height: 100%; border-radius: 3px; background: var(--grad); }

.empty { display: flex; flex-direction: column; align-items: center; padding: 100px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }

.fab {
  position: fixed; right: 20px; bottom: calc(28px + env(safe-area-inset-bottom));
  width: 50px; height: 50px; border-radius: 50%;
  background: var(--grad); color: #fff; font-size: 24px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 20px rgba(59, 91, 219, .3); z-index: 80;
}
</style>
