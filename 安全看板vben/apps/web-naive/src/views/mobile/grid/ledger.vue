<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-01-C：移动端「巡查台账」（真实数据）
 * 复用 GET /api/site-mgmt/grid-records（服务端按 gridScope 身份过滤，fail-closed）。
 * 列表含加载 / 空 / 错误三态 + 分页（加载更多）。点击条目进入详情（携带整行数据，
 * 因后端无独立 GET /:id 端点，详情复用列表全字段）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { getGridAreaList, getGridInspectionList } from '#/api/hse/site';
import type { SiteApi } from '#/api/hse/site';

defineOptions({ name: 'MobileLedger' });

const router = useRouter();

const PAGE_SIZE = 10;

const loading = ref(true);
const loadingMore = ref(false);
const errorMsg = ref('');
const list = ref<SiteApi.GridInspectionRecord[]>([]);
const total = ref(0);
const page = ref(1);
const areaMap = ref<Map<number, SiteApi.GridArea>>(new Map());

function isNegative(v: string | null | undefined): boolean {
  const s = (v ?? '').trim();
  return ['', '无', '--', '-', '否', '不需要', '无三违行为'].includes(s);
}

function gridName(id: number | null | undefined): string {
  if (id == null) return '—';
  const a = areaMap.value.get(Number(id));
  return a?.name || `网格#${id}`;
}

async function ensureAreas() {
  if (areaMap.value.size > 0) return;
  try {
    const res = await getGridAreaList({ pageSize: 200 });
    const m = new Map<number, SiteApi.GridArea>();
    for (const a of res.list || []) m.set(Number(a.id), a);
    areaMap.value = m;
  } catch {
    // 网格名称仅用于展示，失败时回退到 gridId
  }
}

async function loadFirst() {
  loading.value = true;
  errorMsg.value = '';
  page.value = 1;
  try {
    await ensureAreas();
    const res = await getGridInspectionList({ page: 1, pageSize: PAGE_SIZE });
    list.value = res.list || [];
    total.value = typeof res.total === 'number' ? res.total : (res.list || []).length;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value) return;
  if (list.value.length >= total.value) return;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const res = await getGridInspectionList({ page: next, pageSize: PAGE_SIZE });
    const added: SiteApi.GridInspectionRecord[] = res.list || [];
    list.value = [...list.value, ...added];
    page.value = next;
    if (typeof res.total === 'number') total.value = res.total;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '加载失败，请重试';
  } finally {
    loadingMore.value = false;
  }
}

onMounted(loadFirst);

const hasMore = computed(() => list.value.length < total.value);

function formatDate(v: string | null): string {
  if (!v) return '—';
  return String(v).slice(0, 10);
}

function openDetail(rec: SiteApi.GridInspectionRecord) {
  // 后端无独立 GET /:id，详情复用列表行数据；通过 history.state 传递（JSON 字符串，
  // 满足 vue-router 对 state 值的类型约束，且在同一条历史记录内刷新后可恢复）。
  router.push({
    path: `/mobile/grid/detail/${rec.id}`,
    state: { record: JSON.stringify(rec) },
  });
}

/** GRID-02-B：新增巡查入口（沿用现有移动端路由，不新建第二个页面） */
function goNew() {
  router.push('/mobile/grid/new');
}

/**
 * GRID-03-B：进入「补传整改照片」。
 * 后端无独立 GET /grid-records/:id，记录随列表行通过 history.state 携带（与详情页一致）。
 */
function goRectify(rec: SiteApi.GridInspectionRecord) {
  router.push({
    path: `/mobile/grid/rectify/${rec.id}`,
    state: { record: JSON.stringify(rec) },
  });
}
</script>

