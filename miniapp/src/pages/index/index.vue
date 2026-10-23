<template>
  <view class="page" :style="{ paddingTop: topPadding + 'px' }">
    <view class="hero">
      <view class="hl">
        <view class="hello">晚上好</view>
        <view class="date">{{ today }}</view>
      </view>
      <view class="hr">
        <view class="edit" :class="{ on: editing }" @tap="toggleEdit">{{ editing ? '完成' : '编辑' }}</view>
      </view>
    </view>

    <view class="sec-title">
      <text>我的工具 · {{ activeTools.length }}</text>
      <text class="more">全部</text>
    </view>
    <view class="grid" :class="{ editing }">
      <view
        v-for="t in activeTools"
        :key="t.id"
        class="cell"
        hover-class="cell-hover"
        @tap="onToolTap(t)"
      >
        <view v-if="editing" class="minus" @tap.stop="removeTool(t.id)">–</view>
        <view class="ico-wrap">
          <image class="ico" :src="t.icon" mode="aspectFit" />
        </view>
        <text class="label">{{ t.name }}</text>
        <text v-if="t.id === 'todo' && todoCount > 0" class="badge">{{ todoCount }}</text>
      </view>
      <view v-if="editing" class="cell add" @tap="drawer = true">
        <text class="plus">＋</text>
        <text class="label">添加工具</text>
      </view>
    </view>

    <view class="sec-title">
      <text>今日概览</text>
      <text class="more">详情</text>
    </view>
    <view class="summary">
      <view class="sitem">
        <text class="k">待办</text>
        <view class="v num">{{ todoCount }}<text class="unit">件</text></view>
      </view>
      <view class="sdiv" />
      <view class="sitem">
        <text class="k">本月支出</text>
        <view class="v num">¥{{ monthExpense }}</view>
      </view>
      <view class="sdiv" />
      <view class="sitem">
        <text class="k">最近倒数</text>
        <view class="v num">{{ nearestDays }}<text class="unit">天</text></view>
      </view>
    </view>

    <view class="sec-title">
      <text>今天吃了什么</text>
      <text class="more" @tap="goFood">去记录</text>
    </view>
    <view class="foodrow" @tap="goFood">
      <view class="ficon">
        <image class="fimg" src="/static/tools/food.png" mode="aspectFit" />
      </view>
      <view class="fmain">
        <text class="ft">{{ foodToday }} 顿 · 想吃 {{ foodWant }} 个</text>
        <text class="fs">记下今天吃的，攒一份生活账</text>
      </view>
      <text class="farrow">›</text>
    </view>

    <view class="sec-title">
      <text>协作群组</text>
      <text class="more">管理</text>
    </view>
    <view v-if="!groupCards.length" class="gempty">还没有群组，登录后可创建，和朋友共享待办</view>
    <scroll-view scroll-x class="groups" :show-scrollbar="false">
      <view v-for="g in groupCards" :key="g.id" class="gcard" @tap="openGroup(g)">
        <view class="gtop">
          <text class="gname">{{ g.name }}</text>
          <text class="gsub">{{ g.sub }}</text>
        </view>
        <view class="gfoot">
          <view class="avs">
            <view v-for="m in g.members" :key="m.n" class="av" :style="{ background: m.c }">{{ m.n }}</view>
          </view>
          <text class="pct">{{ g.pct }}</text>
        </view>
      </view>
      <view class="gadd" @tap="createGroup">
        <text class="gplus">＋</text>
        <text>创建群组</text>
      </view>
    </scroll-view>

    <view class="sec-title">
      <text>动态</text>
      <text class="more">全部</text>
    </view>
    <view v-if="!events.length" class="feed">
      <view class="fempty">{{ logged ? '最近 7 天没有群组动态' : '登录后查看群组动态' }}</view>
    </view>
    <view v-else class="feed">
      <view v-for="e in events" :key="e.id" class="fitem">
        <view class="fdot" :class="{ gray: e.done }" />
        <view class="ftxt">
          <text class="fb">{{ e.groupName }}</text> · {{ e.title }}{{ e.done ? ' 已完成' : ' 新增' }}
        </view>
        <text class="ftime">{{ ago(e.at) }}</text>
      </view>
    </view>

    <view class="bottom-gap" />

    <!-- 工具抽屉 -->
    <view v-if="drawer" class="mask" @tap="drawer = false" />
    <view class="drawer" :class="{ open: drawer }">
      <view class="dhead">
        <text class="dt">选择工具</text>
        <text class="done" @tap="drawer = false">完成</text>
      </view>
      <view class="dsub">点一下加入或移除，工具栏实时生效</view>
      <view class="tools">
        <view v-for="t in allTools" :key="t.id" class="tool" @tap="toggleTool(t.id)">
          <view class="ico-box" :class="{ on: selected.includes(t.id) }">
            <image
              class="tool-ico"
              :src="selected.includes(t.id) ? t.icon : t.iconGray"
              mode="aspectFit"
            />
          </view>
          <text class="tname">{{ t.name }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getToken, request, ensureLogin } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

