<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后使用待办" subtitle="待办同步到云端，换手机不丢" />
    <block v-else>
    <view class="seg">
      <view
        v-for="s in segs"
        :key="s.k"
        class="s"
        :class="{ on: seg === s.k }"
        @tap="seg = s.k"
      >{{ s.label }}</view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="!filtered.length" class="empty">
      <text class="empty-ico">✓</text>
      <text class="empty-t">还没有待办</text>
      <text class="empty-s">在下面输入框记一件要做的事</text>
    </view>

    <view v-else class="list">
      <view v-for="t in filtered" :key="t.id" class="task" :class="{ done: t.done }">
        <view class="ck" @tap="toggle(t)"><text v-if="t.done">✓</text></view>
        <view class="body">
          <view class="t1">{{ t.title }}</view>
          <view class="meta">
            <text class="tag">{{ t.category }}</text>
            <text class="time">{{ fmt(t.createdAt) }}</text>
          </view>
        </view>
        <text class="bell" :class="{ on: hasReminder(t.id) }" @tap.stop="openRemind(t)">🔔</text>
        <text class="del" @tap="remove(t)">✕</text>
      </view>
    </view>

    <view v-if="remindFor" class="mask" @tap="remindFor = null" />
    <view class="sheet" :class="{ open: !!remindFor }">
      <block v-if="remindFor">
        <view class="shead">
          <text class="stitle">设置提醒</text>
          <text class="sdone" @tap="saveRemind">开启</text>
        </view>
        <view class="rtitle">{{ remindFor.title }}</view>
        <view class="picks">
          <picker mode="date" :value="rdate" @change="onDate">
            <view class="pick">
              <text class="pk">日期</text><text>{{ rdate }}</text><text class="arr">›</text>
            </view>
          </picker>
          <picker mode="time" :value="rtime" @change="onTime">
            <view class="pick">
              <text class="pk">时间</text><text>{{ rtime }}</text><text class="arr">›</text>
            </view>
          </picker>
        </view>
        <view class="hint">
          微信一次授权只能推送一次。到点后通过服务通知提醒；22:00–08:00 会顺延到次日 8 点。
        </view>
        <view v-if="remindId" class="cancel" @tap="cancelRemind">取消提醒</view>
      </block>
    </view>

    <view class="inputbar">
      <input
        v-model="draft"
        class="ipt"
        placeholder="记一件要做的事…"
        placeholder-class="ipt-ph"
        confirm-type="done"
        @confirm="add"
      />
      <view class="plus" hover-class="plus-hover" @tap="add">＋</view>
    </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { isTemplateConfigured, requestReminderAuth } from '@/utils/reminderAuth';

interface Todo {
  id: string;
  title: string;
  done: boolean;
  category: string;
  createdAt: string;
  dueAt?: string | null;
}

const segs = [
  { k: 'today', label: '今天' },
  { k: 'week', label: '本周' },
  { k: 'all', label: '全部' },
];

interface Reminder {
  id: string;
  toolType: string;
  targetId: string;
  remindAt: string;
  remain: number;
  status: string;
}

// TODO: 模板 ID 统一在 utils/reminderAuth.ts 配置

const seg = ref('all');
const list = ref<Todo[]>([]);
const draft = ref('');
const loading = ref(false);
const reminders = ref<Reminder[]>([]);
const remindFor = ref<Todo | null>(null);
const remindId = ref('');
const rdate = ref('');
const rtime = ref('20:00');

const filtered = computed(() => {
  if (seg.value === 'all') return list.value;
  const days = seg.value === 'today' ? 1 : 7;
  const from = Date.now() - days * 86400000;
  return list.value.filter((t) => {
    // 有截止时间按截止时间算；没有时「今天」按创建时间，「本周」全量
    if (t.dueAt) return new Date(t.dueAt).getTime() >= from;
    return seg.value === 'week' ? true : new Date(t.createdAt).getTime() >= from;
  });
});

function fmt(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

async function load() {
  if (!getToken()) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const data = await request<{ list: Todo[] }>('/todos');
    list.value = data.list;
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  } finally {
    loading.value = false;
  }
  await loadReminders();
}

