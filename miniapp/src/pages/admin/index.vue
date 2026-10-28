<template>
  <view class="page">
    <view class="seg">
      <view class="s" :class="{ on: tab === 'notice' }" @tap="tab = 'notice'">发通知</view>
      <view class="s" :class="{ on: tab === 'feedback' }" @tap="tab = 'feedback'">用户反馈</view>
    </view>

    <!-- 发布通知 -->
    <block v-if="tab === 'notice'">
      <view class="card">
        <input v-model="title" class="ipt" placeholder="标题（60 字内）" placeholder-class="ph" />
        <textarea
          v-model="content"
          class="area"
          :maxlength="2000"
          placeholder="通知内容，所有用户在「消息通知」和首页都能看到"
          placeholder-class="ph"
        />
        <view class="btn" hover-class="btn-hover" @tap="publish">发布</view>
      </view>

      <view v-if="!notices.length" class="emptyline">还没有发过通知</view>
      <view v-else class="list">
        <view v-for="a in notices" :key="a.id" class="row" @longpress="removeNotice(a)">
          <view class="left">
            <text class="t">{{ a.title }}</text>
            <text class="m">{{ fmt(a.createdAt) }}</text>
          </view>
          <text class="del" @tap.stop="removeNotice(a)">撤下</text>
        </view>
      </view>
    </block>

    <!-- 用户反馈 -->
    <block v-else>
      <view class="filters">
        <view class="f" :class="{ on: fbStatus === '' }" @tap="fbStatus = ''; loadFeedback()">全部</view>
        <view class="f" :class="{ on: fbStatus === 'new' }" @tap="fbStatus = 'new'; loadFeedback()">待处理</view>
        <view class="f" :class="{ on: fbStatus === 'handled' }" @tap="fbStatus = 'handled'; loadFeedback()">已处理</view>
      </view>

      <view v-if="!feedbacks.length" class="emptyline">没有符合条件的反馈</view>
      <view v-else class="list">
        <view v-for="f in feedbacks" :key="f.id" class="frow" @tap="toggleFeedback(f)">
          <view class="fhead">
            <text class="fkind" :class="f.kind">{{ kindLabel(f.kind) }}</text>
            <text class="fnick">{{ f.nickname || '未设昵称' }}</text>
            <text class="badge" :class="{ handled: f.status === 'handled' }">
              {{ f.status === 'handled' ? '已处理' : '待处理' }}
            </text>
          </view>
          <text class="fbody">{{ f.content }}</text>
          <text class="ftime">{{ fmt(f.createdAt) }} · 点{{ f.status === 'handled' ? '标记待处理' : '标记已处理' }}</text>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { request } from '@/api/request';

interface Announcement { id: string; title: string; content: string; createdAt: string }
interface Feedback {
  id: string;
  kind: string;
  content: string;
  status: string;
  createdAt: string;
  nickname: string;
}

const tab = ref<'notice' | 'feedback'>('notice');
const title = ref('');
const content = ref('');
const notices = ref<Announcement[]>([]);
const feedbacks = ref<Feedback[]>([]);
const fbStatus = ref('');

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function kindLabel(k: string) {
  if (k === 'bug') return '遇到问题';
  if (k === 'idea') return '功能建议';
  if (k === 'tool') return '想要新工具';
  return '其他';
}

