<script setup lang="ts">
/**
 * 员工批量导入弹窗 - HSE 人员主数据中心 Sprint5.1 + Sprint5.1.1
 *
 * 双模式导入：
 *   模式 A — JSON 导入（Sprint5.1）
 *     1. 用户拖拽或点击上传 .json 文件
 *     2. 前端解析 JSON 数组并预览前 10 条
 *     3. 点击确认调用 importEmployees(parsedData)
 *
 *   模式 B — Excel 导入（Sprint5.1.1 生产加固）
 *     1. 用户下载 .xlsx 模板
 *     2. 上传填好的 .xlsx 文件
 *     3. 后端解析返回预览+校验结果
 *     4. 用户确认后调用 importEmployeeExcel(file) 直接导入
 *
 * 不引入新前端依赖（xlsx 解析在后端完成）。
 */
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import {
  importEmployees,
  importEmployeeExcel,
  previewEmployeeExcel,
  downloadEmployeeImportTemplate,
  type EmployeeApi,
} from '#/api/hse/employee';

// ============================================================
// Props / Emits
// ============================================================
const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

// ============================================================
// 状态
// ============================================================
type ImportMode = 'json' | 'excel';
const mode = ref<ImportMode>('excel');

const submitting = ref(false);
const parsing = ref(false);

// JSON 模式状态
const fileList = ref<any[]>([]);
const previewData = ref<EmployeeApi.EmployeeFormData[]>([]);
const parseError = ref('');

// Excel 模式状态
const excelFile = ref<File | null>(null);
const excelFileList = ref<any[]>([]);
const excelPreview = ref<EmployeeApi.ExcelPreviewResult | null>(null);
const excelParseError = ref('');

// 通用结果
const importResult = ref<EmployeeApi.ImportResult | null>(null);

// ============================================================
// 字段说明
// ============================================================
const fieldDocs = [
  { field: 'employee_code', desc: '员工编码（可选）' },
  { field: 'name', desc: '姓名（必填）' },
  { field: 'id_card', desc: '身份证件号（可选，18位）' },
  { field: 'id_address', desc: '身份证地址（可选）' },
  { field: 'gender', desc: '性别（男/女）' },
  { field: 'birth_date', desc: '出生日期（YYYY-MM-DD）' },
  { field: 'phone', desc: '手机号码（11位）' },
  { field: 'hire_date', desc: '入职日期（YYYY-MM-DD）' },
  {
    field: 'person_category',
    desc: '人员分类（适龄人员/超龄人员）',
  },
  {
    field: 'person_type',
    desc: '人员类型（生产人员/管理人员/技术人员/辅助人员，不含驾驶员）',
  },
  { field: 'is_public_welfare', desc: '是否公益岗（是/否）' },
];

// ============================================================
// 预览表格列
// ============================================================
const previewColumns = [
  { title: '序号', dataIndex: '__idx', width: 60 },
  { title: '员工编码', dataIndex: 'employee_code', width: 120 },
  { title: '姓名', dataIndex: 'name', width: 90 },
  { title: '身份证件号', dataIndex: 'id_card', ellipsis: true, width: 180 },
  { title: '身份证地址', dataIndex: 'id_address', ellipsis: true, width: 200 },
  { title: '性别', dataIndex: 'gender', width: 60 },
  { title: '出生日期', dataIndex: 'birth_date', width: 110 },
  { title: '手机号码', dataIndex: 'phone', width: 130 },
  { title: '入职日期', dataIndex: 'hire_date', width: 110 },
  { title: '岗位', dataIndex: 'position_name', width: 120 },
  { title: '人员分类', dataIndex: 'person_category', width: 100 },
  { title: '人员类型', dataIndex: 'person_type', width: 100 },
  {
    title: '公益岗',
    dataIndex: 'is_public_welfare',
    width: 80,
    customRender: ({ value }: any) => (value ? '是' : '否'),
  },
];

const excelPreviewColumns = [
  { title: '行号', dataIndex: '__rowIndex', width: 70 },
  { title: '所属乡镇', dataIndex: 'township', width: 120 },
  { title: '二级部门', dataIndex: 'secondary_dept', width: 140 },
  { title: '岗位', dataIndex: 'position_name', width: 120 },
  { title: '员工编码', dataIndex: 'employee_code', width: 120 },
  { title: '姓名', dataIndex: 'name', width: 90 },
  { title: '性别', dataIndex: 'gender', width: 60 },
  { title: '年龄', dataIndex: 'age', width: 70 },
  { title: '身份证件号', dataIndex: 'id_card', ellipsis: true, width: 180 },
  { title: '身份证地址', dataIndex: 'id_address', ellipsis: true, width: 200 },
  { title: '手机号码', dataIndex: 'phone', width: 130 },
  { title: '入职日期', dataIndex: 'hire_date', width: 110 },
];

