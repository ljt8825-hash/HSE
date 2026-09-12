<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-01-C：移动端首页（真实数据）
 * 复用现有 GET /api/site-mgmt/grid-records（服务端按 gridScope 身份过滤），
 * 仅做聚合展示，不伪造任何业务数值。当前登录人员为真实数据（来自 useUserStore）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import { getGridInspectionList } from '#/api/hse/site';
import type { SiteApi } from '#/api/hse/site';

defineOptions({ name: 'MobileHome' });

const router = useRouter();
const userStore = useUserStore();

const realName = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '',
);

const loading = ref(true);
const errorMsg = ref('');

const todayCount = ref(0);
const todoCount = ref(0);
const historyTotal = ref(0);
const gridCount = ref(0);

function isNegative(v: string | null | undefined): boolean {
  const s = (v ?? '').trim();
  return ['', '无', '--', '-', '否', '不需要', '无三违行为'].includes(s);
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await getGridInspectionList({ page: 1, pageSize: 200 });
    const list: SiteApi.GridInspectionRecord[] = res.list || [];
    const today = todayStr();

    let todayN = 0;
    let todoN = 0;
    const gridSet = new Set<number>();
    for (const r of list) {
      if (r.inspectionDate && String(r.inspectionDate).slice(0, 10) === today) {
        todayN += 1;
      }
      if (!isNegative(r.needRectification)) {
        todoN += 1;
      }
      if (r.gridId != null) gridSet.add(Number(r.gridId));
    }
    todayCount.value = todayN;
    todoCount.value = todoN;
    historyTotal.value = typeof res.total === 'number' ? res.total : list.length;
    gridCount.value = gridSet.size;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const metrics = computed(() => [
  { key: 'grid', label: '我的网格', value: String(gridCount.value) },
  { key: 'today', label: '今日巡查', value: String(todayCount.value) },
  { key: 'todo', label: '待整改', value: String(todoCount.value) },
  { key: 'history', label: '历史巡查', value: String(historyTotal.value) },
]);

function startInspection() {
  // GRID-02-B：首页「开始巡查」直达新增巡查表单（不再只是跳到台账）
  router.push('/mobile/grid/new');
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
      <p class="home__hello">欢迎回来</p>
      <h1 class="home__name">{{ realName || '网格巡查员' }}</h1>
    </section>

    <section v-if="loading" class="home__loading" aria-busy="true" aria-label="加载中">
      <div v-for="i in 4" :key="i" class="skeleton-card m-skeleton"></div>
    </section>

    <template v-else>
      <p v-if="errorMsg" class="home__error">
        {{ errorMsg }}
        <button type="button" class="home__retry" @click="load">重试</button>
      </p>

      <section class="home__metrics">
        <div v-for="m in metrics" :key="m.key" class="metric-card">
          <div class="metric-card__label">{{ m.label }}</div>
          <div class="metric-card__value">{{ m.value }}</div>
        </div>
      </section>

      <section class="home__actions">
        <button type="button" class="action-btn m-btn" @click="goMyGrid">
          我的网格
        </button>
        <button type="button" class="action-btn m-btn" @click="goLedger">
          巡查台账
        </button>
      </section>

      <button class="home__start m-btn" type="button" @click="startInspection">
        开始巡查
      </button>
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

.home__loading {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.skeleton-card {
  height: 78px;
}

.home__error {
  margin: 0;
  font-size: 13px;
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

.home__metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.metric-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.metric-card__label {
  font-size: 13px;
  color: #646a73;
}

.metric-card__value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  color: #1f2329;
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

.home__start {
  width: 100%;
  border: none;
  background: #2f7dcd;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  padding: 14px;
  border-radius: 12px;
  cursor: pointer;
}
</style>