/** 非管理员直接拦下（入口本来就只对管理员展示，这里防直链） */
async function guard() {
  try {
    const me = await request<{ user: { isAdmin?: boolean } }>('/auth/me');
    if (!me.user.isAdmin) {
      uni.showToast({ title: '需要管理员权限', icon: 'none' });
      setTimeout(() => uni.navigateBack(), 800);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function loadNotices() {
  try {
    const d = await request<{ list: Announcement[] }>('/admin/announcements');
    notices.value = d.list;
  } catch {
    notices.value = [];
  }
}

async function loadFeedback() {
  try {
    const d = await request<{ list: Feedback[] }>(
      fbStatus.value ? `/admin/feedback?status=${fbStatus.value}` : '/admin/feedback'
    );
    feedbacks.value = d.list;
  } catch {
    feedbacks.value = [];
  }
}

async function publish() {
  const t = title.value.trim();
  const c = content.value.trim();
  if (!t || !c) {
    uni.showToast({ title: '标题和内容都要填', icon: 'none' });
    return;
  }
  try {
    await request('/admin/announcements', { method: 'POST', data: { title: t, content: c } });
    uni.showToast({ title: '已发布', icon: 'success' });
    title.value = '';
    content.value = '';
    await loadNotices();
  } catch (e) {
    uni.showToast({ title: (e as Error).message.slice(0, 40), icon: 'none' });
  }
}

function removeNotice(a: Announcement) {
  uni.showModal({
    title: '撤下通知',
    content: `撤下「${a.title}」？用户端将不再显示。`,
    confirmColor: '#E03131',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await request(`/admin/announcements/${a.id}`, { method: 'DELETE' });
        await loadNotices();
      } catch (e) {
        uni.showToast({ title: (e as Error).message.slice(0, 40), icon: 'none' });
      }
    },
  });
}

async function toggleFeedback(f: Feedback) {
  const next = f.status === 'handled' ? 'new' : 'handled';
  try {
    await request(`/admin/feedback/${f.id}`, { method: 'PATCH', data: { status: next } });
    f.status = next;
  } catch (e) {
    uni.showToast({ title: (e as Error).message.slice(0, 40), icon: 'none' });
  }
}

onLoad(async () => {
  if (!(await guard())) return;
  await loadNotices();
});

onShow(() => {
  void loadFeedback();
});
</script>

<style scoped>
.page { min-height: 100vh; padding: 14px 18px 40px; box-sizing: border-box; background: var(--bg); }

.seg { display: flex; gap: 6px; margin-bottom: 12px; }
.s { padding: 7px 16px; border-radius: 999px; font-size: 11.5px; color: var(--muted); background: var(--card); border: 1px solid var(--line); }
.s.on { background: var(--accent); color: #fff; border-color: transparent; }

.card {
  padding: 14px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 12px;
}
.ipt {
  height: 38px; padding: 0 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12px;
}
.area {
  margin-top: 10px; width: 100%; height: 130px; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12px; box-sizing: border-box;
}
.ph { color: var(--muted); }
.btn {
  margin-top: 12px; padding: 11px; text-align: center;
  border-radius: 12px; background: var(--grad); color: #fff;
  font-size: 12.5px; font-weight: 600;
}
.btn-hover { transform: scale(.98); }

.list {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 0 14px;
}
.row { display: flex; align-items: center; gap: 10px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: none; }
.left { flex: 1; min-width: 0; }
.t { font-size: 12.5px; font-weight: 600; display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.m { font-size: 9.5px; color: var(--muted); }
.del { font-size: 10px; color: #E03131; }

.filters { display: flex; gap: 6px; margin-bottom: 10px; }
.f { padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); font-size: 10.5px; color: var(--muted); }
.f.on { background: rgba(59, 91, 219, .1); border-color: transparent; color: var(--accent); font-weight: 600; }

.frow { padding: 13px 0; border-bottom: 1px solid var(--line); }
.frow:last-child { border-bottom: none; }
.fhead { display: flex; align-items: center; gap: 8px; }
.fkind {
  padding: 2px 8px; border-radius: 5px;
  background: rgba(59, 91, 219, .1); color: var(--accent);
  font-size: 9.5px; font-weight: 600;
}
.fkind.bug { background: rgba(224, 49, 49, .1); color: #E03131; }
.fkind.tool { background: rgba(245, 159, 0, .14); color: #B8860B; }
.fnick { flex: 1; font-size: 10px; color: var(--muted); }
.badge { font-size: 9px; padding: 2px 7px; border-radius: 999px; background: var(--line); color: var(--muted); }
.badge.handled { background: rgba(55, 178, 77, .12); color: #2F9E44; }
.fbody { display: block; margin-top: 8px; font-size: 11.5px; line-height: 1.7; color: var(--fg); }
.ftime { display: block; margin-top: 6px; font-size: 9.5px; color: var(--muted); }

.emptyline { padding: 40px 0; text-align: center; font-size: 11px; color: var(--muted); }
</style>
