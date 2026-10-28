<template>
  <view class="page">
    <!-- 模式切换 -->
    <view class="modes">
      <view class="mode" :class="{ on: mode === 'cd' }" @tap="switchMode('cd')">倒计时</view>
      <view class="mode" :class="{ on: mode === 'sw' }" @tap="switchMode('sw')">秒表</view>
    </view>

    <!-- ================= 倒计时 ================= -->
    <view v-if="mode === 'cd'" class="body">
      <view class="ring" :style="ringStyle">
        <view class="ring-in">
          <view class="time num">{{ cdText }}</view>
          <view class="tlabel">{{ cdState }}</view>
        </view>
      </view>

      <view class="presets">
        <view
          v-for="p in PRESETS"
          :key="p.min"
          class="pchip"
          :class="{ on: !running && totalMs === p.min * 60000 }"
          @tap="pick(p.min)"
        >{{ p.label }}</view>
      </view>

      <view v-if="!running && !done" class="custom">
        <input
          v-model="customMin"
          class="cinput num"
          type="number"
          placeholder="0"
          maxlength="3"
        />
        <text class="cunit">分钟</text>
        <view class="cbtn" @tap="pickCustom">设定</view>
      </view>

      <view class="ctrl">
        <view v-if="done" class="main-btn" @tap="resetCd">重来</view>
        <block v-else>
          <view class="main-btn" :class="{ ghost: running }" @tap="toggleCd">
            {{ running ? '暂停' : remainMs > 0 && paused ? '继续' : '开始' }}
          </view>
          <view v-if="remainMs > 0 || paused" class="sub-btn" @tap="resetCd">重置</view>
        </block>
      </view>
      <view class="note">倒计时按本机时间计算，切到后台再回来也准</view>
    </view>

    <!-- ================= 秒表 ================= -->
    <view v-if="mode === 'sw'" class="body">
      <view class="ring flat">
        <view class="ring-in">
          <view class="time num">{{ swText }}</view>
          <view class="tlabel">{{ swRunning ? '计时中' : laps.length ? '已停止' : '准备' }}</view>
        </view>
      </view>

      <view class="ctrl">
        <view class="main-btn" :class="{ ghost: swRunning }" @tap="swToggle">
          {{ swRunning ? '停止' : swElapsed() > 0 ? '继续' : '开始' }}
        </view>
        <view v-if="swRunning" class="sub-btn" @tap="addLap">计次</view>
        <view v-if="!swRunning && (swElapsed() > 0 || laps.length)" class="sub-btn" @tap="swReset">重置</view>
      </view>

      <view v-if="laps.length" class="laps">
        <view v-for="(l, i) in lapRows" :key="laps.length - i" class="lap">
          <text class="lno">第 {{ laps.length - i }} 次</text>
          <text class="lplus num">+{{ l.split }}</text>
          <text class="ltotal num">{{ l.total }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';

const mode = ref<'cd' | 'sw'>('cd');

/* ================= 倒计时 ================= */
const PRESETS = [
  { min: 1, label: '1 分钟' },
  { min: 3, label: '3 分钟' },
  { min: 5, label: '5 分钟' },
  { min: 10, label: '10 分钟' },
  { min: 25, label: '25 分钟 · 番茄' },
  { min: 45, label: '45 分钟 · 深度' },
];

const TIMER_KEY = 'dailyuse_timer';
const totalMs = ref(0);
const remainMs = ref(0);
const running = ref(false);
const paused = ref(false);
const done = ref(false);
const customMin = ref('');
/** 暂停时记住剩余；运行时用 endTime 换算，后台回来也不漂 */
let endTime = 0;
let cdTimer: ReturnType<typeof setInterval> | null = null;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const cdText = computed(() => (totalMs.value ? fmt(remainMs.value) : '--:--'));
const cdState = computed(() => {
  if (done.value) return '时间到';
  if (!totalMs.value) return '选一个时长';
  if (running.value) return '计时中';
  return paused.value ? '已暂停' : '就绪';
});

/** 进度环：conic-gradient 按剩余比例着色 */
const ringStyle = computed(() => {
  if (!totalMs.value) return { background: 'conic-gradient(rgba(59, 91, 219, .12) 0deg, rgba(59, 91, 219, .12) 360deg)' };
  const pct = 1 - remainMs.value / totalMs.value;
  const deg = Math.round(pct * 360);
  return {
    background: `conic-gradient(var(--accent) 0deg, var(--accent) ${deg}deg, rgba(59, 91, 219, .12) ${deg}deg, rgba(59, 91, 219, .12) 360deg)`,
  };
});

function persist() {
  try {
    uni.setStorageSync(TIMER_KEY, {
      endTime: running.value ? endTime : 0,
      remain: remainMs.value,
      total: totalMs.value,
      paused: paused.value,
      done: done.value,
    });
  } catch { /* 忽略 */ }
}

function pick(min: number) {
  if (running.value) return;
  setTotal(min * 60000);
}

function pickCustom() {
  const n = Number(customMin.value);
  if (!Number.isFinite(n) || n <= 0 || n > 600) {
    uni.showToast({ title: '填 1-600 分钟', icon: 'none' });
    return;
  }
  if (running.value) return;
  setTotal(Math.round(n * 60000));
}

function setTotal(ms: number) {
  totalMs.value = ms;
  remainMs.value = ms;
  paused.value = false;
  done.value = false;
  persist();
}

function tick() {
  remainMs.value = Math.max(0, endTime - Date.now());
  if (remainMs.value <= 0) {
    stopTimer();
    done.value = true;
    running.value = false;
    uni.vibrateLong({});
    uni.showToast({ title: '时间到！', icon: 'none' });
    persist();
  }
}

function startCd() {
  if (!totalMs.value || done.value) return;
  endTime = Date.now() + remainMs.value;
  running.value = true;
  paused.value = false;
  cdTimer = setInterval(tick, 250);
  persist();
}

function stopTimer() {
  if (cdTimer) clearInterval(cdTimer);
  cdTimer = null;
}

function toggleCd() {
  if (running.value) {
    // 暂停：冻结剩余时间
    stopTimer();
    running.value = false;
    paused.value = true;
    persist();
  } else {
    if (done.value) return;
    startCd();
  }
}

function resetCd() {
  stopTimer();
  running.value = false;
  paused.value = false;
  done.value = false;
  remainMs.value = totalMs.value;
  persist();
}

/** 从缓存恢复（页面被销毁再进来，倒计时还在跑） */
function restore() {
  try {
    const s = uni.getStorageSync(TIMER_KEY) as {
      endTime?: number; remain?: number; total?: number; paused?: boolean; done?: boolean;
    } | '';
    if (!s || !s.total) return;
    totalMs.value = s.total;
    if (s.endTime && s.endTime > Date.now()) {
      remainMs.value = s.endTime - Date.now();
      endTime = s.endTime;
      running.value = true;
      cdTimer = setInterval(tick, 250);
    } else if (s.endTime || s.done) {
      // 上次计时已到点
      remainMs.value = 0;
      done.value = true;
    } else {
      // 旧版未开始/重置的缓存会写 remain=0，按选中的完整时长恢复。
      remainMs.value = s.remain || s.total;
      paused.value = s.paused ?? Boolean(s.remain);
    }
  } catch { /* 忽略 */ }
}

/* ================= 秒表 ================= */
let swBase = 0; // 本次启动时刻的累计起点
let swStamp = 0; // 本次启动的时间戳
const swRunning = ref(false);
const laps = ref<number[]>([]);
const swNow = ref(0);
let swTimer: ReturnType<typeof setInterval> | null = null;

function swElapsed() {
  return swBase + (swRunning.value ? swNow.value - swStamp : 0);
}

function fmtSw(ms: number) {
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const swText = computed(() => fmtSw(swElapsed()));

const lapRows = computed(() => {
  const rows: Array<{ split: string; total: string }> = [];
  for (let i = laps.value.length - 1; i >= 0; i--) {
    const prev = i > 0 ? laps.value[i - 1] : 0;
    rows.push({ split: fmtSw(laps.value[i] - prev), total: fmtSw(laps.value[i]) });
  }
  return rows;
});

function swToggle() {
  if (swRunning.value) {
    swBase = swElapsed();
    swRunning.value = false;
    if (swTimer) clearInterval(swTimer);
    swTimer = null;
  } else {
    swStamp = Date.now();
    swRunning.value = true;
    swTimer = setInterval(() => (swNow.value = Date.now()), 33);
  }
}

function addLap() {
  laps.value.push(swElapsed());
  if (laps.value.length > 99) laps.value.shift();
}

function swReset() {
  if (swTimer) clearInterval(swTimer);
  swTimer = null;
  swRunning.value = false;
  swBase = 0;
  swNow.value = 0;
  laps.value = [];
}

function switchMode(m: 'cd' | 'sw') {
  mode.value = m;
}

onShow(() => {
  // 从后台回来：两个计时器都按时间戳换算，自然追平
  if (swRunning.value) swNow.value = Date.now();
});

onUnmounted(() => {
  stopTimer();
  if (swTimer) clearInterval(swTimer);
});

restore();
</script>

<style scoped>
.page { min-height: 100vh; padding: 16px 18px 40px; box-sizing: border-box; background: var(--bg); }

/* 模式切换 */
.modes {
  display: flex; gap: 6px; padding: 4px;
  background: var(--card); border: 1px solid var(--line); border-radius: 999px;
}
.mode {
  flex: 1; text-align: center; padding: 9px 0;
  border-radius: 999px; font-size: 12.5px; color: var(--muted);
}
.mode.on { background: var(--accent); color: #fff; font-weight: 600; }

.body { display: flex; flex-direction: column; align-items: center; margin-top: 22px; }

/* 进度环 */
.ring {
  width: 230px; height: 230px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.ring.flat { background: rgba(59, 91, 219, .1); }
.ring-in {
  width: 196px; height: 196px; border-radius: 50%;
  background: var(--card); border: 1px solid var(--line);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  box-shadow: inset 0 2px 10px rgba(22, 32, 58, .04);
}
.time { font-size: 40px; font-weight: 600; color: var(--fg); letter-spacing: 1px; }
.tlabel { margin-top: 6px; font-size: 10.5px; color: var(--muted); }

/* 预设 */
.presets { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 22px; }
.pchip {
  padding: 7px 13px; border-radius: 999px;
  background: var(--card); border: 1px solid var(--line);
  font-size: 11px; color: var(--muted);
}
.pchip.on { background: rgba(59, 91, 219, .1); border-color: transparent; color: var(--accent); font-weight: 600; }

/* 自定义分钟 */
.custom { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.cinput {
  width: 64px; height: 34px; text-align: center;
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  font-size: 13px;
}
.cunit { font-size: 11px; color: var(--muted); }
.cbtn {
  padding: 0 14px; height: 34px; line-height: 34px;
  border-radius: 10px; background: var(--grad); color: #fff;
  font-size: 11.5px; font-weight: 600;
}

/* 控制 */
.ctrl { display: flex; align-items: center; gap: 12px; margin-top: 24px; }
.main-btn {
  min-width: 130px; padding: 13px 0; text-align: center;
  border-radius: 999px; background: var(--grad); color: #fff;
  font-size: 14px; font-weight: 600;
  box-shadow: 0 8px 20px rgba(59, 91, 219, .3);
}
.main-btn.ghost { background: var(--card); color: var(--accent); border: 1px solid var(--line); box-shadow: none; }
.sub-btn {
  min-width: 76px; padding: 13px 0; text-align: center;
  border-radius: 999px; background: var(--card);
  border: 1px solid var(--line); color: var(--muted);
  font-size: 13px;
}
.note { margin-top: 16px; font-size: 10px; color: var(--muted); }

/* 计次列表 */
.laps {
  width: 100%; margin-top: 20px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: 14px; padding: 4px 14px; box-sizing: border-box;
}
.lap { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.lap:last-child { border-bottom: none; }
.lno { flex: 1; font-size: 11.5px; color: var(--fg); }
.lplus { font-size: 11px; color: var(--accent); }
.ltotal { min-width: 76px; text-align: right; font-size: 11px; color: var(--muted); }
</style>
