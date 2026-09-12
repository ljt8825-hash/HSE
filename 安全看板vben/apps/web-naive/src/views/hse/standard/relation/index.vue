<script lang="ts" setup>
/**
 * 条款资料关联（web-naive 试点 · 阶段05）
 * 双列布局：左侧标准条款树 + 右侧关联资料列表（HseDataGrid + VXE）。
 * 保留：条款树选择、条款标题/编码/层级信息、关联统计、空状态。
 * 保留：人工新增关联、确认关联、取消关联（二次确认）；写动作按 admin/safety_manager 显隐，
 * 成功后刷新当前条款关联与统计，失败不关闭弹窗/不显示成功。
 * 全部走真实 API（server/routes/hse-standard.js / hse-standard-relation.js / hse-documents.js）。
 * 不迁移本阶段外的「匹配建议」页面。
 */
import { computed, h, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
  NTree,
  type TreeOption,
} from 'naive-ui';
import { List, Plus } from '@vben/icons';

import {
  HseDataGrid,
  HsePageLayout,
  HseSplitPane,
  HseStatusTag,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { getClauseTree, type StandardApi } from '#/api/hse/standard';
import {
  confirmRelation,
  createRelation,
  deleteRelation,
  getRelationStats,
  getRelationsByClause,
  type RelationApi,
} from '#/api/hse/standard-relation';
import { getDocumentList, type DocumentsApi } from '#/api/hse/documents';
import { message } from '#/adapter/naive';

defineOptions({ name: 'StandardsRelation' });

// 动作级权限：新增 / 确认 / 取消关联仅 admin、safety_manager
const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ===================== 统计卡片 =====================
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
    /* ignore */
  }
}
const statItems = computed(() => [
  { key: 'total', label: '关联总数', value: stats.value.total, suffix: '条', type: 'info' as const },
  { key: 'valid', label: '已确认', value: stats.value.byStatus.valid, suffix: '条', type: 'success' as const },
  { key: 'pending', label: '待确认', value: stats.value.byStatus.pending, suffix: '条', type: 'warning' as const },
  { key: 'files', label: '关联文件', value: stats.value.linkedFiles, suffix: '个', type: 'info' as const },
]);

// ===================== 条款树 =====================
const loading = ref(false);
const treeData = ref<StandardApi.ClauseNode[]>([]);
const selectedKeys = ref<(number | string)[]>([]);
const currentClause = ref<StandardApi.ClauseDetail | null>(null);
const expandedKeys = ref<(number | string)[]>([]);

function nodeTitle(node: StandardApi.ClauseNode): string {
  if (node.level === 1) return node.elementName || node.code;
  return node.clauseTitle || node.code;
}

function toTreeOptions(nodes: StandardApi.ClauseNode[]): TreeOption[] {
  return nodes.map((n) => ({
    key: String(n.id),
    label: n.level === 1 ? n.elementName || n.code : n.clauseTitle || n.code,
    clause: n,
    children: n.children?.length ? toTreeOptions(n.children) : undefined,
  }));
}
const treeOptions = computed(() => toTreeOptions(treeData.value));

function renderNodeLabel(props: { option: TreeOption }) {
  const option = props.option;
  const c = (option as any).clause as StandardApi.ClauseNode | undefined;
  if (!c) return option.label as string;
  return h('span', { class: 'clause-node' }, [
    h('span', {}, option.label as string),
    h('span', { class: 'node-code' }, ` ${c.code}`),
  ]);
}

