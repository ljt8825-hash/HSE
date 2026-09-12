<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-01-B：移动端布局壳层（01-B/C 打磨版）
 * 自包含的顶部 + 主体（<router-view/>）+ 底部导航，不依赖 PC 端 BasicLayout。
 * 仅在 meta.noBasicLayout = true 的 /mobile 路由下使用。
 *
 * 打磨点：安全区(safe-area-inset)适配、去除点按高亮/双击缩放延迟、底部导航触控目标
 * 达标并加图标与 aria-current、详情页归入台账高亮、平板/横屏适度放宽、减少动态效果。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import { useAuthStore } from '#/store';

import '#/views/mobile/mobile.css';

defineOptions({ name: 'MobileLayout' });

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const authStore = useAuthStore();

const username = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '—',
);

const navItems = [
  {
    name: 'MobileHome',
    path: '/mobile/index',
    label: '首页',
    icon: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
  },
  {
    name: 'MobileGrid',
    path: '/mobile/grid',
    label: '我的网格',
    icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  },
  {
    name: 'MobileLedger',
    path: '/mobile/grid/ledger',
    label: '巡查台账',
    icon: 'M4 6h16M4 12h16M4 18h11',
  },
  {
    name: 'MobileMe',
    path: '/mobile/me',
    label: '我的',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c0-3.2 3.4-5.5 7.5-5.5s7.5 2.3 7.5 5.5',
  },
];

// 详情页 (/mobile/grid/detail/:id)、新增巡查 (/mobile/grid/new) 与
// 补传整改照片 (/mobile/grid/rectify/:id) 均归属「巡查台账」高亮
const activeName = computed(() =>
  route.name === 'MobileDetail' ||
  route.name === 'MobileGridNew' ||
  route.name === 'MobileGridRectify'
    ? 'MobileLedger'
    : route.name,
);

function go(path: string) {
  void router.push(path);
}

async function handleLogout() {
  await authStore.logout(true);
}
</script>

<template>
  <div class="mobile-shell">
    <header class="mobile-header">
      <span class="mobile-header__title">网格巡查</span>
      <span class="mobile-header__user">
        <span class="mobile-header__name">{{ username }}</span>
        <button class="mobile-header__logout m-btn" type="button" @click="handleLogout">
          退出
        </button>
      </span>
    </header>

    <main class="mobile-main">
      <router-view />
    </main>

    <nav class="mobile-bottom-nav" aria-label="移动端主导航">
      <button
        v-for="item in navItems"
        :key="item.name"
        type="button"
        class="mobile-bottom-nav__item m-btn"
        :class="{ 'is-active': activeName === item.name }"
        :aria-current="activeName === item.name ? 'page' : undefined"
        @click="go(item.path)"
      >
        <svg
          class="mobile-bottom-nav__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="item.icon" />
        </svg>
        <span class="mobile-bottom-nav__label">{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  background: #f4f5f7;
  color: #1f2329;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
    'Microsoft YaHei', sans-serif;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  overscroll-behavior: contain;
}

/* 平板 / 横屏：适度放宽，仍居中不拉伸 */
@media (min-width: 768px) {
  .mobile-shell {
    max-width: 560px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04);
  }
}

.mobile-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top));
  padding-left: calc(16px + env(safe-area-inset-left));
  padding-right: calc(16px + env(safe-area-inset-right));
  background: #ffffff;
  border-bottom: 1px solid #ebedf0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.mobile-header__title {
  font-size: 17px;
  font-weight: 600;
}

.mobile-header__user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mobile-header__name {
  max-width: 140px;
  overflow: hidden;
  font-size: 13px;
  color: #646a73;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-header__logout {
  border: none;
  background: #f2f3f5;
  color: #646a73;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
}

.mobile-main {
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px;
  padding-left: calc(12px + env(safe-area-inset-left));
  padding-right: calc(12px + env(safe-area-inset-right));
}

.mobile-bottom-nav {
  flex: 0 0 auto;
  display: flex;
  background: #ffffff;
  border-top: 1px solid #ebedf0;
  padding-bottom: env(safe-area-inset-bottom);
}

.mobile-bottom-nav__item {
  flex: 1;
  min-height: 52px;
  border: none;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 0;
  cursor: pointer;
  color: #8a8f99;
  font-size: 12px;
}

.mobile-bottom-nav__icon {
  width: 22px;
  height: 22px;
}

.mobile-bottom-nav__item.is-active {
  color: #2f7dcd;
  font-weight: 600;
}

.mobile-bottom-nav__label {
  line-height: 1.2;
}
</style>
