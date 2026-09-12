<script lang="ts" setup>
/**
 * 匹配建议（web-naive）
 * 展示 AI 自动匹配的条款-资料关联建议
 * 支持批量确认、单条确认、生成匹配建议
 */
import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import {
  NButton,
  NCard,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSpace,
  NStatistic,
  NTag,
  NText,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  batchConfirmRelations,
  confirmRelation,
  generateAutoMatches,
  getPendingSuggestions,
  getRelationStats,
  type RelationApi,
} from '#/api/hse/standard-relation';
import { message } from '#/adapter/naive';

defineOptions({ name: 'StandardsSuggestions' });

const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ===================== 统计 =====================
const stats = ref<RelationApi.RelationStats>({
  total: 0,
  byStatus: { pending: 0, valid: 0, invalid: 0 },
  byMatchType: { auto: 0, manual: 0 },
  linkedFiles: 0,
  linkedClauses: 0,
});

async function loadStats() {
  try {
    stats.value = await getRelationStats();
  } catch {
    // ignore
  }
}

// ===================== 建议列表 =====================
const loading = ref(false);
const generating = ref(false);
const suggestions = ref<RelationApi.Relation[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const generateParams = ref({
  minConfidence: 30,
  limitPerClause: 10,
});

async function loadSuggestions() {
  loading.value = true;
  try {
    const res = await getPendingSuggestions({ limit: 100 });
    suggestions.value = res ?? [];
    total.value = suggestions.value.length;
  } catch {
    suggestions.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
}

async function onRefresh() {
  await Promise.all([loadSuggestions(), loadStats()]);
}

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

// ===================== 生成匹配 =====================
const generateModalOpen = ref(false);

function openGenerateModal() {
  generateModalOpen.value = true;
}

async function handleGenerate() {
  generating.value = true;
  try {
    const result = await generateAutoMatches({
      minConfidence: generateParams.value.minConfidence,
      limitPerClause: generateParams.value.limitPerClause,
    });
    message.success(`匹配完成：扫描 ${result.totalClauses} 个条款，生成 ${result.created} 条建议`);
    generateModalOpen.value = false;
    await onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    generating.value = false;
  }
}

// ===================== 确认关联 =====================
const selectedRowKeys = ref<number[]>([]);

async function handleConfirm(record: RelationApi.Relation) {
  try {
    await confirmRelation(record.id);
    message.success('关联已确认');
    await onRefresh();
  } catch {
    // 拦截器已提示
  }
}

async function handleBatchConfirm() {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择要确认的建议');
    return;
  }
  try {
    const result = await batchConfirmRelations(selectedRowKeys.value);
    if (result.failed > 0) {
      message.warning(`确认完成：成功 ${result.success} 条，失败 ${result.failed} 条`);
    } else {
      message.success(`确认完成：成功 ${result.success} 条`);
    }
    selectedRowKeys.value = [];
    await onRefresh();
  } catch {
    // 拦截器已提示
  }
}

async function handleDelete(record: RelationApi.Relation) {
  try {
    const { deleteRelation } = await import('#/api/hse/standard-relation');
    await deleteRelation(record.id);
    message.success('已忽略该建议');
    await onRefresh();
  } catch {
    // 拦截器已提示
  }
}

// ===================== 匹配度颜色 =====================
function confidenceColor(confidence: number): 'success' | 'warning' | 'error' | 'default' {
  if (confidence >= 70) return 'success';
  if (confidence >= 40) return 'warning';
  return 'error';
}

// ===================== 表格列 =====================
const columns = computed<VxeTableGridColumns>(() => [
  { type: 'checkbox', width: 50, align: 'center' },
  { title: '文件名', field: 'fileName', minWidth: 220, align: 'left', showOverflow: 'tooltip' },
  {
    title: '条款',
    field: 'clauseTitle',
    minWidth: 200,
    align: 'left',
    showOverflow: 'tooltip',
    slots: { default: 'clause' },
  },
  {
    title: '匹配类型',
    field: 'matchType',
    width: 100,
    align: 'center',
    slots: { default: 'matchType' },
  },
  {
    title: '匹配度',
    field: 'matchConfidence',
    width: 130,
    align: 'center',
    slots: { default: 'confidence' },
  },
  { title: '命中说明', field: 'matchReason', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  {
    title: '操作',
    field: 'action',
    width: 150,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

const MATCH_TYPE_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  auto: 'info',
  manual: 'warning',
};

const MATCH_TYPE_LABEL: Record<string, string> = {
  auto: '自动匹配',
  manual: '人工添加',
};

onMounted(() => {
  loadSuggestions();
  loadStats();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.standardSuggestionsDesc')"
    :title="$t('page.hse.standardSuggestions')"
  >
    <template #extra>
      <NSpace>
        <NButton v-if="canEdit && selectedRowKeys.length > 0" type="primary" @click="handleBatchConfirm">
          批量确认 ({{ selectedRowKeys.length }})
        </NButton>
        <NButton v-if="canEdit" type="primary" @click="openGenerateModal">
          生成匹配建议
        </NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
        />
      </NSpace>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="待确认建议" :value="stats.byStatus.pending" suffix="条" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已确认关联" :value="stats.byStatus.valid" suffix="条" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="自动匹配" :value="stats.byMatchType.auto" suffix="条" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="人工关联" :value="stats.byMatchType.manual" suffix="条" />
      </NCard>
    </div>

    <!-- 建议列表 -->
    <HseDataGrid
      :columns="columns"
      :data="suggestions"
      :loading="loading"
      :pager="true"
      :total="total"
      :checkbox-config="{ checkRowKeys: selectedRowKeys }"
      @page-change="onPageChange"
      @checkbox-all="(rows: any[]) => (selectedRowKeys = rows.map((r: any) => r.id))"
      @checkbox-change="(params: any) => (selectedRowKeys = params.checkedRows.map((r: any) => r.id))"
    >
      <template #clause="{ row }">
        <div>
          <div>{{ row.clauseTitle || row.clauseName || '-' }}</div>
          <NText depth="3" class="text-xs">{{ row.clauseCode || '' }}</NText>
        </div>
      </template>
      <template #matchType="{ row }">
        <HseStatusTag :type="MATCH_TYPE_TAG[row.matchType] || 'neutral'" size="small">
          {{ MATCH_TYPE_LABEL[row.matchType] || row.matchType }}
        </HseStatusTag>
      </template>
      <template #confidence="{ row }">
        <NTag :type="confidenceColor(row.matchConfidence)" :bordered="false" size="small">
          {{ Number(row.matchConfidence || 0).toFixed(0) }}%
        </NTag>
      </template>
      <template #action="{ row }">
        <NSpace v-if="canEdit" justify="center">
          <NButton size="small" type="success" quaternary @click="handleConfirm(row)">确认</NButton>
          <NPopconfirm @positive-click="handleDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>忽略</NButton>
            </template>
            确定忽略该建议吗？
          </NPopconfirm>
        </NSpace>
        <NText v-else depth="3">-</NText>
      </template>
    </HseDataGrid>

    <!-- 生成匹配弹窗 -->
    <NModal
      v-model:show="generateModalOpen"
      title="生成自动匹配建议"
      preset="card"
      style="width: 420px; max-width: 92vw"
      :mask-closable="false"
    >
      <div class="space-y-4">
        <div>
          <div class="mb-2 text-sm text-foreground/70">最低匹配度：</div>
          <NInputNumber v-model:value="generateParams.minConfidence" :min="0" :max="100" :step="10" style="width: 200px">
            <template #suffix>%</template>
          </NInputNumber>
        </div>
        <div>
          <div class="mb-2 text-sm text-foreground/70">每条款最大建议数：</div>
          <NInputNumber v-model:value="generateParams.limitPerClause" :min="1" :max="50" :step="1" style="width: 200px" />
        </div>
        <NText depth="3" class="text-xs">
          将对所有条款生成匹配建议（最低置信度 {{ generateParams.minConfidence }}%）。已有匹配的条款不会重复生成。生成的建议状态为"待确认"，不会自动生效。
        </NText>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="generateModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="generating" @click="handleGenerate">开始生成</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
