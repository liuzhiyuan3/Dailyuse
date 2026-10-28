<template>
  <view class="page">
    <view v-if="!logged" class="guest" @tap="goLogin">
      游客模式 · 数据暂存本机，登录后自动同步云端 ›
    </view>

    <!-- 转盘切换 -->
    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view
        v-for="(w, i) in wheels"
        :key="w.id || 'draft'"
        class="chip"
        :class="{ on: i === current }"
        @tap="selectWheel(i)"
        @longpress="removeWheel(i)"
      >{{ w.title }}</view>
      <view class="chip add" @tap="openNew">＋</view>
    </scroll-view>

    <!-- 转盘主体 -->
    <view class="stage">
      <view class="pointer" />
      <view class="wheel-box" :style="{ width: size + 'px', height: size + 'px' }">
        <view class="wheel-rot" :style="rotStyle">
          <view class="face" :style="faceStyle" />
          <view
            v-for="(it, i) in items"
            :key="i"
            class="wlabel"
            :style="{ transform: 'rotate(' + midOf(i) + 'deg)', fontSize: fontOf + 'px' }"
          >
            <text class="wltext">{{ short(it) }}</text>
          </view>
        </view>
        <view class="go" :class="{ spinning }" @tap="spin">{{ spinning ? '…' : 'GO' }}</view>
      </view>
    </view>

    <view class="hint">点 GO 开始 · 长按顶部标签删除转盘</view>
    <view class="editbtn" @tap="openEdit">编辑选项</view>

    <!-- 结果弹层 -->
    <view v-if="result" class="mask" @tap="result = ''" />
    <view v-if="result" class="result">
      <view class="r-emoji">🎡</view>
      <view class="r-text">{{ result }}</view>
      <view class="r-btn" @tap="result = ''">再转一次</view>
    </view>

    <!-- 编辑转盘 -->
    <view v-if="sheet" class="mask" @tap="sheet = false" />
    <view class="sheet" :class="{ open: sheet }">
      <view class="shead">
        <text class="stitle">{{ form.id ? '编辑转盘' : '新建转盘' }}</text>
        <text class="sdone" @tap="save">保存</text>
      </view>

      <input v-model="form.title" class="ipt" placeholder="转盘名称，如「今天吃什么」" placeholder-class="ph" />

      <view class="items">
        <view v-for="(it, i) in form.items" :key="i" class="irow">
          <text class="ino num">{{ i + 1 }}</text>
          <input v-model="form.items[i]" class="iipt" placeholder="选项内容" placeholder-class="ph" />
          <text
            v-if="form.items.length > 2"
            class="idel"
            @tap="form.items.splice(i, 1)"
          >✕</text>
        </view>
      </view>

      <view class="addrow">
        <input
          v-model="newItem"
          class="ipt"
          placeholder="添加一个选项"
          placeholder-class="ph"
          @confirm="addItem"
        />
        <view class="aplus" @tap="addItem">＋</view>
      </view>
      <view class="hint2">2-12 个选项，不能重复；保存后立即可转</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ensureLogin, getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { loadLocal, newLocalId, saveLocal, type LocalWheel } from '@/utils/localData';

interface WheelData {
  id: string; // 空串 = 内置示例，尚未保存
  title: string;
  items: string[];
}

const DEFAULT_WHEEL: WheelData = {
  id: '',
  title: '今天吃什么',
  items: ['火锅', '烤肉', '日料', '面馆', '快餐', '沙拉'],
};

const PALETTE = ['#5C7CFA', '#22B8CF', '#51CF66', '#F59F00', '#AE3EC9', '#FF6B6B', '#20C997', '#FAB005', '#4C6EF5', '#E64980'];

const wheels = ref<WheelData[]>([]);
const current = ref(0);
const sheet = ref(false);
const form = ref<WheelData>({ id: '', title: '', items: ['', ''] });
const newItem = ref('');
const result = ref('');

