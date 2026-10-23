<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后使用" subtitle="数据云端保存，换设备不丢" />
    <block v-else>
    <view class="profile">
      <image v-if="profile.avatarUrl" class="pav pav-img" :src="profile.avatarUrl" mode="aspectFill" />
      <view v-else class="pav">{{ initial }}</view>
      <view class="pinfo" @tap="editNickname">
        <view class="pname">
          {{ profile.nickname || '未设置昵称' }}
          <text class="pedit">✎</text>
        </view>
        <view class="psub">
          <text v-if="isDev" class="pdev">调试账号</text>
          <text>{{ isDev ? '未接通微信，仅本机使用' : '数据已云端同步' }}</text>
        </view>
      </view>
    </view>

    <view class="quota">
      <view class="qleft">
        <view class="qt">微信提醒额度</view>
        <view class="qs">一次授权可提醒一次，用完需补充</view>
      </view>
      <view class="qnum num">{{ quota }}<text class="qunit">次</text></view>
    </view>

    <view class="menu">
      <view v-for="m in menus" :key="m.t" class="mrow" @tap="todo(m.t)">
        <text class="mico">{{ m.icon }}</text>
        <text class="mt">{{ m.t }}</text>
        <text class="marr">›</text>
      </view>
    </view>

    <view class="logout" @tap="doLogout">退出登录</view>
    <view class="ver">Dailyuse v0.1.0</view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { clearToken, fetchMe, request, updateMe, type Me } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

const quota = ref(0);
const profile = ref<Partial<Me>>({});
const isDev = ref(false);

const initial = computed(() => {
  const name = profile.value.nickname?.trim();
  return name ? name.slice(0, 1) : '我';
});

async function loadProfile() {
  try {
    const d = await fetchMe();
    profile.value = d.user;
    isDev.value = d.loginMode === 'dev';
  } catch {
    // token 失效时 request 内部已清 token 并广播 need-login，这里不用再处理
  }
}

async function loadQuota() {
  try {
    const d = await request<{ list: Array<{ status: string; remain: number }> }>('/reminders');
    quota.value = d.list.filter((r) => r.status === 'pending').reduce((sum, r) => sum + r.remain, 0);
  } catch {
    /* 静默 */
  }
}

function loadAll() {
  void loadProfile();
  void loadQuota();
}

const { logged } = useAuthGate(loadAll);

const menus = [
  { icon: '🔔', t: '提醒设置' },
  { icon: '📰', t: '我的订阅' },
  { icon: '👥', t: '我的群组' },
  { icon: '📤', t: '数据导出' },
  { icon: 'ℹ️', t: '关于' },
];

// 昵称：用微信原生的 nickname 输入能力，避免自己造 profile 授权（已废弃）
function editNickname() {
  uni.showModal({
    title: '修改昵称',
    editable: true,
    placeholderText: '最多 24 个字',
    content: profile.value.nickname || '',
    success: async (res) => {
      if (!res.confirm) return;
      const nickname = (res.content || '').trim();
      if (nickname === (profile.value.nickname || '')) return;
      try {
        const d = await updateMe({ nickname });
        profile.value = d.user;
        uni.showToast({ title: '已保存', icon: 'success' });
      } catch (e) {
        uni.showToast({ title: (e as Error).message.slice(0, 40), icon: 'none' });
      }
    },
  } as UniApp.ShowModalOptions & { editable?: boolean; placeholderText?: string });
}

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后本机需要重新登录才能查看数据，云端数据不会删除。',
    confirmText: '退出',
    confirmColor: '#E03131',
    success: (res) => {
      if (!res.confirm) return;
      clearToken();
      void request('/auth/logout', { method: 'POST' }).catch(() => {});
      profile.value = {};
      quota.value = 0;
      logged.value = false;
      uni.showToast({ title: '已退出', icon: 'none' });
    },
  });
}

const menuRoutes: Record<string, string> = {
  提醒设置: '/pages/mine/reminders',
  我的群组: '/pages/group/index',
  我的订阅: '/pages/news/subscribes',
};

function todo(name: string) {
  const url = menuRoutes[name];
  if (url) {
    uni.navigateTo({ url });
    return;
  }
  uni.showToast({ title: `${name}（建设中）`, icon: 'none' });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 18px;
  box-sizing: border-box;
  background: var(--bg);
}

.profile {
  display: flex; align-items: center; gap: 12px;
  padding: 18px 16px;
  background: var(--grad); color: #fff;
  border-radius: var(--radius);
  box-shadow: 0 10px 24px rgba(59, 91, 219, 0.22);
}
.pav {
  width: 44px; height: 44px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.24);
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600;
}
.pinfo { flex: 1; }
.pav-img { display: block; }
.pname { font-size: 15px; font-weight: 600; }
.pedit { margin-left: 6px; font-size: 11px; opacity: 0.75; }
.psub { margin-top: 3px; font-size: 10px; opacity: 0.82; display: flex; align-items: center; gap: 6px; }
.pdev {
  padding: 1px 6px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.45);
  font-size: 9px; font-weight: 600;
}
.pbtn {
  padding: 6px 14px; border-radius: 999px;
  background: #fff; color: var(--accent);
  font-size: 11px; font-weight: 600;
}

.quota {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 12px; padding: 14px 16px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.qt { font-size: 12px; font-weight: 600; }
.qs { margin-top: 4px; font-size: 10px; color: var(--muted); }
.qnum { font-size: 22px; font-weight: 600; color: var(--accent); }
.qunit { font-size: 10px; color: var(--muted); font-weight: 400; margin-left: 2px; }

.menu {
  margin-top: 12px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 0 14px;
}
.mrow {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 0; border-bottom: 1px solid var(--line);
}
.mrow:last-child { border-bottom: none; }
.mico { font-size: 15px; }
.mt { flex: 1; font-size: 12.5px; }
.marr { font-size: 16px; color: var(--muted); }

.logout {
  margin-top: 16px; padding: 13px;
  text-align: center; font-size: 12px; color: #E03131;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius);
}
.ver { margin-top: 24px; text-align: center; font-size: 10px; color: var(--muted); }
</style>
