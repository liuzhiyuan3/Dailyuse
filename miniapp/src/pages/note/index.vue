<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后使用便签" subtitle="便签同步到云端，换手机不丢" />
    <block v-else>
    <view class="search">
      <text class="sico">🔍</text>
      <input v-model="q" class="sipt" placeholder="搜索便签" placeholder-class="ph" />
    </view>

    <view v-if="!filtered.length" class="empty">
      <text class="eico">📝</text>
      <text class="et">还没有便签</text>
      <text class="es">点右下角新建一个</text>
    </view>

    <view v-else class="list">
      <view v-for="n in filtered" :key="n.id" class="note" @tap="openEdit(n)">
        <view class="nhead">
          <text class="ntitle">{{ n.title || '无标题' }}</text>
          <text v-if="n.pinned" class="pin">置顶</text>
        </view>
        <text class="ncontent">{{ n.content || '（空）' }}</text>
        <view class="nfoot">
          <text class="ntime">{{ fmt(n.updatedAt) }}</text>
          <text class="ndel" @tap.stop="remove(n)">删除</text>
        </view>
      </view>
    </view>

    <view class="fab" @tap="openNew">＋</view>

    <view v-if="editing" class="mask" @tap="close" />
    <view class="sheet" :class="{ open: editing }">
      <view class="shead">
        <text class="stitle">{{ form.id ? '编辑便签' : '新建便签' }}</text>
        <text class="sdone" @tap="save">保存</text>
      </view>
      <input v-model="form.title" class="ipt" placeholder="标题" placeholder-class="ph" />
      <textarea v-model="form.content" class="area" placeholder="写点什么…" placeholder-class="ph" />
      <view class="pinrow">
        <text class="plabel">置顶</text>
        <switch :checked="form.pinned" color="#3B5BDB" @change="onPin" />
      </view>
    </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

interface Note { id: string; title: string; content: string; pinned: boolean; updatedAt: string }

const list = ref<Note[]>([]);
const q = ref('');
const editing = ref(false);
const form = ref<{ id?: string; title: string; content: string; pinned: boolean }>({
  title: '', content: '', pinned: false,
});

const filtered = computed(() => {
  const k = q.value.trim();
  if (!k) return list.value;
  return list.value.filter((n) => (n.title + n.content).includes(k));
});

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function load() {
  if (!getToken()) return;
  try {
    const data = await request<{ list: Note[] }>('/notes');
    list.value = data.list;
  } catch { /* 静默 */ }
}

function openNew() {
  form.value = { title: '', content: '', pinned: false };
  editing.value = true;
}
function openEdit(n: Note) {
  form.value = { id: n.id, title: n.title, content: n.content, pinned: n.pinned };
  editing.value = true;
}
function close() { editing.value = false; }
function onPin(e: any) { form.value.pinned = e.detail.value; }

async function save() {
  const f = form.value;
  if (!f.title.trim() && !f.content.trim()) {
    uni.showToast({ title: '写点内容再保存', icon: 'none' });
    return;
  }
  try {
    if (f.id) {
      await request(`/notes/${f.id}`, { method: 'PATCH', data: { title: f.title, content: f.content, pinned: f.pinned } });
    } else {
      await request('/notes', { method: 'POST', data: { title: f.title, content: f.content, pinned: f.pinned } });
    }
    editing.value = false;
    await load();
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function remove(n: Note) {
  try {
    await request(`/notes/${n.id}`, { method: 'DELETE' });
    list.value = list.value.filter((x) => x.id !== n.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 0 18px 90px; box-sizing: border-box; background: var(--bg); }
.search {
  display: flex; align-items: center; gap: 8px;
  margin-top: 12px; padding: 0 14px; height: 38px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: 999px;
}
.sico { font-size: 13px; }
.sipt { flex: 1; font-size: 12px; }
.ph { color: var(--muted); }

.list { margin-top: 12px; }
.note {
  padding: 14px; margin-bottom: 10px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.nhead { display: flex; align-items: center; gap: 8px; }
.ntitle { flex: 1; font-size: 13.5px; font-weight: 600; }
.pin { font-size: 9px; padding: 2px 7px; border-radius: 5px; background: rgba(59, 91, 219, .1); color: var(--accent); }
.ncontent {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; margin-top: 8px;
  font-size: 11.5px; line-height: 1.6; color: var(--muted);
}
.nfoot { display: flex; justify-content: space-between; margin-top: 10px; }
.ntime { font-size: 9.5px; color: var(--muted); }
.ndel { font-size: 10px; color: #E03131; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 100px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }

.fab {
  position: fixed; right: 20px; bottom: calc(28px + env(safe-area-inset-bottom));
  width: 50px; height: 50px; border-radius: 50%;
  background: var(--grad); color: #fff; font-size: 24px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 20px rgba(59, 91, 219, .3);
  z-index: 80;
}

.mask { position: fixed; inset: 0; background: rgba(22,32,58,.32); z-index: 90; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--card); border-radius: 22px 22px 0 0;
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
  transform: translateY(110%);
  transition: transform .32s cubic-bezier(.2,.85,.25,1);
  box-shadow: 0 -12px 34px rgba(0,0,0,.14);
}
.sheet.open { transform: translateY(0); }
.shead { display: flex; justify-content: space-between; align-items: baseline; }
.stitle { font-size: 16px; font-weight: 600; }
.sdone { font-size: 12px; color: var(--accent); font-weight: 600; }
.ipt {
  margin-top: 16px; height: 38px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 13px;
}
.area {
  margin-top: 10px; width: 100%; height: 120px; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12px; box-sizing: border-box;
}
.pinrow { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
.plabel { font-size: 12px; }
</style>