const wheel = computed(() => wheels.value[current.value] || DEFAULT_WHEEL);
const items = computed(() => wheel.value.items);

/* ---------- 轮盘绘制（纯 CSS，conic-gradient 扇区 + 沿半径的标签） ---------- */
const sys = uni.getSystemInfoSync();
const size = Math.min(Math.floor(sys.windowWidth * 0.82), 320);

const faceStyle = computed(() => {
  const n = items.value.length;
  if (n < 2) return {};
  const seg = 360 / n;
  const stops = items.value.map((_, i) => {
    const c = PALETTE[i % PALETTE.length];
    return `${c} ${(i * seg).toFixed(2)}deg ${((i + 1) * seg).toFixed(2)}deg`;
  });
  return { background: `conic-gradient(${stops.join(', ')})` };
});

/** 第 i 个扇区中点的角度（从正上方顺时针，与旋转落点计算一致） */
function midOf(i: number) {
  const n = items.value.length;
  return n ? (i + 0.5) * (360 / n) : 0;
}

const fontOf = computed(() => {
  const n = items.value.length;
  return n <= 6 ? 13 : n <= 8 ? 12 : n <= 10 ? 11 : 10;
});

function short(s: string) {
  const v = s.trim();
  return v.length > 6 ? v.slice(0, 5) + '…' : v;
}

/* ---------- 旋转 ---------- */
const rot = ref(0);
const spinning = ref(false);
const rotStyle = computed(() => ({
  transform: `rotate(${rot.value}deg)`,
  transition: spinning.value ? 'transform 4s cubic-bezier(.15,.85,.08,1)' : 'none',
}));

function spin() {
  if (spinning.value) return;
  const list = items.value;
  if (list.length < 2) {
    uni.showToast({ title: '先在「编辑选项」里加点内容', icon: 'none' });
    return;
  }
  const n = list.length;
  const seg = 360 / n;
  // 指着扇区 i 时转盘的归一化角度：让第 i 区中点停在指针下，加一点偏移更自然
  const idx = Math.floor(Math.random() * n);
  const jitter = (Math.random() - 0.5) * seg * 0.7;
  const target = (360 - (idx + 0.5) * seg + jitter + 360) % 360;
  const from = rot.value % 360;

  spinning.value = true;
  rot.value = rot.value + 360 * 5 + ((target - from + 360) % 360);

  setTimeout(() => {
    spinning.value = false;
    rot.value = rot.value % 360; // 归一化，避免数值无限增大
    result.value = list[idx].trim();
  }, 4100);
}

/* ---------- 数据 ---------- */
function parseItems(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String);
  } catch {
    /* 兜底给空 */
  }
  return [];
}

async function load() {
  if (!getToken()) {
    const local = loadLocal<LocalWheel>('wheels');
    wheels.value = local.length
      ? local.map((w) => ({ id: w.id, title: w.title, items: w.items }))
      : [DEFAULT_WHEEL];
  } else {
    try {
      const d = await request<{ list: Array<{ id: string; title: string; items: string }> }>('/wheels');
      wheels.value = d.list.map((w) => ({ id: w.id, title: w.title, items: parseItems(w.items) }));
    } catch {
      /* 静默 */
    }
    if (!wheels.value.length) wheels.value = [DEFAULT_WHEEL];
  }
  current.value = Math.min(current.value, wheels.value.length - 1);
}

function goLogin() {
  void ensureLogin('登录后数据同步到云端，换设备不丢');
}

function selectWheel(i: number) {
  if (spinning.value) return;
  current.value = i;
}

