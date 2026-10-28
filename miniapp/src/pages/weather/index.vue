<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后订阅天气" subtitle="每天早上把天气推给你" />
    <block v-else>
      <!-- 顶栏：城市圆点 + 添加 -->
      <view class="topbar">
        <view class="dots">
          <view
            v-for="(c, i) in cities"
            :key="c.id"
            class="dot"
            :class="{ on: i === curIdx }"
            @tap="curIdx = i"
          />
        </view>
        <view class="add" @tap="openSheet">＋</view>
      </view>

      <!-- 沉浸大卡：左右滑切换城市 -->
      <swiper class="sw" :current="curIdx" @change="onSwiper">
        <swiper-item v-for="c in cities" :key="c.id">
          <view class="wxcard">
            <view class="chead">
              <text class="cname">{{ c.name }}</text>
              <text v-if="weathers[c.id]" class="cobs">{{ fmtObs(weathers[c.id]!.obsTime) }}</text>
            </view>
            <view v-if="!weathers[c.id]" class="cloading">查询中…</view>
            <block v-else>
              <view class="temp num">{{ weathers[c.id]!.temp }}°</view>
              <view class="ttext">{{ weathers[c.id]!.text }}</view>
              <view class="tdets">
                <text>体感 {{ weathers[c.id]!.feelsLike }}°</text>
                <text>湿度 {{ weathers[c.id]!.humidity }}%</text>
                <text>{{ weathers[c.id]!.windDir }} {{ weathers[c.id]!.windScale }} 级</text>
              </view>
            </block>
          </view>
        </swiper-item>
      </swiper>

      <!-- 订阅：推送当前城市 -->
      <view class="subcard">
        <view class="subleft">
          <text class="st1">
            <template v-if="sub">已订阅「{{ sub.city }}」 · 剩 {{ sub.remain }} 次</template>
            <template v-else>每日推送「{{ cur.name }}」天气</template>
          </text>
          <text class="st2">
            {{ sub ? `下次 ${fmtSub(sub.remindAt)} · 一周补一次额度即可` : '明早 8 点左右服务通知 · 建议授权时勾选「总是保持以上选择」' }}
          </text>
        </view>
        <view v-if="!sub" class="subbtn" @tap="subscribe">开启</view>
        <block v-else>
          <view v-if="sub.city !== cur.name" class="subbtn" @tap="subscribe">推{{ cur.name }}</view>
          <view v-else-if="sub.remain < 7" class="subbtn" @tap="topUp">补一周</view>
        </block>
      </view>
      <view v-if="sub" class="subacts">
        <view v-if="sub.city !== cur.name" class="act" @tap="subscribe">把推送城市换成「{{ cur.name }}」</view>
        <view class="act danger" @tap="cancelSub">取消订阅</view>
      </view>

      <!-- 城市管理弹层 -->
      <view v-if="sheet" class="mask" @tap="sheet = false" />
      <view class="sheet" :class="{ open: sheet }">
        <view class="shead">
          <text class="stitle">城市管理</text>
          <text class="sdone" @tap="sheet = false">完成</text>
        </view>
        <view class="sipt">
          <text class="sico">🔍</text>
          <input
            v-model="q"
            placeholder="搜索城市（如：杭州 / hangzhou）"
            placeholder-class="ph"
            confirm-type="search"
            @confirm="doSearch"
          />
        </view>
        <view v-if="results.length" class="rlist">
          <view v-for="c in results" :key="c.id" class="rrow" @tap="addCity(c)">
            {{ c.name }}<text class="radd">＋ 添加</text>
          </view>
        </view>
        <block v-else>
          <view class="sttl">我的城市（左右滑动查看，点 ✕ 移除）</view>
          <view class="chips">
            <view v-for="(c, i) in cities" :key="c.id" class="chip on">
              {{ c.name }}
              <text v-if="cities.length > 1" class="cdel" @tap.stop="removeCity(i)">✕</text>
            </view>
          </view>
          <view class="sttl">热门城市</view>
          <view class="chips">
            <view v-for="c in HOT_CITIES" :key="c.id" class="chip" @tap="addCity(c)">{{ c.name }}</view>
          </view>
        </block>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';
import { authWithHint, isAlwaysAccept, silentTopUp, WEATHER_TEMPLATE_ID } from '@/utils/reminderAuth';

interface CityHit { id: string; name: string }
interface Sub { id: string; city: string; location: string; remain: number; remindAt: string }
interface Now {
  temp: string; text: string; humidity: string;
  windDir: string; windScale: string; feelsLike: string; obsTime: string;
}

const CITIES_KEY = 'dailyuse_weather_cities';