interface ToolItem { id: string; name: string; icon: string; iconGray: string }

// 自定义导航栏：顶部要给微信胶囊留位，否则右上角内容会被压住
const topPadding = ref(64);
const today = ref('');
const editing = ref(false);
const drawer = ref(false);
const todoCount = ref(0);
const monthExpense = ref('0');
const nearestDays = ref(0);

const allTools: ToolItem[] = [
  { id: 'todo', name: '待办', icon: '/static/tools/todo.png', iconGray: '/static/tools/todo-gray.png' },
  { id: 'note', name: '便签', icon: '/static/tools/note.png', iconGray: '/static/tools/note-gray.png' },
  { id: 'wallet', name: '记账', icon: '/static/tools/wallet.png', iconGray: '/static/tools/wallet-gray.png' },
  { id: 'calendar', name: '倒数日', icon: '/static/tools/calendar.png', iconGray: '/static/tools/calendar-gray.png' },
  { id: 'news', name: '资讯', icon: '/static/tools/news.png', iconGray: '/static/tools/news-gray.png' },
  { id: 'food', name: '美食', icon: '/static/tools/food.png', iconGray: '/static/tools/food-gray.png' },
];

const defaultSelected = ['todo', 'note', 'wallet', 'news'];
const selected = ref<string[]>(uni.getStorageSync('dailyuse_tools') || defaultSelected);
const activeTools = computed(() => allTools.filter((t) => selected.value.includes(t.id)));

const groups = ref<any[]>([]);
const isDemo = ref(true);

const groupCards = computed(() =>
  groups.value.map((g) => ({
    id: g.id,
    name: g.name,
    sub: isDemo.value ? (g.sub ?? '') : `${g.doneCount ?? 0} / ${g.todoCount ?? 0} 完成`,
    pct: isDemo.value
      ? (g.pct ?? '')
      : `${g.todoCount ? Math.round(((g.doneCount ?? 0) / g.todoCount) * 100) : 0}%`,
    members: g.members ?? [{ n: '我', c: '#5C7CFA' }],
  }))
);

const events = ref<any[]>([]);
const foodToday = ref(0);
const foodWant = ref(0);

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

async function loadFeed() {
  if (!getToken()) {
    events.value = [];
    return;
  }
  try {
    const d = await request<{ events: any[] }>('/feed');
    events.value = d.events;
  } catch {
    events.value = [];
  }
}

function formatToday() {
  const d = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
}

function toggleEdit() {
  editing.value = !editing.value;
  if (!editing.value) drawer.value = false;
}

const toolPages: Record<string, string> = {
  note: '/pages/note/index',
  wallet: '/pages/account/index',
  calendar: '/pages/countdown/index',
  food: '/pages/food/index',
};

async function onToolTap(t: ToolItem) {
  if (editing.value) return;
  if (!(await ensureLogin('登录后才能使用工具'))) return;

  if (t.id === 'todo') {
    uni.switchTab({ url: '/pages/todo/index' });
    return;
  }
  const url = toolPages[t.id];
  if (url) uni.navigateTo({ url });
  else uni.showToast({ title: `${t.name}（建设中）`, icon: 'none' });
}

function removeTool(id: string) {
  if (selected.value.length <= 1) {
    uni.showToast({ title: '至少保留一个工具', icon: 'none' });
    return;
  }
  selected.value = selected.value.filter((x) => x !== id);
  persist();
}

function toggleTool(id: string) {
  if (selected.value.includes(id)) {
    if (selected.value.length <= 1) {
      uni.showToast({ title: '至少保留一个工具', icon: 'none' });
      return;
    }
    selected.value = selected.value.filter((x) => x !== id);
  } else {
    selected.value = [...selected.value, id];
  }
  persist();
}

function persist() {
  uni.setStorageSync('dailyuse_tools', selected.value);
}

