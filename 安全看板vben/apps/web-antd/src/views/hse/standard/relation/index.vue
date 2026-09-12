<script setup lang="ts">
/**
 * 条款资料关联页 - HSE V2 Sprint4 Phase4
 *
 * 布局: 左侧条款树 + 右侧关联资料列表
 * 功能: 查看关联 / 新增关联 / 取消关联 / 确认关联
 */
import { computed, onMounted, ref } from 'vue';
import {
  Card, Row, Col, Table, Empty, Spin, message, Modal,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';
import HseStatCard from '#/components/hse/StatCard.vue';
import { getClauseTree, type StandardApi } from '../api';
import {
  getRelationsByClause,
  createRelation,
  deleteRelation,
  confirmRelation,
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
const treeData = ref<StandardApi.ClauseNode[]>([]);
const selectedKeys = ref<number[]>([]);
const currentClause = ref<StandardApi.ClauseDetail | null>(null);
const relations = ref<RelationApi.Relation[]>([]);
const stats = ref<RelationApi.RelationStats>({
  total: 0,
  byStatus: { pending: 0, valid: 0, invalid: 0 },
  byMatchType: { auto: 0, manual: 0 },
  linkedFiles: 0,
  linkedClauses: 0,
});

// ============================================================
// 统计卡片
// ============================================================
const statItems = computed(() => [
  {
    key: 'total',
    label: '关联总数',
    value: stats.value.total,
    icon: 'lucide:link',
    color: 'blue' as const,
    suffix: '条',
  },
  {
    key: 'valid',
    label: '已确认',
    value: stats.value.byStatus.valid,
    icon: 'lucide:circle-check',
    color: 'green' as const,
    suffix: '条',
  },
  {
    key: 'pending',
    label: '待确认',
    value: stats.value.byStatus.pending,
    icon: 'lucide:clock',
    color: 'orange' as const,
    suffix: '条',
  },
  {
    key: 'files',
    label: '关联文件',
    value: stats.value.linkedFiles,
    icon: 'lucide:file-text',
    color: 'cyan' as const,
    suffix: '个',
  },
]);

// ============================================================
// 树
// ============================================================
const treeFieldNames = {
  title: 'clauseTitle',
  key: 'id',
  children: 'children',
};

function nodeTitle(node: StandardApi.ClauseNode): string {
  if (node.level === 1) return node.elementName || node.code;
  return node.clauseTitle || node.code;
}

function findNode(
  nodes: StandardApi.ClauseNode[],
  id: number,
): StandardApi.ClauseNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

async function onTreeSelect(keys: any[]) {
  selectedKeys.value = keys as number[];
  if (keys.length === 0) {
    currentClause.value = null;
    relations.value = [];
    return;
  }
  currentClause.value = findNode(treeData.value, keys[0] as number);
  await loadRelations(keys[0] as number);
}

// ============================================================
// 加载数据
// ============================================================
async function loadTree() {
  loading.value = true;
  try {
    const tree = await getClauseTree({ includeInactive: false });
    treeData.value = tree;
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    loading.value = false;
  }
}

async function loadRelations(clauseId: number) {
  try {
    relations.value = await getRelationsByClause(clauseId);
  } catch {
    // ignore
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
// 表格列定义
// ============================================================
const columns = [
  {
    title: '文件名',
    dataIndex: 'fileName',
    key: 'fileName',
    ellipsis: true,
  },
  {
    title: '匹配类型',
    dataIndex: 'matchType',
    key: 'matchType',
    width: 100,
  },
  {
    title: '匹配度',
    dataIndex: 'matchConfidence',
    key: 'matchConfidence',
    width: 100,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 100,
  },
  {
    title: '操作',
    key: 'action',
    width: 200,
  },
];

function matchTypeText(type: string): string {
  return type === 'auto' ? '自动' : '人工';
}

function matchTypeColor(type: string): string {
  return type === 'auto' ? 'blue' : 'purple';
}

function statusText(status: string): string {
  return { pending: '待确认', valid: '已确认', invalid: '已失效' }[status] || status;
}

function statusColor(status: string): string {
  return { pending: 'orange', valid: 'green', invalid: 'default' }[status] || 'default';
}

// ============================================================
// 新增关联弹窗
// ============================================================
const addModalOpen = ref(false);
const addForm = ref<{ fileId?: number }>({});
const fileOptions = ref<Array<{ id: number; originalName: string }>>([]);

async function handleAdd() {
  if (!currentClause.value) {
    message.warning('请先选择条款');
    return;
  }
  addForm.value = { fileId: undefined };
  addModalOpen.value = true;
  // 加载文件列表
  try {
    const { getDocumentList } = await import('#/api/hse/documents');
    const result = await getDocumentList({ page: 1, pageSize: 100 });
    fileOptions.value = result.list.map((f) => ({
      id: f.id,
      originalName: f.originalName,
    }));
  } catch {
    // ignore
  }
}

async function handleAddSubmit() {
  if (!addForm.value.fileId) {
    message.warning('请选择文件');
    return;
  }
  try {
    await createRelation({
      fileId: addForm.value.fileId,
      clauseId: currentClause.value!.id,
    });
    message.success('关联创建成功');
    addModalOpen.value = false;
    await loadRelations(currentClause.value!.id);
    await loadStats();
  } catch {
    // 错误提示已由拦截器处理
  }
}

// ============================================================
// 确认关联
// ============================================================
async function handleConfirm(record: RelationApi.Relation) {
  try {
    await confirmRelation(record.id);
    message.success('关联已确认');
    await loadRelations(currentClause.value!.id);
    await loadStats();
  } catch {
    // ignore
  }
}

// ============================================================
// 取消关联
// ============================================================
function handleDelete(record: RelationApi.Relation) {
  Modal.confirm({
    title: '取消关联确认',
    content: `确定要取消「${record.fileName}」与该条款的关联吗？文件本身不会被删除。`,
    okType: 'danger',
    onOk: async () => {
      try {
        await deleteRelation(record.id);
        message.success('关联已取消');
        await loadRelations(currentClause.value!.id);
        await loadStats();
      } catch {
        // ignore
      }
    },
  });
}

// ============================================================
// 初始化
// ============================================================
onMounted(() => {
  loadTree();
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
      <Row :gutter="16">
        <!-- 左侧: 条款树 -->
        <Col :xs="24" :sm="24" :md="10" :lg="8" :xl="7">
          <div class="mb-3 flex items-center justify-between">
            <span class="font-semibold">标准条款树</span>
          </div>
          <Spin :spinning="loading">
            <div class="clause-tree-container">
              <a-empty
                v-if="treeData.length === 0 && !loading"
                description="暂无条款数据"
              />
              <a-tree
                v-else
                :tree-data="treeData"
                :selected-keys="selectedKeys"
                :field-names="treeFieldNames"
                :default-expand-all="false"
                :show-line="{ showLeafIcon: false }"
                @select="onTreeSelect"
              >
                <template #title="node">
                  <div class="flex items-center gap-1">
                    <span>{{ nodeTitle(node) }}</span>
                    <span class="text-xs text-gray-400">{{ node.code }}</span>
                  </div>
                </template>
              </a-tree>
            </div>
          </Spin>
        </Col>

        <!-- 右侧: 关联资料列表 -->
        <Col :xs="24" :sm="24" :md="14" :lg="16" :xl="17">
          <div v-if="!currentClause" class="flex h-full min-h-[400px] items-center justify-center">
            <a-empty description="请从左侧选择条款查看关联资料" />
          </div>

          <div v-else>
            <!-- 头部 -->
            <div class="mb-4 flex items-center justify-between">
              <div>
                <h3 class="m-0 text-lg font-semibold">
                  {{ nodeTitle(currentClause) }}
                </h3>
                <div class="text-sm text-gray-500">
                  编码: {{ currentClause.code }} · 层级: L{{ currentClause.level }}
                </div>
              </div>
              <a-button
                v-if="canEdit"
                type="primary"
                size="small"
                @click="handleAdd"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                新增关联
              </a-button>
            </div>

            <!-- 关联资料表格 -->
            <Table
              :columns="columns"
              :data-source="relations"
              :loading="loading"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'matchType'">
                  <a-tag :color="matchTypeColor(record.matchType)">
                    {{ matchTypeText(record.matchType) }}
                  </a-tag>
                </template>
                <template v-else-if="column.key === 'matchConfidence'">
                  <span :class="record.matchConfidence >= 60 ? 'text-green-600' : 'text-orange-500'">
                    {{ Number(record.matchConfidence || 0).toFixed(0) }}%
                  </span>
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="statusColor(record.status)">
                    {{ statusText(record.status) }}
                  </a-tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <div v-if="canEdit" class="flex gap-1">
                    <a-button
                      v-if="record.status === 'pending'"
                      type="link"
                      size="small"
                      @click="handleConfirm(record as any)"
                    >
                      确认
                    </a-button>
                    <a-button
                      type="link"
                      danger
                      size="small"
                      @click="handleDelete(record as any)"
                    >
                      取消关联
                    </a-button>
                  </div>
                  <span v-else class="text-gray-400">-</span>
                </template>
              </template>

              <template #emptyText>
                <Empty description="该条款暂无关联资料" />
              </template>
            </Table>
          </div>
        </Col>
      </Row>
    </Card>

    <!-- 新增关联弹窗 -->
    <a-modal
      v-model:open="addModalOpen"
      title="新增关联"
      :width="480"
      :mask-closable="false"
      ok-text="确认关联"
      cancel-text="取消"
      @ok="handleAddSubmit"
    >
      <a-form layout="vertical">
        <a-form-item label="条款">
          <a-input
            :value="currentClause?.clauseTitle || currentClause?.elementName"
            disabled
          />
        </a-form-item>
        <a-form-item label="选择文件" required>
          <a-select
            v-model:value="addForm.fileId"
            placeholder="选择要关联的文件"
            show-search
            :field-names="{ label: 'originalName', value: 'id' }"
            :options="fileOptions"
            :filter-option="(input: string, option: any) => option.originalName.toLowerCase().includes(input.toLowerCase())"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </Page>
</template>

<style scoped>
.hse-page {
  padding: 16px;
}

.clause-tree-container {
  max-height: calc(100vh - 320px);
  overflow-y: auto;
  padding-right: 4px;
}
</style>
