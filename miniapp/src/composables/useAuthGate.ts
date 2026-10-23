import { ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { isLoggedIn } from '@/api/request';

/**
 * 页面级登录守卫：
 * - logged=false 时页面渲染登录引导
 * - 登录成功后自动拉数据
 */
export function useAuthGate(onReady: () => void | Promise<void>) {
  const logged = ref(isLoggedIn());

  function sync() {
    logged.value = isLoggedIn();
    if (logged.value) void onReady();
  }

  onLoad(() => {
    uni.$on('login-success', sync);
    // token 过期被清掉时，页面要立刻切回登录引导
    uni.$on('need-login', sync);
  });

  onUnload(() => {
    uni.$off('login-success', sync);
    uni.$off('need-login', sync);
  });

  onShow(sync);

  return { logged };
}