async function openGroup(g: { id: string; name: string }) {
  if (!(await ensureLogin('登录后才能查看群组'))) return;
  uni.navigateTo({ url: `/pages/group/detail?id=${g.id}` });
}

async function createGroup() {
  if (!(await ensureLogin('登录后才能创建群组'))) return;
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
        await loadGroups();
        uni.navigateTo({ url: `/pages/group/detail?id=${g.id}` });
      } catch (e) {
        uni.showToast({ title: (e as Error).message, icon: 'none' });
      }
    },
  });
}

async function loadGroups() {
  if (!getToken()) {
    groups.value = [];
    isDemo.value = true;
    return;
  }
  try {
    const d = await request<{ groups: any[] }>('/groups');
    groups.value = d.groups;
    isDemo.value = false;
  } catch {
    groups.value = [];
    isDemo.value = true;
  }
}

async function loadToday() {
  try {
    const data = await request<{ list: Array<{ done: boolean }> }>('/todos');
    todoCount.value = data.list.filter((x) => !x.done).length;
  } catch {
    /* 未登录或离线时静默 */
  }
}

async function loadFood() {
  try {
    const d = await request<{ list: Array<{ kind: string; createdAt: string }> }>('/foods');
    const today = new Date().toDateString();
    foodToday.value = d.list.filter(
      (f) => f.kind === 'ate' && new Date(f.createdAt).toDateString() === today
    ).length;
    foodWant.value = d.list.filter((f) => f.kind === 'want').length;
  } catch {
    /* 静默 */
  }
}

async function goFood() {
  if (!(await ensureLogin('登录后才能记录美食'))) return;
  uni.navigateTo({ url: '/pages/food/index' });
}

const { logged } = useAuthGate(async () => {
  await loadGroups();
  await loadFeed();
  await loadToday();
  await loadFood();
});

