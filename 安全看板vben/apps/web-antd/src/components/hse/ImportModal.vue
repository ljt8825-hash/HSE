<template>
  <Modal
    :open="visible"
    :title="`${moduleName}数据导入`"
    width="800px"
    :footer="null"
    @update:open="(v) => emit('update:visible', v)"
    @cancel="handleCancel"
  >
    <div v-if="currentStep === 'upload'" class="import-step-upload">
      <div class="import-tip">
        <p>支持上传 Excel (.xlsx) 或 CSV 文件</p>
        <p v-if="uploadHint">{{ uploadHint }}</p>
        <p v-else>建议先下载模板，按照模板格式填写数据后再上传</p>
      </div>
      <div class="import-actions">
        <Button type="primary" @click="handleDownloadTemplate">
          <template #icon><IconifyIcon icon="lucide:download" /></template>
          下载模板
        </Button>
      </div>
      <Upload
        :file-list="fileList"
        :before-upload="handleUpload"
        :show-upload-list="false"
        accept=".csv,.xlsx,.xls"
        :disabled="loading"
        class="import-upload"
      >
        <div class="upload-placeholder">
          <IconifyIcon icon="lucide:upload-cloud" class="upload-icon" />
          <p class="upload-text">
            <span v-if="loading">文件解析中...</span>
            <span v-else>点击或拖拽文件到此处上传</span>
          </p>
          <p class="upload-hint">支持 .csv, .xlsx, .xls 格式</p>
        </div>
      </Upload>
    </div>

    <div v-else-if="currentStep === 'sheets'" class="import-step-sheets">
      <div class="preview-summary">
        <div class="summary-header">
          <span class="summary-title">选择要导入的工作表</span>
          <span class="summary-count">共 {{ sheetList.length }} 个工作表</span>
        </div>
        <div class="summary-tags">
          <Tag color="blue">已选 {{ selectedSheets.length }} 个</Tag>
        </div>
      </div>

      <div class="sheet-list">
        <label
          v-for="s in sheetList"
          :key="s.name"
          class="sheet-item"
          :class="{ disabled: !s.is_data_sheet }"
        >
          <input
            type="checkbox"
            :value="s.name"
            v-model="selectedSheets"
            :disabled="!s.is_data_sheet"
          />
          <div class="sheet-info">
            <span class="sheet-name">{{ s.name }}</span>
            <span class="sheet-meta">{{ s.row_count }} 行 · 匹配 {{ s.matched_cols }} 列</span>
          </div>
          <Tag v-if="!s.is_data_sheet" color="default">非数据表</Tag>
          <Tag v-else color="success">数据表</Tag>
        </label>
      </div>

      <div class="preview-actions">
        <Button @click="currentStep = 'upload'">返回上传</Button>
        <Button type="primary" :loading="sheetLoading" @click="handleConfirmSheets">
          下一步
        </Button>
      </div>
    </div>

    <div v-else-if="currentStep === 'preview'" class="import-step-preview">
      <div class="preview-summary">
        <div class="summary-header">
          <span class="summary-title">数据校验结果</span>
          <span class="summary-count">共 {{ previewData?.totalRows || 0 }} 条数据</span>
        </div>
        <div class="summary-tags">
          <Tag color="success">
            <IconifyIcon icon="lucide:check-circle-2" class="tag-icon" />
            {{ previewData?.validRows || 0 }} 条有效
          </Tag>
          <Tag color="error">
            <IconifyIcon icon="lucide:x-circle" class="tag-icon" />
            {{ previewData?.invalidRows || 0 }} 条无效
          </Tag>
        </div>
        <Progress
          :percent="validPercent"
          :status="previewData?.invalidRows === 0 ? 'success' : 'exception'"
          class="preview-progress"
        />
      </div>

      <div v-if="previewData?.preview?.length" class="preview-table">
        <h4 class="preview-title">预览数据</h4>
        <Table
          :columns="previewColumns"
          :data-source="previewRows"
          :pagination="{ pageSize: 5, size: 'small' }"
          :scroll="{ y: 220 }"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'errors'">
              <Tag v-if="record.errorList?.length" color="error">
                <IconifyIcon icon="lucide:x-circle" class="tag-icon" />
                失败
              </Tag>
              <Tag v-else color="success">
                <IconifyIcon icon="lucide:check-circle-2" class="tag-icon" />
                成功
              </Tag>
            </template>
          </template>
        </Table>
      </div>

      <div v-if="errorRecords.length" class="error-actions">
        <Button @click="handleDownloadErrors">
          <template #icon><IconifyIcon icon="lucide:alert-circle" /></template>
          下载错误记录
        </Button>
      </div>

      <div class="preview-actions">
        <Button @click="currentStep = 'upload'">返回上传</Button>
        <Button
          v-if="previewData?.invalidRows === 0"
          type="primary"
          :loading="confirmLoading"
          @click="handleConfirm"
        >
          确认导入
        </Button>
        <Button
          v-else
          type="primary"
          danger
          :loading="confirmLoading"
          @click="handleConfirm"
        >
          导入有效数据（跳过错误）
        </Button>
      </div>
    </div>

    <div v-else-if="currentStep === 'result'" class="import-step-result">
      <div class="result-content">
        <div class="result-icon">
          <IconifyIcon icon="lucide:check-circle-2" class="result-success-icon" />
        </div>
        <h3 class="result-title">导入完成</h3>
        <div class="result-stats">
          <div class="stat-item">
            <div class="stat-value inserted">{{ importResult?.inserted || 0 }}</div>
            <div class="stat-label">新增记录</div>
          </div>
          <div class="stat-item">
            <div class="stat-value updated">{{ importResult?.updated || 0 }}</div>
            <div class="stat-label">更新记录</div>
          </div>
          <div class="stat-item">
            <div class="stat-value skipped">{{ importResult?.skipped || 0 }}</div>
            <div class="stat-label">跳过记录</div>
          </div>
        </div>
      </div>
      <div class="result-actions">
        <Button type="primary" @click="handleCancel">关闭</Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Modal, Button, Upload, Table, message, Progress, Tag } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { downloadTemplate, uploadFileFormData, confirmImport, parseImport } from '#/api/hse/insurance';
