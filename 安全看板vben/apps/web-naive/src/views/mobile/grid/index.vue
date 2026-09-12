<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-01-C：移动端「我的网格」（真实数据）
 * 服务端按 gridScope（users.employee_id → grid_areas.personnel_id）过滤台账，
 * 本页从「当前账号可见的巡查记录」聚合出负责网格，并关联 grid_areas 取得名称/状态。
 * 不在前端推导 inspector_employee_id / grid_id（服务器权威）。
 *
 * 说明：当前无「仅返回我负责的网格」的独立端点，故「我的网格」由本人可见的巡查记录聚合得出，
 * 仅含【有巡查记录的网格】；若需展示尚未巡查的空网格，需后端新增只读端点
 * GET /site-mgmt/grid-areas/mine（复用 gridScope）。本页不做任何伪造。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import { getGridAreaList, getGridInspectionList } from '#/api/hse/site';
import type { SiteApi } from '#/api/hse/site';

defineOptions({ name: 'MobileGrid' });

const router = useRouter();
const userStore = useUserStore();

const realName = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '—',
);

const loading = ref(true);
const errorMsg = ref('');
const myGrids = ref<SiteApi.GridArea[]>([]);

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [recRes, areaRes] = await Promise.all([
      getGridInspectionList({ page: 1, pageSize: 200 }),
      getGridAreaList({ pageSize: 200 }),
    ]);
    const records: SiteApi.GridInspectionRecord[] = recRes.list || [];
    const areas: SiteApi.GridArea[] = areaRes.list || [];

    const areaMap = new Map<number, SiteApi.GridArea>();
    for (const a of areas) areaMap.set(Number(a.id), a);

    const ids = new Set<number>();
    for (const r of records) {
      if (r.gridId != null) ids.add(Number(r.gridId));
    }
    myGrids.value = [...ids]
      .map((id) => areaMap.get(id))
      .filter((a): a is SiteApi.GridArea => Boolean(a));
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openLedger() {
  router.push('/mobile/grid/ledger');
}
</script>

<template>
  <div class="grid-page">
    <div class="info-card">
      <div class="info-card__row">
        <span class="info-card__label">当前登录人员</span>
        <span class="info-card__value">{{ realName }}</span>
      </div>
      <div class="info-card__row">
        <span class="info-card__label">负责网格数量</span>
        <span class="info-card__value">{{ loading ? '—' : myGrids.length }}</span>
      </div>
    </div>

    <section v-if="loading" class="grid-page__loading" aria-busy="true" aria-label="加载中">
      <div v-for="i in 3" :key="i" class="skeleton-row m-skeleton"></div>
    </section>

    <p v-else-if="errorMsg" class="grid-page__error">
      {{ errorMsg }}
      <button type="button" class="grid-page__retry" @click="load">重试</button>
    </p>

    <section v-else-if="myGrids.length === 0" class="grid-page__empty">
      <p class="grid-page__empty-title">暂未查询到负责网格</p>
      <p class="grid-page__empty-desc">
        当前账号在可见范围内还没有巡查记录，或暂未分配网格。
      </p>
      <button type="button" class="grid-page__link m-btn" @click="openLedger">
        查看巡查台账
      </button>
    </section>

    <section v-else class="grid-list">
      <div v-for="g in myGrids" :key="g.id" class="grid-item">
        <div class="grid-item__head">
          <span class="grid-item__name">{{ g.name || '未命名网格' }}</span>
          <span class="grid-item__level">{{ g.gridLevel || '—' }}</span>
        </div>
        <div class="grid-item__meta">
          <span>状态：{{ g.status || '—' }}</span>
          <span>月巡查：{{ g.monthPatrolCount ?? 0 }}</span>
        </div>
        <div class="grid-item__meta">
          <span>网格编号：{{ g.gridCode || '—' }}</span>
          <span>完成率：{{ g.completionRate ?? 0 }}%</span>
        </div>
      </div>
    </section>

    <p class="grid-page__hint">
      说明：本页网格取自你的巡查记录，尚未产生巡查记录的网格不会显示。
    </p>
  </div>
</template>

<style scoped>
.grid-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-card {
  background: #fff;
  border-radius: 12px;
  padding: 4px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.info-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid #f2f3f5;
}

.info-card__row:last-child {
  border-bottom: none;
}

.info-card__label {
  font-size: 14px;
  color: #646a73;
}

.info-card__value {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
}

.grid-page__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-row {
  height: 76px;
}

.grid-page__error {
  margin: 0;
  font-size: 13px;
  color: #d4380d;
  background: #fff1f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.grid-page__retry {
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

.grid-page__empty {
  background: #fff;
  border-radius: 12px;
  padding: 28px 16px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.grid-page__empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
}

.grid-page__empty-desc {
  margin: 8px 0 14px;
  font-size: 12px;
  color: #8a8f99;
  line-height: 1.6;
}

.grid-page__link {
  min-width: 140px;
  border: 1px solid #2f7dcd;
  background: #fff;
  color: #2f7dcd;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
}

.grid-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.grid-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.grid-item__name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2329;
}

.grid-item__level {
  font-size: 12px;
  color: #2f7dcd;
  background: #eaf3fc;
  border-radius: 6px;
  padding: 2px 8px;
}

.grid-item__meta {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: #646a73;
}

.grid-page__hint {
  margin: 0;
  font-size: 12px;
  color: #8a8f99;
  line-height: 1.6;
}
</style>
