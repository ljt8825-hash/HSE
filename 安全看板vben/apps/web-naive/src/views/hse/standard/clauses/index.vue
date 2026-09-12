<script lang="ts" setup>
/**
 * 安全生产标准条款库（web-naive）
 * 双列布局：左侧三级条款树 + 右侧条款详情
 * 功能：搜索、新增、编辑、启停、导入、导出
 */
import { computed, h, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import {
  NButton,
  NCard,
  NCheckbox,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
  NTree,
  NTreeSelect,
  type FormInst,
  type TreeOption,
} from 'naive-ui';
import { Plus, RotateCw } from '@vben/icons';

import {
  HseActionBar,
  HseImportDialog,
  HsePageLayout,
  HseSplitPane,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import {
  createClause,
  exportClauses,
  getClauseStats,
  getClauseTree,
  setClauseStatus,
  updateClause,
  type StandardApi,
} from '#/api/hse/standard';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'StandardsClauses' });

const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ===================== 统计数据 =====================
const stats = ref<StandardApi.ClauseStats>({
  total: 0,
  byLevel: { 1: 0, 2: 0, 3: 0 },
  active: 0,
  inactive: 0,
});

const statItems = computed(() => [
  { key: 'total', label: '条款总数', value: stats.value.total, suffix: '条', type: 'info' as const },
  { key: 'level1', label: '一级要素', value: stats.value.byLevel[1] || 0, suffix: '个', type: 'info' as const },
  { key: 'active', label: '启用条款', value: stats.value.active, suffix: '条', type: 'success' as const },
  { key: 'inactive', label: '停用条款', value: stats.value.inactive, suffix: '条', type: 'warning' as const },
]);

// ===================== 树数据 =====================
const treeLoading = ref(false);
const treeData = ref<StandardApi.ClauseNode[]>([]);
const searchKeyword = ref('');
const includeInactive = ref(false);
const selectedKeys = ref<(number | string)[]>([]);
const expandedKeys = ref<(number | string)[]>([]);
const currentClause = ref<StandardApi.ClauseDetail | null>(null);

function nodeTitle(node: StandardApi.ClauseNode): string {
  if (node.level === 1) return node.elementName || node.code;
  return node.clauseTitle || node.code;
}

function levelText(level?: number): string {
  const map: Record<number, string> = { 1: '要素', 2: '子项', 3: '条款' };
  return level ? map[level] || '-' : '-';
}

function levelTag(level?: number): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const map: Record<number, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    1: 'danger',
    2: 'info',
    3: 'success',
  };
  return level ? map[level] || 'neutral' : 'neutral';
}

function toTreeOptions(nodes: StandardApi.ClauseNode[]): TreeOption[] {
  return nodes.map((n) => ({
    key: String(n.id),
    label: n.level === 1 ? n.elementName || n.code : n.clauseTitle || n.code,
    clause: n,
    children: n.children?.length ? toTreeOptions(n.children) : undefined,
  }));
}

const treeOptions = computed(() => {
  if (!searchKeyword.value.trim()) return toTreeOptions(treeData.value);
  const keyword = searchKeyword.value.toLowerCase().trim();
  const filterNodes = (nodes: StandardApi.ClauseNode[]): StandardApi.ClauseNode[] => {
    const result: StandardApi.ClauseNode[] = [];
    for (const node of nodes) {
      const title = (node.level === 1 ? node.elementName : node.clauseTitle)?.toLowerCase() || '';
      const code = node.code?.toLowerCase() || '';
      const matched = title.includes(keyword) || code.includes(keyword);
      const children = node.children ? filterNodes(node.children) : [];
      if (matched || children.length > 0) {
        result.push({ ...node, children });
      }
    }
    return result;
  };
  return toTreeOptions(filterNodes(treeData.value));
});

