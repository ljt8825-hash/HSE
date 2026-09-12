<script lang="ts" setup>
import { ref } from 'vue';

import {
  NButton,
  NCard,
  NGi,
  NInput,
  NSelect,
  NSpace,
  NStatistic,
  NText,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
  type HseActionState,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

// 离散 API（来自 src/adapter/naive）：验证其主题与页面内 NConfigProvider 一致
import {
  message,
  dialog as discreteDialog,
  loadingBar as discreteLoadingBar,
  modal as discreteModal,
  notification as discreteNotification,
} from '#/adapter/naive';

defineOptions({ name: 'HseOverview' });

// —— 仅用于演示动作状态，非真实业务数据 ——
const actionState = ref<Partial<Record<HseActionKey, HseActionState>>>({
  refresh: { loading: false },
  import: { loading: false },
  export: { loading: false },
});

function runLoading(key: HseActionKey) {
  actionState.value[key] = { ...actionState.value[key], loading: true };
  setTimeout(() => {
    actionState.value[key] = { ...actionState.value[key], loading: false };
  }, 900);
}

function onAction(key: HseActionKey) {
  switch (key) {
    case 'refresh':
      runLoading('refresh');
      message.success('已刷新（离散 message · HSE 绿）');
      break;
    case 'downloadTemplate':
      message.info('下载模板（演示，未接入真实文件）');
      break;
    case 'import':
      runLoading('import');
      message.warning('导入中（演示，未接入真实导入流程）');
      break;
    case 'export':
      runLoading('export');
      message.success('导出中（演示，未接入真实导出流程）');
      break;
    case 'create':
      message.info('新增（演示，未接入真实表单）');
      break;
  }
}

// —— 离散 UI 主题一致性验证 ——
function showDiscreteMessage() {
  message.success('message 已继承 HSE 主题（绿）');
}
function showDiscreteNotification() {
  discreteNotification.success({
    title: 'Notification',
    content: 'notification 已继承 HSE 主题（绿）',
    duration: 2500,
  });
}
function showDiscreteDialog() {
  discreteDialog.success({
    title: 'Dialog',
    content: 'dialog 已继承 HSE 主题（绿）',
  });
}
function showDiscreteModal() {
  discreteModal.create({
    title: 'Modal',
    content: 'modal 已继承 HSE 主题（绿）',
    preset: 'card',
  });
}
function runDiscreteLoadingBar() {
  discreteLoadingBar.start();
  setTimeout(() => discreteLoadingBar.finish(), 1200);
}

const statusTypes = ['success', 'info', 'warning', 'danger', 'neutral'] as const;

/* ===================== HseDataGrid 演示 ===================== */
// 静态演示数据（无后端）。含超长姓名用于验证省略 + tooltip。
const rawGridData = [
  {
    id: 1,
    code: 'A-0001',
    name: '张伟（环卫作业中心·人工作业一班·道路清扫岗位）',
    dept: '人工作业中心',
    statusType: 'success',
    statusText: '正常',
    editableName: '张伟',
    editableDept: '人工作业中心',
  },
  {
    id: 2,
    code: 'A-0002',
    name: '李娜（机扫车队·车辆驾驶岗位·国Ⅵ压缩式垃圾车驾驶员）',
    dept: '机扫车队',
    statusType: 'warning',
    statusText: '预警',
    editableName: '李娜',
    editableDept: '机扫车队',
  },
  {
    id: 3,
    code: 'A-0003',
    name: '王强',
    dept: '转运站',
    statusType: 'danger',
    statusText: '危险',
    editableName: '王强',
    editableDept: '转运站',
  },
  {
    id: 4,
    code: 'A-0004',
    name: '赵敏',
    dept: '公厕管护中心',
    statusType: 'success',
    statusText: '正常',
    editableName: '赵敏',
    editableDept: '公厕管护中心',
  },
  {
    id: 5,
    code: 'A-0005',
    name: '陈晨',
    dept: '设施维修中心',
    statusType: 'info',
    statusText: '信息',
    editableName: '陈晨',
    editableDept: '设施维修中心',
  },
];

const gridData = ref([...rawGridData]);
const gridRef = ref<InstanceType<typeof HseDataGrid>>();
const editingId = ref<number | null>(null);
const currentSort = ref<{ field?: string; order?: 'asc' | 'desc' }>({});

// 行编辑校验规则（演示「部门不能为空」必填；真实业务页面按自身字段声明）
const gridEditRules = {
  editableDept: [{ required: true, message: '部门不能为空' }],
};
// 编辑事件日志（仅用于演示与验证：保存成功 / 取消回滚 / 校验失败回滚）
const editLog = ref<string[]>([]);
function pushEditLog(text: string) {
  editLog.value = [text, ...editLog.value].slice(0, 5);
}

const gridColumns = ref<VxeTableGridColumns>([
  {
    title: '编号',
    field: 'code',
    width: 110,
    align: 'center',
    sortable: true, // 白名单：仅此列可排序
    fixed: 'left',
  },
  {
    title: '姓名（长文本省略 + tooltip）',
    field: 'name',
    minWidth: 260,
    align: 'left', // 长文本左对齐
    // showOverflow 继承全局 'tooltip'
  },
  {
    title: '部门',
    field: 'editableDept',
    width: 160,
    align: 'center',
    editRender: { name: 'input' },
  },
  {
    title: '状态',
    field: 'statusText',
    width: 120,
    align: 'center',
    slots: { default: 'status' },
  },
  {
    title: '操作',
    field: 'action',
    width: 170,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

// 排序三态：组件只上报，不本地重排；此处为演示对本地全量数据排序
function onSortChange(payload: {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const { sortBy, sortOrder } = payload;
  currentSort.value = { field: sortBy, order: sortOrder };
  if (!sortBy || !sortOrder) {
    gridData.value = [...rawGridData];
    return;
  }
  gridData.value = [...rawGridData].sort((a, b) => {
    const av = (a as any)[sortBy] as string;
    const bv = (b as any)[sortBy] as string;
    if (av === bv) return 0;
    const cmp = av > bv ? 1 : -1;
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

function startEdit(row: any) {
  editingId.value = row.id;
  gridRef.value?.beginEdit(row);
}
function onEditSave(payload: any) {
  editingId.value = null;
  pushEditLog(`save 成功：${payload?.row?.editableDept ?? ''}`);
  message.success('行已保存（演示）');
}
function onEditCancel(payload: any) {
  editingId.value = null;
  // 点击取消与校验失败都走 edit-cancel：校验失败可在 VXE 单元格红框提示中区分
  pushEditLog(`cancel 回滚：${payload?.row?.editableDept ?? ''}`);
  message.info('已取消编辑（或校验失败已回滚）');
}

/* ===================== HseImportDialog 演示 ===================== */
const importOpen = ref(false);
const importPreviewColumns = ref<VxeTableGridColumns>([
  { title: '编号', field: 'code', width: 110, align: 'center' },
  { title: '姓名', field: 'name', minWidth: 160, align: 'left' },
  { title: '部门', field: 'dept', width: 160, align: 'center' },
  { title: '状态', field: 'status', width: 120, align: 'center' },
]);
const importPreviewData = ref<any[]>([]);
const importPreviewError = ref<string | null>(null);
const importConfirming = ref(false);
const importResult = ref<{ success: boolean; message: string } | null>(null);
const simulateError = ref(false);

const sampleImportRows = [
  { code: 'B-0001', name: '刘洋', dept: '人工作业中心', status: '正常' },
  { code: 'B-0002', name: '孙悦', dept: '机扫车队', status: '预警' },
  { code: 'B-0003', name: '周杰', dept: '转运站', status: '正常' },
];

function onDownloadTemplate() {
  message.info('已触发「下载模板」（演示，未接入真实文件）');
}
function onUpload(file: File) {
  // 模拟解析 / 校验（无真实后端）
  if (simulateError.value) {
    importPreviewError.value = `校验失败：第 2 行「状态」取值非法（应为 正常/预警/危险），请修正后重新上传。文件名：${file.name}`;
    importPreviewData.value = [];
    return;
  }
  importPreviewError.value = null;
  importPreviewData.value = sampleImportRows;
}
function onConfirmImport() {
  importConfirming.value = true;
  setTimeout(() => {
    importConfirming.value = false;
    importResult.value = {
      success: true,
      message: `成功导入 ${importPreviewData.value.length} 条记录（演示）`,
    };
  }, 900);
}
function onImportClose() {
  importPreviewData.value = [];
  importPreviewError.value = null;
  importResult.value = null;
}
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.overviewDesc')"
    :title="$t('page.hse.overview')"
  >
    <template #breadcrumb>
      <NSpace size="small">
        <HseStatusTag type="neutral">阶段 03 组件验证</HseStatusTag>
        <HseStatusTag type="warning">演示页 · 非业务页面</HseStatusTag>
      </NSpace>
    </template>

    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onAction('refresh')"
        @download-template="onAction('downloadTemplate')"
        @import="onAction('import')"
        @export="onAction('export')"
        @create="onAction('create')"
      />
    </template>

    <!-- 1. 状态标签 -->
    <NCard title="HseStatusTag · 语义状态标签" :bordered="false" class="mb-4">
      <NSpace>
        <HseStatusTag
          v-for="t in statusTypes"
          :key="t"
          :type="t"
        />
      </NSpace>
    </NCard>

    <!-- 2. 搜索面板 -->
    <HseSearchPanel
      :columns="3"
      @query="message.success('查询（演示）')"
      @reset="message.info('重置（演示）')"
    >
      <NGi>
        <NInput placeholder="关键词（演示）" />
      </NGi>
      <NGi>
        <NSelect
          :options="[
            { label: '全部（演示）', value: 'all' },
            { label: '已处理', value: 'done' },
            { label: '待处理', value: 'pending' },
          ]"
          placeholder="状态（演示）"
        />
      </NGi>
      <NGi>
        <NInput placeholder="责任人（演示）" />
      </NGi>
      <template #more>
        <NGi>
          <NInput placeholder="更多条件 A（演示）" />
        </NGi>
        <NGi>
          <NInput placeholder="更多条件 B（演示）" />
        </NGi>
        <NGi>
          <NInput placeholder="更多条件 C（演示）" />
        </NGi>
      </template>
    </HseSearchPanel>

    <!-- 3. 操作栏（独立演示，含禁用 / 隐藏） -->
    <NCard title="HseActionBar · 标准操作栏" :bordered="false" class="mb-4">
      <NSpace vertical :size="16">
        <div>
          <div class="mb-2 text-muted-foreground">默认（冻结顺序：刷新 / 下载模板 / 导入 / 导出 / 新增）</div>
          <HseActionBar
            @refresh="onAction('refresh')"
            @download-template="onAction('downloadTemplate')"
            @import="onAction('import')"
            @export="onAction('export')"
            @create="onAction('create')"
          />
        </div>
        <div>
          <div class="mb-2 text-muted-foreground">含禁用与隐藏（导入禁用、下载模板隐藏）</div>
          <HseActionBar
            :actions="{ import: { disabled: true }, downloadTemplate: { hidden: true } }"
            @refresh="onAction('refresh')"
            @import="onAction('import')"
            @export="onAction('export')"
            @create="onAction('create')"
          />
        </div>
      </NSpace>
    </NCard>

    <!-- 4. 离散 UI 主题一致性验证 -->
    <NCard title="离散 UI 主题一致性（message / notification / dialog / modal / loadingBar）" :bordered="false" class="mb-4">
      <NSpace>
        <NButton @click="showDiscreteMessage">Message</NButton>
        <NButton @click="showDiscreteNotification">Notification</NButton>
        <NButton @click="showDiscreteDialog">Dialog</NButton>
        <NButton @click="showDiscreteModal">Modal</NButton>
        <NButton @click="runDiscreteLoadingBar">LoadingBar</NButton>
      </NSpace>
    </NCard>

    <!-- 5. HseDataGrid 演示（阶段 03 核心） -->
    <NCard title="HseDataGrid · 通用表格（VXE Table）" :bordered="false" class="mb-4">
      <NText depth="3" class="mb-3 block text-xs">
        表头居中 · 长文本省略 + tooltip · 编号列三态排序（升/降/取消，不影响其他列）· 行编辑保存/取消
      </NText>
      <HseDataGrid
        ref="gridRef"
        :columns="gridColumns"
        :data="gridData"
        :editable="true"
        :edit-rules="gridEditRules"
        :pager="true"
        :total="gridData.length"
        @sort-change="onSortChange"
        @edit-save="onEditSave"
        @edit-cancel="onEditCancel"
      >
        <template #status="{ row }">
          <HseStatusTag :type="row.statusType">{{ row.statusText }}</HseStatusTag>
        </template>
        <template #action="{ row }">
          <NSpace v-if="row.id !== editingId" justify="center">
            <NButton size="small" type="primary" quaternary @click="startEdit(row)">
              {{ $t('page.hse.grid.edit') }}
            </NButton>
          </NSpace>
          <NSpace v-else justify="center">
            <NButton size="small" type="primary" @click="gridRef?.saveEdit(row)">
              {{ $t('page.hse.grid.save') }}
            </NButton>
            <NButton size="small" @click="gridRef?.cancelEdit(row)">
              {{ $t('page.hse.grid.cancel') }}
            </NButton>
          </NSpace>
        </template>
      </HseDataGrid>
      <div class="mt-3 rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        编辑事件日志（演示验证用）：
        <span v-if="editLog.length === 0">尚无事件</span>
        <template v-else>
          <span v-for="(log, i) in editLog" :key="i" class="mr-3 inline-block">· {{ log }}</span>
        </template>
      </div>
    </NCard>

    <!-- 6. HseImportDialog 演示（阶段 03 核心） -->
    <NCard title="HseImportDialog · 通用导入弹窗" :bordered="false" class="mb-4">
      <NSpace vertical :size="12">
        <NSpace align="center">
          <NButton type="primary" @click="importOpen = true">
            {{ $t('page.hse.import.title') }}
          </NButton>
          <NText depth="3" class="text-xs">
            打开弹窗后体验：下载模板 → 上传 → 解析校验预览 → 确认导入 → 结果
          </NText>
        </NSpace>
        <NSpace align="center">
          <NText depth="3" class="text-xs">勾选后下次上传将模拟「校验失败」状态：</NText>
          <NButton
            size="small"
            :type="simulateError ? 'error' : 'default'"
            @click="simulateError = !simulateError"
          >
            {{ simulateError ? '已开启模拟失败' : '模拟校验失败：关' }}
          </NButton>
        </NSpace>
      </NSpace>

      <HseImportDialog
        v-model:open="importOpen"
        :preview-columns="importPreviewColumns"
        :preview-data="importPreviewData"
        :preview-error="importPreviewError"
        :confirming="importConfirming"
        :result="importResult"
        @download-template="onDownloadTemplate"
        @upload="onUpload"
        @confirm="onConfirmImport"
        @close="onImportClose"
      />
    </NCard>

    <!-- 占位统计（无真实业务数据） -->
    <NCard title="占位统计（演示）" :bordered="false">
      <NSpace :size="40">
        <NStatistic label="风险预警" :value="0" />
        <NStatistic label="隐患排查" :value="0" />
        <NStatistic label="培训演练" :value="0" />
        <NStatistic label="责任书签订" :value="0" />
      </NSpace>
    </NCard>
  </HsePageLayout>
</template>
