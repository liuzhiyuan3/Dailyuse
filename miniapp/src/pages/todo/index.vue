<template>
  <view class="page">
    <view v-if="!logged" class="guest" @tap="goLogin">
      游客模式 · 数据暂存本机，登录后自动同步云端 ›
    </view>
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
      <text class="empty-ico">{{ seg === 'history' ? '🗂️' : '✓' }}</text>
      <text class="empty-t">{{ seg === 'history' ? '还没有历史记录' : '还没有待办' }}</text>
      <text class="empty-s">{{
        seg === 'history' ? '完成隔天的待办会收进这里，点勾可找回' : '在下面输入框记一件要做的事'
      }}</text>
    </view>

    <view v-else class="list">
      <view v-for="t in filtered" :key="t.id" class="task" :class="{ done: t.done }">
        <view class="ck" @tap="toggle(t)"><text v-if="t.done">✓</text></view>
        <view class="body">
          <view class="t1">{{ t.title }}</view>
          <view class="meta">
            <text class="tag">{{ t.category }}</text>
            <text class="time">{{ t.done && t.doneAt ? `完成 ${fmt(t.doneAt)}` : fmt(t.createdAt) }}</text>
          </view>
        </view>
        <text v-if="logged" class="bell" :class="bellClass(t.id)" @tap.stop="openRemind(t)">🔔</text>
        <text class="del" @tap="remove(t)">✕</text>
      </view>
    </view>

    <view v-if="remindFor" class="mask" @tap="remindFor = null" />
    <view class="sheet" :class="{ open: !!remindFor }">
      <block v-if="remindFor">
        <view class="shead">
          <text class="stitle">设置提醒</text>
          <text class="sdone" @tap="saveRemind">{{ remindDry ? '补充并开启' : '开启' }}</text>
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
        <view v-if="remindDry" class="hint dry-hint">这条提醒的推送额度已用完，需要再授权一次。</view>
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
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ensureLogin, getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { authWithHint, isTemplateConfigured } from '@/utils/reminderAuth';
import { loadLocal, newLocalId, saveLocal, type LocalTodo } from '@/utils/localData';

interface Todo {
  id: string;
  title: string;
  done: boolean;
  category: string;
  createdAt: string;
  dueAt?: string | null;
  doneAt?: string | null;
}

const segs = [
  { k: 'today', label: '今天' },
  { k: 'week', label: '本周' },
  { k: 'all', label: '全部' },
  { k: 'history', label: '历史' },
];

interface Reminder {
  id: string;
  toolType: string;
  targetId: string;
  remindAt: string;
  remain: number;
  status: string;
}

const seg = ref('all');
const list = ref<Todo[]>([]);
const draft = ref('');
const loading = ref(false);
const reminders = ref<Reminder[]>([]);
const remindFor = ref<Todo | null>(null);
const remindId = ref('');
const remindDry = ref(false);
const rdate = ref('');
const rtime = ref('20:00');

function isToday(iso?: string | null) {
  return Boolean(iso) && new Date(iso as string).toDateString() === new Date().toDateString();
}

