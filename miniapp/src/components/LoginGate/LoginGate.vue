<template>
  <view class="gate">
    <view class="gicon">🔒</view>
    <view class="gtitle">{{ title || '登录后使用' }}</view>
    <view class="gsub">{{ subtitle || '数据保存到云端，换手机也不丢' }}</view>
    <view class="gbtn" :class="{ loading }" @tap="onLogin">
      {{ loading ? '登录中…' : '微信登录' }}
    </view>
    <view class="ghint">仅用于识别身份，不获取其他信息</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { login } from '@/api/request';

defineProps<{ title?: string; subtitle?: string }>();

const loading = ref(false);

async function onLogin() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await login();
    // dev 模式说明服务端没配 WX_SECRET，登录没经过微信，得让用户看得见
    uni.showToast({
      title: res.loginMode === 'dev' ? '已登录（调试账号）' : '登录成功',
      icon: res.loginMode === 'dev' ? 'none' : 'success',
    });
    uni.$emit('login-success');
  } catch (e) {
    const msg = (e as Error)?.message || '登录失败，请重试';
    uni.showToast({ title: msg.slice(0, 40), icon: 'none' });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 90px 32px 0;
}
.gicon {
  font-size: 40px;
  opacity: 0.28;
}
.gtitle {
  margin-top: 18px;
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}
.gsub {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
  text-align: center;
}
.gbtn {
  margin-top: 26px;
  width: 200px;
  height: 44px;
  border-radius: 999px;
  background: var(--grad);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 20px rgba(59, 91, 219, 0.24);
}
.gbtn.loading {
  opacity: 0.7;
}
.ghint {
  margin-top: 16px;
  font-size: 10px;
  color: var(--muted);
  opacity: 0.8;
}
</style>
