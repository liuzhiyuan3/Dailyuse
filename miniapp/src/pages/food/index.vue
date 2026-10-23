<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后记录美食" subtitle="吃了什么、想吃什么，都替你记着" />
    <block v-else>
      <view class="hero">
        <view class="htitle">美食记录</view>
        <view class="hsub">{{ todayLabel }} · 今天已记 {{ todayAte.length }} 顿</view>
      </view>

      <view class="seg">
        <view class="s" :class="{ on: tab === 'ate' }" @tap="tab = 'ate'">
          今天吃了
        </view>
        <view class="s" :class="{ on: tab === 'want' }" @tap="tab = 'want'">
          想吃什么
          <text v-if="wantList.length" class="cnt">{{ wantList.length }}</text>
        </view>
      </view>

      <view class="inputbar">
        <input
          v-model="draft"
          class="ipt"
          :placeholder="tab === 'ate' ? '刚吃了什么？' : '想吃什么？'"
          placeholder-class="ph"
          confirm-type="done"
          @confirm="add"
        />
        <view class="plus" hover-class="plus-hover" @tap="add">＋</view>
      </view>

      <view v-if="!current.length" class="empty">
        <text class="eico">{{ tab === 'ate' ? '🍜' : '✨' }}</text>
        <text class="et">{{ tab === 'ate' ? '今天还没记录' : '还没有想吃的' }}</text>
        <text class="es">{{ tab === 'ate' ? '吃了什么，记一笔' : '把想吃的先存起来' }}</text>
      </view>

      <view v-else class="list">
        <view v-for="f in current" :key="f.id" class="row">
          <view class="left">
            <text class="rc">{{ f.content }}</text>
            <text class="rt">{{ fmt(f.createdAt) }}</text>
          </view>
          <view class="right">
            <view v-if="f.kind === 'want'" class="eaten" @tap="markEaten(f)">吃到了</view>
            <text class="del" @tap="remove(f)">✕</text>
          </view>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

interface Food {
  id: string;
  kind: 'ate' | 'want';
  content: string;
  note: string;
  createdAt: string;
}

const all = ref<Food[]>([]);
const tab = ref<'ate' | 'want'>('ate');
const draft = ref('');

const todayLabel = computed(() => {
  const d = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
});

const todayAte = computed(() => {
  const today = new Date().toDateString();
  return all.value.filter(
    (f) => f.kind === 'ate' && new Date(f.createdAt).toDateString() === today
  );
});

const wantList = computed(() => all.value.filter((f) => f.kind === 'want'));

const current = computed(() => (tab.value === 'ate' ? todayAte.value : wantList.value));

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  try {
    const d = await request<{ list: Food[] }>('/foods');
    all.value = d.list;
  } catch {
    all.value = [];
  }
}

async function add() {
  const content = draft.value.trim();
  if (!content) return;
  try {
    const created = await request<Food>('/foods', {
      method: 'POST',
      data: { kind: tab.value, content },
    });
    all.value = [created, ...all.value];
    draft.value = '';
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function markEaten(f: Food) {
  try {
    await request(`/foods/${f.id}/eaten`, { method: 'POST' });
    await load();
    tab.value = 'ate';
    uni.showToast({ title: '已记到「今天吃了」', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function remove(f: Food) {
  try {
    await request(`/foods/${f.id}`, { method: 'DELETE' });
    all.value = all.value.filter((x) => x.id !== f.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 14px 18px 40px; box-sizing: border-box; background: var(--bg); }

.hero { padding: 6px 0 2px; }
.htitle { font-size: 21px; font-weight: 600; letter-spacing: .5px; }
.hsub { margin-top: 6px; font-size: 11px; color: var(--muted); }

.seg { display: flex; gap: 6px; margin: 16px 0 10px; }
.s {
  padding: 7px 15px; border-radius: 999px;
  font-size: 11.5px; color: var(--muted);
  background: var(--card); border: 1px solid var(--line);
  display: flex; align-items: center; gap: 5px;
}
.s.on { background: var(--accent); border-color: transparent; color: #fff; }
.cnt { font-size: 9px; padding: 0 5px; border-radius: 8px; background: rgba(255,255,255,.25); }

.inputbar { display: flex; gap: 8px; align-items: center; }
.ipt {
  flex: 1; height: 42px; padding: 0 16px;
  border-radius: 999px; background: var(--card);
  border: 1px solid var(--line); font-size: 12.5px;
  box-shadow: var(--shadow);
}
.ph { color: var(--muted); }
.plus {
  width: 42px; height: 42px; border-radius: 50%;
  background: var(--grad); color: #fff; font-size: 20px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 14px rgba(59, 91, 219, .24);
}
.plus-hover { transform: scale(.94); }

.list {
  margin-top: 14px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 0 14px;
}
.row { display: flex; align-items: center; gap: 10px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: none; }
.left { flex: 1; min-width: 0; }
.rc { font-size: 13px; }
.rt { display: block; margin-top: 4px; font-size: 10px; color: var(--muted); }
.right { display: flex; align-items: center; gap: 10px; }
.eaten {
  padding: 4px 10px; border-radius: 999px;
  background: rgba(59, 91, 219, .1); color: var(--accent);
  font-size: 10px; font-weight: 600;
}
.del { font-size: 11px; color: var(--muted); padding: 2px 4px; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 70px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }
</style>
