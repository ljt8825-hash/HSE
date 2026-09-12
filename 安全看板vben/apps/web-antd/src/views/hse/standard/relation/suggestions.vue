<script setup lang="ts">
/**
 * 匹配建议页 - HSE V2 Sprint4 Phase4
 *
 * 功能:
 *   - 显示 AI 推荐的自动匹配关联（status=pending）
 *   - 显示匹配度
 *   - 批量确认 / 单条确认
 *   - 触发自动匹配生成
 */
import { computed, onMounted, ref } from 'vue';
import {
  Card, Row, Col, Table, Progress, message, Modal,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';
import HseStatCard from '#/components/hse/StatCard.vue';
import {
  getPendingSuggestions,
  confirmRelation,
  batchConfirmRelations,
  generateAutoMatches,
  getRelationStats,
  type RelationApi,
} from './api';

// ============================================================
// 权限
// ============================================================
const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ============================================================
// 数据
// ============================================================
const loading = ref(false);
const generating = ref(false);
const suggestions = ref<RelationApi.Relation[]>([]);
const selectedRowKeys = ref<number[]>([]);
const stats = ref<RelationApi.RelationStats>({
  total: 0,
  byStatus: { pending: 0, valid: 0, invalid: 0 },
  byMatchType: { auto: 0, manual: 0 },
  linkedFiles: 0,
  linkedClauses: 0,
});

/** 生成匹配的参数 */
const generateParams = ref({
  minConfidence: 30,
  limitPerClause: 10,
});

// ============================================================
// 统计卡片
// ============================================================
const statItems = computed(() => [
  {
    key: 'pending',
    label: '待确认建议',
    value: stats.value.byStatus.pending,
    icon: 'lucide:clock',
    color: 'orange' as const,
    suffix: '条',
  },
  {
    key: 'valid',
    label: '已确认关联',
    value: stats.value.byStatus.valid,
    icon: 'lucide:circle-check',
    color: 'green' as const,
    suffix: '条',
  },
  {
    key: 'auto',
    label: '自动匹配',
    value: stats.value.byMatchType.auto,
    icon: 'lucide:zap',
    color: 'blue' as const,
    suffix: '条',
  },
  {
    key: 'manual',
    label: '人工关联',
    value: stats.value.byMatchType.manual,
    icon: 'lucide:hand',
    color: 'purple' as const,
    suffix: '条',
  },
]);

// ============================================================
// 表格
// ============================================================
const columns = [
  {
    title: '文件名',
    dataIndex: 'fileName',
    key: 'fileName',
    ellipsis: true,
  },
  {
    title: '条款',
    key: 'clause',
    ellipsis: true,
  },
  {
    title: '匹配度',
    key: 'confidence',
    width: 160,
  },
  {
    title: '命中说明',
    dataIndex: 'matchReason',
    key: 'matchReason',
    ellipsis: true,
  },
  {
    title: '操作',
    key: 'action',
    width: 120,
  },
];

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: number[]) => {
    selectedRowKeys.value = keys;
  },
}));

// ============================================================
// 加载数据
// ============================================================
async function loadSuggestions() {
  loading.value = true;
  try {
    suggestions.value = await getPendingSuggestions({ limit: 100 });
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    stats.value = await getRelationStats();
  } catch {
    // ignore
  }
}

// ============================================================
// 生成自动匹配
// ============================================================
function handleGenerate() {
  Modal.confirm({
    title: '生成自动匹配建议',
    content: `将对所有三级条款生成匹配建议（最低置信度 ${generateParams.value.minConfidence}%）。已有匹配的条款不会重复生成。生成的建议状态为"待确认"，不会自动生效。`,
    onOk: async () => {
      generating.value = true;
      try {
        const result = await generateAutoMatches({
          minConfidence: generateParams.value.minConfidence,
          limitPerClause: generateParams.value.limitPerClause,
        });
        message.success(
          `匹配完成：扫描 ${result.totalClauses} 个条款，生成 ${result.created} 条建议`,
        );
        await loadSuggestions();
        await loadStats();
      } catch {
        // ignore
      } finally {
        generating.value = false;
      }
    },
  });
}

// ============================================================
// 确认关联
// ============================================================
async function handleConfirm(record: RelationApi.Relation) {
  try {
    await confirmRelation(record.id);
    message.success('关联已确认');
    await loadSuggestions();
    await loadStats();
  } catch {
    // ignore
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
    await loadSuggestions();
    await loadStats();
  } catch {
    // ignore
  }
}

// ============================================================
// 初始化
// ============================================================
onMounted(() => {
  loadSuggestions();
  loadStats();
});
</script>

<template>
  <Page auto-content-height class="hse-page">
    <!-- 统计卡片 -->
    <Row :gutter="[16, 16]" class="mb-4">
      <Col
        v-for="stat in statItems"
        :key="stat.key"
        :xs="24"
        :sm="12"
        :md="6"
        :lg="6"
      >
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="stat.color"
          :suffix="stat.suffix"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <!-- 工具栏 -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500">最低匹配度:</span>
          <a-input-number
            v-model:value="generateParams.minConfidence"
            :min="0"
            :max="100"
            :step="10"
            style="width: 80px"
          />
          <span class="text-sm text-gray-500">%</span>
        </div>
        <div v-if="canEdit" class="flex gap-2">
          <a-button
            v-if="selectedRowKeys.length > 0"
            type="primary"
            @click="handleBatchConfirm"
          >
            <template #icon>
              <IconifyIcon icon="lucide:check-check" />
            </template>
            批量确认 ({{ selectedRowKeys.length }})
          </a-button>
          <a-button
            type="primary"
            :loading="generating"
            @click="handleGenerate"
          >
            <template #icon>
              <IconifyIcon icon="lucide:sparkles" />
            </template>
            生成匹配建议
          </a-button>
        </div>
      </div>

      <!-- 建议列表 -->
      <Table
        :columns="columns"
        :data-source="suggestions"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: true }"
        :row-selection="(canEdit ? rowSelection : undefined) as any"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'clause'">
            <div>
              <div>{{ record.clauseTitle || record.clauseName }}</div>
              <div class="text-xs text-gray-400">{{ record.clauseCode }}</div>
            </div>
          </template>
          <template v-else-if="column.key === 'confidence'">
            <Progress
              :percent="Number(record.matchConfidence || 0)"
              :stroke-color="record.matchConfidence >= 60 ? '#52c41a' : '#faad14'"
              size="small"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button
              v-if="canEdit"
              type="link"
              size="small"
              @click="handleConfirm(record as any)"
            >
              确认
            </a-button>
          </template>
        </template>

        <template #emptyText>
          <div class="py-8">
            <IconifyIcon icon="lucide:inbox" class="mb-2 text-4xl text-gray-300" />
            <div class="text-gray-400">
              暂无待确认的匹配建议
            </div>
            <div v-if="canEdit" class="mt-2 text-sm text-gray-400">
              点击右上角"生成匹配建议"按钮开始自动匹配
            </div>
          </div>
        </template>
      </Table>
    </Card>
  </Page>
</template>

<style scoped>
.hse-page {
  padding: 16px;
}
</style>
