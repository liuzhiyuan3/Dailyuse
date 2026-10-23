<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后查看群组" subtitle="群组待办需要成员身份" />

    <view v-else-if="!group" class="empty">
      <text class="eico">👥</text>
      <text class="et">{{ error || '加载中…' }}</text>
    </view>

    <block v-else>
      <!-- 头部：标题 + 成员头像行（无大卡片） -->
      <view class="hstack">
        <view class="hrow">
          <text class="hname">{{ group.name }}</text>
          <text class="hmeta">本周 {{ doneCount }} / {{ group.todos.length }}</text>
        </view>
        <view class="avrow">
          <view
            v-for="(m, i) in group.members"
            :key="m.id"
            class="av"
            :style="{ background: palette[i % palette.length] }"
            @longpress="onMemberLongPress(m)"
          >
            {{ m.user?.nickname ? m.user.nickname.slice(0, 1) : i + 1 }}
          </view>
          <view class="avadd" @tap="showInvite">＋</view>
          <view class="hspace" />
          <view class="hact" @tap="openMenu">
            <image class="hact-icon" src="/static/group-tools/settings.png" mode="aspectFit" />
            <text class="hact-text">管理</text>
          </view>
        </view>
      </view>

      <!-- 分段控件 -->
      <!-- 工具切换：图标 + 文字，选中蓝底白字 -->
      <scroll-view scroll-x class="toolbar" :show-scrollbar="false">
        <view
          v-for="t in tools"
          :key="t.key"
          class="ttab"
          :class="{ on: tab === t.key }"
          @tap="tab = t.key"
        >
          <image class="timg" :src="tabIcon(t)" mode="aspectFit" />
          <text class="ttext">{{ t.label }}</text>
        </view>
      </scroll-view>

      <!-- 待办 -->
      <view v-if="currentKind === 'todo'" class="pane">
        <view class="card">
          <view
            v-for="x in group.todos"
            :key="x.id"
            class="item"
            :class="{ done: x.done }"
            @tap="toggleTodo(x)"
            @longpress="removeTodo(x)"
          >
            <view class="ck"><text v-if="x.done">✓</text></view>
            <text class="tx">{{ x.title }}</text>
          </view>
          <view v-if="!group.todos.length" class="emptyline">还没有集体待办</view>
        </view>
        <view class="addline">
          <input v-model="todoDraft" class="ainput" placeholder="添加一件集体待办" @confirm="addTodo" />
          <view class="aplus" @tap="addTodo">＋</view>
        </view>
      </view>

      <!-- 清单 -->
      <!-- 清单 / 公告 / 菜谱 / 链接 / 快递 / 值日 / 愿望 / 自定义 -->
      <view v-if="isItemKind" class="pane">
        <view class="card">
          <view
            v-for="x in activeItems"
            :key="x.id"
            class="item"
            :class="{ done: x.done }"
            @tap="toggleItem(x)"
            @longpress="removeItem(x)"
          >
            <view class="ck"><text v-if="x.done">✓</text></view>
            <view class="ibody">
              <text class="tx">{{ x.content }}</text>
              <text v-if="x.note" class="inote">{{ x.note }}</text>
            </view>
          </view>
          <view v-if="!activeItems.length" class="emptyline">
            {{ currentKind === 'notice' ? '还没有公告' : '还是空的，加一项' }}
          </view>
        </view>

        <view class="addline">
          <input v-model="itemDraft" class="ainput" :placeholder="currentPh" @confirm="addItem" />
          <view class="aplus" @tap="addItem">＋</view>
        </view>
        <view v-if="currentNotePh" class="addline note">
          <input v-model="itemNote" class="ainput" :placeholder="currentNotePh" @confirm="addItem" />
        </view>
      </view>

      <!-- 记账 -->
      <view v-if="currentKind === 'expense'" class="pane">
        <view class="card">
          <view class="money">
            <text class="cur">¥</text>
            <text class="amt num">{{ money(summary.total) }}</text>
            <text class="note">本群总支出</text>
          </view>
          <view class="split">
            <text>我垫付 ¥{{ money(summary.myPaid) }}</text>
            <text>{{ balanceText }}</text>
          </view>
        </view>

        <view class="card">
          <view v-for="e in expenses" :key="e.id" class="item" @longpress="removeExpense(e)">
            <text class="tx">{{ e.title }}</text>
            <text class="who">¥{{ money(e.amount) }} · {{ brief(e.payerId) }}</text>
          </view>
          <view v-if="!expenses.length" class="emptyline">还没有记录</view>
        </view>

        <view class="card">
          <input v-model="exTitle" class="ainput block" placeholder="用途，如 超市采购" />
          <input v-model="exAmount" class="ainput block" type="digit" placeholder="金额" />
          <view class="abtn" @tap="addExpense">记一笔（我付）</view>
        </view>
      </view>

      <!-- 活动 -->
      <view v-if="currentKind === 'event'" class="pane">
        <view v-for="e in events" :key="e.id" class="card" @longpress="removeEvent(e)">
          <view class="evt">
            <view class="day">
              <view class="d1">{{ monthOf(e.startAt) }} 月</view>
              <view class="d2">{{ dayOf(e.startAt) }}</view>
            </view>
            <view class="info">
              <view class="et">{{ e.title }}</view>
              <view class="es">{{ timeOf(e.startAt) }}{{ e.place ? ' · ' + e.place : '' }}</view>
            </view>
          </view>
        </view>
        <view v-if="!events.length" class="card"><view class="emptyline">还没有活动</view></view>

        <view class="card">
          <input v-model="evTitle" class="ainput block" placeholder="活动名称" />
          <picker mode="date" :value="evDate" @change="onEvDate">
            <view class="pickrow">
              <text class="pk">日期</text><text>{{ evDate }}</text><text class="arr">›</text>
            </view>
          </picker>
          <input v-model="evPlace" class="ainput block" placeholder="地点（可选）" />
          <view class="abtn" @tap="addEvent">添加活动</view>
        </view>
      </view>

      <!-- 计分 -->
      <view v-if="currentKind === 'score'" class="pane">
        <view class="card">
          <view v-for="s in scores" :key="s.userId" class="srow">
            <text class="sname">{{ s.nickname || '成员' }}</text>
            <text class="snum num">{{ s.score }}</text>
            <view class="sbtns">
              <view class="sbtn plus" @tap="addScore(s.userId, 1)">＋1</view>
              <view class="sbtn" @tap="addScore(s.userId, -1)">－1</view>
            </view>
          </view>
          <view v-if="!scores.length" class="emptyline">还没有成员</view>
        </view>
        <view class="emptyline">点 ＋1 / －1 快速计分，可记家务、游戏</view>
      </view>

      <!-- 点餐 -->
      <view v-if="currentKind === 'order'" class="pane">
        <view class="card">
          <view
            v-for="o in orders"
            :key="o.id"
            class="item"
            :class="{ done: o.done }"
            @tap="toggleOrder(o)"
            @longpress="removeOrder(o)"
          >
            <view class="ck"><text v-if="o.done">✓</text></view>
            <text class="tx">{{ o.content }}</text>
          </view>
          <view v-if="!orders.length" class="emptyline">还没人点</view>
        </view>
        <view class="addline">
          <input v-model="orderDraft" class="ainput" placeholder="想吃什么" @confirm="addOrder" />
          <view class="aplus" @tap="addOrder">＋</view>
        </view>
      </view>

      <!-- 工具编辑 -->
      <view v-if="showTools" class="mask" @tap="showTools = false" />
      <view class="sheet" :class="{ open: showTools }">
        <view class="shead">
          <text class="stitle">编辑工具</text>
          <text class="sdone" @tap="saveTools">保存</text>
        </view>
        <view class="hint">点 ✕ 删除，也可以自己新建一个工具</view>

        <view class="toolgrid">
          <view v-for="t in draftTools" :key="t.key" class="toolitem on">
            <text class="tlabel">{{ t.label }}</text>
            <text class="tdel" @tap="removeTool(t.key)">✕</text>
          </view>
        </view>

        <view v-if="availablePresets.length" class="presets">
          <view
            v-for="p in availablePresets"
            :key="p.key"
            class="pchip"
            @tap="addPreset(p)"
          >＋ {{ p.label }}</view>
        </view>

        <view class="customrow">
          <input
            v-model="newToolName"
            class="ainput"
            placeholder="自定义工具名，如「家务表」"
            @confirm="addCustomTool"
          />
          <view class="abtn small" @tap="addCustomTool">新建</view>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { getToken, getUserId, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

interface Member { id: string; role: string; user: { id: string; nickname: string | null; avatarUrl: string | null } }
interface GroupTodo { id: string; title: string; done: boolean }
interface GroupDetail {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  tools: string;
  members: Member[];
  todos: GroupTodo[];
}
interface ListItem { id: string; content: string; done: boolean; toolKey: string }
interface ToolDef { key: string; label: string; kind: string; ph?: string; notePh?: string }
interface Expense { id: string; title: string; amount: string | number; payerId: string }
interface GroupEvent { id: string; title: string; startAt: string; place: string }
interface OrderItem { id: string; content: string; done: boolean }
interface ScoreRow { userId: string; nickname: string | null; score: number }
interface ExpenseSummary {
  total: number;
  memberCount: number;
  myPaid: number;
  myShare: number;
  balance: number;
}

const PRESETS: ToolDef[] = [
  { key: 'todo', label: '待办', kind: 'todo', ph: '添加一件集体待办' },
  { key: 'list', label: '清单', kind: 'list', ph: '添加一项，全家同步' },
  { key: 'expense', label: '记账', kind: 'expense' },
  { key: 'event', label: '活动', kind: 'event' },
  { key: 'score', label: '计分', kind: 'score' },
  { key: 'order', label: '点餐', kind: 'order', ph: '想吃什么' },
  { key: 'notice', label: '公告', kind: 'notice', ph: '公告内容' },
  { key: 'recipe', label: '菜谱', kind: 'recipe', ph: '菜名', notePh: '做法或备注' },
  { key: 'link', label: '链接', kind: 'link', ph: '名称', notePh: '链接地址' },
  { key: 'parcel', label: '快递', kind: 'parcel', ph: '物品', notePh: '快递单号' },
  { key: 'duty', label: '值日', kind: 'duty', ph: '谁做什么' },
  { key: 'wish', label: '愿望', kind: 'wish', ph: '想要什么' },
];
const DEFAULT_TOOLS = PRESETS.slice(0, 4);

/** 内容存在通用条目表里的工具类型 */
const ITEM_KINDS = ['list', 'notice', 'recipe', 'link', 'parcel', 'duty', 'wish', 'custom'];

/** 兼容两种存法：JSON 数组（新）与逗号分隔（旧） */
function parseTools(raw: string): ToolDef[] {
  if (!raw) return DEFAULT_TOOLS;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length && arr[0]?.key) return arr as ToolDef[];
  } catch {
    /* 旧格式，走下面 */
  }
  const map = Object.fromEntries(PRESETS.map((t) => [t.key, t]));
  const out = String(raw)
    .split(',')
    .filter(Boolean)
    .map((k) => map[k] || { key: k, label: k, kind: 'custom' });
  return out.length ? out : DEFAULT_TOOLS;
}