import { $t } from '#/locales';

const props = defineProps<{
  visible: boolean;
  module: string;
  moduleName: string;
  /** 上传提示文案（可选；不传则使用通用提示） */
  uploadHint?: string;
  /** 导入时默认写入的保险类型（如「雇主责任险」「工伤保险」） */
  insuranceType?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'refresh'): void;
}>();

const loading = ref(false);
const currentStep = ref<'upload' | 'sheets' | 'preview' | 'result'>('upload');
const fileList = ref<any[]>([]);
const previewData = ref<any>(null);
const importResult = ref<any>(null);
const confirmLoading = ref(false);
const errorRecords = ref<any[]>([]);

// 多 sheet 选择状态
const sheetList = ref<any[]>([]);
const selectedSheets = ref<string[]>([]);
const sheetLoading = ref(false);

// ========= 预览阶段客户端字段校验（必填项 + 日期格式）=========
// 按模块配置必填字段与日期字段（字段名兼容 camelCase 与 snake_case）
const MODULE_FIELD_RULES: Record<string, { required: string[]; dateFields: string[] }> = {
  regulations: {
    required: ['title', 'name', 'category', 'type'],
    dateFields: ['issueDate', 'effectiveDate', 'issue_date', 'effective_date'],
  },
  'risk-control': {
    required: ['name', 'level', 'measures', 'area'],
    dateFields: ['assessmentDate', 'assessment_date'],
  },
  hazards: { required: ['title', 'name', 'level'], dateFields: ['discoveredAt', 'discovered_at'] },
  accidents: {
    // 事故必填字段：事故名称/等级/发生日期/伤亡人数/损失金额
    required: ['title', 'level', 'occurredAt', 'casualties', 'economicLoss'],
    dateFields: ['occurredAt', 'occurred_at', 'accidentDate', 'accident_date'],
  },
  training: { required: ['name', 'title', 'type'], dateFields: ['startDate', 'endDate', 'start_date', 'end_date'] },
};
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// 客户端校验产生的错误数（与后端错误合并计入 invalidRows）
const clientExtraErrors = ref(0);