function renderNodeLabel(props: { option: TreeOption }) {
  const option = props.option;
  const c = (option as any).clause as StandardApi.ClauseNode | undefined;
  if (!c) return option.label as string;
  return h('span', { class: { 'node-inactive': c.status === 'inactive' } }, [
    h('span', { style: 'margin-right:4px' }, option.label as string),
    h('span', { class: 'node-code' }, c.code),
    c.status === 'inactive'
      ? h(HseStatusTag, { type: 'neutral', size: 'small', style: 'margin-left:4px' }, { default: () => '停用' })
      : null,
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
  treeLoading.value = true;
  try {
    const [tree, statsData] = await Promise.all([
      getClauseTree({ includeInactive: includeInactive.value }),
      getClauseStats(),
    ]);
    treeData.value = tree;
    stats.value = statsData;
    if (tree.length > 0) {
      expandedKeys.value = tree.map((n) => String(n.id));
    }
    // Refresh current clause if selected
    if (selectedKeys.value.length > 0) {
      const found = findNode(treeData.value, selectedKeys.value[0] as number);
      currentClause.value = found;
    }
  } catch {
    // 拦截器已提示
  } finally {
    treeLoading.value = false;
  }
}

function onTreeSelect(keys: (number | string)[], options: (TreeOption | null)[]) {
  selectedKeys.value = keys;
  if (keys.length === 0) {
    currentClause.value = null;
    return;
  }
  const node = (options?.[0] as any)?.clause as StandardApi.ClauseNode | undefined;
  currentClause.value = node || findNode(treeData.value, keys[0] as number);
}

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({});

const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onImportClose,
  bindRefresh: bindImportRefresh,
} = useGenericImport('standard-clauses');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await loadTree();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

async function onExport() {
  try {
    const clauses = await exportClauses();
    const blob = new Blob([JSON.stringify(clauses, null, 2)], {
      type: 'application/json',
    });
    const ts = new Date().toISOString().slice(0, 10);
    triggerDownload(blob, `safety_standard_clauses_${ts}.json`);
    message.success(`导出成功，共 ${clauses.length} 条条款`);
  } catch {
    message.error('导出失败');
  }
}

// ===================== 新增/编辑弹窗 =====================
const editModalOpen = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const formLoading = ref(false);
const formRef = ref<FormInst | null>(null);
const pendingParentId = ref<number | null>(null);

const formModel = reactive<StandardApi.ClauseFormData>({
  code: '',
  parentId: null,
  level: 1,
  elementName: '',
  clauseTitle: '',
  clauseContent: '',
  checkMethod: '',
  scoreWeight: 0,
  requiredDocTypes: [],
  keywords: [],
  sortOrder: 0,
  status: 'active',
});

const levelOptions = [
  { label: '一级（要素）', value: 1 },
  { label: '二级（子项）', value: 2 },
  { label: '三级（条款）', value: 3 },
];

/** 父级树数据（过滤掉三级节点） */
const parentTreeOptions = computed(() => {
  const filterTree = (nodes: StandardApi.ClauseNode[]): TreeOption[] => {
    return nodes
      .filter((n) => n.level === 1 || n.level === 2)
      .map((n) => ({
        key: n.id,
        label: n.level === 1 ? n.elementName || n.code : n.clauseTitle || n.code,
        children: n.children ? filterTree(n.children) : undefined,
      }));
  };
  return filterTree(treeData.value);
});

function onParentChange(value: number | null) {
  formModel.parentId = value;
  if (!value) {
    formModel.level = 1;
  } else {
    const parent = findNode(treeData.value, value);
    if (parent?.level === 1) formModel.level = 2;
    else if (parent?.level === 2) formModel.level = 3;
    else formModel.level = 1;
  }
}

function resetForm() {
  formModel.code = '';
  formModel.parentId = null;
  formModel.level = 1;
  formModel.elementName = '';
  formModel.clauseTitle = '';
  formModel.clauseContent = '';
  formModel.checkMethod = '';
  formModel.scoreWeight = 0;
  formModel.requiredDocTypes = [];
  formModel.keywords = [];
  formModel.sortOrder = 0;
  formModel.status = 'active';
}

function handleAdd(parentId?: number | null) {
  resetForm();
  editMode.value = 'create';
  pendingParentId.value = parentId ?? null;
  if (parentId) {
    formModel.parentId = parentId;
    onParentChange(parentId);
  }
  editModalOpen.value = true;
}

function handleEdit() {
  if (!currentClause.value) return;
  resetForm();
  editMode.value = 'edit';
  const c = currentClause.value;
  formModel.code = c.code;
  formModel.parentId = c.parentId ?? null;
  formModel.level = c.level;
  formModel.elementName = c.elementName || '';
  formModel.clauseTitle = c.clauseTitle || '';
  formModel.clauseContent = c.clauseContent || '';
  formModel.checkMethod = c.checkMethod || '';
  formModel.scoreWeight = c.scoreWeight != null ? Number(c.scoreWeight) : 0;
  formModel.requiredDocTypes = c.requiredDocTypes || [];
  formModel.keywords = c.keywords || [];
  formModel.sortOrder = c.sortOrder ?? 0;
  formModel.status = c.status;
  editModalOpen.value = true;
}

async function onSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!formModel.code?.trim()) {
    message.warning('请输入条款编码');
    return;
  }
  if (formModel.level === 1 && !formModel.elementName?.trim()) {
    message.warning('一级要素请填写要素名称');
    return;
  }
  if (formModel.level > 1 && !formModel.clauseTitle?.trim()) {
    message.warning('请填写条款标题');
    return;
  }
  formLoading.value = true;
  try {
    if (editMode.value === 'edit' && currentClause.value) {
      await updateClause(currentClause.value.id, { ...formModel });
      message.success('条款更新成功');
    } else {
      await createClause({ ...formModel });
      message.success('条款创建成功');
    }
    editModalOpen.value = false;
    await loadTree();
  } catch {
    // 拦截器已提示
  } finally {
    formLoading.value = false;
  }
}