function findNode(nodes: StandardApi.ClauseNode[], id: number | string): StandardApi.ClauseNode | null {
  for (const n of nodes) {
    if (String(n.id) === String(id)) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

async function loadTree() {
  loading.value = true;
  try {
    const tree = await getClauseTree({ includeInactive: false });
    treeData.value = tree;
    if (tree.length > 0) {
      expandedKeys.value = tree.map((n) => String(n.id));
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

function onTreeSelect(keys: (number | string)[], options: (TreeOption | null)[]) {
  selectedKeys.value = keys;
  if (keys.length === 0) {
    currentClause.value = null;
    relations.value = [];
    return;
  }
  const node = (options?.[0] as any)?.clause as StandardApi.ClauseNode | undefined;
  currentClause.value = node || findNode(treeData.value, keys[0] as number);
  if (currentClause.value) {
    loadRelations(currentClause.value.id);
  }
}

// ===================== 关联列表 =====================
const relations = ref<RelationApi.Relation[]>([]);
const relationsLoading = ref(false);

async function loadRelations(clauseId: number) {
  relationsLoading.value = true;
  try {
    relations.value = await getRelationsByClause(clauseId);
  } catch {
    relations.value = [];
  } finally {
    relationsLoading.value = false;
  }
}

function matchTypeText(type: string): string {
  return type === 'auto' ? '自动' : '人工';
}
function matchTypeTag(type: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  return type === 'auto' ? 'info' : 'warning';
}
function statusText(status: string): string {
  return { pending: '待确认', valid: '已确认', invalid: '已失效' }[status] || status;
}
function statusTag(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    pending: 'warning',
    valid: 'success',
    invalid: 'neutral',
  };
  return map[status] || 'neutral';
}

const relationColumns = computed<VxeTableGridColumns>(() => [
  {
    title: '文件名',
    field: 'fileName',
    minWidth: 240,
    align: 'left',
    showOverflow: 'tooltip',
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
    width: 100,
    align: 'center',
    slots: { default: 'matchConfidence' },
  },
  {
    title: '状态',
    field: 'status',
    width: 100,
    align: 'center',
    slots: { default: 'status' },
  },
  {
    title: '操作',
    field: '_action',
    width: 180,
    align: 'center',
    slots: { default: 'action' },
  },
]);

// ===================== 新增关联弹窗 =====================
const addModalOpen = ref(false);
const addFileId = ref<number | null>(null);
const addSubmitting = ref(false);
const fileOptions = ref<Array<{ id: number; originalName: string }>>([]);
const fileLoading = ref(false);

async function handleAdd() {
  if (!currentClause.value) {
    message.warning('请先选择条款');
    return;
  }
  addFileId.value = null;
  addModalOpen.value = true;
  fileLoading.value = true;
  try {
    const result = await getDocumentList({ page: 1, pageSize: 100 });
    fileOptions.value = (result.list || []).map((f: DocumentsApi.DocumentFile) => ({
      id: f.id,
      originalName: f.originalName,
    }));
  } catch {
    fileOptions.value = [];
  } finally {
    fileLoading.value = false;
  }
}

async function handleAddSubmit() {
  if (!addFileId.value) {
    message.warning('请选择文件');
    return;
  }
  if (!currentClause.value) return;
  addSubmitting.value = true;
  try {
    await createRelation({
      fileId: addFileId.value,
      clauseId: currentClause.value.id,
    });
    message.success('关联创建成功');
    addModalOpen.value = false;
    await loadRelations(currentClause.value.id);
    await loadStats();
  } catch {
    // 失败：弹窗保持打开，错误提示由拦截器处理，不显示成功
  } finally {
    addSubmitting.value = false;
  }
}

// ===================== 确认 / 取消关联 =====================
async function handleConfirm(record: RelationApi.Relation) {
  try {
    await confirmRelation(record.id);
    message.success('关联已确认');
    if (currentClause.value) {
      await loadRelations(currentClause.value.id);
      await loadStats();
    }
  } catch {
    /* 拦截器已提示 */
  }
}

async function handleDelete(record: RelationApi.Relation) {
  try {
    await deleteRelation(record.id);
    message.success('关联已取消');
    if (currentClause.value) {
      await loadRelations(currentClause.value.id);
      await loadStats();
    }
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 初始化 =====================
onMounted(() => {
  loadTree();
  loadStats();
});
</script>

<template>
  <HsePageLayout
    :title="$t('page.hse.standardRelation')"
    :description="$t('page.hse.standardRelationDesc')"
  >
    <!-- 统计卡片 -->
    <div class="stat-row mb-4">
      <NCard v-for="s in statItems" :key="s.key" size="small" class="stat-card">
        <div class="stat-card-inner">
          <div class="stat-value">{{ s.value }}<span class="stat-suffix">{{ s.suffix }}</span></div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </NCard>
    </div>

    <HseSplitPane
      title="标准条款树"
      storage-key="hse-standard-split-width"
      :default-width="280"
      class="relation-split"
    >
        <template #left>
          <div class="clause-tree-panel">
            <div class="panel-head">
              <div class="panel-title">
                <List class="size-4 title-icon" />
                <span>标准条款树</span>
              </div>
            </div>
            <NSpin :show="loading">
              <NEmpty v-if="treeData.length === 0 && !loading" description="暂无条款数据" class="py-10" />
              <NTree
                v-else
                :data="treeOptions"
                :selected-keys="selectedKeys"
                :expanded-keys="expandedKeys"
                selectable
                block-line
                :show-line="true"
                :render-label="renderNodeLabel"
                @update:selected-keys="onTreeSelect"
                @update:expanded-keys="(v: any[]) => (expandedKeys = v)"
              />
            </NSpin>
          </div>
        </template>

        <template #right>
          <div class="relation-panel">
            <NEmpty
              v-if="!currentClause"
              description="请从左侧选择条款查看关联资料"
              class="py-20"
            />

            <template v-else>
              <div class="detail-head">
                <div>
                  <div class="clause-title">{{ nodeTitle(currentClause) }}</div>
                  <NText depth="3" class="text-sm">
                    编码: {{ currentClause.code }} · 层级: L{{ currentClause.level }}
                  </NText>
                </div>
                <NButton
                  v-if="canEdit"
                  type="primary"
                  size="tiny"
                  @click="handleAdd"
                >
                  <template #icon><Plus class="size-3.5" /></template>
                  新增关联
                </NButton>
              </div>

              <HseDataGrid
                :columns="relationColumns"
                :data="relations"
                :loading="relationsLoading"
                :pager="false"
                size="small"
                class="mt-2"
              >
                <template #matchType="{ row }">
                  <HseStatusTag :type="matchTypeTag(row.matchType)" size="small" :label="matchTypeText(row.matchType)" />
                </template>
                <template #matchConfidence="{ row }">
                  <NTag
                    size="small"
                    :type="row.matchConfidence >= 60 ? 'success' : 'warning'"
                    :bordered="false"
                  >
                    {{ Number(row.matchConfidence || 0).toFixed(0) }}%
                  </NTag>
                </template>
                <template #status="{ row }">
                  <HseStatusTag :type="statusTag(row.status)" size="small" :label="statusText(row.status)" />
                </template>
                <template #action="{ row }">
                  <NSpace v-if="canEdit" size="small">
                    <NButton
                      v-if="row.status === 'pending'"
                      title="确认关联（待确认 → 已确认）"
                      size="tiny"
                      type="primary"
                      secondary
                      @click="handleConfirm(row)"
                    >
                      确认
                    </NButton>
                    <NPopconfirm @positive-click="handleDelete(row)">
                      <template #trigger>
                        <span style="display:inline-block"><NButton size="tiny" type="error" secondary>取消关联</NButton></span>
                      </template>
                      确定要取消「{{ row.fileName }}」与该条款的关联吗？文件本身不会被删除。
                    </NPopconfirm>
                  </NSpace>
                  <NText v-else depth="3">-</NText>
                </template>
                <template #empty>
                  <NEmpty description="该条款暂无关联资料" />
                </template>
              </HseDataGrid>
            </template>
          </div>
        </template>
      </HseSplitPane>

    <!-- 新增关联弹窗 -->
    <NModal
      v-model:show="addModalOpen"
      preset="card"
      title="新增关联"
      style="width: 480px"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="条款">
          <NInput
            :value="currentClause?.clauseTitle || currentClause?.elementName || currentClause?.code"
            disabled
          />
        </NFormItem>
        <NFormItem label="选择文件" required>
          <NSelect
            v-model:value="addFileId"
            placeholder="选择要关联的文件"
            filterable
            :loading="fileLoading"
            :options="fileOptions.map((f) => ({ label: f.originalName, value: f.id }))"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="addModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="addSubmitting" @click="handleAddSubmit">
            确认关联
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card-inner {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.stat-suffix {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  margin-left: 4px;
}

.stat-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.relation-split {
  height: calc(100vh - 260px);
  min-height: 420px;
}

.clause-tree-panel,
.relation-panel {
  height: 100%;
  overflow: auto;
  padding: 4px 8px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

.title-icon {
  color: hsl(var(--primary));
}

.node-code {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  margin-left: 4px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.clause-title {
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.mb-4 {
  margin-bottom: 16px;
}

.mt-2 {
  margin-top: 8px;
}

@media (max-width: 900px) {
  .stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