// 对 previewData.preview 执行客户端字段校验，将错误追加到每行 errors 数组
function runClientValidation() {
  clientExtraErrors.value = 0;
  if (!previewData.value?.preview?.length) return;
  const rules = MODULE_FIELD_RULES[props.module];
  if (!rules) return; // 未配置规则的模块跳过

  let extraInvalid = 0;
  previewData.value.preview.forEach((row: any, idx: number) => {
    const data = row.data || {};
    const serverErrors: string[] = row.errors || [];
    const clientErrors: string[] = [];

    // 必填项校验
    rules.required.forEach((field) => {
      const value = data[field];
      if (value === undefined || value === null || String(value).trim() === '') {
        clientErrors.push(
          $t('hse.regulations.validate.importRequiredField', { row: idx + 1, field }),
        );
      }
    });
    // 日期格式校验（仅对非空值校验）
    rules.dateFields.forEach((field) => {
      const value = data[field];
      if (value !== undefined && value !== null && String(value).trim() !== '' && !DATE_REGEX.test(String(value))) {
        clientErrors.push(
          $t('hse.regulations.validate.importDateFormat', { row: idx + 1, value: String(value) }),
        );
      }
    });

    // 合并错误：若该行原本无错误但客户端校验发现问题，则计入新增无效行
    if (clientErrors.length > 0) {
      row.errors = [...serverErrors, ...clientErrors];
      if (serverErrors.length === 0) extraInvalid += 1;
    }
  });

  // 重新计算 validRows / invalidRows
  const total = previewData.value.totalRows || previewData.value.preview.length;
  const invalidCount = previewData.value.preview.filter((r: any) => (r.errors?.length || 0) > 0).length;
  previewData.value.invalidRows = invalidCount;
  previewData.value.validRows = total - invalidCount;
  clientExtraErrors.value = extraInvalid;
  // 重新生成错误记录列表（用于下载错误记录）
  errorRecords.value = previewData.value.preview.filter((r: any) => r.errors?.length) || [];
}

const validPercent = computed(() => {
  const total = previewData.value?.totalRows || 1;
  const valid = previewData.value?.validRows || 0;
  return Math.round((valid / total) * 100);
});

const previewColumns = computed(() => {
  if (!previewData.value?.preview?.length) return [];
  const firstRow = previewData.value.preview[0]?.data;
  if (!firstRow) return [];
  const cols = Object.keys(firstRow).map((key) => ({
    title: key,
    dataIndex: key,
    key,
    ellipsis: true,
    width: 120,
  }));
  cols.push({
    title: '校验结果',
    key: 'errors',
    width: 100,
    fixed: 'right',
  } as any);
  return cols;
});

const previewRows = computed(() => {
  if (!previewData.value?.preview?.length) return [];
  return previewData.value.preview.map((r: any, i: number) => ({
    ...r.data,
    key: i,
    errorList: r.errors || [],
  }));
});