/** 热门城市快捷入口（和风 LocationID 已逐一验证）；其余城市走搜索 */
const HOT_CITIES: CityHit[] = [
  { id: '101010100', name: '北京' }, { id: '101020100', name: '上海' },
  { id: '101280101', name: '广州' }, { id: '101280601', name: '深圳' },
  { id: '101210101', name: '杭州' }, { id: '101270101', name: '成都' },
  { id: '101200101', name: '武汉' }, { id: '101110101', name: '西安' },
  { id: '101040100', name: '重庆' }, { id: '101190101', name: '南京' },
  { id: '101120201', name: '青岛' }, { id: '101230201', name: '厦门' },
];

const cities = ref<CityHit[]>([]);
const curIdx = ref(0);
const weathers = ref<Record<string, Now | null>>({});
const sub = ref<Sub | null>(null);
const sheet = ref(false);
const q = ref('');
const results = ref<CityHit[]>([]);

const cur = computed(() => cities.value[curIdx.value] ?? { id: '', name: '' });

function onSwiper(e: any) {
  curIdx.value = e.detail.current;
}

function loadCities() {
  const saved = uni.getStorageSync(CITIES_KEY) as CityHit[] | '';
  if (Array.isArray(saved) && saved.length) {
    cities.value = saved.filter((c) => c && c.id && c.name);
  }
  if (!cities.value.length) cities.value = [HOT_CITIES[1]]; // 默认上海
  if (curIdx.value >= cities.value.length) curIdx.value = 0;
}

function persistCities() {
  uni.setStorageSync(CITIES_KEY, cities.value);
}

async function loadNow(id: string) {
  weathers.value[id] = null;
  try {
    const d = await request<{ now: Now }>(`/weather/now?location=${id}`);
    weathers.value[id] = d.now;
  } catch {
    weathers.value[id] = null;
  }
}

function loadAllNow() {
  cities.value.forEach((c) => void loadNow(c.id));
}

async function doSearch() {
  const kw = q.value.trim();
  if (!kw) return;
  try {
    const d = await request<{ list: CityHit[] }>(`/weather/cities?q=${encodeURIComponent(kw)}`);
    results.value = d.list;
    if (!d.list.length) uni.showToast({ title: '没搜到，试试只输城市名', icon: 'none' });
  } catch {
    results.value = [];
  }
}

function addCity(c: CityHit) {
  if (!cities.value.some((x) => x.id === c.id)) {
    cities.value.push(c);
    persistCities();
    curIdx.value = cities.value.length - 1;
    void loadNow(c.id);
  } else {
    curIdx.value = cities.value.findIndex((x) => x.id === c.id);
  }
  results.value = [];
  q.value = '';
}

function removeCity(i: number) {
  if (cities.value.length <= 1) {
    uni.showToast({ title: '至少保留一个城市', icon: 'none' });
    return;
  }
  cities.value.splice(i, 1);
  persistCities();
  if (curIdx.value >= cities.value.length) curIdx.value = cities.value.length - 1;
}

function openSheet() {
  q.value = '';
  results.value = [];
  sheet.value = true;
}

async function loadSub() {
  try {
    sub.value = await request<Sub | null>('/weather/subscription');
  } catch {
    sub.value = null;
  }
}

