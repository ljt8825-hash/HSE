<script setup lang="ts">
/**
 * 安全生产标准条款管理 - HSE V2 Sprint4 Phase 3
 *
 * 布局: 左侧三级条款树 + 右侧条款详情
 * 功能: 搜索、新增、编辑、启停、导入、导出
 */
import { computed, onMounted, ref } from 'vue';
import { Card, Row, Col, Spin, Space, message, Modal } from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ClauseEditModal from './components/ClauseEditModal.vue';
import ImportModal from './components/ImportModal.vue';
import {
  getClauseTree,
  getClauseStats,
  setClauseStatus,
  exportClauses,
  type StandardApi,
} from './api';

// ============================================================
// 权限
// ============================================================
const { hasAccessByRoles } = useAccess();
const canEdit = computed(() =>
  hasAccessByRoles(['admin', 'safety_manager']),
);

// ============================================================
// 数据
// ============================================================
const loading = ref(false);
const treeData = ref<StandardApi.ClauseNode[]>([]);
const stats = ref<StandardApi.ClauseStats>({
  total: 0,
  byLevel: { 1: 0, 2: 0, 3: 0 },
  active: 0,
  inactive: 0,
});

/** 搜索关键词 */
const searchKeyword = ref('');
/** 是否包含停用条款 */
const includeInactive = ref(false);

/** 当前选中的条款 */
const selectedKeys = ref<number[]>([]);
const currentClause = ref<StandardApi.ClauseDetail | null>(null);

// ============================================================
// 统计卡片
// ============================================================
const statItems = computed(() => [
  {
    key: 'total',
    label: '条款总数',
    value: stats.value.total,
    icon: 'lucide:list-tree',
    color: 'blue' as const,
    suffix: '条',
  },
  {
    key: 'level1',
    label: '一级要素',
    value: stats.value.byLevel[1] || 0,
    icon: 'lucide:folder',
    color: 'cyan' as const,
    suffix: '个',
  },
  {
    key: 'active',
    label: '启用条款',
    value: stats.value.active,
    icon: 'lucide:circle-check',
    color: 'green' as const,
    suffix: '条',
  },
  {
    key: 'inactive',
    label: '停用条款',
    value: stats.value.inactive,
    icon: 'lucide:circle-minus',
    color: 'orange' as const,
    suffix: '条',
  },
]);

// ============================================================
// 树数据处理
// ============================================================
/**
 * 过滤树（按搜索关键词）
 */
const filteredTree = computed(() => {
  if (!searchKeyword.value.trim()) return treeData.value;

  const keyword = searchKeyword.value.toLowerCase().trim();
  const filterNodes = (
    nodes: StandardApi.ClauseNode[],
  ): StandardApi.ClauseNode[] => {
    const result: StandardApi.ClauseNode[] = [];
    for (const node of nodes) {
      const title = (
        node.level === 1 ? node.elementName : node.clauseTitle
      )?.toLowerCase() || '';
      const code = node.code?.toLowerCase() || '';
      const matched = title.includes(keyword) || code.includes(keyword);
      const children = node.children ? filterNodes(node.children) : [];
      if (matched || children.length > 0) {
        result.push({ ...node, children });
      }
    }
    return result;
  };
  return filterNodes(treeData.value);
});

/** a-tree 的 fieldNames 映射 */
const treeFieldNames = {
  title: 'clauseTitle',
  key: 'id',
  children: 'children',
};

/** 树节点标题显示 */
function nodeTitle(node: StandardApi.ClauseNode): string {
  if (node.level === 1) return node.elementName || node.code;
  return node.clauseTitle || node.code;
}

