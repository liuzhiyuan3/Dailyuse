<template>
  <view class="page">
    <LoginGate v-if="!logged" title="登录后提交反馈" subtitle="反馈与你的账号绑定，便于回访" />
    <block v-else>
      <view class="tip">吐槽、提建议、想要什么新工具都欢迎——这些反馈直接送到开发者手里</view>

      <view class="card">
        <view class="kinds">
          <view
            v-for="k in kinds"
            :key="k.v"
            class="kind"
            :class="{ on: kind === k.v }"
            @tap="kind = k.v"
          >{{ k.label }}</view>
        </view>

        <textarea
          v-model="content"
          class="area"
          :maxlength="500"
          placeholder="写点具体的内容，比如：记账页希望支持自定义分类；希望加一个喝水提醒工具…"
          placeholder-class="ph"
        />
        <view class="count">{{ content.length }}/500</view>

        <view class="btn" hover-class="btn-hover" @tap="submit">提交反馈</view>
      </view>

      <view class="note">每天最多提交 5 条；提交后可在「我的 → 关于」里找到联系方式催进度</view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { getToken, request } from '@/api/request';
import { useAuthGate } from '@/composables/useAuthGate';

const kinds = [
  { v: 'bug', label: '遇到问题' },
  { v: 'idea', label: '功能建议' },
  { v: 'tool', label: '想要新工具' },
  { v: 'other', label: '其他' },
];

const kind = ref('idea');
const content = ref('');
const sending = ref(false);

async function submit() {
  const text = content.value.trim();
  if (text.length < 5) {
    uni.showToast({ title: '至少写 5 个字', icon: 'none' });
    return;
  }
  if (sending.value || !getToken()) return;
  sending.value = true;
  try {
    await request('/feedback', { method: 'POST', data: { kind: kind.value, content: text } });
    uni.showToast({ title: '已收到，谢谢反馈', icon: 'success' });
    content.value = '';
    setTimeout(() => uni.navigateBack(), 800);
  } catch (e) {
    uni.showToast({ title: (e as Error).message.slice(0, 40), icon: 'none' });
  } finally {
    sending.value = false;
  }
}

const { logged } = useAuthGate(() => {});
</script>

<style scoped>
.page { min-height: 100vh; padding: 14px 18px 40px; box-sizing: border-box; background: var(--bg); }

.tip {
  padding: 10px 12px; margin-bottom: 12px;
  border-radius: 10px; background: rgba(59, 91, 219, .06);
  font-size: 10.5px; line-height: 1.6; color: var(--muted);
}

.card {
  padding: 14px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.kinds { display: flex; flex-wrap: wrap; gap: 8px; }
.kind {
  padding: 7px 13px; border-radius: 999px;
  border: 1px solid var(--line); font-size: 11px; color: var(--muted);
}
.kind.on { background: var(--accent); border-color: transparent; color: #fff; }

.area {
  margin-top: 14px; width: 100%; height: 150px; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; font-size: 12px; box-sizing: border-box;
}
.ph { color: var(--muted); }
.count { margin-top: 4px; text-align: right; font-size: 9.5px; color: var(--muted); }

.btn {
  margin-top: 14px; padding: 12px; text-align: center;
  border-radius: 12px; background: var(--grad); color: #fff;
  font-size: 12.5px; font-weight: 600;
}
.btn-hover { transform: scale(.98); }
.note { margin-top: 12px; text-align: center; font-size: 10px; color: var(--muted); }
</style>
