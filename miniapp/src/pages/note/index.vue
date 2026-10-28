<template>
  <view class="page">
    <view v-if="!logged" class="guest" @tap="goLogin">
      游客模式 · 数据暂存本机，登录后自动同步云端 ›
    </view>
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
          <text v-if="logged" class="bell" :class="bellClass(n.id)" @tap.stop="openRemind(n)">🔔</text>
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

    <!-- 便签提醒：备忘录到点 / 定期推送 -->
    <view v-if="remindFor" class="mask" @tap="remindFor = null" />
    <view class="sheet" :class="{ open: !!remindFor }">
      <block v-if="remindFor">
        <view class="shead">
          <text class="stitle">设置提醒</text>
          <text class="sdone" @tap="saveRemind">{{ remindDry ? '补充并开启' : '开启' }}</text>
        </view>
        <view class="rtitle">{{ remindFor.title || remindFor.content.slice(0, 20) || '便签' }}</view>
        <picker mode="date" :value="rdate" @change="onRDate">
          <view class="pick"><text class="pk">日期</text><text>{{ rdate }}</text><text class="arr">›</text></view>
        </picker>
        <picker mode="time" :value="rtime" @change="onRTime">
          <view class="pick"><text class="pk">时间</text><text>{{ rtime }}</text><text class="arr">›</text></view>
        </picker>
        <picker mode="selector" :range="repeatLabels" :value="repeatIdx" @change="onRepeat">
          <view class="pick"><text class="pk">重复</text><text>{{ repeatLabels[repeatIdx] }}</text><text class="arr">›</text></view>
        </picker>
        <view class="hint">
          微信一次授权推送一次；定期提醒每次到点都消耗一次额度，额度用完可在这里补充。22:00–08:00 顺延到次日 8 点。
        </view>
        <view v-if="remindDry" class="hint dry-hint">这条提醒的推送额度已用完，需要再授权一次。</view>
        <view v-if="remindId" class="cancel" @tap="cancelRemind">取消提醒</view>
      </block>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ensureLogin, getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { authWithHint, isTemplateConfigured, NOTE_TEMPLATE_ID, silentTopUp } from '@/utils/reminderAuth';
import { loadLocal, newLocalId, saveLocal, type LocalNote } from '@/utils/localData';

interface Note { id: string; title: string; content: string; pinned: boolean; updatedAt: string }
interface Reminder {
  id: string;
  toolType: string;
  targetId: string;
  remindAt: string;
  remain: number;
  status: string;
  repeat?: string;
}

const list = ref<Note[]>([]);
const q = ref('');
const editing = ref(false);
const form = ref<{ id?: string; title: string; content: string; pinned: boolean }>({
  title: '', content: '', pinned: false,
});

const reminders = ref<Reminder[]>([]);
const remindFor = ref<Note | null>(null);
const remindId = ref('');
const remindDry = ref(false);
const rdate = ref('');
const rtime = ref('09:00');

const repeatLabels = ['不重复', '每天', '每周', '每月'];
const repeatValues = ['', 'daily', 'weekly', 'monthly'];
const repeatIdx = ref(0);

const filtered = computed(() => {
  const k = q.value.trim();
  if (!k) return list.value;
  const pinned = list.value.filter((n) => n.pinned && (n.title + n.content).includes(k));
  const rest = list.value.filter((n) => !n.pinned && (n.title + n.content).includes(k));
  return [...pinned, ...rest];
});

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function load() {
  if (!getToken()) {
    // 游客态：读本地暂存，置顶的排前面
    const local = loadLocal<LocalNote>('notes');
    list.value = [...local.filter((n) => n.pinned), ...local.filter((n) => !n.pinned)];
    return;
  }
  try {
    const data = await request<{ list: Note[] }>('/notes');
    list.value = data.list;
  } catch { /* 静默 */ }
  await loadReminders();
}

async function loadReminders() {
  try {
    const d = await request<{ list: Reminder[] }>('/reminders');
    reminders.value = d.list;
  } catch {
    /* 静默 */
  }
}

/** 铃铛三态：亮 = 额度充足，虚 = 额度耗尽待补充 */
function bellClass(id: string) {
  const r = reminders.value.find(
    (x) => x.toolType === 'note' && x.targetId === id && x.status === 'pending'
  );
  if (!r) return '';
  return r.remain > 0 ? 'on' : 'dry';
}

function openRemind(n: Note) {
  const p = (v: number) => String(v).padStart(2, '0');
  const existing = reminders.value.find(
    (r) => r.toolType === 'note' && r.targetId === n.id && r.status === 'pending'
  );

  if (existing) {
    const d = new Date(existing.remindAt);
    rdate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    rtime.value = `${p(d.getHours())}:${p(d.getMinutes())}`;
    remindId.value = existing.id;
    remindDry.value = existing.remain <= 0;
    repeatIdx.value = Math.max(0, repeatValues.indexOf(existing.repeat ?? ''));
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    rdate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    rtime.value = '09:00';
    remindId.value = '';
    remindDry.value = false;
    repeatIdx.value = 0;
  }
  remindFor.value = n;
}