// ===================== 启用/停用 =====================
async function handleToggleStatus() {
  if (!currentClause.value) return;
  const clause = currentClause.value;
  const newStatus = clause.status === 'active' ? 'inactive' : 'active';
  const action = newStatus === 'active' ? '启用' : '停用';
  try {
    await setClauseStatus(clause.id, newStatus);
    message.success(`条款已${action}`);
    await loadTree();
  } catch {
    // 拦截器已提示
  }
}

onMounted(() => {
  loadTree();
});
</script>

<template>
  <HsePageLayout title="标准条款库" description="安全生产标准化三级条款管理">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @export="onExport"
        @create="() => handleAdd(null)"
      />
    </template>

    <!-- 统计卡片 -->
    <div class="stat-row mb-4">
      <NCard v-for="s in statItems" :key="s.key" size="small" class="stat-card">
        <div class="stat-card-inner">
          <div class="stat-value">
            {{ s.value }}<span class="stat-suffix">{{ s.suffix }}</span>
          </div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </NCard>
    </div>

    <HseSplitPane
      title="条款树"
      storage-key="hse-standard-clauses-split-width"
      :default-width="300"
      class="clauses-split"
    >
      <template #left>
        <div class="clause-tree-panel">
          <div class="panel-head">
            <div class="panel-title">
              <span>条款树</span>
            </div>
            <NSpace v-if="canEdit" size="small">
              <NButton size="tiny" type="primary" @click="handleAdd(null)">
                <template #icon><Plus class="size-3.5" /></template>
                新增
              </NButton>
              <NButton size="tiny" quaternary @click="loadTree">
                <template #icon><RotateCw class="size-3.5" /></template>
              </NButton>
            </NSpace>
          </div>

          <NInput
            v-model:value="searchKeyword"
            placeholder="搜索编码或名称"
            clearable
            class="tree-search"
          />

          <div class="tree-filter">
            <NCheckbox v-model:checked="includeInactive" @update:checked="loadTree">
              包含停用条款
            </NCheckbox>
          </div>

          <NSpin :show="treeLoading">
            <NEmpty
              v-if="treeOptions.length === 0 && !treeLoading"
              description="暂无条款数据"
              class="py-10"
            />
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
        <div class="clause-detail-panel">
          <NEmpty
            v-if="!currentClause"
            description="请从左侧选择条款查看详情"
            class="py-20"
          />

          <template v-else>
            <div class="detail-head">
              <div>
                <div class="clause-title">
                  {{ nodeTitle(currentClause) }}
                </div>
                <NText depth="3" class="text-sm">
                  编码: {{ currentClause.code }} · 层级:
                  <HseStatusTag :type="levelTag(currentClause.level)" size="small">
                    L{{ currentClause.level }} {{ levelText(currentClause.level) }}
                  </HseStatusTag>
                  ·
                  <HseStatusTag
                    :type="currentClause.status === 'active' ? 'success' : 'neutral'"
                    size="small"
                  >
                    {{ currentClause.status === 'active' ? '启用' : '停用' }}
                  </HseStatusTag>
                </NText>
              </div>
              <NSpace v-if="canEdit" size="small">
                <NButton size="small" @click="handleEdit">
                  编辑
                </NButton>
                <NButton
                  v-if="currentClause.level < 3"
                  size="small"
                  type="primary"
                  @click="handleAdd(currentClause.id)"
                >
                  <template #icon><Plus class="size-3.5" /></template>
                  新增子项
                </NButton>
                <NPopconfirm @positive-click="handleToggleStatus">
                  <template #trigger>
                    <NButton
                      size="small"
                      :type="currentClause.status === 'active' ? 'default' : 'primary'"
                    >
                      {{ currentClause.status === 'active' ? '停用' : '启用' }}
                    </NButton>
                  </template>
                  确定要{{ currentClause.status === 'active' ? '停用' : '启用' }}该条款吗？
                </NPopconfirm>
              </NSpace>
            </div>

            <NDescriptions :column="2" bordered size="small" class="detail-desc">
              <NDescriptionsItem label="条款编码">
                <span class="font-mono">{{ currentClause.code }}</span>
              </NDescriptionsItem>
              <NDescriptionsItem label="层级">
                第 {{ currentClause.level }} 级（{{ levelText(currentClause.level) }}）
              </NDescriptionsItem>
              <NDescriptionsItem v-if="currentClause.elementName" label="要素名称">
                {{ currentClause.elementName }}
              </NDescriptionsItem>
              <NDescriptionsItem label="分值权重">
                <span class="font-semibold text-blue-600">
                  {{ Number(currentClause.scoreWeight || 0) }}
                </span>
              </NDescriptionsItem>
              <NDescriptionsItem label="排序">
                {{ currentClause.sortOrder }}
              </NDescriptionsItem>
              <NDescriptionsItem label="创建时间">
                {{ currentClause.createdAt ? new Date(currentClause.createdAt).toLocaleString('zh-CN') : '-' }}
              </NDescriptionsItem>
            </NDescriptions>

            <NCard
              v-if="currentClause.clauseContent"
              size="small"
              title="条款要求"
              class="mb-3"
            >
              <div class="whitespace-pre-wrap text-sm">
                {{ currentClause.clauseContent }}
              </div>
            </NCard>

            <NCard
              v-if="currentClause.checkMethod"
              size="small"
              title="检查方法"
              class="mb-3"
            >
              <div class="whitespace-pre-wrap text-sm">
                {{ currentClause.checkMethod }}
              </div>
            </NCard>

            <div
              v-if="currentClause.keywords && currentClause.keywords.length > 0"
              class="mb-3"
            >
              <div class="mb-1 text-sm text-gray-500">关键词标签</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(kw, idx) in currentClause.keywords" :key="idx" type="info">
                  {{ kw }}
                </NTag>
              </div>
            </div>

            <div
              v-if="currentClause.requiredDocTypes && currentClause.requiredDocTypes.length > 0"
              class="mb-3"
            >
              <div class="mb-1 text-sm text-gray-500">要求资料类型</div>
              <div class="flex flex-wrap gap-1">
                <NTag
                  v-for="(doc, idx) in currentClause.requiredDocTypes"
                  :key="idx"
                  type="primary"
                >
                  {{ doc }}
                </NTag>
              </div>
            </div>
          </template>
        </div>
      </template>
    </HseSplitPane>

    <!-- 新增/编辑弹窗 -->
    <NModal
      v-model:show="editModalOpen"
      preset="card"
      :title="editMode === 'edit' ? '编辑条款' : '新增条款'"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm
        ref="formRef"
        :model="formModel"
        label-placement="top"
        class="clause-form"
      >
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="条款编码" required>
            <NInput
              v-model:value="formModel.code"
              placeholder="如 GB-5.1-001"
              :disabled="editMode === 'edit'"
            />
          </NFormItem>
          <NFormItem label="层级" required>
            <NSelect v-model:value="formModel.level" :options="levelOptions" placeholder="选择层级" />
          </NFormItem>
        </div>

        <NFormItem label="父级条款">
          <NTreeSelect
            v-model:value="formModel.parentId"
            :options="parentTreeOptions"
            placeholder="一级要素无需选择父级"
            clearable
            default-expand-all
            @update:value="onParentChange"
          />
        </NFormItem>

        <NFormItem v-if="formModel.level === 1" label="要素名称" required>
          <NInput v-model:value="formModel.elementName" placeholder="如：目标职责" :maxlength="128" />
        </NFormItem>

        <NFormItem label="条款标题" :required="formModel.level > 1">
          <NInput v-model:value="formModel.clauseTitle" placeholder="条款简要标题" :maxlength="256" />
        </NFormItem>

        <NFormItem label="条款要求内容">
          <NInput
            v-model:value="formModel.clauseContent"
            type="textarea"
            :rows="4"
            placeholder="条款的具体要求描述"
          />
        </NFormItem>

        <NFormItem label="检查方法">
          <NInput
            v-model:value="formModel.checkMethod"
            type="textarea"
            :rows="2"
            placeholder="如何检查该条款是否达标"
          />
        </NFormItem>

        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="分值权重">
            <NInputNumber
              v-model:value="formModel.scoreWeight"
              :min="0"
              :max="999"
              :step="0.5"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="排序">
            <NInputNumber
              v-model:value="formModel.sortOrder"
              :min="0"
              :max="9999"
              style="width: 100%"
            />
          </NFormItem>
        </div>

        <NFormItem v-if="editMode === 'edit'" label="状态">
          <NSelect
            v-model:value="formModel.status"
            :options="[
              { label: '启用', value: 'active' },
              { label: '停用', value: 'inactive' },
            ]"
          />
        </NFormItem>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="editModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入弹窗 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入标准条款"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onImportTemplate"
      @upload="onImportUpload"
      @confirm="onImportConfirm"
      @close="onImportClose"
    />
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