async function add() {
  const title = draft.value.trim();
  if (!title) return;
  if (!getToken()) {
    uni.showToast({ title: '请先到「我的」登录', icon: 'none' });
    return;
  }
  try {
    const t = await request<Todo>('/todos', { method: 'POST', data: { title } });
    list.value = [t, ...list.value];
    draft.value = '';
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function toggle(t: Todo) {
  try {
    await request(`/todos/${t.id}`, { method: 'PATCH', data: { done: !t.done } });
    t.done = !t.done;
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function remove(t: Todo) {
  try {
    await request(`/todos/${t.id}`, { method: 'DELETE' });
    list.value = list.value.filter((x) => x.id !== t.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

function hasReminder(id: string) {
  return reminders.value.some(
    (r) => r.toolType === 'todo' && r.targetId === id && r.status === 'pending' && r.remain > 0
  );
}

async function loadReminders() {
  if (!getToken()) return;
  try {
    const data = await request<{ list: Reminder[] }>('/reminders');
    reminders.value = data.list;
  } catch {
    /* 静默 */
  }
}

function openRemind(t: Todo) {
  const existing = reminders.value.find(
    (r) => r.toolType === 'todo' && r.targetId === t.id && r.status === 'pending'
  );

  if (existing) {
    const d = new Date(existing.remindAt);
    const p = (n: number) => String(n).padStart(2, '0');
    rdate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    rtime.value = `${p(d.getHours())}:${p(d.getMinutes())}`;
    remindId.value = existing.id;
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const p = (n: number) => String(n).padStart(2, '0');
    rdate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    rtime.value = '20:00';
    remindId.value = '';
  }

  remindFor.value = t;
}

function onDate(e: any) {
  rdate.value = e.detail.value;
}
function onTime(e: any) {
  rtime.value = e.detail.value;
}

async function saveRemind() {
  if (!remindFor.value) return;
  const targetId = remindFor.value.id;
  const remindAt = new Date(`${rdate.value}T${rtime.value}:00`).toISOString();
  const editing = Boolean(remindId.value);

  // 改期不需要重新授权（额度还在），仅新建时走授权
  if (!editing) {
    if (!isTemplateConfigured()) {
      uni.showModal({
        title: '未配置推送模板',
        content: '需先在小程序后台创建订阅消息模板，把 ID 填入 utils/reminderAuth.ts。',
        showCancel: false,
      });
      return;
    }
    if (!(await requestReminderAuth())) {
      uni.showToast({ title: '需要允许通知才能推送', icon: 'none' });
      return;
    }
  }

  try {
    if (editing) {
      await request(`/reminders/${remindId.value}`, { method: 'PATCH', data: { remindAt } });
    } else {
      await request('/reminders', { method: 'POST', data: { toolType: 'todo', targetId, remindAt } });
    }
    // 提醒时间回写截止时间，让「今天/本周」筛选与排序有依据
    await request(`/todos/${targetId}`, { method: 'PATCH', data: { dueAt: remindAt } });
    remindFor.value = null;
    remindId.value = '';
    await loadReminders();
    uni.showToast({ title: editing ? '已改期' : '提醒已设置', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function cancelRemind() {
  if (!remindId.value) return;
  try {
    await request(`/reminders/${remindId.value}`, { method: 'DELETE' });
    remindId.value = '';
    remindFor.value = null;
    await loadReminders();
    uni.showToast({ title: '已取消提醒', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 0 18px;
  box-sizing: border-box;
  background: var(--bg);
}

.seg { display: flex; gap: 6px; padding: 12px 0 6px; }
.s {
  padding: 6px 14px; border-radius: 999px;
  font-size: 11px; color: var(--muted);
}
.s.on { background: var(--accent); color: #fff; }

.list {
  margin-top: 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0 14px;
}

.task {
  display: flex; align-items: flex-start; gap: 11px;
  padding: 13px 0; border-bottom: 1px solid var(--line);
}
.task:last-child { border-bottom: none; }
.ck {
  width: 19px; height: 19px; border-radius: 50%;
  border: 1.5px solid var(--line); flex: 0 0 19px;
  margin-top: 1px; display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #fff;
}
.task.done .ck { background: var(--accent); border-color: transparent; }
.body { flex: 1; min-width: 0; }
.t1 { font-size: 13px; line-height: 1.45; color: var(--fg); }
.task.done .t1 { color: var(--muted); text-decoration: line-through; }
.meta { display: flex; align-items: center; gap: 7px; margin-top: 6px; }
.tag {
  font-size: 9px; padding: 2px 7px; border-radius: 5px;
  background: var(--line); color: var(--muted);
}
.time { font-size: 9px; color: var(--muted); }
.del { font-size: 12px; color: var(--muted); padding: 2px 4px; }
.bell { font-size: 12px; opacity: .3; padding: 2px 4px; }
.bell.on { opacity: 1; }

.mask { position: fixed; inset: 0; background: rgba(22, 32, 58, .32); z-index: 90; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--card); border-radius: 22px 22px 0 0;
  padding: 20px 18px calc(24px + env(safe-area-inset-bottom));
  transform: translateY(110%);
  transition: transform .32s cubic-bezier(.2,.85,.25,1);
  box-shadow: 0 -12px 34px rgba(0,0,0,.14);
}
.sheet.open { transform: translateY(0); }
.shead { display: flex; justify-content: space-between; align-items: baseline; }
.stitle { font-size: 16px; font-weight: 600; }
.sdone { font-size: 12px; color: var(--accent); font-weight: 600; }
.rtitle { margin-top: 10px; font-size: 12px; color: var(--muted); }
.picks { margin-top: 12px; }
.pick {
  display: flex; align-items: center; gap: 10px;
  height: 42px; padding: 0 12px; margin-bottom: 8px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12.5px;
}
.pk { width: 34px; font-size: 11px; color: var(--muted); }
.arr { margin-left: auto; font-size: 16px; color: var(--muted); }
.hint { margin-top: 10px; font-size: 10.5px; line-height: 1.7; color: var(--muted); }
.cancel { margin-top: 12px; text-align: center; font-size: 12px; color: #E03131; }

.empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 80px 0; color: var(--muted);
}
.empty-ico { font-size: 34px; color: var(--line); }
.empty-t { margin-top: 12px; font-size: 13px; color: var(--fg); }
.empty-s { margin-top: 6px; font-size: 11px; }

.inputbar {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; gap: 8px; align-items: center;
  padding: 10px 18px calc(10px + env(safe-area-inset-bottom));
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.ipt {
  flex: 1; height: 40px; padding: 0 16px;
  border-radius: 999px; background: var(--card);
  border: 1px solid var(--line);
  font-size: 12px;
}
.ipt-ph { color: var(--muted); }
.plus {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--grad); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 19px;
  box-shadow: 0 6px 14px rgba(59, 91, 219, 0.24);
}
.plus-hover { transform: scale(0.94); }
</style>