function removeWheel(i: number) {
  if (wheels.value.length <= 1) {
    uni.showToast({ title: '至少保留一个转盘', icon: 'none' });
    return;
  }
  const w = wheels.value[i];
  uni.showModal({
    title: '删除转盘',
    content: `「${w.title}」将被删除`,
    success: async (r) => {
      if (!r.confirm) return;
      if (w.id && getToken()) {
        try {
          await request(`/wheels/${w.id}`, { method: 'DELETE' });
        } catch (e) {
          uni.showToast({ title: (e as Error).message, icon: 'none' });
          return;
        }
      } else if (w.id) {
        saveLocal('wheels', loadLocal<LocalWheel>('wheels').filter((x) => x.id !== w.id));
      }
      wheels.value = wheels.value.filter((_, k) => k !== i);
      current.value = Math.min(current.value, wheels.value.length - 1);
    },
  });
}

/* ---------- 编辑 ---------- */
function openNew() {
  form.value = { id: '', title: '', items: ['', ''] };
  newItem.value = '';
  sheet.value = true;
}

function openEdit() {
  form.value = { id: wheel.value.id, title: wheel.value.title, items: [...wheel.value.items] };
  newItem.value = '';
  sheet.value = true;
}

function addItem() {
  const v = newItem.value.trim().slice(0, 30);
  if (!v) return;
  if (form.value.items.length >= 12) {
    uni.showToast({ title: '最多 12 个选项', icon: 'none' });
    return;
  }
  form.value.items.push(v);
  newItem.value = '';
}

/** 保存到本机或云端；返回该转盘的 id */
async function persist(w: WheelData, isCreate: boolean): Promise<string> {
  if (!getToken()) {
    const local = loadLocal<LocalWheel>('wheels');
    if (isCreate || !w.id) {
      const id = newLocalId();
      local.unshift({ id, title: w.title, items: w.items });
      saveLocal('wheels', local);
      return id;
    }
    const hit = local.find((x) => x.id === w.id);
    if (hit) Object.assign(hit, { title: w.title, items: w.items });
    saveLocal('wheels', local);
    return w.id;
  }
  if (isCreate || !w.id) {
    const created = await request<{ id: string }>('/wheels', {
      method: 'POST',
      data: { title: w.title, items: w.items },
    });
    return created.id;
  }
  await request(`/wheels/${w.id}`, { method: 'PATCH', data: { title: w.title, items: w.items } });
  return w.id;
}

