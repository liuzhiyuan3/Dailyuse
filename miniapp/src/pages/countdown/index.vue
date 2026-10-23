<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后使用倒数日" subtitle="重要日子同步到云端，换手机不丢" />
    <block v-else>
    <view v-if="!list.length" class="empty">
      <text class="eico">📅</text>
      <text class="et">还没有倒数日</text>
      <text class="es">记下重要的日子，心里有数</text>
    </view>

    <view v-else class="list">
      <view v-for="c in list" :key="c.id" class="cd">
        <view class="chead">
          <text class="cname">{{ c.name }}</text>
          <text v-if="c.pinned" class="pin">置顶</text>
          <text class="bell" :class="{ on: hasReminder(c.id) }" @tap.stop="openRemind(c)">🔔</text>
        </view>
        <view class="cdays num">{{ label(days(c.targetDate)) }}</view>
        <view class="cfoot">
          <text class="cdate">{{ c.targetDate.slice(0, 10) }}</text>
          <text class="cdel" @tap="remove(c)">删除</text>
        </view>
      </view>
    </view>

    <view class="fab" @tap="openNew">＋</view>

    <view v-if="sheet" class="mask" @tap="sheet = false" />
    <view class="sheet" :class="{ open: sheet }">
      <view class="shead">
        <text class="stitle">新建倒数日</text>
        <text class="sdone" @tap="save">保存</text>
      </view>

      <input v-model="form.name" class="ipt" placeholder="名称，如「生日」" placeholder-class="ph" />

      <picker mode="date" :value="form.date" @change="onDate">
        <view class="datepick">
          <text :class="{ ph: !form.date }">{{ form.date || '选择目标日期' }}</text>
          <text class="arr">›</text>
        </view>
      </picker>

      <view class="pinrow">
        <text class="plabel">置顶</text>
        <switch :checked="form.pinned" color="#3B5BDB" @change="onPin" />
      </view>
    </view>

    <view v-if="remindFor" class="mask" @tap="remindFor = null" />
    <view class="sheet" :class="{ open: !!remindFor }">
      <block v-if="remindFor">
        <view class="shead">
          <text class="stitle">设置提醒</text>
          <text class="sdone" @tap="saveRemind">开启</text>
        </view>
        <view class="rtitle">{{ remindFor.name }}</view>
        <picker mode="date" :value="rdate" @change="onRDate">
          <view class="pick"><text class="pk">日期</text><text>{{ rdate }}</text><text class="arr">›</text></view>
        </picker>
        <picker mode="time" :value="rtime" @change="onRTime">
          <view class="pick"><text class="pk">时间</text><text>{{ rtime }}</text><text class="arr">›</text></view>
        </picker>
        <view class="hint">微信一次授权只能推送一次；22:00–08:00 会顺延到次日 8 点。</view>
        <view v-if="remindId" class="cancel" @tap="cancelRemind">取消提醒</view>
      </block>
    </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { isTemplateConfigured, requestReminderAuth } from '@/utils/reminderAuth';

interface Countdown { id: string; name: string; targetDate: string; pinned: boolean }
interface Reminder {
  id: string;
  toolType: string;
  targetId: string;
  remindAt: string;
  remain: number;
  status: string;
}

const list = ref<Countdown[]>([]);
const sheet = ref(false);
const form = ref({ name: '', date: '', pinned: false });

const reminders = ref<Reminder[]>([]);
const remindFor = ref<Countdown | null>(null);
const remindId = ref('');
const rdate = ref('');
const rtime = ref('09:00');

function days(iso: string) {
  const t = new Date(iso);
  t.setHours(0, 0, 0, 0);
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - n.getTime()) / 86400000);
}
function label(d: number) {
  if (d === 0) return '就是今天';
  return d > 0 ? `还有 ${d} 天` : `已过 ${-d} 天`;
}

