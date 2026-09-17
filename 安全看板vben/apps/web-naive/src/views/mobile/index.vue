<script lang="ts" setup>
/**
 * H5-GRID-UI-01 · 02 工作台（重构：最少必要信息）
 *
 * 冻结要求：手机端是「现场巡查记录工具」，不是 PC HSE 缩小版——
 *   - 展示：当前登录人员 + 网格长身份（employee_code / 组织 / 岗位）
 *   - 主按钮：【开始巡查】 → /mobile/inspection/start（统一取证流程）
 *   - 次入口：我的巡查记录（台账）/ 我的网格
 * 不搬运 PC 统计指标（原「今日巡查/待整改/历史巡查」卡片移除，不删数据接口）。
 * 身份来自既有 GET /api/current-employee（employee_code 为业务身份），fail-closed 展示。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import {
  getCurrentEmployeeContext,
  type CurrentEmployeeContext,
} from '#/api/hse/current-employee';

defineOptions({ name: 'MobileHome' });

const router = useRouter();
const userStore = useUserStore();

const loading = ref(true);
const contextError = ref('');
const context = ref<CurrentEmployeeContext | null>(null);

const realName = computed(
  () =>
    context.value?.employeeName ||
    userStore.userInfo?.realName ||
    userStore.userInfo?.username ||
    '',
);

const identityLine = computed(() => {
  const c = context.value;
  if (!c) return '';
  return [c.position, c.organization, c.operationUnit]
    .map((v) => (v ?? '').trim())
    .filter((v) => v !== '')
    .join(' · ');
});

async function loadContext() {
  loading.value = true;
  contextError.value = '';
  const res = await getCurrentEmployeeContext();
  if (res.ok) {
    context.value = res.context;
  } else {
    context.value = null;
    contextError.value = res.message;
  }
  loading.value = false;
}

onMounted(loadContext);

function startInspection() {
  // H5-GRID-UI-01：开始巡查 → 统一取证流程
  router.push('/mobile/inspection/start');
}

function goMyGrid() {
  router.push('/mobile/grid');
}

function goLedger() {
  router.push('/mobile/grid/ledger');
}
</script>

<template>
  <div class="home">
    <section class="home__welcome">
      <p class="home__hello">网格长巡查</p>
      <h1 class="home__name">{{ realName || '网格巡查员' }}</h1>
      <p v-if="context?.employeeCode" class="home__code">
        员工编码 {{ context.employeeCode }}
      </p>
      <p v-if="identityLine" class="home__identity">{{ identityLine }}</p>
    </section>

    <section v-if="loading" class="home__loading" aria-busy="true" aria-label="加载中">
      <div class="skeleton-card m-skeleton"></div>
    </section>

    <template v-else>
      <p v-if="contextError" class="home__error" role="alert">
        {{ contextError }}
        <button type="button" class="home__retry" @click="loadContext">重试</button>
      </p>

      <!-- 主按钮：开始巡查 -->
      <button
        type="button"
        class="home__start m-btn"
        :disabled="!!contextError"
        @click="startInspection"
      >
        开始巡查
      </button>

      <section class="home__actions">
        <button type="button" class="action-btn m-btn" @click="goLedger">
          我的巡查记录
        </button>
        <button type="button" class="action-btn m-btn" @click="goMyGrid">
          我的网格
        </button>
      </section>

      <p class="footnote">
        现场巡查记录工具：取证 → 判断 → 提交；三违后续处理由现有 HSE 系统完成。
      </p>
    </template>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.home__welcome {
  background: linear-gradient(135deg, #2f7dcd, #4a9be0);
  color: #fff;
  border-radius: 12px;
  padding: 20px 16px;
}

.home__hello {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}

.home__name {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 700;
}

.home__code {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.95;
}

.home__identity {
  margin: 4px 0 0;
  font-size: 12px;
  opacity: 0.85;
}

.home__loading {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.skeleton-card {
  height: 78px;
}

.home__error {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #d4380d;
  background: #fff1f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.home__retry {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  margin-left: 8px;
  border: none;
  background: #2f7dcd;
  color: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
}

.home__start {
  width: 100%;
  min-height: 56px;
  border: none;
  background: #2f7dcd;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  padding: 14px;
  border-radius: 14px;
  cursor: pointer;
}

.home__start:disabled {
  opacity: 0.55;
  cursor: default;
}

.home__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-btn {
  width: 100%;
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #2f7dcd;
  font-size: 15px;
  font-weight: 600;
  padding: 14px;
  border-radius: 12px;
  cursor: pointer;
}

.footnote {
  margin: 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}
</style>
