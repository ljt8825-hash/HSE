<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 移动端布局壳层
 *
 * 复用现有移动端设计令牌与触控原语（src/views/mobile/mobile.css 的 m-* 类），
 * 不新增 UI 框架、不引入 Ant Design Vue，样式以 .mobile-shell 作用域隔离，
 * 不影响 PC 端。
 *
 * 与既有 /mobile 的差异：本壳层服务于「WPS 驱动的移动 HSE V1」，
 * 使用独立的手机号临时会话（src/api/mw/session.ts），不读写正式 JWT。
 */
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import { logout, transportInfo } from '#/api/mw';
import type { MobileAccount } from '#/api/mw';
import { clearSession } from '#/api/mw/session';
import { currentAccount } from '#/api/mw/index';

import '#/views/mobile/mobile.css';

defineOptions({ name: 'MwLayout' });

const router = useRouter();
const route = useRoute();

const account = ref<MobileAccount | null>(null);
const info = transportInfo();

/** 是否为 TEST 占位数据（必须显式告知用户，不得粉饰） */
const isTest = computed(() => info.isTestData);

const navItems = [
  {
    name: 'MwHome',
    path: '/mw/home',
    label: '首页',
    icon: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
  },
  {
    name: 'MwCapture',
    path: '/mw/violation/capture',
    label: '三违上报',
    icon: 'M12 3v10M12 3 8 7M12 3l4 4M5 14v6h14v-6',
  },
  {
    name: 'MwRectifyList',
    path: '/mw/rectify',
    label: '我的整改',
    icon: 'M4 20h6V10H4zM14 20h6V4h-6z',
  },
  {
    name: 'MwReviewList',
    path: '/mw/review',
    label: '我的复查',
    icon: 'M20 6 9 17l-5-5',
  },
  {
    name: 'MwTaskList',
    path: '/mw/task',
    label: '我的任务',
    icon: 'M4 6h16M4 12h16M4 18h11',
  },
];

const activeName = computed(() => {
  const n = String(route.name || '');
  if (
    n === 'MwPerson' ||
    n === 'MwBehavior' ||
    n === 'MwDispose' ||
    n === 'MwRectifyForm' ||
    n === 'MwTransfer' ||
    n === 'MwDetail'
  ) {
    return 'MwCapture';
  }
  return n;
});

async function load() {
  account.value = await currentAccount();
  if (!account.value) {
    router.replace('/mw/login');
  }
}

function go(path: string) {
  void router.push(path);
}

function handleLogout() {
  logout();
  clearSession();
  void router.replace('/mw/login');
}

onMounted(load);
</script>

<template>
  <div class="mobile-shell mw-shell">
    <header class="mobile-header">
      <span class="mobile-header__title">移动 HSE · 三违</span>
      <span class="mobile-header__user">
        <span class="mobile-header__name">{{ account?.name || '未登录' }}</span>
        <button class="mobile-header__logout m-btn" type="button" @click="handleLogout">
          退出
        </button>
      </span>
    </header>

    <!-- TEST 数据横幅：只要当前数据源是占位数据就常驻，不隐瞒 -->
    <div v-if="isTest" class="mw-testbar">
      TEST 数据 · {{ info.label }}：{{ info.description }}
    </div>

    <main class="mobile-main mw-main">
      <RouterView />
    </main>

    <nav class="mobile-bottom-nav" aria-label="移动 HSE 主导航">
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
.mw-shell {
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

.mw-testbar {
  flex: 0 0 auto;
  padding: 6px 14px;
  background: #fff7e6;
  border-bottom: 1px solid #ffe7ba;
  color: #ad6800;
  font-size: 12px;
  line-height: 1.5;
}

.mw-main {
  padding-bottom: 16px;
}
</style>