const palette = ['#5C7CFA', '#22B8CF', '#51CF66', '#F59F00', '#AE3EC9'];

const gid = ref('');
const inviteFromLink = ref('');
const group = ref<GroupDetail | null>(null);
const error = ref('');
const tab = ref('todo');

const items = ref<ListItem[]>([]);
const expenses = ref<Expense[]>([]);
const events = ref<GroupEvent[]>([]);
const orders = ref<OrderItem[]>([]);
const scores = ref<ScoreRow[]>([]);
const summary = ref<ExpenseSummary>({ total: 0, memberCount: 0, myPaid: 0, myShare: 0, balance: 0 });

const showTools = ref(false);
const draftTools = ref<ToolDef[]>([]);
const newToolName = ref('');

const todoDraft = ref('');
const itemDraft = ref('');
const itemNote = ref('');
const orderDraft = ref('');
const exTitle = ref('');
const exAmount = ref('');
const evTitle = ref('');
const evPlace = ref('');
const evDate = ref('');

const tools = computed(() => parseTools(group.value?.tools || ''));
const currentKind = computed(() => tools.value.find((t) => t.key === tab.value)?.kind || 'todo');
const currentPreset = computed(() => PRESETS.find((p) => p.key === tab.value));
const currentPh = computed(() => currentPreset.value?.ph || '添加一项');
const currentNotePh = computed(() => currentPreset.value?.notePh || '');
const isItemKind = computed(() => ITEM_KINDS.includes(currentKind.value));
const availablePresets = computed(() =>
  PRESETS.filter((p) => !tools.value.some((t) => t.key === p.key))
);
const activeItems = computed(() => items.value.filter((i) => i.toolKey === tab.value));

