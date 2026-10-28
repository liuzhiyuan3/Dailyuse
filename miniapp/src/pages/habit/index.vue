<template>
  <view class="page">
    <view v-if="!logged" class="guest" @tap="goLogin">
      游客模式 · 数据暂存本机，登录后自动同步云端 ›
    </view>

    <view v-if="!list.length" class="empty">
      <text class="eico">✅</text>
      <text class="et">还没有打卡项</text>
      <text class="es">喝水、锻炼、背单词，自己定内容</text>
    </view>

    <view v-else class="list">
      <view v-for="h in list" :key="h.id" class="habit" @longpress="removeHabit(h)">
        <view class="hhead">
          <text class="hname">{{ h.name }}</text>
          <text class="streak" :class="{ hot: h.streak >= 3 }">🔥 连续 {{ h.streak }} 天</text>
        </view>

        <view class="week">
          <view v-for="(on, i) in h.week" :key="i" class="day">
            <view class="dot" :class="{ on }">{{ on ? '✓' : '' }}</view>
            <text class="dlabel">{{ weekLabels[i] }}</text>
          </view>
          <view class="ck" :class="{ on: h.today }" @tap.stop="toggle(h)">
            {{ h.today ? '已完成' : '打卡' }}
          </view>
        </view>

        <view class="hfoot">
          <text class="total">累计 {{ h.total }} 天</text>
        </view>
      </view>
    </view>

    <view class="fab" @tap="openNew">＋</view>

    <view v-if="sheet" class="mask" @tap="sheet = false" />
    <view class="sheet" :class="{ open: sheet }">
      <view class="shead">
        <text class="stitle">新建打卡项</text>
        <text class="sdone" @tap="save">保存</text>
      </view>
      <input v-model="form.name" class="ipt" placeholder="名称，如「每天喝水 8 杯」" placeholder-class="ph" @confirm="save" />
      <view class="hint">长按卡片可删除打卡项</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ensureLogin, getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { loadLocal, newLocalId, saveLocal, type LocalHabit } from '@/utils/localData';

interface HabitItem {
  id: string;
  name: string;
  today: boolean;
  streak: number;
  total: number;
  /** 最近 7 天（老 → 新，最后一位是今天） */
  week: boolean[];
}

/** 最近 7 天的星期标签（老 → 新，随日期滚动） */
const weekLabels = computed(() => {
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(names[d.getDay()]);
  }
  return out;
});

const list = ref<HabitItem[]>([]);
const sheet = ref(false);
const form = ref({ name: '' });

function todayKey() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 本机游客数据 → 页面模型 */
function fromLocal(items: LocalHabit[]): HabitItem[] {
  const today = todayKey();
  const dayMs = 86400000;
  return items.map((h) => {
    const days = new Set(h.days);
    // 连击：从今天（或昨天）往回数
    let streak = 0;
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    if (!days.has(keyOf(cur))) cur.setTime(cur.getTime() - dayMs);
    while (days.has(keyOf(cur))) {
      streak++;
      cur.setTime(cur.getTime() - dayMs);
    }
    // 最近 7 天
    const week: boolean[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setTime(d.getTime() - i * dayMs);
      week.push(days.has(keyOf(d)));
    }
    return { id: h.id, name: h.name, today: days.has(today), streak, total: days.size, week };
  });
}