<template>
  <div class="ledger-page">
    <!-- GRID-02-B 新增巡查入口：所有状态（加载/错误/空/列表）下均可用，未改动原有区块 -->
    <div class="ledger-page__bar">
      <span class="ledger-page__bar-title">巡查台账</span>
      <button type="button" class="ledger-page__new m-btn" @click="goNew">
        + 新增巡查
      </button>
    </div>

    <section v-if="loading" class="ledger-page__loading" aria-busy="true" aria-label="加载中">
      <div v-for="i in 4" :key="i" class="skeleton-row m-skeleton"></div>
    </section>

    <p v-else-if="errorMsg" class="ledger-page__error">
      {{ errorMsg }}
      <button type="button" class="ledger-page__retry" @click="loadFirst">
        重试
      </button>
    </p>

    <section
      v-else-if="list.length === 0"
      class="ledger-page__empty"
    >
      <p class="ledger-page__empty-title">暂无巡查记录</p>
      <p class="ledger-page__empty-desc">
        当前账号暂无可查看的巡查记录。
      </p>
      <button type="button" class="ledger-page__new ledger-page__new--block m-btn" @click="goNew">
        + 新增巡查
      </button>
    </section>

    <section v-else class="ledger-list">
      <div
        v-for="rec in list"
        :key="rec.id"
        class="ledger-item"
        role="button"
        tabindex="0"
        @click="openDetail(rec)"
        @keyup.enter="openDetail(rec)"
      >
        <div class="ledger-item__head">
          <span class="ledger-item__date">{{ formatDate(rec.inspectionDate) }}</span>
          <span class="ledger-item__tag">{{ rec.reportStatus || '—' }}</span>
        </div>
        <div class="ledger-item__line">
          <span class="ledger-item__label">网格</span>
          <span class="ledger-item__value">{{ gridName(rec.gridId) }}</span>
        </div>
        <div class="ledger-item__line">
          <span class="ledger-item__label">片区</span>
          <span class="ledger-item__value">{{ rec.areaTeam || '—' }}</span>
        </div>
        <div class="ledger-item__line">
          <span class="ledger-item__label">违规人员</span>
          <span class="ledger-item__value">{{ rec.violatorName || '—' }}</span>
        </div>
        <div class="ledger-item__line">
          <span class="ledger-item__label">问题</span>
          <span class="ledger-item__value ledger-item__value--ellipsis">
            {{ rec.violationBehavior || '—' }}
          </span>
        </div>
        <div class="ledger-item__foot">
          <!-- GRID-03-B：
               ①「待整改」口径对齐生产唯一整改完成判据 —— rectified_photo 无有效图片即为待整改
                 （与 services/sanweiLedgerDerive.js 及 GET /grid-records?hasRectifiedPhoto 同源），
                 补传整改照片提交成功后该徽标自动消失；
               ② 徽标本身即补传入口，点击直接进入「补传整改照片」页。 -->
          <button
            v-if="
              !isNegative(rec.needRectification) && isNegative(rec.rectifiedPhoto)
            "
            type="button"
            class="ledger-item__badge ledger-item__badge--todo ledger-item__badge--entry m-btn"
            @click.stop="goRectify(rec)"
          >
            待整改
          </button>
          <span
            v-if="!isNegative(rec.imageContent) || !isNegative(rec.rectifiedPhoto)"
            class="ledger-item__badge ledger-item__badge--photo"
          >
            有照片
          </span>
        </div>
      </div>

      <button
        v-if="hasMore"
        type="button"
        class="ledger-page__more m-btn"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </button>
      <p v-else class="ledger-page__end">已显示全部 {{ total }} 条</p>
    </section>
  </div>
</template>

<style scoped>
.ledger-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 新增巡查入口（GRID-02-B） */
.ledger-page__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ledger-page__bar-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
}

.ledger-page__new {
  border: none;
  border-radius: 999px;
  background: #2f7dcd;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
}

.ledger-page__new--block {
  width: 100%;
  margin-top: 16px;
  border-radius: 12px;
  padding: 14px;
  font-size: 15px;
}

.ledger-page__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-row {
  height: 132px;
}

.ledger-page__error {
  margin: 0;
  font-size: 13px;
  color: #d4380d;
  background: #fff1f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.ledger-page__retry {
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

.ledger-page__empty {
  background: #fff;
  border-radius: 12px;
  padding: 32px 16px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.ledger-page__empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
}

.ledger-page__empty-desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a8f99;
}

.ledger-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ledger-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    transform 0.06s ease;
}

.ledger-item:active {
  background: #fafbfc;
  transform: scale(0.995);
}

.ledger-item:focus-visible {
  outline: 2px solid #2f7dcd;
  outline-offset: 2px;
}

.ledger-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ledger-item__date {
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
}

.ledger-item__tag {
  font-size: 12px;
  color: #646a73;
  background: #f2f3f5;
  border-radius: 6px;
  padding: 2px 8px;
}

.ledger-item__line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
  font-size: 13px;
}

.ledger-item__label {
  flex: 0 0 56px;
  color: #8a8f99;
}

.ledger-item__value {
  color: #1f2329;
}

.ledger-item__value--ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-item__foot {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.ledger-item__badge {
  font-size: 12px;
  border-radius: 6px;
  padding: 2px 8px;
}

.ledger-item__badge--todo {
  color: #d4380d;
  background: #fff1f0;
}

/* GRID-03-B：「待整改」徽标同时作为「补传整改照片」入口（按钮化，保持原视觉） */
.ledger-item__badge--entry {
  border: none;
  font-family: inherit;
  cursor: pointer;
}

.ledger-item__badge--photo {
  color: #2f7dcd;
  background: #eaf3fc;
}

.ledger-page__more {
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #2f7dcd;
  font-size: 14px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
}

.ledger-page__more:disabled {
  opacity: 0.6;
  cursor: default;
}

.ledger-page__end {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #8a8f99;
}
</style>