/** 选中节点 */
async function onTreeSelect(keys: any[]) {
  selectedKeys.value = keys as number[];
  if (keys.length === 0) {
    currentClause.value = null;
    return;
  }
  // 从树数据中查找节点（已有完整数据）
  const found = findNode(treeData.value, keys[0] as number);
  currentClause.value = found;
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

// ============================================================
// 加载数据
// ============================================================
async function loadTree() {
  loading.value = true;
  try {
    const [tree, statsData] = await Promise.all([
      getClauseTree({ includeInactive: includeInactive.value }),
      getClauseStats(),
    ]);
    treeData.value = tree;
    stats.value = statsData;
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    loading.value = false;
  }
}

// ============================================================
// 弹窗控制
// ============================================================
const editModalOpen = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const importModalOpen = ref(false);

function handleAdd(parentId?: number | null) {
  editMode.value = 'create';
  editModalOpen.value = true;
  // 通过 defaultParentId 传入（组件内部处理）
  pendingParentId.value = parentId ?? null;
}

function handleEdit() {
  if (!currentClause.value) return;
  editMode.value = 'edit';
  editModalOpen.value = true;
}

/** 临时存储新增时的默认父级 */
const pendingParentId = ref<number | null>(null);

function handleEditModalOpen(val: boolean) {
  editModalOpen.value = val;
}

async function onEditSuccess() {
  await loadTree();
}

// ============================================================
// 启用/停用
// ============================================================
function handleToggleStatus() {
  if (!currentClause.value) return;
  const clause = currentClause.value;
  const isActive = clause.status === 'active';
  const action = isActive ? '停用' : '启用';

  Modal.confirm({
    title: `${action}确认`,
    content: `确定要${action}条款「${nodeTitle(clause)}」吗？`,
    okType: isActive ? 'danger' : 'primary',
    onOk: async () => {
      try {
        const newStatus = isActive ? 'inactive' : 'active';
        await setClauseStatus(clause.id, newStatus);
        message.success(`条款已${action}`);
        await loadTree();
        // 重新选中当前条款（刷新状态）
        const updated = findNode(treeData.value, clause.id);
        if (updated) currentClause.value = updated;
      } catch {
        // 错误提示已由拦截器处理
      }
    },
  });
}

// ============================================================
// 导出
// ============================================================
const exporting = ref(false);

async function handleExport() {
  exporting.value = true;
  try {
    const clauses = await exportClauses();
    const blob = new Blob([JSON.stringify(clauses, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    link.download = `safety_standard_clauses_${ts}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success(`导出成功，共 ${clauses.length} 条条款`);
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    exporting.value = false;
  }
}

// ============================================================
// 切换包含停用
// ============================================================
async function onIncludeInactiveChange() {
  await loadTree();
}

// ============================================================
// 初始化
// ============================================================
onMounted(() => {
  loadTree();
});
</script>

<template>
  <Page auto-content-height class="hse-page">
    <div class="page-toolbar">
      <Space :size="8">
        <HelpButton menuCode="HSE_STANDARD" />
      </Space>
    </div>
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

    <!-- 主内容区: 左树 + 右详情 -->
    <Card :bordered="false">
      <Row :gutter="16">
        <!-- 左侧: 条款树 -->
        <Col :xs="24" :sm="24" :md="10" :lg="8" :xl="7">
          <div class="flex flex-col">
            <!-- 工具栏 -->
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <a-input-search
                v-model:value="searchKeyword"
                placeholder="搜索编码或名称"
                allow-clear
                style="max-width: 200px"
              />
              <a-tooltip title="包含停用条款">
                <a-switch
                  v-model:checked="includeInactive"
                  checked-children="全部"
                  un-checked-children="启用"
                  @change="onIncludeInactiveChange"
                />
              </a-tooltip>
            </div>

            <!-- 操作按钮 -->
            <div v-if="canEdit" class="mb-3 flex flex-wrap gap-2">
              <a-button
                type="primary"
                size="small"
                @click="handleAdd(null)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                新增
              </a-button>
              <a-button
                size="small"
                :loading="exporting"
                @click="handleExport"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:download" />
                </template>
                导出
              </a-button>
              <a-button size="small" @click="importModalOpen = true">
                <template #icon>
                  <IconifyIcon icon="lucide:upload" />
                </template>
                导入
              </a-button>
            </div>

            <!-- 树 -->
            <Spin :spinning="loading">
              <div class="clause-tree-container">
                <a-empty
                  v-if="filteredTree.length === 0 && !loading"
                  description="暂无条款数据"
                />
                <a-tree
                  v-else
                  :tree-data="filteredTree"
                  :selected-keys="selectedKeys"
                  :field-names="treeFieldNames"
                  :default-expand-all="true"
                  :show-line="{ showLeafIcon: false }"
                  @select="onTreeSelect"
                >
                  <template #title="node">
                    <div class="flex items-center gap-1">
                      <span>{{ nodeTitle(node) }}</span>
                      <span class="text-xs text-gray-400">
                        {{ node.code }}
                      </span>
                      <a-tag
                        v-if="node.status === 'inactive'"
                        color="orange"
                        class="ml-1"
                        style="font-size: 11px; line-height: 16px"
                      >
                        停用
                      </a-tag>
                    </div>
                  </template>
                </a-tree>
              </div>
            </Spin>
          </div>
        </Col>

        <!-- 右侧: 条款详情 -->
        <Col :xs="24" :sm="24" :md="14" :lg="16" :xl="17">
          <div v-if="!currentClause" class="flex h-full min-h-[400px] items-center justify-center">
            <a-empty description="请从左侧选择条款查看详情" />
          </div>

          <div v-else class="clause-detail">
            <!-- 详情头部 -->
            <div class="mb-4 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h3 class="m-0 text-lg font-semibold">
                  {{ nodeTitle(currentClause) }}
                </h3>
                <a-tag :color="currentClause.status === 'active' ? 'green' : 'orange'">
                  {{ currentClause.status === 'active' ? '启用' : '停用' }}
                </a-tag>
                <a-tag color="blue">L{{ currentClause.level }}</a-tag>
              </div>
              <div v-if="canEdit" class="flex gap-2">
                <a-button
                  type="primary"
                  size="small"
                  @click="handleEdit"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:pencil" />
                  </template>
                  编辑
                </a-button>
                <a-button
                  v-if="currentClause.level < 3"
                  size="small"
                  @click="handleAdd(currentClause.id)"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:plus" />
                  </template>
                  新增子项
                </a-button>
                <a-button
                  :type="currentClause.status === 'active' ? 'default' : 'primary'"
                  :danger="currentClause.status === 'active'"
                  size="small"
                  @click="handleToggleStatus"
                >
                  <template #icon>
                    <IconifyIcon
                      :icon="currentClause.status === 'active'
                        ? 'lucide:circle-minus'
                        : 'lucide:circle-check'"
                    />
                  </template>
                  {{ currentClause.status === 'active' ? '停用' : '启用' }}
                </a-button>
              </div>
            </div>

            <!-- 基本信息 -->
            <a-descriptions
              :column="2"
              bordered
              size="small"
              class="mb-4"
            >
              <a-descriptions-item label="条款编码">
                <span class="font-mono">{{ currentClause.code }}</span>
              </a-descriptions-item>
              <a-descriptions-item label="层级">
                第 {{ currentClause.level }} 级
                <span class="text-gray-400">
                  （{{ ['要素', '子项', '条款'][currentClause.level - 1] }}）
                </span>
              </a-descriptions-item>
              <a-descriptions-item v-if="currentClause.elementName" label="要素名称">
                {{ currentClause.elementName }}
              </a-descriptions-item>
              <a-descriptions-item label="分值权重">
                <span class="font-semibold text-blue-600">
                  {{ Number(currentClause.scoreWeight || 0) }}
                </span>
              </a-descriptions-item>
              <a-descriptions-item label="排序">
                {{ currentClause.sortOrder }}
              </a-descriptions-item>
              <a-descriptions-item label="创建时间">
                {{ currentClause.createdAt
                  ? new Date(currentClause.createdAt).toLocaleString('zh-CN')
                  : '-' }}
              </a-descriptions-item>
            </a-descriptions>

            <!-- 条款要求内容 -->
            <Card v-if="currentClause.clauseContent" size="small" class="mb-3" title="条款要求">
              <div class="whitespace-pre-wrap text-sm text-gray-700">
                {{ currentClause.clauseContent }}
              </div>
            </Card>

            <!-- 检查方法 -->
            <Card v-if="currentClause.checkMethod" size="small" class="mb-3" title="检查方法">
              <div class="whitespace-pre-wrap text-sm text-gray-700">
                {{ currentClause.checkMethod }}
              </div>
            </Card>

            <!-- 关键词 -->
            <div v-if="currentClause.keywords && currentClause.keywords.length > 0" class="mb-3">
              <div class="mb-1 text-sm text-gray-500">关键词标签</div>
              <div class="flex flex-wrap gap-1">
                <a-tag
                  v-for="(kw, idx) in currentClause.keywords"
                  :key="idx"
                  color="blue"
                >
                  {{ kw }}
                </a-tag>
              </div>
            </div>

            <!-- 要求资料类型 -->
            <div v-if="currentClause.requiredDocTypes && currentClause.requiredDocTypes.length > 0" class="mb-3">
              <div class="mb-1 text-sm text-gray-500">要求资料类型</div>
              <div class="flex flex-wrap gap-1">
                <a-tag
                  v-for="(doc, idx) in currentClause.requiredDocTypes"
                  :key="idx"
                  color="purple"
                >
                  {{ doc }}
                </a-tag>
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </Card>

    <!-- 编辑/新增弹窗 -->
    <ClauseEditModal
      :open="editModalOpen"
      :mode="editMode"
      :clause="currentClause"
      :tree-data="treeData"
      :default-parent-id="pendingParentId"
      @update:open="handleEditModalOpen"
      @success="onEditSuccess"
    />

    <!-- 导入弹窗 -->
    <ImportModal
      v-model:open="importModalOpen"
      @success="onEditSuccess"
    />
  </Page>
</template>

<style scoped>
.hse-page {
  padding: 16px;
}

.clause-tree-container {
  max-height: calc(100vh - 380px);
  overflow-y: auto;
  padding-right: 4px;
}

.clause-detail {
  min-height: 400px;
}
</style>