const filtered = computed(() => {
  // 历史：隔天前完成的待办收在这里，点勾可恢复为未完成
  if (seg.value === 'history') {
    return list.value.filter((t) => t.done && !isToday(t.doneAt));
  }
  // 主列表：未完成 + 今天完成的（当天还能看到划线，第二天自动收进历史）
  const main = list.value.filter((t) => !t.done || isToday(t.doneAt));
  if (seg.value === 'all') return main;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (seg.value === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + (seg.value === 'today' ? 1 : 7));
  const from = start.getTime();
  const to = end.getTime();
  return main.filter((t) => {
    // 有截止时间按截止时间算；没有时「今天」按创建时间，「本周」全量
    if (!t.dueAt && seg.value === 'week') return true;
    const at = new Date(t.dueAt || t.createdAt).getTime();
    return at >= from && at < to;
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
    // 游客态：读本机暂存（登录成功后会被合并上报，见 utils/localData.ts）
    list.value = loadLocal<LocalTodo>('todos');
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

function goLogin() {
  void ensureLogin('登录后数据同步到云端，换设备不丢');
}

async function add() {
  const title = draft.value.trim();
  if (!title) return;
  if (!getToken()) {
    const item: LocalTodo = {
      id: newLocalId(),
      title,
      done: false,
      category: 'default',
      createdAt: new Date().toISOString(),
      dueAt: null,
      doneAt: null,
    };
    saveLocal('todos', [item, ...loadLocal<LocalTodo>('todos')]);
    list.value = [item, ...list.value];
    draft.value = '';
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
  const wasDone = t.done;
  if (!getToken()) {
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    saveLocal('todos', list.value);
    return;
  }
  try {
    await request(`/todos/${t.id}`, { method: 'PATCH', data: { done: !t.done } });
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    // 在历史里取消勾选 = 找回到未完成，提示一下它去哪了
    if (wasDone && seg.value === 'history') {
      uni.showToast({ title: '已恢复为未完成', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function remove(t: Todo) {
  if (!getToken()) {
    list.value = list.value.filter((x) => x.id !== t.id);
    saveLocal('todos', list.value);
    return;
  }
  try {
    await request(`/todos/${t.id}`, { method: 'DELETE' });
    list.value = list.value.filter((x) => x.id !== t.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

/** 铃铛三态：亮 = 额度充足，虚 = 额度耗尽待补充（PRD §4.7） */
function bellClass(id: string) {
  const r = reminders.value.find(
    (x) => x.toolType === 'todo' && x.targetId === id && x.status === 'pending'
  );
  if (!r) return '';
  return r.remain > 0 ? 'on' : 'dry';
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
    remindDry.value = existing.remain <= 0;
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const p = (n: number) => String(n).padStart(2, '0');
    rdate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    rtime.value = '20:00';
    remindId.value = '';
    remindDry.value = false;
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
  const needGrant = editing && remindDry.value;

  // 改期且额度还在时不用重新授权；新建或额度耗尽都要走一次订阅授权
  if (!editing || needGrant) {
    if (!isTemplateConfigured()) {
      uni.showModal({
        title: '提醒推送暂未开通',
        content: '微信推送服务开通前，暂时无法设置到点提醒。',
        showCancel: false,
      });
      return;
    }
    if (!(await authWithHint())) {
      uni.showToast({ title: '需要允许通知才能推送', icon: 'none' });
      return;
    }
  }

  try {
    if (editing) {
      await request(`/reminders/${remindId.value}`, { method: 'PATCH', data: { remindAt } });
      if (needGrant) {
        await request(`/reminders/${remindId.value}/grant`, { method: 'POST' });
      }
    } else {
      await request('/reminders', { method: 'POST', data: { toolType: 'todo', targetId, remindAt } });
    }
    // 提醒时间回写截止时间，让「今天/本周」筛选与排序有依据
    await request(`/todos/${targetId}`, { method: 'PATCH', data: { dueAt: remindAt } });
    remindFor.value = null;
    remindId.value = '';
    remindDry.value = false;
    await loadReminders();
    uni.showToast({ title: needGrant ? '已补充并改期' : editing ? '已改期' : '提醒已设置', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function cancelRemind() {
  if (!remindId.value) return;
  try {
    await request(`/reminders/${remindId.value}`, { method: 'DELETE' });
    remindId.value = '';
    remindDry.value = false;
    remindFor.value = null;
    await loadReminders();
    uni.showToast({ title: '已取消提醒', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

const { logged } = useAuthGate(load);

// 游客态没有登录事件可等，进页面时直接读本地
onShow(() => {
  if (!logged.value) void load();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 0 18px;
  box-sizing: border-box;
  background: var(--bg);
}

.guest {
  margin: 12px 0 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(59, 91, 219, .08);
  border: 1px dashed rgba(59, 91, 219, .35);
  font-size: 11px;
  color: var(--accent);
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
.bell.dry { opacity: .55; border-bottom: 1px dashed var(--muted); }

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
.dry-hint { color: #E03131; }
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
