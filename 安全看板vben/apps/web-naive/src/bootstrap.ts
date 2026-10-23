import { createApp, watchEffect } from 'vue';

import { registerAccessDirective } from '@vben/access';
import { registerLoadingDirective } from '@vben/common-ui';
import { preferences } from '@vben/preferences';
import { initStores, useAccessStore, useUserStore } from '@vben/stores';

import { getAccessCodesApi, getUserInfoApi, loginApi } from '#/api';
import '@vben/styles';
import '@vben/styles/naive';

// HSE 主题覆盖：将 VXE Table 主色族改为 HSE 安全绿（亮/暗一致）
import '#/styles/hse-vxe-overrides.css';

import { useTitle } from '@vueuse/core';

import { $t, setupI18n } from '#/locales';

import { initComponentAdapter } from './adapter/component';
import { initSetupVbenForm } from './adapter/form';
// 触发 setupVbenVxeTable：注册 VXE 组件、暗/亮主题切换、语言与全局配置
import './adapter/vxe-table';
import App from './app.vue';
import { router } from './router';

async function bootstrap(namespace: string) {
  // 初始化组件适配器
  await initComponentAdapter();

  // 初始化表单组件
  await initSetupVbenForm();

  // // 设置弹窗的默认配置
  // setDefaultModalProps({
  //   fullscreenButton: false,
  // });
  // // 设置抽屉的默认配置
  // setDefaultDrawerProps({
  //   // zIndex: 2000,
  // });

  const app = createApp(App);

  // 注册v-loading指令
  registerLoadingDirective(app, {
    loading: 'loading', // 在这里可以自定义指令名称,也可以明确提供false表示不注册这个指令
    spinning: 'spinning',
  });

  // 与 app 无关的初始化可并行，缩短启动序列
  await Promise.all([
    initComponentAdapter(),
    initSetupVbenForm(),
  ]);

  // 依赖 app 的初始化也可并行
  await Promise.all([
    setupI18n(app),
    initStores(app, { namespace }),
  ]);

  // 开发阶段自动登录：跳过登录页（含滑块验证），仅 dev 生效，生产不受影响
  if (import.meta.env.DEV) {
    await devAutoLogin();
  }

  // 安装权限指令
  registerAccessDirective(app);

  // 两个动态插件并行初始化
  await Promise.all([
    (async () => {
      const { initTippy } = await import('@vben/common-ui/es/tippy');
      initTippy(app);
    })(),
    (async () => {
      const { MotionPlugin } = await import('@vben/plugins/motion');
      app.use(MotionPlugin);
    })(),
  ]);

  // 配置路由及路由守卫
  app.use(router);

  // 动态更新标题
  watchEffect(() => {
    if (preferences.app.dynamicTitle) {
      const routeTitle = router.currentRoute.value.meta?.title;
      const pageTitle =
        (routeTitle ? `${$t(routeTitle)} - ` : '') + preferences.app.name;
      useTitle(pageTitle);
    }
  });

  app.mount('#app');
}

export { bootstrap };

/**
 * 开发阶段自动登录（仅 dev 调用）。
 * 直接调登录接口并写入 store，绕过登录页及滑块验证。
 * 若后端不可用或账号失效则静默降级，仍可手动登录。
 * 注意：此处不用 useAuthStore（其内部依赖 useRouter，非组件上下文会报错）。
 */
async function devAutoLogin() {
  const accessStore = useAccessStore();
  const userStore = useUserStore();

  // 已有 token 则跳过（含 keep-alive / 刷新场景）
  if (accessStore.accessToken) {
    return;
  }

  const username = import.meta.env.VITE_DEV_USERNAME || 'admin';
  const password = import.meta.env.VITE_DEV_PASSWORD || 'admin123';

  try {
    const { accessToken } = await loginApi({ username, password });
    accessStore.setAccessToken(accessToken);

    const [userInfo, accessCodes] = await Promise.all([
      getUserInfoApi(),
      getAccessCodesApi(),
    ]);
    userStore.setUserInfo(userInfo);
    accessStore.setAccessCodes(accessCodes);
  } catch (error) {
    // 后端未启动 / 账号不可用，交给登录页手动处理
    console.error('[dev] 自动登录失败，请手动登录：', error);
  }
}