const errorColumns = [
  { title: '行号', dataIndex: 'index', width: 80 },
  { title: '错误信息', dataIndex: 'message' },
];

const excelErrorColumns = [
  { title: '序号', dataIndex: '__idx', width: 70 },
  { title: '错误信息', dataIndex: 'message' },
];

// JSON 预览数据（带序号，前 10 条）
const previewRows = computed(() =>
  previewData.value.slice(0, 10).map((item, idx) => ({
    ...item,
    __idx: idx + 1,
  })),
);

// Excel 预览数据（前 50 行，带序号，并解析组织路径）
const excelPreviewRows = computed(() =>
  excelPreview.value
    ? excelPreview.value.preview.slice(0, 50).map((item, idx) => {
        const orgPath = (item as any).org_path || '';
        const parts = orgPath.split('/').filter(Boolean);
        return {
          ...item,
          __idx: idx + 1,
          township: parts[0] || '-',
          secondary_dept: parts[1] || '-',
        };
      })
    : [],
);

// Excel 错误列表（带序号）
const excelErrorRows = computed(() =>
  excelPreview.value
    ? excelPreview.value.errors.map((msg, idx) => ({
        __idx: idx + 1,
        message: msg,
      }))
    : [],
);

// 确认按钮是否可用
const canSubmit = computed(() => {
  if (submitting.value) return false;
  if (mode.value === 'json') return previewData.value.length > 0;
  // Excel 模式：有文件且预览无致命错误
  return excelFile.value !== null;
});

// 确认按钮文案
const okText = computed(() => {
  if (submitting.value) return '导入中...';
  if (mode.value === 'json') return '开始导入';
  return excelPreview.value ? '确认导入' : '解析并导入';
});

// ============================================================
// 弹窗打开/关闭时重置
// ============================================================
watch(
  () => props.open,
  (val) => {
    if (!val) {
      resetForm();
    }
  },
);

// 切换模式时清理另一模式状态
watch(mode, () => {
  resetResult();
});

// ============================================================
// JSON 模式：解析 JSON 文件
// ============================================================
function handleBeforeUpload(file: File) {
  parseError.value = '';
  previewData.value = [];
  importResult.value = null;
  fileList.value = [
    {
      uid: String(Date.now()),
      name: file.name,
      status: 'done',
      size: file.size,
    },
  ];

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        parseError.value = '文件内容必须是 JSON 数组';
        return;
      }
      if (parsed.length === 0) {
        parseError.value = '文件内容为空';
        return;
      }
      previewData.value = parsed as EmployeeApi.EmployeeFormData[];
      message.success(`解析成功，共 ${parsed.length} 条员工记录`);
    } catch {
      parseError.value = 'JSON 格式错误，无法解析';
    }
  };
  reader.onerror = () => {
    parseError.value = '文件读取失败';
  };
  reader.readAsText(file);
  return false;
}

function handleRemove() {
  fileList.value = [];
  previewData.value = [];
  parseError.value = '';
  importResult.value = null;
}