onShow(() => {
  today.value = formatToday();

  const sys = uni.getSystemInfoSync();
  let top = (sys.statusBarHeight || 20) + 44;
  // #ifdef MP-WEIXIN
  try {
    const menu = uni.getMenuButtonBoundingClientRect();
    if (menu && menu.bottom) top = menu.bottom + 10;
  } catch {
    /* 拿不到胶囊时用默认值 */
  }
  // #endif
  topPadding.value = top;
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-left: 18px;
  padding-right: 18px;
  box-sizing: border-box;
}

/* 顶部 */
.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-top: 14px;
}
.hello { font-size: 22px; font-weight: 600; letter-spacing: 0.5px; }
.date { margin-top: 5px; font-size: 11px; color: var(--muted); }
.hr { display: flex; align-items: center; gap: 8px; }
.gempty { margin-bottom: 10px; font-size: 11px; color: var(--muted); }
.fempty { padding: 18px 0; text-align: center; font-size: 11px; color: var(--muted); }
.edit {
  padding: 5px 12px; border-radius: 999px;
  font-size: 11px; color: var(--muted);
  background: var(--card); border: none;
  box-shadow: 0 1px 5px rgba(22, 32, 58, .06);
}
.edit.on { background: var(--accent); color: #fff; border-color: transparent; }

/* 宫格 */
/* 宫格：用 grid，避免 calc 在小程序里失效 */
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.cell {
  position: relative;
  padding: 10px 4px 12px;
  background: var(--card);
  border-radius: 16px;
  box-shadow: 0 2px 10px rgba(22, 32, 58, .05);
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  box-sizing: border-box;
}
.cell-hover { transform: scale(0.96); }
.ico-wrap {
  width: 42px; height: 42px; border-radius: 13px;
  background: #EEF2FC;
  display: flex; align-items: center; justify-content: center;
}
.ico { width: 20px; height: 20px; }
.label { font-size: 10.5px; color: var(--fg); }
.badge {
  position: absolute; top: 7px; right: 8px;
  min-width: 15px; height: 15px; padding: 0 4px;
  border-radius: 8px; background: var(--accent); color: #fff;
  font-size: 9px; line-height: 15px; text-align: center;
}
.grid.editing .cell { animation: jiggle 0.3s ease-in-out infinite; }
.grid.editing .cell:nth-child(2n) { animation-delay: 0.15s; }
@keyframes jiggle {
  0%, 100% { transform: rotate(-1.1deg); }
  50% { transform: rotate(1.1deg); }
}
.minus {
  position: absolute; top: -6px; right: -6px; z-index: 2;
  width: 18px; height: 18px; border-radius: 50%;
  background: #2a2a2a; color: #fff; font-size: 12px;
  line-height: 18px; text-align: center;
}
.cell.add { border-style: dashed; box-shadow: none; background: transparent; }
.plus { font-size: 18px; color: var(--muted); }
.cell.add .label { color: var(--muted); font-size: 10px; }

/* 今日概览：单块 */
.summary {
  display: flex; align-items: center;
  padding: 11px 4px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.sitem { flex: 1; text-align: center; }
.k { font-size: 10px; color: var(--muted); }
.v { margin-top: 5px; font-size: 18px; font-weight: 600; }
.unit { font-size: 10px; color: var(--muted); font-weight: 400; margin-left: 1px; }
.sdiv { display: none; }

/* ===== 美食速记 ===== */
.foodrow {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 14px;
  background: var(--card); border-radius: 14px;
  box-shadow: 0 3px 12px rgba(22, 32, 58, .05);
}
.ficon {
  width: 42px; height: 42px; border-radius: 13px;
  background: #FFF1E6;
  display: flex; align-items: center; justify-content: center;
}
.fimg { width: 20px; height: 20px; }
.fmain { flex: 1; min-width: 0; }
.ft { font-size: 12.5px; font-weight: 600; color: var(--fg); }
.fs { display: block; margin-top: 3px; font-size: 10px; color: var(--muted); }
.farrow { font-size: 16px; color: var(--muted); }

/* 群组 */
.groups { white-space: nowrap; }
.gcard {
  display: inline-flex; flex-direction: column; justify-content: space-between;
  width: 150px; height: 92px; margin-right: 9px; padding: 12px;
  border-radius: var(--radius); background: var(--grad); color: #fff;
  box-sizing: border-box; vertical-align: top;
  box-shadow: 0 8px 20px rgba(59, 91, 219, 0.18);
}
.gname { font-size: 13px; font-weight: 600; }
.gsub { margin-top: 3px; font-size: 10px; opacity: 0.82; }
.gfoot { display: flex; align-items: center; justify-content: space-between; }
.avs { display: flex; }
.av {
  width: 20px; height: 20px; border-radius: 50%; margin-right: -6px;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  font-size: 8px; line-height: 19px; text-align: center; font-weight: 600;
}
.pct { font-size: 10px; opacity: 0.9; }
.gadd {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
  width: 84px; height: 92px; border-radius: var(--radius);
  border: 1px dashed var(--line); color: var(--muted); font-size: 10px;
  vertical-align: top; box-sizing: border-box;
}
.gplus { font-size: 18px; margin-bottom: 4px; }

/* 动态 */
.feed {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 2px 13px;
}
.fitem { display: flex; align-items: flex-start; gap: 9px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.fitem:last-child { border-bottom: none; }
.fdot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); margin-top: 6px; flex: 0 0 6px; }
.fdot.gray { background: var(--line); }
.ftxt { flex: 1; font-size: 11px; line-height: 1.5; }
.fb { font-weight: 600; }
.ftime { font-size: 10px; color: var(--muted); white-space: nowrap; margin-top: 1px; }

.bottom-gap { height: 24px; }

/* 抽屉 */
.mask {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(22, 32, 58, 0.32); z-index: 90;
}
.drawer {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--card);
  border-radius: 22px 22px 0 0;
  padding: 20px 18px 30px;
  transform: translateY(110%);
  transition: transform 0.32s cubic-bezier(0.2, 0.85, 0.25, 1);
  box-shadow: 0 -12px 34px rgba(0, 0, 0, 0.14);
}
.drawer.open { transform: translateY(0); }
.dhead { display: flex; justify-content: space-between; align-items: baseline; }
.dt { font-size: 16px; font-weight: 600; }
.done { font-size: 12px; color: var(--accent); font-weight: 600; }
.dsub { margin-top: 6px; font-size: 10px; color: var(--muted); }
.tools { display: flex; flex-wrap: wrap; margin-top: 16px; }
.tool {
  width: 25%; padding: 6px 0 12px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.ico-box {
  width: 42px; height: 42px; border-radius: 13px;
  border: 1px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  transition: all 0.2s;
}
.ico-box.on { background: rgba(59, 91, 219, 0.08); border-color: var(--accent); }
.tool-ico { width: 20px; height: 20px; }
.tname { font-size: 10px; color: var(--muted); }
</style>