function onRDate(e: any) {
  rdate.value = e.detail.value;
}
function onRTime(e: any) {
  rtime.value = e.detail.value;
}
function onRepeat(e: any) {
  repeatIdx.value = Number(e.detail.value);
}

async function saveRemind() {
  if (!remindFor.value) return;
  const noteId = remindFor.value.id;
  const remindAt = new Date(`${rdate.value}T${rtime.value}:00`).toISOString();
  const repeat = repeatValues[repeatIdx.value];
  const editing = Boolean(remindId.value);
  const needGrant = editing && remindDry.value;

  if (!editing || needGrant) {
    if (!isTemplateConfigured(NOTE_TEMPLATE_ID)) {
      uni.showModal({
        title: '提醒推送暂未开通',
        content: '微信推送服务开通前，暂时无法设置到点提醒。',
        showCancel: false,
      });
      return;
    }
    if (!(await authWithHint(NOTE_TEMPLATE_ID))) {
      uni.showToast({ title: '需要允许通知才能推送', icon: 'none' });
      return;
    }
  }

  try {
    if (editing) {
      await request(`/reminders/${remindId.value}`, {
        method: 'PATCH',
        data: { remindAt, repeat },
      });
      if (needGrant) {
        await request(`/reminders/${remindId.value}/grant`, { method: 'POST' });
      }
    } else {
      await request('/reminders', {
        method: 'POST',
        data: {
          toolType: 'note',
          targetId: noteId,
          remindAt,
          repeat,
          templateId: NOTE_TEMPLATE_ID,
        },
      });
    }
    remindFor.value = null;
    remindId.value = '';
    remindDry.value = false;
    await loadReminders();

    // 定期提醒：勾选了「总是保持以上选择」的用户，静默把额度补到 7 次（约一周），
    // 之后每天打开小程序 App.vue 里的 autoTopUp 还会再补，做到免打扰自动推
    if (repeat) {
      const cur = reminders.value.find(
        (x) => x.toolType === 'note' && x.targetId === noteId && x.status === 'pending'
      );
      if (cur && cur.remain < 7) {
        await silentTopUp(NOTE_TEMPLATE_ID, cur.id, cur.remain, 7);
        await loadReminders();
      }
    }

    uni.showToast({
      title: needGrant ? '已补充并改期' : editing ? '已改期' : repeat ? '定期提醒已设置' : '提醒已设置',
      icon: 'none',
    });
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

function goLogin() {
  void ensureLogin('登录后数据同步到云端，换设备不丢');
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
  if (!getToken()) {
    const local = loadLocal<LocalNote>('notes');
    if (f.id) {
      const hit = local.find((n) => n.id === f.id);
      if (hit) {
        hit.title = f.title;
        hit.content = f.content;
        hit.pinned = f.pinned;
        hit.updatedAt = new Date().toISOString();
      }
    } else {
      local.unshift({
        id: newLocalId(),
        title: f.title,
        content: f.content,
        pinned: f.pinned,
        updatedAt: new Date().toISOString(),
      });
    }
    saveLocal('notes', local);
    editing.value = false;
    await load();
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
  if (!getToken()) {
    list.value = list.value.filter((x) => x.id !== n.id);
    saveLocal('notes', list.value);
    return;
  }
  try {
    await request(`/notes/${n.id}`, { method: 'DELETE' });
    list.value = list.value.filter((x) => x.id !== n.id);
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
.page { min-height: 100vh; padding: 0 18px 90px; box-sizing: border-box; background: var(--bg); }
.guest {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(59, 91, 219, .08);
  border: 1px dashed rgba(59, 91, 219, .35);
  font-size: 11px;
  color: var(--accent);
}
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
.bell { margin-left: 2px; font-size: 11px; opacity: .3; }
.bell.on { opacity: 1; }
.bell.dry { opacity: .55; border-bottom: 1px dashed var(--muted); }
.rtitle { margin-top: 10px; font-size: 12px; color: var(--muted); }
.pick {
  display: flex; align-items: center; gap: 10px;
  margin-top: 8px; height: 42px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12.5px;
}
.pk { width: 34px; font-size: 11px; color: var(--muted); }
.arr { margin-left: auto; font-size: 16px; color: var(--muted); }
.hint { margin-top: 10px; font-size: 10.5px; line-height: 1.7; color: var(--muted); }
.dry-hint { color: #E03131; }
.cancel { margin-top: 12px; text-align: center; font-size: 12px; color: #E03131; }
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