// ============================================================
// 下载模板
// ============================================================
async function handleDownloadTemplate() {
  if (mode.value === 'json') {
    // JSON 模板
    const template = [
      {
        employee_code: 'EMP001',
        id_card: '3201XXXXXXXXXXXXXX',
        name: '张三',
        gender: '男',
        birth_date: '1990-01-01',
        phone: '138XXXXXXXX',
        person_category: '适龄人员',
        person_type: '生产人员',
        is_public_welfare: false,
      },
    ];
    const blob = new Blob([JSON.stringify(template, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '员工导入模板.json';
    link.click();
    URL.revokeObjectURL(url);
    message.success('JSON 模板下载成功');
  } else {
    // Excel 模板（从后端下载）
    try {
      const blob = await downloadEmployeeImportTemplate();
      const url = URL.createObjectURL(blob as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '员工导入模板.xlsx';
      link.click();
      URL.revokeObjectURL(url);
      message.success('Excel 模板下载成功');
    } catch {
      // 错误提示已由拦截器处理
    }
  }
}

// ============================================================
// Excel 模式：上传文件 → 解析预览
// ============================================================
function handleExcelBeforeUpload(file: File) {
  excelParseError.value = '';
  excelPreview.value = null;
  importResult.value = null;
  excelFile.value = file;
  excelFileList.value = [
    {
      uid: String(Date.now()),
      name: file.name,
      status: 'done',
      size: file.size,
    },
  ];

  // 自动调用预览接口
  parseExcelFile(file);
  return false;
}

function handleExcelRemove() {
  excelFile.value = null;
  excelFileList.value = [];
  excelPreview.value = null;
  excelParseError.value = '';
  importResult.value = null;
}

async function parseExcelFile(file: File) {
  parsing.value = true;
  try {
    const result = await previewEmployeeExcel(file);
    excelPreview.value = result;
    if (result.invalidRows > 0) {
      message.warning(
        `解析完成：共 ${result.totalRows} 行，其中 ${result.invalidRows} 行存在校验错误`,
      );
    } else {
      message.success(`解析完成：共 ${result.totalRows} 行有效数据`);
    }
  } catch {
    excelParseError.value = 'Excel 解析失败，请检查文件格式';
  } finally {
    parsing.value = false;
  }
}

// ============================================================
// 确认导入
// ============================================================
async function handleImport() {
  if (mode.value === 'json') {
    await handleJsonImport();
  } else {
    await handleExcelImport();
  }
}

async function handleJsonImport() {
  if (previewData.value.length === 0) {
    message.warning('请先选择有效的 JSON 文件');
    return;
  }

  submitting.value = true;
  importResult.value = null;
  try {
    const result = await importEmployees(previewData.value);
    importResult.value = result;
    let msg = `导入完成：成功 ${result.success} 条`;
    if (result.failed > 0) {
      msg += `，失败 ${result.failed} 条`;
    }
    if (result.failed > 0) {
      message.warning(msg);
    } else {
      message.success(msg);
      emit('update:open', false);
      emit('success');
    }
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    submitting.value = false;
  }
}

async function handleExcelImport() {
  if (!excelFile.value) {
    message.warning('请先上传 Excel 文件');
    return;
  }

  // 若尚未预览，先预览
  if (!excelPreview.value) {
    await parseExcelFile(excelFile.value);
    if (!excelPreview.value) {
      message.error('Excel 解析失败，无法导入');
      return;
    }
  }

  // 若存在校验错误，提示用户但仍允许继续（错误行会被后端跳过）
  if (excelPreview.value.invalidRows > 0) {
    message.warning(
      `当前文件有 ${excelPreview.value.invalidRows} 行校验错误，将被跳过；点击确定继续导入有效行`,
    );
  }

  submitting.value = true;
  importResult.value = null;
  try {
    const result = await importEmployeeExcel(excelFile.value);
    importResult.value = result;
    let msg = `Excel 导入完成：成功 ${result.success} 条`;
    if (result.failed > 0) {
      msg += `，失败 ${result.failed} 条`;
    }
    if (result.failed > 0) {
      message.warning(msg);
    } else {
      message.success(msg);
      emit('update:open', false);
      emit('success');
    }
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  emit('update:open', false);
}

function resetForm() {
  mode.value = 'excel';
  fileList.value = [];
  previewData.value = [];
  parseError.value = '';
  excelFile.value = null;
  excelFileList.value = [];
  excelPreview.value = null;
  excelParseError.value = '';
  resetResult();
  submitting.value = false;
  parsing.value = false;
}

function resetResult() {
  importResult.value = null;
}
</script>

<template>
  <a-modal
    :open="open"
    title="批量导入员工"
    :width="1000"
    :confirm-loading="submitting"
    :ok-button-props="{ disabled: !canSubmit }"
    :ok-text="okText"
    :mask-closable="false"
    cancel-text="取消"
    @ok="handleImport"
    @cancel="handleCancel"
  >
    <!-- 模式切换 -->
    <a-radio-group
      v-model:value="mode"
      style="margin-bottom: 16px"
      button-style="solid"
    >
      <a-radio-button value="excel">Excel 导入（推荐）</a-radio-button>
      <a-radio-button value="json">JSON 导入</a-radio-button>
    </a-radio-group>

    <!-- 字段说明 -->
    <a-alert type="info" show-icon style="margin-bottom: 16px">
      <template #message>字段说明</template>
      <template #description>
        <div class="field-doc">
          <span
            v-for="item in fieldDocs"
            :key="item.field"
            class="field-doc-item"
          >
            <span class="font-mono text-blue-500">{{ item.field }}</span>
            <span class="text-gray-500">：{{ item.desc }}</span>
          </span>
        </div>
      </template>
    </a-alert>

    <!-- 操作区 -->
    <div style="margin-bottom: 12px; text-align: right">
      <a-button type="link" size="small" @click="handleDownloadTemplate">
        <IconifyIcon icon="lucide:download" class="mr-1" :size="14" />
        下载{{
          mode === 'json' ? 'JSON' : 'Excel'
        }}模板
      </a-button>
    </div>

    <!-- ============== Excel 模式 ============== -->
    <template v-if="mode === 'excel'">
      <a-upload-dragger
        :file-list="excelFileList"
        :before-upload="handleExcelBeforeUpload"
        :max-count="1"
        :multiple="false"
        accept=".xlsx,.xls"
        @remove="handleExcelRemove"
      >
        <p class="ant-upload-drag-icon">
          <IconifyIcon
            icon="lucide:file-spreadsheet"
            class="text-4xl text-green-500"
          />
        </p>
        <p class="ant-upload-text">点击或拖拽 Excel 文件到此处</p>
        <p class="ant-upload-hint text-gray-400">
          支持 .xlsx / .xls 格式，需使用模板填写；姓名为必填字段
        </p>
      </a-upload-dragger>

      <!-- 解析中 -->
      <div v-if="parsing" style="margin-top: 16px; text-align: center">
        <a-spin tip="正在解析 Excel..." />
      </div>

      <!-- 解析错误 -->
      <a-alert
        v-if="excelParseError"
        type="error"
        show-icon
        style="margin-top: 16px"
      >
        <template #message>
          <span>
            <IconifyIcon
              icon="lucide:alert-circle"
              class="mr-1"
              :size="14"
            />{{ excelParseError }}
          </span>
        </template>
      </a-alert>

      <!-- 预览结果 -->
      <div v-if="excelPreview" style="margin-top: 16px">
        <a-alert
          :type="excelPreview.invalidRows > 0 ? 'warning' : 'success'"
          show-icon
          style="margin-bottom: 12px"
        >
          <template #message>
            文件 {{ excelPreview.fileName }} / 工作表
            {{ excelPreview.sheetName }}：共
            {{ excelPreview.totalRows }} 行，有效
            {{ excelPreview.validRows }} 行，错误
            {{ excelPreview.invalidRows }} 行
          </template>
        </a-alert>

        <!-- 错误明细 -->
        <div v-if="excelPreview.errors.length > 0" style="margin-bottom: 12px">
          <div class="mb-2 text-red-500">校验错误明细：</div>
          <a-table
            :columns="excelErrorColumns"
            :data-source="excelErrorRows"
            size="small"
            :pagination="{ pageSize: 5, showSizeChanger: false }"
            row-key="__idx"
          />
        </div>

        <!-- 数据预览 -->
        <div class="mb-2 text-gray-500">
          前 {{ Math.min(50, excelPreview.totalRows) }} 行预览：
        </div>
        <a-table
          :columns="excelPreviewColumns"
          :data-source="excelPreviewRows"
          size="small"
          :pagination="false"
          :scroll="{ x: 1500 }"
          row-key="__rowIndex"
        />
      </div>
    </template>

    <!-- ============== JSON 模式 ============== -->
    <template v-else>
      <a-upload-dragger
        :file-list="fileList"
        :before-upload="handleBeforeUpload"
        :max-count="1"
        :multiple="false"
        accept=".json"
        @remove="handleRemove"
      >
        <p class="ant-upload-drag-icon">
          <IconifyIcon
            icon="lucide:upload-cloud"
            class="text-4xl text-blue-500"
          />
        </p>
        <p class="ant-upload-text">点击或拖拽 JSON 文件到此处</p>
        <p class="ant-upload-hint text-gray-400">
          仅支持 .json 格式，需为 JSON 数组，姓名为必填字段
        </p>
      </a-upload-dragger>

      <!-- 解析错误 -->
      <a-alert v-if="parseError" type="error" show-icon style="margin-top: 16px">
        <template #message>
          <span>
            <IconifyIcon
              icon="lucide:alert-circle"
              class="mr-1"
              :size="14"
            />{{ parseError }}
          </span>
        </template>
      </a-alert>

      <!-- 预览表格 -->
      <div v-if="previewData.length > 0" style="margin-top: 16px">
        <div class="mb-2 text-gray-500">
          共 {{ previewData.length }} 条员工记录，前
          {{ Math.min(10, previewData.length) }} 条预览：
        </div>
        <a-table
          :columns="previewColumns"
          :data-source="previewRows"
          size="small"
          :pagination="false"
          :scroll="{ x: 1500 }"
          row-key="__idx"
        />
      </div>
    </template>

    <!-- 导入结果（两种模式共用） -->
    <div v-if="importResult" style="margin-top: 16px">
      <a-alert
        :type="importResult.failed > 0 ? 'warning' : 'success'"
        show-icon
      >
        <template #message>
          导入完成：成功 {{ importResult.success }} 条，失败
          {{ importResult.failed }} 条，总计
          {{ importResult.total }} 条
        </template>
      </a-alert>

      <div
        v-if="importResult.errors && importResult.errors.length > 0"
        style="margin-top: 12px"
      >
        <div class="mb-2 text-red-500">错误明细：</div>
        <a-table
          :columns="errorColumns"
          :data-source="importResult.errors"
          size="small"
          :pagination="{ pageSize: 5, showSizeChanger: false }"
          row-key="index"
        />
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.field-doc {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 12px;
  line-height: 1.8;
}

.field-doc-item {
  white-space: nowrap;
}
</style>