/** 工具图标：预设用 key，自定义用 custom */
function iconOf(t: ToolDef) {
  return PRESETS.some((p) => p.key === t.key) ? t.key : 'custom';
}

function tabIcon(t: ToolDef) {
  const suffix = tab.value === t.key ? '-white' : '';
  return `/static/group-tools/${iconOf(t)}${suffix}.png`;
}

const doneCount = computed(() => group.value?.todos.filter((t) => t.done).length ?? 0);

const balanceText = computed(() => {
  const b = summary.value.balance;
  if (Math.abs(b) < 0.01) return '已结清';
  return b > 0 ? `待收 ¥${b.toFixed(2)}` : `待付 ¥${Math.abs(b).toFixed(2)}`;
});

function money(v: number | string) {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function brief(payerId: string) {
  if (payerId === getUserId()) return '我';
  const idx = group.value?.members.findIndex((m) => m.user?.id === payerId) ?? -1;
  return idx >= 0 ? `成员${idx + 1}` : '成员';
}

function monthOf(iso: string) {
  return new Date(iso).getMonth() + 1;
}
function dayOf(iso: string) {
  return new Date(iso).getDate();
}
function timeOf(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function load() {
  if (!gid.value) {
    error.value = '群组不存在';
    return;
  }
  if (!getToken()) {
    error.value = '请先登录';
    return;
  }

  try {
    const [g, i, ex, ev, sc, od] = await Promise.all([
      request<GroupDetail>(`/groups/${gid.value}`),
      request<{ list: ListItem[] }>(`/groups/${gid.value}/items`),
      request<{ list: Expense[]; summary: ExpenseSummary }>(`/groups/${gid.value}/expenses`),
      request<{ list: GroupEvent[] }>(`/groups/${gid.value}/events`),
      request<{ totals: ScoreRow[] }>(`/groups/${gid.value}/scores`),
      request<{ list: OrderItem[] }>(`/groups/${gid.value}/orders`),
    ]);
    group.value = g;
    items.value = i.list;
    expenses.value = ex.list;
    summary.value = ex.summary;
    events.value = ev.list;
    scores.value = sc.totals;
    orders.value = od.list;

    // 当前 tab 不在已启用工具里，回退到第一个
    const defs = parseTools(g.tools || '');
    if (!defs.some((t) => t.key === tab.value)) tab.value = defs[0]?.key || 'todo';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

let joined = false;
async function boot() {
  if (!gid.value) {
    error.value = '群组不存在';
    return;
  }
  if (!getToken()) {
    error.value = '请先登录';
    return;
  }
  if (inviteFromLink.value && !joined) {
    joined = true;
    try {
      await request('/groups/join', { method: 'POST', data: { inviteCode: inviteFromLink.value } });
    } catch {
      /* 已加入或邀请码无效 */
    }
  }
  await load();
}

/* ---------- 待办 ---------- */
async function addTodo() {
  const title = todoDraft.value.trim();
  if (!title || !group.value) return;
  try {
    const created = await request<GroupTodo>(`/groups/${group.value.id}/todos`, {
      method: 'POST',
      data: { title },
    });
    group.value.todos = [{ ...created, done: false }, ...group.value.todos];
    todoDraft.value = '';
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function toggleTodo(t: GroupTodo) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/todos/${t.id}`, { method: 'PATCH', data: { done: !t.done } });
    t.done = !t.done;
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function removeTodo(t: GroupTodo) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/todos/${t.id}`, { method: 'DELETE' });
    group.value.todos = group.value.todos.filter((x) => x.id !== t.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

/* ---------- 清单 ---------- */
async function addItem() {
  const content = itemDraft.value.trim();
  if (!content || !group.value) return;
  try {
    const created = await request<ListItem>(`/groups/${group.value.id}/items`, {
      method: 'POST',
      data: { content, toolKey: tab.value, note: itemNote.value.trim() },
    });
    items.value = [{ ...created, done: false }, ...items.value];
    itemDraft.value = '';
    itemNote.value = '';
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function toggleItem(x: ListItem) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/items/${x.id}`, { method: 'PATCH', data: { done: !x.done } });
    x.done = !x.done;
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function removeItem(x: ListItem) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/items/${x.id}`, { method: 'DELETE' });
    items.value = items.value.filter((i) => i.id !== x.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

/* ---------- 记账 ---------- */
async function addExpense() {
  const title = exTitle.value.trim();
  const amount = Number(exAmount.value);
  if (!title || !group.value) return;
  if (!Number.isFinite(amount) || amount <= 0) {
    uni.showToast({ title: '填写金额', icon: 'none' });
    return;
  }
  try {
    await request(`/groups/${group.value.id}/expenses`, {
      method: 'POST',
      data: { title, amount },
    });
    exTitle.value = '';
    exAmount.value = '';
    await load();
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function removeExpense(e: Expense) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/expenses/${e.id}`, { method: 'DELETE' });
    await load();
  } catch (err) {
    uni.showToast({ title: (err as Error).message, icon: 'none' });
  }
}

/* ---------- 活动 ---------- */
function onEvDate(e: any) {
  evDate.value = e.detail.value;
}

async function addEvent() {
  const title = evTitle.value.trim();
  if (!title || !group.value) return;
  if (!evDate.value) {
    uni.showToast({ title: '选个日期', icon: 'none' });
    return;
  }
  try {
    await request(`/groups/${group.value.id}/events`, {
      method: 'POST',
      data: { title, startAt: `${evDate.value}T09:00:00`, place: evPlace.value.trim() },
    });
    evTitle.value = '';
    evPlace.value = '';
    await load();
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function removeEvent(e: GroupEvent) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/events/${e.id}`, { method: 'DELETE' });
    events.value = events.value.filter((x) => x.id !== e.id);
  } catch (err) {
    uni.showToast({ title: (err as Error).message, icon: 'none' });
  }
}

/* ---------- 计分 ---------- */
async function addScore(userId: string, delta: number) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/scores`, {
      method: 'POST',
      data: { userId, delta },
    });
    const row = scores.value.find((s) => s.userId === userId);
    if (row) row.score += delta;
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

/* ---------- 点餐 ---------- */
async function addOrder() {
  const content = orderDraft.value.trim();
  if (!content || !group.value) return;
  try {
    const created = await request<OrderItem>(`/groups/${group.value.id}/orders`, {
      method: 'POST',
      data: { content },
    });
    orders.value = [{ ...created, done: false }, ...orders.value];
    orderDraft.value = '';
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function toggleOrder(o: OrderItem) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/orders/${o.id}`, {
      method: 'PATCH',
      data: { done: !o.done },
    });
    o.done = !o.done;
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function removeOrder(o: OrderItem) {
  if (!group.value) return;
  try {
    await request(`/groups/${group.value.id}/orders/${o.id}`, { method: 'DELETE' });
    orders.value = orders.value.filter((x) => x.id !== o.id);
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

/* ---------- 工具选择 ---------- */
function openToolPicker() {
  draftTools.value = tools.value.map((t) => ({ ...t }));
  newToolName.value = '';
  showTools.value = true;
}

function addPreset(p: ToolDef) {
  if (draftTools.value.some((t) => t.key === p.key)) return;
  draftTools.value.push({ ...p });
}

function removeTool(key: string) {
  if (draftTools.value.length <= 1) {
    uni.showToast({ title: '至少保留一个工具', icon: 'none' });
    return;
  }
  draftTools.value = draftTools.value.filter((t) => t.key !== key);
}

function addCustomTool() {
  const label = newToolName.value.trim();
  if (!label) {
    uni.showToast({ title: '填个名字', icon: 'none' });
    return;
  }
  if (draftTools.value.length >= 12) {
    uni.showToast({ title: '最多 12 个工具', icon: 'none' });
    return;
  }
  draftTools.value.push({
    key: `c-${Date.now().toString(36)}`,
    label: label.slice(0, 20),
    kind: 'custom',
  });
  newToolName.value = '';
}

async function saveTools() {
  if (!group.value) return;
  try {
    const d = await request<{ tools: ToolDef[] }>(`/groups/${group.value.id}/tools`, {
      method: 'PATCH',
      data: { tools: draftTools.value },
    });
    group.value.tools = JSON.stringify(d.tools);
    if (!d.tools.some((t) => t.key === tab.value)) tab.value = d.tools[0]?.key || 'todo';
    showTools.value = false;
    uni.showToast({ title: '已更新工具', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

/* ---------- 群管理 ---------- */
function isOwner() {
  return Boolean(group.value && getUserId() && group.value.ownerId === getUserId());
}

function showInvite() {
  const code = group.value?.inviteCode ?? '';
  uni.showModal({
    title: '邀请成员',
    content: `邀请码：${code}\n复制后发给家人或朋友`,
    confirmText: '复制',
    success: (res) => {
      if (res.confirm) {
        uni.setClipboardData({
          data: code,
          success: () => uni.showToast({ title: '邀请码已复制', icon: 'none' }),
        });
      }
    },
  });
}

function openMenu() {
  if (!group.value) return;
  const owner = isOwner();
  const action = owner ? '解散群组' : '退出群组';

  uni.showActionSheet({
    itemList: ['选择工具', '分享给好友', '复制邀请码', action],
    success: async ({ tapIndex }) => {
      if (tapIndex === 0) {
        openToolPicker();
        return;
      }
      if (tapIndex === 1) {
        uni.showShareMenu({ withShareTicket: true });
        uni.showToast({ title: '点右上角「···」分享', icon: 'none' });
        return;
      }
      if (tapIndex === 2) {
        showInvite();
        return;
      }

      const res = await new Promise<{ confirm: boolean }>((resolve) => {
        uni.showModal({
          title: action,
          content: owner ? '解散后群内数据将一并删除，不可恢复。' : '退出后需要重新邀请才能加入。',
          success: (r) => resolve({ confirm: r.confirm }),
        });
      });
      if (!res.confirm) return;

      try {
        if (owner) await request(`/groups/${group.value.id}`, { method: 'DELETE' });
        else await request(`/groups/${group.value.id}/leave`, { method: 'DELETE' });
        uni.showToast({ title: owner ? '已解散' : '已退出', icon: 'none' });
        setTimeout(() => uni.navigateBack(), 600);
      } catch (e) {
        uni.showToast({ title: (e as Error).message, icon: 'none' });
      }
    },
  });
}

function onMemberLongPress(m: Member) {
  if (!group.value || !isOwner() || m.user?.id === getUserId()) return;

  uni.showActionSheet({
    itemList: [`移除 ${m.user?.nickname || '该成员'}`],
    success: async () => {
      try {
        await request(`/groups/${group.value!.id}/members/${m.user.id}`, { method: 'DELETE' });
        group.value!.members = group.value!.members.filter((x) => x.id !== m.id);
        uni.showToast({ title: '已移除', icon: 'none' });
      } catch (e) {
        uni.showToast({ title: (e as Error).message, icon: 'none' });
      }
    },
  });
}

onLoad((q) => {
  const params = q as Record<string, string>;
  gid.value = params?.id || '';
  inviteFromLink.value = params?.invite || '';
  evDate.value = todayStr();
});

const { logged } = useAuthGate(boot);

onShareAppMessage(() => ({
  title: group.value ? `一起来「${group.value.name}」记待办` : '一起用「日常使用」',
  path: `/pages/group/detail?id=${gid.value}&invite=${group.value?.inviteCode ?? ''}`,
}));
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 2px 18px 24px;
  box-sizing: border-box;
  background: var(--bg);
}

/* ===== 头部（无大卡） ===== */
.hstack { padding: 2px 0 10px; }
.hrow { display: flex; align-items: baseline; gap: 8px; }
.hname { font-size: 17px; font-weight: 600; letter-spacing: .3px; color: var(--fg); }
.hmeta { font-size: 10px; color: var(--muted); }
.avrow { display: flex; align-items: center; margin-top: 9px; }
.av {
  width: 26px; height: 26px; border-radius: 50%; margin-right: -7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 9.5px; color: #fff; font-weight: 600;
  border: 1.5px solid var(--bg);
}
.avadd {
  width: 26px; height: 26px; border-radius: 50%; margin-left: 13px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--muted);
  border: 1px dashed var(--line);
}
.hspace { flex: 1; }
.hact {
  display: inline-flex; align-items: center; gap: 4px;
  height: 30px; padding: 0 11px;
  border-radius: 15px;
  background: rgba(59, 91, 219, .1);
  border: 1px solid rgba(59, 91, 219, .18);
}
.hact-icon { width: 13px; height: 13px; }
.hact-text { font-size: 11px; font-weight: 600; color: var(--accent); }

/* ===== 工具切换：横向滚动，选中蓝底白字 ===== */
.toolbar { white-space: nowrap; margin-top: 12px; }
.ttab {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 8px 13px; margin-right: 7px;
  border-radius: 999px;
  background: var(--card); border: 1px solid var(--line);
  color: var(--muted);
}
.ttab.on {
  background: var(--accent); border-color: transparent;
  box-shadow: 0 4px 10px rgba(59, 91, 219, .28);
}
.timg { width: 14px; height: 14px; }
.ttext { font-size: 11.5px; }
.ttab.on .ttext { color: #fff; font-weight: 600; }

/* ===== 内容 ===== */
.pane { margin-top: 14px; }
.card {
  background: var(--card); border: 1px solid var(--line);
  border-radius: 14px; box-shadow: 0 4px 14px rgba(59, 91, 219, .06);
  padding: 12px 13px;
}
.card + .card { margin-top: 9px; }

.item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 0; border-bottom: 1px solid var(--line);
  font-size: 11.5px;
}
.item:last-child { border-bottom: none; }
.ck {
  width: 16px; height: 16px; border-radius: 5px; flex: 0 0 16px;
  border: 1.4px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; color: #fff;
}
.item.done .ck { background: var(--accent); border-color: transparent; }
.item.done .tx { color: var(--muted); text-decoration: line-through; }
.tx { flex: 1; color: var(--fg); }
.ibody { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.inote {
  margin-top: 3px; font-size: 9.5px; color: var(--muted);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.who { font-size: 9px; color: var(--muted); }

.money { display: flex; align-items: baseline; gap: 4px; }
.cur { font-size: 11px; color: var(--muted); }
.amt { font-size: 24px; font-weight: 600; color: var(--fg); }
.note { margin-left: auto; font-size: 9.5px; color: var(--muted); }
.split { display: flex; gap: 14px; margin-top: 8px; font-size: 10px; color: var(--muted); }

.evt { display: flex; gap: 12px; align-items: center; }
.day { width: 44px; flex: 0 0 44px; text-align: center; background: #EEF2FC; border-radius: 10px; padding: 6px 0; }
.d1 { font-size: 9px; color: var(--muted); }
.d2 { margin-top: 2px; font-size: 16px; font-weight: 600; color: var(--accent); }
.info { flex: 1; }
.et { font-size: 12.5px; font-weight: 600; color: var(--fg); }
.es { margin-top: 4px; font-size: 10px; color: var(--muted); }

.emptyline { padding: 6px 0; font-size: 11px; color: var(--muted); }

/* ===== 添加行 ===== */
.addline { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.addline.note { margin-top: 8px; }
.addline.note .ainput { font-size: 10.5px; }
.ainput {
  flex: 1; height: 38px; padding: 0 14px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: 999px; font-size: 11.5px; box-sizing: border-box;
}
.ainput.block { width: 100%; margin-bottom: 8px; border-radius: 10px; }
.aplus {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--grad); color: #fff; font-size: 18px;
  display: flex; align-items: center; justify-content: center;
}
.abtn {
  margin-top: 2px; padding: 10px 0; text-align: center;
  border-radius: 10px; background: var(--grad); color: #fff;
  font-size: 12px; font-weight: 600;
}
.pickrow {
  display: flex; align-items: center; gap: 10px;
  height: 40px; padding: 0 12px; margin-bottom: 8px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12px;
}
.pk { width: 34px; font-size: 11px; color: var(--muted); }
.arr { margin-left: auto; font-size: 16px; color: var(--muted); }

/* ===== 计分 ===== */
.srow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.srow:last-child { border-bottom: none; }
.sname { flex: 1; font-size: 11.5px; color: var(--fg); }
.snum { min-width: 34px; text-align: right; font-size: 16px; font-weight: 600; color: var(--accent); }
.sbtns { display: flex; gap: 6px; }
.sbtn {
  width: 34px; height: 26px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--bg);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: var(--muted);
}
.sbtn.plus { background: rgba(59, 91, 219, .1); border-color: transparent; color: var(--accent); font-weight: 600; }

/* ===== 工具选择 ===== */
.mask { position: fixed; inset: 0; background: rgba(22, 32, 58, .32); z-index: 90; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--card); border-radius: 22px 22px 0 0;
  padding: 20px 18px calc(26px + env(safe-area-inset-bottom));
  transform: translateY(110%);
  transition: transform .32s cubic-bezier(.2, .85, .25, 1);
  box-shadow: 0 -12px 34px rgba(0, 0, 0, .14);
}
.sheet.open { transform: translateY(0); }
.shead { display: flex; justify-content: space-between; align-items: baseline; }
.stitle { font-size: 16px; font-weight: 600; color: var(--fg); }
.sdone { font-size: 12px; color: var(--accent); font-weight: 600; }
.hint { margin-top: 6px; font-size: 10px; color: var(--muted); }
.toolgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-top: 14px; }
.toolitem {
  position: relative;
  padding: 13px 4px; text-align: center; border-radius: 12px;
  border: 1px solid var(--line); background: var(--bg);
  font-size: 12px; color: var(--muted);
}
.toolitem.on {
  background: rgba(59, 91, 219, .08);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.tlabel { font-size: 12px; }
.tdel {
  position: absolute; top: 2px; right: 4px;
  font-size: 10px; color: var(--muted); padding: 2px 3px;
}
.presets { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.pchip {
  padding: 6px 12px; border-radius: 999px;
  border: 1px dashed var(--line); background: transparent;
  font-size: 10.5px; color: var(--muted);
}
.customrow { display: flex; gap: 8px; align-items: center; margin-top: 14px; }
.customrow .ainput { flex: 1; }
.abtn.small { width: 68px; padding: 9px 0; font-size: 11.5px; flex: 0 0 68px; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 90px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; color: var(--muted); }
</style>