async function handleDownloadTemplate() {
  try {
    const blob = await downloadTemplate(props.module);
    if (blob instanceof Blob) {
      if (blob.type.includes('application/json')) {
        const text = await blob.text();
        let errMsg = '模板下载失败';
        try {
          const json = JSON.parse(text);
          errMsg = json.message || json.error || errMsg;
        } catch {
          /* ignore */
        }
        message.warning(errMsg);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${props.module}_template.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success('模板下载成功');
    } else {
      message.warning('模板格式异常，请稍后重试');
    }
  } catch (err: any) {
    let errMsg = '模板下载失败，请稍后重试';
    if (err?.message) {
      errMsg = err.message;
    } else if (err instanceof Blob) {
      try {
        const text = await err.text();
        const json = JSON.parse(text);
        errMsg = json.message || json.error || errMsg;
      } catch {
        errMsg = '模板下载失败';
      }
    }
    console.warn('模板下载失败:', err);
    message.warning(errMsg);
  }
}

// ========= 扩展名自动规范化（解决"xlsx 文件被误命名为 .csv"导致的 500）=========
// 触发条件：扩展名为 .csv，但二进制签名是 xlsx (PK\x03\x04) 或 xls (D0\xCF\x11\xE0)
// 行为：创建同名新 File，扩展名改为 .xlsx/.xls，并去除文件名中的尾部空格。
// 真实 CSV 文本文件不会触发此逻辑（魔数不匹配）。
async function normalizeExcelFile(file: File): Promise<File> {
  const originalName = file.name || '';
  const lower = originalName.toLowerCase();
  const extIdx = lower.lastIndexOf('.');
  const ext = extIdx >= 0 ? lower.slice(extIdx) : '';
  if (ext !== '.csv') return file;

  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    let realExt: string | null = null;
    // xlsx / xlsm / docx / pptx 都是 ZIP 容器，签名 PK\x03\x04
    if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
      realExt = '.xlsx';
    }
    // xls / doc 是 OLE2 容器，签名 D0\xCF\x11\xE0
    else if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
      realExt = '.xls';
    }
    if (!realExt) return file; // 真的是 CSV 文本，不改

    const baseName = originalName
      .replace(/\.csv$/i, '')
      .replace(/[\s.]+$/, '') // 去除尾部空格与点
      .trimEnd();
    const newName = `${baseName}${realExt}`;
    return new File([file], newName, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch (e) {
    console.warn('[ImportModal] 扩展名规范化失败，使用原文件:', e);
    return file;
  }
}

async function handleUpload(file: any) {
  loading.value = true;
  // 修正"xlsx 文件被误命名为 .csv"的情况，再交给后端 multer 严格白名单
  const rawFile: File = (file.originFileObj || file) as File;
  const normalized = await normalizeExcelFile(rawFile);
  // 用 FormData 方式上传原始二进制文件，避免 readAsText 对 xlsx 的损坏
  uploadFileFormData(normalized, props.module)
    .then((response) => {
      previewData.value = response;
      errorRecords.value = response.preview?.filter((r: any) => r.errors?.length) || [];
      const sheets = response.sheets || [];
      if (sheets.length > 1) {
        // 多工作表：进入选择步骤，默认勾选所有"数据表"
        sheetList.value = sheets;
        selectedSheets.value = sheets.filter((s: any) => s.is_data_sheet).map((s: any) => s.name);
        currentStep.value = 'sheets';
      } else {
        // 单工作表：执行客户端字段校验后进入预览
        runClientValidation();
        currentStep.value = 'preview';
      }
    })
    .catch((err: any) => {
      const errMsg = err?.message || err?.response?.data?.message || err?.response?.data?.error || JSON.stringify(err)?.slice(0, 200) || '未知错误';
      console.error('上传解析失败:', err);
      message.error($t('hse.message.importParseFailed', { reason: errMsg }));
    })
    .finally(() => {
      loading.value = false;
    });
  return false; // 阻止 antd Upload 默认行为
}

async function handleConfirmSheets() {
  if (!selectedSheets.value.length) {
    message.warning('请至少选择一个工作表');
    return;
  }
  sheetLoading.value = true;
  try {
    const response = await parseImport({
      fileRecordId: previewData.value?.jobId || '',
      sheets: selectedSheets.value,
    });
    previewData.value = response;
    errorRecords.value = response.preview?.filter((r: any) => r.errors?.length) || [];
    // 多 sheet 解析完成后同样执行客户端字段校验
    runClientValidation();
    currentStep.value = 'preview';
    message.success('已按所选工作表解析');
  } catch (err: any) {
    const errMsg = err?.message || err?.response?.data?.message || '未知错误';
    console.error('解析失败:', err);
    message.error('解析失败: ' + errMsg);
  } finally {
    sheetLoading.value = false;
  }
}