function keyOf(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function load() {
  if (!getToken()) {
    list.value = fromLocal(loadLocal<LocalHabit>('habits'));
    return;
  }
  try {
    const d = await request<{ list: HabitItem[] }>('/habits');
    list.value = d.list;
  } catch { /* 静默 */ }
}

function goLogin() {
  void ensureLogin('登录后数据同步到云端，换设备不丢');
}

function openNew() {
  form.value.name = '';
  sheet.value = true;
}

async function save() {
  const name = form.value.name.trim();
  if (!name) {
    uni.showToast({ title: '填个名称', icon: 'none' });
    return;
  }

  if (!getToken()) {
    const local = loadLocal<LocalHabit>('habits');
    if (local.length >= 20) {
      uni.showToast({ title: '最多 20 个打卡项', icon: 'none' });
      return;
    }
    local.push({ id: newLocalId(), name, createdAt: new Date().toISOString(), days: [] });
    saveLocal('habits', local);
    sheet.value = false;
    await load();
    return;
  }

  try {
    await request('/habits', { method: 'POST', data: { name } });
    sheet.value = false;
    await load();
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function toggle(h: HabitItem) {
  const done = !h.today;

  if (!getToken()) {
    const local = loadLocal<LocalHabit>('habits');
    const hit = local.find((x) => x.id === h.id);
    if (!hit) return;
    const key = todayKey();
    hit.days = done ? [...new Set([...hit.days, key])] : hit.days.filter((d) => d !== key);
    saveLocal('habits', local);
    list.value = fromLocal(local);
    uni.showToast({ title: done ? '打卡成功' : '已取消', icon: 'none' });
    return;
  }

  try {
    await request(`/habits/${h.id}/toggle`, { method: 'POST', data: {} });
    await load();
    uni.showToast({ title: done ? '打卡成功' : '已取消', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function removeHabit(h: HabitItem) {
  const res = await new Promise<{ confirm: boolean }>((resolve) => {
    uni.showModal({
      title: '删除打卡项',
      content: `「${h.name}」及其全部记录将被删除`,
      success: (r) => resolve({ confirm: r.confirm }),
    });
  });
  if (!res.confirm) return;

  if (!getToken()) {
    saveLocal('habits', loadLocal<LocalHabit>('habits').filter((x) => x.id !== h.id));
    list.value = list.value.filter((x) => x.id !== h.id);
    return;
  }
  try {
    await request(`/habits/${h.id}`, { method: 'DELETE' });
    list.value = list.value.filter((x) => x.id !== h.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

const { logged } = useAuthGate(load);

onShow(() => {
  if (!logged.value) void load();
});
</script>

<style scoped>
.page { min-height: 100vh; padding: 12px 18px 90px; box-sizing: border-box; background: var(--bg); }

.guest {
  margin-bottom: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(59, 91, 219, .08);
  border: 1px dashed rgba(59, 91, 219, .35);
  font-size: 11px;
  color: var(--accent);
}

.list { display: flex; flex-direction: column; gap: 10px; }
.habit {
  padding: 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.hhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.hname { flex: 1; font-size: 13.5px; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.streak { flex: 0 0 auto; font-size: 10px; color: var(--muted); }
.streak.hot { color: #E8590C; }

.week { display: flex; align-items: center; gap: 6px; margin-top: 14px; }
.day { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.dot {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1.4px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #fff;
}
.dot.on { background: rgba(59, 91, 219, .18); border-color: transparent; color: var(--accent); font-weight: 700; }
.dlabel { font-size: 8.5px; color: var(--muted); }

.ck {
  flex: 0 0 auto; margin-left: 4px;
  padding: 0 14px; height: 34px; border-radius: 999px;
  display: flex; align-items: center;
  background: var(--grad); color: #fff;
  font-size: 11px; font-weight: 600;
}
.ck.on { background: var(--bg); color: var(--muted); border: 1px solid var(--line); }

.hfoot { margin-top: 10px; }
.total { font-size: 9.5px; color: var(--muted); }

.empty { display: flex; flex-direction: column; align-items: center; padding: 110px 0; }
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

.mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(22, 32, 58, .32); z-index: 90; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--card); border-radius: 22px 22px 0 0;
  padding: 20px 18px calc(24px + env(safe-area-inset-bottom));
  transform: translateY(110%);
  transition: transform .32s cubic-bezier(.2, .85, .25, 1);
  box-shadow: 0 -12px 34px rgba(0, 0, 0, .14);
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
.hint { margin-top: 10px; font-size: 10.5px; color: var(--muted); }
</style>
