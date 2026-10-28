<template>
  <view class="page">
    <view class="hero">
      <image class="logo" src="/static/tabbar/tools-active.png" mode="aspectFit" />
      <view class="name">日常使用 Dailyuse</view>
      <view class="ver">v0.1.0</view>
    </view>

    <view class="card">
      <view class="ct">这是什么</view>
      <view class="cl">一个不打扰的小工具合集：待办、便签、记账、倒数日打开即用；便签还能设定期提醒；和家人朋友共享群组待办。无广告、不导流。</view>
    </view>

    <view class="card">
      <view class="ct">你的数据</view>
      <view class="cl">· 工具数据在你登录后存到云端，未登录时只留在本机。</view>
      <view class="cl">· 只用微信 openid 识别身份，不采集通讯录和位置。</view>
      <view class="cl">· 工具提醒用微信订阅消息，一次授权只推送一次，可随时在「提醒设置」删除。</view>
      <view class="cl">· 可随时在「我的 → 数据导出」备份，或删除账号清空全部数据。</view>
    </view>

    <view class="card">
      <view class="ct">联系与反馈</view>
      <view class="cl">通过小程序内「意见反馈」或开发者主页留言。</view>
    </view>

    <view class="foot">© 2026 Dailyuse</view>
  </view>
</template>

<script setup lang="ts">
// 静态说明页，无逻辑
</script>

<style scoped>
.page { min-height: 100vh; padding: 24px 18px 30px; box-sizing: border-box; background: var(--bg); }

.hero { display: flex; flex-direction: column; align-items: center; padding: 20px 0 8px; }
.logo { width: 56px; height: 56px; border-radius: 14px; }
.name { margin-top: 12px; font-size: 16px; font-weight: 600; }
.ver { margin-top: 4px; font-size: 10px; color: var(--muted); }

.card {
  margin-top: 14px; padding: 14px 16px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.ct { font-size: 12.5px; font-weight: 600; }
.cl { margin-top: 8px; font-size: 11px; line-height: 1.8; color: var(--muted); }

.foot { margin-top: 22px; text-align: center; font-size: 10px; color: var(--muted); }
</style>
