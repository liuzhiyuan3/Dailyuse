<template>
  <web-view v-if="url" :src="url" />
  <view v-else class="empty">链接无效</view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const url = ref('');

onLoad((q) => {
  const raw = (q as Record<string, string>)?.url || '';
  const decoded = raw ? decodeURIComponent(raw) : '';
  // 只允许 http(s)，避免被构造成非预期协议
  url.value = /^https?:\/\//i.test(decoded) ? decoded : '';
});
</script>

<style scoped>
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60vh;
  font-size: 13px;
  color: var(--muted);
}
</style>