async function load() {
  if (!getToken()) return;
  try {
    const data = await request<{ list: Countdown[] }>('/countdowns');
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

function hasReminder(id: string) {
  return reminders.value.some(
    (r) => r.toolType === 'countdown' && r.targetId === id && r.status === 'pending' && r.remain > 0
  );
}

function openRemind(c: Countdown) {
  const p = (n: number) => String(n).padStart(2, '0');
  const existing = reminders.value.find(
    (r) => r.toolType === 'countdown' && r.targetId === c.id && r.status === 'pending'
  );

  if (existing) {
    const d = new Date(existing.remindAt);
    rdate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    rtime.value = `${p(d.getHours())}:${p(d.getMinutes())}`;
    remindId.value = existing.id;
  } else {
    const d = new Date(c.targetDate);
    rdate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    rtime.value = '09:00';
    remindId.value = '';
  }
  remindFor.value = c;
}

function onRDate(e: any) {
  rdate.value = e.detail.value;
}
function onRTime(e: any) {
  rtime.value = e.detail.value;
}

async function saveRemind() {
  if (!remindFor.value) return;
  const targetId = remindFor.value.id;
  const remindAt = new Date(`${rdate.value}T${rtime.value}:00`).toISOString();
  const editing = Boolean(remindId.value);

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
      await request('/reminders', {
        method: 'POST',
        data: { toolType: 'countdown', targetId, remindAt },
      });
    }
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

function openNew() {
  form.value = { name: '', date: '', pinned: false };
  sheet.value = true;
}
function onDate(e: any) { form.value.date = e.detail.value; }
function onPin(e: any) { form.value.pinned = e.detail.value; }

async function save() {
  if (!form.value.name.trim()) {
    uni.showToast({ title: '填个名称', icon: 'none' });
    return;
  }
  if (!form.value.date) {
    uni.showToast({ title: '选个日期', icon: 'none' });
    return;
  }
  try {
    await request('/countdowns', {
      method: 'POST',
      data: { name: form.value.name.trim(), targetDate: form.value.date, pinned: form.value.pinned },
    });
    sheet.value = false;
    await load();
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function remove(c: Countdown) {
  try {
    await request(`/countdowns/${c.id}`, { method: 'DELETE' });
    list.value = list.value.filter((x) => x.id !== c.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

const { logged } = useAuthGate(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 12px 18px 90px; box-sizing: border-box; background: var(--bg); }

.list { display: flex; flex-wrap: wrap; gap: 10px; }
.cd {
  width: calc((100% - 10px) / 2);
  padding: 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  box-sizing: border-box;
}
.chead { display: flex; align-items: center; gap: 6px; }
.cname { flex: 1; font-size: 12.5px; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pin { font-size: 9px; padding: 1px 6px; border-radius: 4px; background: rgba(59,91,219,.1); color: var(--accent); }
.cdays { margin-top: 12px; font-size: 17px; font-weight: 600; color: var(--accent); }
.cfoot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.cdate { font-size: 9.5px; color: var(--muted); }
.cdel { font-size: 10px; color: var(--muted); }

.empty { display: flex; flex-direction: column; align-items: center; padding: 110px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }

.fab {
  position: fixed; right: 20px; bottom: calc(28px + env(safe-area-inset-bottom));
  width: 50px; height: 50px; border-radius: 50%;
  background: var(--grad); color: #fff; font-size: 24px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 20px rgba(59,91,219,.3); z-index: 80;
}

.mask { position: fixed; inset: 0; background: rgba(22,32,58,.32); z-index: 90; }
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

.ipt {
  margin-top: 16px; height: 38px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 13px;
}
.ph { color: var(--muted); }
.datepick {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; height: 42px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12.5px;
}
.arr { color: var(--muted); font-size: 16px; }
.pinrow { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
.plabel { font-size: 12px; }
.bell { margin-left: 6px; font-size: 11px; opacity: .3; }
.bell.on { opacity: 1; }
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
.cancel { margin-top: 12px; text-align: center; font-size: 12px; color: #E03131; }
</style>