async function save() {
  const title = form.value.title.trim() || '转盘';
  const itemsList = [...new Set(form.value.items.map((s) => s.trim().slice(0, 30)).filter(Boolean))];
  if (itemsList.length < 2) {
    uni.showToast({ title: '至少 2 个选项', icon: 'none' });
    return;
  }

  const isCreate = !form.value.id;
  try {
    const id = await persist({ id: form.value.id, title, items: itemsList }, isCreate);
    const saved: WheelData = { id, title, items: itemsList };
    if (isCreate) {
      wheels.value.unshift(saved);
      current.value = 0;
    } else {
      const i = wheels.value.findIndex((w) => w.id === saved.id);
      if (i >= 0) wheels.value[i] = saved;
      else wheels.value[current.value] = saved;
    }
    sheet.value = false;
    uni.showToast({ title: '已保存', icon: 'none' });
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
.page { min-height: 100vh; padding: 12px 18px 40px; box-sizing: border-box; background: var(--bg); }

.guest {
  margin-bottom: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(59, 91, 219, .08);
  border: 1px dashed rgba(59, 91, 219, .35);
  font-size: 11px;
  color: var(--accent);
}

/* 转盘切换标签 */
.chips { white-space: nowrap; margin-top: 2px; }
.chip {
  display: inline-block; padding: 7px 14px; margin-right: 8px;
  border-radius: 999px; background: var(--card);
  border: 1px solid var(--line);
  font-size: 11.5px; color: var(--muted);
}
.chip.on {
  background: var(--accent); border-color: transparent; color: #fff; font-weight: 600;
  box-shadow: 0 4px 10px rgba(59, 91, 219, .28);
}
.chip.add { border-style: dashed; }

/* 舞台 */
.stage { position: relative; display: flex; justify-content: center; padding-top: 30px; margin-top: 18px; }
.pointer {
  position: absolute; top: 6px; left: 50%; z-index: 5;
  margin-left: -9px;
  width: 0; height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 26px solid #E03131;
  filter: drop-shadow(0 3px 4px rgba(224, 49, 49, .4));
}

.wheel-box { position: relative; border-radius: 50%; border: 4px solid #3B5BDB; box-shadow: 0 10px 30px rgba(59, 91, 219, .2); box-sizing: border-box; }
.wheel-rot { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 50%; overflow: hidden; }
.face { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 50%; }

/* 标签：随扇区旋转，flex 垂直居中 + 右对齐，文字沿半径从外缘向圆心读 */
.wlabel {
  position: absolute; left: 0; top: 0; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: flex-end;
  padding-right: 14px; box-sizing: border-box;
}
.wltext {
  max-width: 56%;
  color: #fff; font-weight: 600; line-height: 14px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .25);
}

.go {
  position: absolute; top: 50%; left: 50%; z-index: 4;
  width: 64px; height: 64px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--grad); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; letter-spacing: 1px;
  box-shadow: 0 6px 18px rgba(59, 91, 219, .45);
  border: 4px solid #fff;
  box-sizing: border-box;
}
.go.spinning { opacity: .75; }

.hint { margin-top: 16px; text-align: center; font-size: 10.5px; color: var(--muted); }
.editbtn {
  width: 130px; margin: 12px auto 0; padding: 10px 0;
  text-align: center; border-radius: 999px;
  background: var(--card); border: 1px solid var(--line);
  font-size: 12px; color: var(--accent); font-weight: 600;
}

/* 结果弹层 */
.mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(22, 32, 58, .5); z-index: 90; }
.result {
  position: fixed; top: 32%; left: 50%; z-index: 100;
  width: 220px; margin-left: -110px;
  padding: 26px 20px 20px; border-radius: 20px;
  background: var(--card); text-align: center;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .22);
  animation: pop .32s cubic-bezier(.2, 1.2, .4, 1);
}
@keyframes pop {
  0% { transform: scale(.7); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.r-emoji { font-size: 34px; }
.r-text { margin-top: 10px; font-size: 19px; font-weight: 700; color: var(--accent); }
.r-btn {
  margin-top: 18px; padding: 10px 0; border-radius: 999px;
  background: var(--grad); color: #fff; font-size: 12.5px; font-weight: 600;
}

/* 编辑面板 */
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--card); border-radius: 22px 22px 0 0;
  padding: 20px 18px calc(24px + env(safe-area-inset-bottom));
  transform: translateY(110%);
  transition: transform .32s cubic-bezier(.2, .85, .25, 1);
  box-shadow: 0 -12px 34px rgba(0, 0, 0, .14);
  max-height: 78vh; overflow-y: auto;
}
.sheet.open { transform: translateY(0); }
.shead { display: flex; justify-content: space-between; align-items: baseline; }
.stitle { font-size: 16px; font-weight: 600; }
.sdone { font-size: 12px; color: var(--accent); font-weight: 600; }

.ipt {
  margin-top: 14px; height: 38px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 13px;
}
.ph { color: var(--muted); }

.items { margin-top: 6px; }
.irow { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.ino { width: 16px; font-size: 10px; color: var(--muted); text-align: center; }
.iipt {
  flex: 1; height: 36px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12.5px;
}
.idel { width: 26px; text-align: center; font-size: 12px; color: var(--muted); padding: 4px; }

.addrow { display: flex; align-items: center; gap: 8px; }
.addrow .ipt { flex: 1; margin-top: 10px; }
.aplus {
  width: 38px; height: 38px; margin-top: 10px; border-radius: 50%;
  background: var(--grad); color: #fff; font-size: 18px;
  display: flex; align-items: center; justify-content: center;
}
.hint2 { margin-top: 12px; font-size: 10.5px; color: var(--muted); }
</style>
