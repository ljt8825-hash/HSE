<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-01-B：移动端「我的」页
 * 展示真实登录信息（来自 useUserStore），并提供退出登录。
 * 复用现有 authStore.logout，不新增任何身份/账号体系。
 */
import { computed } from 'vue';

import { useUserStore } from '@vben/stores';
import { useAuthStore } from '#/store';

defineOptions({ name: 'MobileMe' });

const userStore = useUserStore();
const authStore = useAuthStore();

const info = computed(() => userStore.userInfo);
const roles = computed(() => info.value?.roles?.join('、') || '—');

async function handleLogout() {
  await authStore.logout(true);
}
</script>

<template>
  <div class="me-page">
    <div class="me-card">
      <div class="me-card__name">{{ info?.realName || info?.username || '—' }}</div>
      <div class="me-card__sub">{{ info?.username || '' }}</div>
    </div>

    <div class="info-list">
      <div class="info-list__row">
        <span>账号</span><span>{{ info?.username || '—' }}</span>
      </div>
      <div class="info-list__row">
        <span>姓名</span><span>{{ info?.realName || '—' }}</span>
      </div>
      <div class="info-list__row">
        <span>角色</span><span>{{ roles }}</span>
      </div>
    </div>

    <button class="me-logout m-btn" type="button" @click="handleLogout">
      退出登录
    </button>
  </div>
</template>

<style scoped>
.me-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.me-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px 16px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.me-card__name {
  font-size: 18px;
  font-weight: 700;
  color: #1f2329;
}

.me-card__sub {
  margin-top: 4px;
  font-size: 13px;
  color: #8a8f99;
}

.info-list {
  background: #fff;
  border-radius: 12px;
  padding: 4px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.info-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid #f2f3f5;
  font-size: 14px;
}

.info-list__row:last-child {
  border-bottom: none;
}

.info-list__row span:first-child {
  color: #646a73;
}

.info-list__row span:last-child {
  color: #1f2329;
  font-weight: 600;
}

.me-logout {
  width: 100%;
  min-height: 48px;
  border: none;
  background: #fff;
  color: #d54941;
  font-size: 15px;
  font-weight: 600;
  padding: 14px;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
</style>
