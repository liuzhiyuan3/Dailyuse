<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后订阅资讯" subtitle="订阅需要身份才能推送给你" />
    <block v-else>
    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view
        v-for="s in subs"
        :key="s.id"
        class="chip"
        :class="{ on: s.keyword === active }"
        @tap="select(s.keyword)"
        @longpress="removeSub(s)"
      >
        <text>{{ s.keyword }}</text>
        <text class="bal">{{ s.remain }}</text>
      </view>
      <view class="chip add" @tap="sheet = true">＋ 订阅</view>
    </scroll-view>

    <view v-if="!subs.length" class="empty">
      <text class="eico">📰</text>
      <text class="et">还没有订阅</text>
      <text class="es">订阅关键词，有新内容推到微信</text>
    </view>

    <view v-else-if="loading" class="empty"><text class="es">加载中…</text></view>

    <view v-else-if="!list.length" class="empty">
      <text class="eico">🕊️</text>
      <text class="et">暂无资讯</text>
      <text class="es">点右上角刷新按钮抓一次</text>
    </view>

    <view v-else>
      <view v-for="g in grouped" :key="g.label" class="group">
        <view class="glabel">{{ g.label }}</view>
        <view class="list">
          <view v-for="n in g.items" :key="n.id" class="item" @tap="open(n)">
            <view class="itxt">
              <view class="itop">
                <view v-if="!isRead(n.id)" class="dot" />
                <text class="ititle">{{ n.title }}</text>
              </view>
              <text class="isum">{{ n.summary }}</text>
              <text class="isrc">{{ n.source }} · {{ ago(n.publishedAt) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="refresh" @tap="refresh">↻</view>

    <view v-if="sheet" class="mask" @tap="sheet = false" />
    <view class="sheet" :class="{ open: sheet }">
      <view class="shead">
        <text class="stitle">订阅关键词</text>
        <text class="sdone" @tap="subscribe">订阅</text>
      </view>
      <input v-model="draft" class="ipt" placeholder="如：AI、房价、考研" placeholder-class="ph" />
      <view class="hint">
        订阅后服务端定期抓取，有新内容通过微信服务通知推送。
        微信只允许一次授权对应一次推送，用完需再点一次订阅补充额度。
      </view>
    </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

// TODO: 换成微信后台「订阅消息」里创建的资讯模板 ID
const TEMPLATE_ID = 'TODO_FILL_NEWS_TEMPLATE_ID';

interface Subscribe { id: string; keyword: string; remain: number }
interface NewsItem { id: string; title: string; summary: string; url: string; source: string; publishedAt: string }

const subs = ref<Subscribe[]>([]);
const list = ref<NewsItem[]>([]);
const active = ref('');
const loading = ref(false);
const sheet = ref(false);
const draft = ref('');
const readIds = ref<Set<string>>(new Set());

const grouped = computed(() => {
  const groups: Array<{ label: string; items: NewsItem[] }> = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const n of list.value) {
    const d = new Date(n.publishedAt).toDateString();
    const label = d === today ? '今天' : d === yesterday ? '昨天' : '更早';
    let g = groups.find((x) => x.label === label);
    if (!g) {
      g = { label, items: [] };
      groups.push(g);
    }
    g.items.push(n);
  }
  return groups;
});

function loadRead() {
  const raw = uni.getStorageSync(`news_read_${active.value}`);
  readIds.value = new Set(Array.isArray(raw) ? raw : []);
}

function isRead(id: string) {
  return readIds.value.has(id);
}

function markRead(id: string) {
  readIds.value.add(id);
  uni.setStorageSync(`news_read_${active.value}`, [...readIds.value]);
}

function ago(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

async function loadSubs() {
  if (!getToken()) return;
  try {
    const data = await request<{ list: Subscribe[] }>('/subscribes');
    subs.value = data.list;
    if (!active.value && subs.value.length) active.value = subs.value[0].keyword;
  } catch { /* 静默 */ }
}

async function loadNews() {
  if (!active.value || !getToken()) return;
  loading.value = true;
  try {
    const data = await request<{ list: NewsItem[] }>(
      `/news?keyword=${encodeURIComponent(active.value)}&page=1&pageSize=20`
    );
    list.value = data.list;
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function select(keyword: string) {
  active.value = keyword;
  loadRead();
  loadNews();
}

function removeSub(s: Subscribe) {
  uni.showModal({
    title: '删除订阅',
    content: `不再接收「${s.keyword}」的资讯？`,
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await request(`/subscribes/${s.id}`, { method: 'DELETE' });
        subs.value = subs.value.filter((x) => x.id !== s.id);

        if (active.value === s.keyword) {
          active.value = subs.value[0]?.keyword || '';
          list.value = [];
          if (active.value) await loadNews();
        }
      } catch (e) {
        uni.showToast({ title: (e as Error).message, icon: 'none' });
      }
    },
  });
}

async function refresh() {
  if (!active.value) return;
  try {
    await request('/news/refresh', { method: 'POST', data: { keyword: active.value } });
    await loadNews();
    uni.showToast({ title: '已刷新', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

async function subscribe() {
  const keyword = draft.value.trim();
  if (!keyword) {
    uni.showToast({ title: '输入关键词', icon: 'none' });
    return;
  }

  if (TEMPLATE_ID.startsWith('TODO')) {
    uni.showModal({
      title: '未配置推送模板',
      content: '需先在小程序后台创建订阅消息模板，把 ID 填入 news/index.vue 的 TEMPLATE_ID。',
      showCancel: false,
    });
    return;
  }

  // #ifdef MP-WEIXIN
  try {
    const res: any = await new Promise((resolve, reject) => {
      uni.requestSubscribeMessage({ tmplIds: [TEMPLATE_ID], success: resolve, fail: reject });
    });
    if (res[TEMPLATE_ID] !== 'accept') {
      uni.showToast({ title: '需要允许通知才能推送', icon: 'none' });
      return;
    }
  } catch {
    uni.showToast({ title: '订阅授权失败', icon: 'none' });
    return;
  }
  // #endif

  try {
    await request('/subscribes', { method: 'POST', data: { keyword, templateId: TEMPLATE_ID } });
    sheet.value = false;
    draft.value = '';
    await loadSubs();
    select(keyword);
    await loadNews();
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}

function open(n: NewsItem) {
  markRead(n.id);
  uni.navigateTo({ url: `/pages/news/detail?url=${encodeURIComponent(n.url)}` });
}

onPullDownRefresh(async () => {
  await refresh();
  uni.stopPullDownRefresh();
});

const { logged } = useAuthGate(async () => {
  await loadSubs();
  await loadNews();
});
</script>

<style scoped>
.page { min-height: 100vh; padding: 12px 18px 80px; box-sizing: border-box; background: var(--bg); }

.chips { white-space: nowrap; }
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  margin-right: 8px; padding: 7px 14px;
  border-radius: 999px; border: 1px solid var(--line);
  background: var(--card); font-size: 11.5px; color: var(--muted);
}
.chip.on { background: var(--accent); border-color: transparent; color: #fff; }
.chip.add { border-style: dashed; }
.bal {
  font-size: 9px; padding: 0 5px; border-radius: 8px;
  background: rgba(59, 91, 219, .1); color: var(--accent);
}
.chip.on .bal { background: rgba(255, 255, 255, .24); color: #fff; }

.list { margin-top: 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0 14px; }
.group + .group { margin-top: 16px; }
.glabel { padding: 0 2px 7px; font-size: 10px; letter-spacing: 1px; color: var(--muted); }
.itop { display: flex; align-items: flex-start; gap: 6px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); margin-top: 5px; flex: 0 0 6px; }
.item { padding: 14px 0; border-bottom: 1px solid var(--line); }
.item:last-child { border-bottom: none; }
.ititle { font-size: 13px; font-weight: 600; line-height: 1.45; }
.isum {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; margin-top: 6px;
  font-size: 11px; line-height: 1.55; color: var(--muted);
}
.isrc { display: block; margin-top: 8px; font-size: 9.5px; color: var(--muted); }

.empty { display: flex; flex-direction: column; align-items: center; padding: 90px 0; }
.eico { font-size: 34px; opacity: .35; }
.et { margin-top: 14px; font-size: 13px; }
.es { margin-top: 6px; font-size: 11px; color: var(--muted); }

.refresh {
  position: fixed; right: 20px; bottom: calc(28px + env(safe-area-inset-bottom));
  width: 46px; height: 46px; border-radius: 50%;
  background: var(--card); border: 1px solid var(--line);
  color: var(--accent); font-size: 20px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow); z-index: 80;
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
.hint { margin-top: 12px; font-size: 10.5px; line-height: 1.7; color: var(--muted); }
</style>
