<template>
  <view class="page">
    <view v-if="!logged" class="guest" @tap="goLogin">
      游客模式 · 数据暂存本机，登录后自动同步云端 ›
    </view>
    <view class="sum">
      <text class="sk">本月支出</text>
      <view class="sv num">¥{{ money(expense) }}</view>
      <view class="srow">
        <text>收入 ¥{{ money(income) }}</text>
        <text>结余 ¥{{ money(balance) }}</text>
      </view>
    </view>

    <view v-if="dailyBars.length" class="chart">
      <view class="chead">
        <text class="ct">本月每日支出</text>
        <text class="cmax">峰值 ¥{{ money(maxDaily) }}</text>
      </view>
      <scroll-view scroll-x class="cbody" :show-scrollbar="false">
        <view class="bars">
          <view v-for="b in dailyBars" :key="b.day" class="bar-item">
            <text class="bval">{{ shortMoney(b.v) }}</text>
            <view class="bar" :style="{ height: b.h + 'px' }" />
            <text class="bday">{{ b.day }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <view class="seg">
      <view class="s" :class="{ on: tab === 'expense' }" @tap="tab = 'expense'">支出</view>
      <view class="s" :class="{ on: tab === 'income' }" @tap="tab = 'income'">收入</view>
    </view>

    <view v-if="!filtered.length" class="empty">
      <text class="eico">💰</text>
      <text class="et">还没有记录</text>
    </view>

    <view v-else class="list">
      <view v-for="a in filtered" :key="a.id" class="row" @tap="openEdit(a)">
        <view class="rleft">
          <text class="rcat">{{ a.category }}</text>
          <text class="rremark">{{ a.remark || '—' }}</text>
        </view>
        <view class="rright">
          <text class="ramt num" :class="{ income: a.type === 'income' }">
            {{ a.type === 'income' ? '+' : '-' }}¥{{ money(a.amount) }}
          </text>
          <text class="rdate">{{ shortDate(a.occurredAt) }}</text>
        </view>
        <text class="rdel" @tap="remove(a)">✕</text>
      </view>
    </view>

    <view class="fab" @tap="openNew">＋</view>

    <view v-if="sheet" class="mask" @tap="sheet = false" />
    <view class="sheet" :class="{ open: sheet }">
      <view class="shead">
        <text class="stitle">{{ form.id ? '编辑记录' : '记一笔' }}</text>
        <text class="sdone" @tap="save">保存</text>
      </view>

      <view class="types">
        <view class="t" :class="{ on: form.type === 'expense' }" @tap="form.type = 'expense'">支出</view>
        <view class="t" :class="{ on: form.type === 'income' }" @tap="form.type = 'income'">收入</view>
      </view>

      <view class="amtrow">
        <text class="cny">¥</text>
        <input v-model="form.amount" class="amt" type="digit" placeholder="0.00" placeholder-class="ph" />
      </view>

      <view class="chips">
        <view
          v-for="c in categories"
          :key="c"
          class="chip"
          :class="{ on: form.category === c }"
          @tap="form.category = c"
        >{{ c }}</view>
      </view>

      <input v-model="form.remark" class="ipt" placeholder="备注（可选）" placeholder-class="ph" />

      <picker mode="date" :value="form.date" @change="onDate">
        <view class="pick">
          <text class="pk">日期</text><text>{{ form.date }}</text><text class="arr">›</text>
        </view>
      </picker>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ensureLogin, getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { loadLocal, newLocalId, saveLocal, type LocalAccount } from '@/utils/localData';

interface Account {
  id: string;
  type: 'income' | 'expense';
  amount: string | number;
  category: string;
  remark: string;
  occurredAt: string;
}

const list = ref<Account[]>([]);
const income = ref(0);
const expense = ref(0);
const balance = ref(0);
const tab = ref<'expense' | 'income'>('expense');
const sheet = ref(false);

const categories = ['餐饮', '交通', '购物', '居家', '医疗', '娱乐', '其他'];
const form = ref({
  id: undefined as string | undefined,
  type: 'expense' as 'income' | 'expense',
  amount: '',
  category: '餐饮',
  remark: '',
  date: '',
});

const filtered = computed(() => list.value.filter((a) => a.type === tab.value));

function money(v: number | string) {
  return Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
/** 柱状图顶上的短金额：去尾零（88 → 88，88.5 → 88.5，1234 → 1.2k） */
function shortMoney(v: number) {
  if (v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, '')}w`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(v * 100) / 100);
}
function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 本月每日支出柱状图（PRD §4.4），条数多时横向滚动 */
const dailyBars = computed(() => {
  const now = new Date();
  const byDay = new Map<number, number>();
  for (const a of list.value) {
    if (a.type !== 'expense') continue;
    const d = new Date(a.occurredAt);
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
    byDay.set(d.getDate(), (byDay.get(d.getDate()) || 0) + Number(a.amount));
  }
  const days = [...byDay.entries()].sort((x, y) => x[0] - y[0]);
  const max = Math.max(...days.map(([, v]) => v), 1);
  return days.map(([day, v]) => ({ day, v, h: Math.max(8, Math.round((v / max) * 56)) }));
});

const maxDaily = computed(() => Math.max(...dailyBars.value.map((b) => b.v), 0));

function localSummary(items: Account[]) {
  const now = new Date();
  let inc = 0;
  let exp = 0;
  for (const a of items) {
    const d = new Date(a.occurredAt);
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
    if (a.type === 'income') inc += Number(a.amount);
    else exp += Number(a.amount);
  }
  return { income: inc, expense: exp, balance: inc - exp };
}

async function load() {
  if (!getToken()) {
    // 游客态：读本地暂存并现场算汇总
    list.value = loadLocal<LocalAccount>('accounts');
    const s = localSummary(list.value);
    income.value = s.income;
    expense.value = s.expense;
    balance.value = s.balance;
    return;
  }
  try {
    const [acc, sum] = await Promise.all([
      request<{ list: Account[] }>('/accounts'),
      request<{ income: number; expense: number; balance: number }>('/accounts/summary'),
    ]);
    list.value = acc.list;
    income.value = sum.income;
    expense.value = sum.expense;
    balance.value = sum.balance;
  } catch { /* 静默 */ }
}

function goLogin() {
  void ensureLogin('登录后数据同步到云端，换设备不丢');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function openNew() {
  form.value = { id: undefined, type: 'expense', amount: '', category: '餐饮', remark: '', date: todayStr() };
  sheet.value = true;
}

function openEdit(a: Account) {
  form.value = {
    id: a.id,
    type: a.type,
    amount: String(a.amount),
    category: a.category,
    remark: a.remark,
    date: (a.occurredAt || '').slice(0, 10) || todayStr(),
  };
  sheet.value = true;
}

function onDate(e: any) {
  form.value.date = e.detail.value;
}

async function save() {
  const amount = Number(form.value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    uni.showToast({ title: '请输入金额', icon: 'none' });
    return;
  }

  const payload = {
    type: form.value.type,
    amount,
    category: form.value.category,
    remark: form.value.remark,
    occurredAt: form.value.date || todayStr(),
  };

  if (!getToken()) {
    const local = loadLocal<LocalAccount>('accounts');
    if (form.value.id) {
      const hit = local.find((a) => a.id === form.value.id);
      if (hit) Object.assign(hit, payload);
    } else {
      local.unshift({ id: newLocalId(), ...payload });
    }
    saveLocal('accounts', local);
    sheet.value = false;
    await load();
    return;
  }

  try {
    if (form.value.id) {
      await request(`/accounts/${form.value.id}`, { method: 'PATCH', data: payload });
    } else {
      await request('/accounts', { method: 'POST', data: payload });
    }
    sheet.value = false;
    await load();
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function remove(a: Account) {
  if (!getToken()) {
    list.value = list.value.filter((x) => x.id !== a.id);
    saveLocal('accounts', list.value);
    const s = localSummary(list.value);
    income.value = s.income;
    expense.value = s.expense;
    balance.value = s.balance;
    return;
  }
  try {
    await request(`/accounts/${a.id}`, { method: 'DELETE' });
    list.value = list.value.filter((x) => x.id !== a.id);
    await load();
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

.chart {
  margin-top: 10px; padding: 13px 14px 10px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.chead { display: flex; align-items: baseline; justify-content: space-between; }
.ct { font-size: 12px; font-weight: 600; }
.cmax { font-size: 9.5px; color: var(--muted); }
.cbody { margin-top: 10px; white-space: nowrap; }
.bars { display: inline-flex; align-items: flex-end; gap: 8px; }
.bar-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.bval { font-size: 8px; color: var(--muted); }
.bar { width: 14px; border-radius: 4px 4px 2px 2px; background: var(--grad); }
.bday { font-size: 9px; color: var(--muted); }

.sum {
  padding: 16px; border-radius: var(--radius);
  background: var(--grad); color: #fff;
  box-shadow: 0 10px 24px rgba(59, 91, 219, .22);
}
.sk { font-size: 11px; opacity: .82; }
.sv { margin-top: 8px; font-size: 28px; font-weight: 600; letter-spacing: .5px; }
.srow { display: flex; gap: 18px; margin-top: 10px; font-size: 10.5px; opacity: .88; }

.seg { display: flex; gap: 6px; margin: 16px 0 8px; }
.s { padding: 6px 14px; border-radius: 999px; font-size: 11px; color: var(--muted); }
.s.on { background: var(--accent); color: #fff; }

.list { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0 14px; }
.row { display: flex; align-items: center; gap: 10px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: none; }
.rleft { flex: 1; min-width: 0; }
.rcat { font-size: 12.5px; }
.rremark { display: block; margin-top: 3px; font-size: 10px; color: var(--muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.rright { text-align: right; }
.ramt { font-size: 13px; font-weight: 600; color: var(--fg); }
.ramt.income { color: #37B24D; }
.rdate { display: block; margin-top: 3px; font-size: 9.5px; color: var(--muted); }
.rdel { font-size: 11px; color: var(--muted); padding: 2px 4px; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 70px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; color: var(--muted); }

.fab {
  position: fixed; right: 20px; bottom: calc(28px + env(safe-area-inset-bottom));
  width: 50px; height: 50px; border-radius: 50%;
  background: var(--grad); color: #fff; font-size: 24px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 20px rgba(59, 91, 219, .3); z-index: 80;
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

.types { display: flex; gap: 8px; margin-top: 16px; }
.t {
  flex: 1; padding: 9px 0; text-align: center;
  border-radius: 10px; border: 1px solid var(--line);
  font-size: 12px; color: var(--muted);
}
.t.on { background: rgba(59, 91, 219, .08); border-color: var(--accent); color: var(--accent); font-weight: 600; }

.amtrow { display: flex; align-items: baseline; gap: 6px; margin-top: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.cny { font-size: 20px; color: var(--muted); }
.amt { flex: 1; font-size: 26px; font-weight: 600; }
.ph { color: var(--muted); }

.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.chip { padding: 6px 13px; border-radius: 999px; border: 1px solid var(--line); font-size: 11px; color: var(--muted); }
.chip.on { background: var(--accent); border-color: transparent; color: #fff; }

.ipt {
  margin-top: 14px; height: 38px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12px;
}
.pick {
  display: flex; align-items: center; gap: 10px;
  margin-top: 10px; height: 42px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12.5px;
}
.pk { width: 34px; font-size: 11px; color: var(--muted); }
.arr { margin-left: auto; font-size: 16px; color: var(--muted); }
</style>