/** 订阅 / 换城市：一次授权开订阅；已勾选「总是保持以上选择」时顺带静默补到 7 次（约一周） */
async function subscribe() {
  if (!cur.value.id) return;
  if (!(await authWithHint(WEATHER_TEMPLATE_ID))) {
    uni.showToast({ title: '需要允许通知才能推送', icon: 'none' });
    return;
  }
  try {
    sub.value = await request<Sub>('/weather/subscription', {
      method: 'POST',
      data: { city: cur.value.name, location: cur.value.id },
    });
    const got = await silentTopUp(WEATHER_TEMPLATE_ID, sub.value.id, sub.value.remain, 7);
    if (got > 0) await loadSub();
    uni.showToast({ title: got ? `已订阅,额度 ${got + 1} 次` : '已订阅,明早见', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

/** 补一周额度：勾了「总是保持以上选择」的用户点一次就静默补齐 7 次，不再弹窗 */
async function topUp() {
  if (!sub.value) return;
  if (await isAlwaysAccept(WEATHER_TEMPLATE_ID)) {
    const got = await silentTopUp(WEATHER_TEMPLATE_ID, sub.value.id, sub.value.remain, 7);
    if (got > 0) {
      await loadSub();
      uni.showToast({ title: `已补到 ${sub.value.remain} 次`, icon: 'none' });
      return;
    }
  }
  // 没勾「总是保持以上选择」：单次授权 +1，并提示怎么免打扰
  const ok = await authWithHint(WEATHER_TEMPLATE_ID);
  if (!ok) {
    uni.showToast({ title: '需要允许通知才能推送', icon: 'none' });
    return;
  }
  try {
    await request(`/reminders/${sub.value.id}/grant`, { method: 'POST' });
    await loadSub();
    uni.showToast({ title: '已补 1 次；勾选「总是保持以上选择」后可一键补一周', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function cancelSub() {
  if (!sub.value) return;
  const res = await new Promise<{ confirm: boolean }>((resolve) => {
    uni.showModal({
      title: '取消天气推送',
      content: '取消后不再每日推送，可随时重新开启。',
      success: (r) => resolve({ confirm: r.confirm }),
    });
  });
  if (!res.confirm) return;
  try {
    await request('/weather/subscription', { method: 'DELETE' });
    sub.value = null;
    uni.showToast({ title: '已取消', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

function fmtObs(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} 发布`;
}

function fmtSub(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function init() {
  loadCities();
  loadAllNow();
  await loadSub();
  // 已订阅且勾了「总是保持以上选择」：进页面静默补满一周，用户完全无感
  if (sub.value && sub.value.remain < 7) {
    const got = await silentTopUp(WEATHER_TEMPLATE_ID, sub.value.id, sub.value.remain, 7);
    if (got > 0) await loadSub();
  }
}

const { logged } = useAuthGate(init);

onShow(() => {
  if (!logged.value) return;
  void loadSub();
  loadAllNow();
});
</script>

<style scoped>
.page { min-height: 100vh; padding: 14px 18px 40px; box-sizing: border-box; background: var(--bg); }

.topbar { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 12px; }
.dots { display: flex; gap: 6px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line); transition: background .2s; }
.dot.on { background: var(--accent); }
.add {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--card); border: 1px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: var(--accent); box-shadow: var(--shadow);
}

.sw { height: 300px; }
.wxcard {
  height: 284px; padding: 20px; box-sizing: border-box;
  background: var(--grad); color: #fff;
  border-radius: 20px;
  box-shadow: 0 12px 30px rgba(59, 91, 219, .25);
  display: flex; flex-direction: column;
}
.chead { display: flex; align-items: baseline; justify-content: space-between; }
.cname { font-size: 18px; font-weight: 600; }
.cobs { font-size: 9.5px; opacity: .8; }
.cloading { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 12px; opacity: .8; }
.temp { font-size: 64px; font-weight: 600; line-height: 1.1; margin-top: 8px; }
.ttext { font-size: 16px; font-weight: 600; margin-top: 2px; }
.tdets { display: flex; gap: 14px; margin-top: auto; font-size: 10.5px; opacity: .88; }

.subcard {
  display: flex; align-items: center; gap: 12px;
  margin-top: 16px; padding: 14px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.subleft { flex: 1; min-width: 0; }
.st1 { font-size: 12.5px; font-weight: 600; }
.st2 { display: block; margin-top: 4px; font-size: 10px; color: var(--muted); }
.subbtn {
  flex: 0 0 auto; padding: 0 16px; height: 34px; line-height: 34px;
  border-radius: 999px; background: var(--grad); color: #fff;
  font-size: 11.5px; font-weight: 600; white-space: nowrap;
}
.subacts { display: flex; gap: 10px; margin-top: 10px; }
.act {
  flex: 1; padding: 11px 0; text-align: center;
  border-radius: 999px; background: var(--card);
  border: 1px solid var(--line); font-size: 12px; color: var(--accent);
}
.act.danger { color: #E03131; }

.mask { position: fixed; inset: 0; background: rgba(22, 32, 58, .32); z-index: 90; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: var(--card); border-radius: 22px 22px 0 0;
  padding: 18px 18px calc(24px + env(safe-area-inset-bottom));
  transform: translateY(110%);
  transition: transform .32s cubic-bezier(.2, .85, .25, 1);
  box-shadow: 0 -12px 34px rgba(0, 0, 0, .14);
  max-height: 72vh; overflow-y: auto; box-sizing: border-box;
}
.sheet.open { transform: translateY(0); }
.shead { display: flex; justify-content: space-between; align-items: baseline; }
.stitle { font-size: 16px; font-weight: 600; }
.sdone { font-size: 12px; color: var(--accent); font-weight: 600; }

.sipt {
  display: flex; align-items: center; gap: 8px; margin-top: 14px;
  height: 38px; padding: 0 14px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 999px;
}
.sico { font-size: 13px; }
.sipt input { flex: 1; font-size: 12px; }
.ph { color: var(--muted); }

.rlist { margin-top: 10px; }
.rrow {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 4px; font-size: 13px; border-bottom: 1px solid var(--line);
}
.radd { font-size: 11px; color: var(--accent); font-weight: 600; }

.sttl { font-size: 10.5px; color: var(--muted); margin: 14px 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: flex; align-items: center; gap: 4px;
  padding: 7px 13px; border-radius: 999px;
  background: var(--bg); border: 1px solid var(--line);
  font-size: 11.5px; color: var(--muted);
}
.chip.on { background: rgba(59, 91, 219, .1); border-color: transparent; color: var(--accent); font-weight: 600; }
.cdel { font-size: 9px; opacity: .6; padding: 2px; }
</style>