.clauses-split {
  height: calc(100vh - 300px);
  min-height: 420px;
}

.clause-tree-panel,
.clause-detail-panel {
  height: 100%;
  overflow: auto;
  padding: 8px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

.tree-search {
  margin-bottom: 8px;
}

.tree-filter {
  margin-bottom: 8px;
  padding: 0 4px;
}

.node-code {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  margin-left: 4px;
}

.node-inactive {
  color: hsl(var(--muted-foreground));
  text-decoration: line-through;
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
  margin-bottom: 4px;
}

.detail-desc {
  margin-bottom: 12px;
}

.mb-3 {
  margin-bottom: 12px;
}

.mb-4 {
  margin-bottom: 16px;
}

.py-10 {
  padding: 40px 0;
}

.py-20 {
  padding: 80px 0;
}

.text-sm {
  font-size: 13px;
}

.font-mono {
  font-family: monospace;
}

.font-semibold {
  font-weight: 600;
}

.text-blue-600 {
  color: #2563eb;
}

.text-gray-500 {
  color: #6b7280;
}

.whitespace-pre-wrap {
  white-space: pre-wrap;
}

.flex {
  display: flex;
}

.flex-wrap {
  flex-wrap: wrap;
}

.gap-1 {
  gap: 4px;
}

.grid {
  display: grid;
}

.grid-cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.gap-x-4 {
  column-gap: 16px;
}

@media (max-width: 900px) {
  .stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