async function handleConfirm() {
  confirmLoading.value = true;
  try {
    const response = await confirmImport({
      fileRecordId: previewData.value?.jobId || '',
      operator: 'admin',
      insuranceType: props.insuranceType,
    });
    importResult.value = response;
    currentStep.value = 'result';
    emit('refresh');
    message.success('导入成功');
  } catch (err) {
    console.error('导入确认失败:', err);
    message.error($t('hse.message.importFailed'));
  } finally {
    confirmLoading.value = false;
  }
}

function handleDownloadErrors() {
  if (!errorRecords.value.length) return;
  const firstData = errorRecords.value[0]?.data || {};
  const headers = Object.keys(firstData).join(',') + ',errors\n';
  const rows = errorRecords.value.map((r: any) => {
    const dataValues = Object.values(r.data || {})
      .map((v: any) => (typeof v === 'string' ? `"${v}"` : v))
      .join(',');
    const errors = r.errors?.join(';') || '';
    return `${dataValues},"${errors}"`;
  }).join('\n');
  const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${props.module}_errors.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleCancel() {
  emit('update:visible', false);
  currentStep.value = 'upload';
  fileList.value = [];
  previewData.value = null;
  importResult.value = null;
  errorRecords.value = [];
}
</script>

<style scoped lang="scss">
.tag-icon {
  margin-right: 4px;
}

.import-tip {
  padding: 12px 16px;
  background: hsl(var(--success) / 0.06);
  border: 1px solid hsl(var(--success) / 0.3);
  border-radius: 6px;
  margin-bottom: 16px;

  p {
    margin: 4px 0;
    font-size: 13px;
    color: hsl(var(--success));
  }
}

.import-actions {
  margin-bottom: 16px;
}

.import-upload {
  .upload-placeholder {
    padding: 40px 20px;
    text-align: center;
    border: 2px dashed hsl(var(--border));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;

    &:hover {
      border-color: hsl(var(--primary));
      background: hsl(var(--primary) / 0.04);
    }
  }

  .upload-icon {
    font-size: 48px;
    color: hsl(var(--muted-foreground));
    margin-bottom: 12px;
  }

  .upload-text {
    font-size: 14px;
    color: hsl(var(--foreground));
    margin-bottom: 4px;
  }

  .upload-hint {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
  }
}

.preview-summary {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: hsl(var(--muted));
  border-radius: 6px;

  .summary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .summary-title {
    font-weight: 600;
    font-size: 14px;
  }

  .summary-count {
    font-size: 13px;
    color: hsl(var(--foreground) / 0.65);
  }

  .summary-tags {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
  }

  .preview-progress {
    margin-top: 8px;
  }
}

.preview-table {
  margin-bottom: 16px;

  .preview-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
  }
}

.error-actions {
  margin-bottom: 16px;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid hsl(var(--border));
}

.import-step-result {
  .result-content {
    text-align: center;
    padding: 32px 0;
  }

  .result-icon {
    margin-bottom: 16px;
  }

  .result-success-icon {
    font-size: 64px;
    color: hsl(var(--success));
  }

  .result-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 24px;
  }

  .result-stats {
    display: flex;
    justify-content: center;
    gap: 32px;
  }

  .stat-item {
    text-align: center;

    .stat-value {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;

      &.inserted {
        color: hsl(var(--success));
      }
      &.updated {
        color: hsl(var(--primary));
      }
      &.skipped {
        color: hsl(var(--warning));
      }
    }

    .stat-label {
      font-size: 13px;
      color: hsl(var(--foreground) / 0.65);
    }
  }

  .result-actions {
    display: flex;
    justify-content: center;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid hsl(var(--border));
  }
}
</style>

<style lang="scss">
/* 非 scoped 块：Ant Upload 内部 .ant-upload 元素需 display:block 才能撑满容器。
   仅限 .import-upload 内部，避免污染全局 antd 样式。 */
.import-upload .ant-upload {
  display: block;
}
</style>
