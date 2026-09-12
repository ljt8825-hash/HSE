<template>
  <div class="p-4">
    <a-row :gutter="16">
      <a-col :span="16">
        <a-card>
          <template #title>Excel 导入导出</template>

          <a-row :gutter="16" class="mb-6">
            <a-col :span="8">
              <a-select
                v-model:value="selectedCycleId"
                placeholder="请选择考核周期"
                style="width: 100%"
                :loading="cycleLoading"
                @change="handleCycleChange"
              >
                <Select.Option v-for="cycle in cycleList" :key="cycle.id" :value="cycle.id">
                  {{ cycle.cycleName }}
                </Select.Option>
              </a-select>
            </a-col>
          </a-row>

          <a-row :gutter="24">
            <a-col :span="12">
              <a-card size="small" title="导出考核结果">
                <template #extra>
                  <a-tag color="green">导出</a-tag>
                </template>
                <div class="text-gray-600 mb-4">
                  <p class="mb-2">导出当前考核周期的所有考核结果，包含：</p>
                  <ul class="list-disc pl-5 text-sm space-y-1">
                    <li>考核对象基本信息</li>
                    <li>各项指标得分明细</li>
                    <li>扣分明细</li>
                    <li>总分与排名</li>
                  </ul>
                </div>
                <a-alert
                  v-if="exportResult"
                  type="success"
                  show-icon
                  :message="`导出成功，共 ${exportResult.total} 条数据`"
                  class="mb-4"
                />
                <div class="flex justify-end">
                  <a-button
                    type="primary"
                    :loading="exporting"
                    :disabled="!selectedCycleId"
                    @click="handleExport"
                  >
                    <template #icon><download-outlined /></template>
                    导出考核结果
                  </a-button>
                </div>
              </a-card>
            </a-col>

            <a-col :span="12">
              <a-card size="small" title="导入扣分明细">
                <template #extra>
                  <a-tag color="blue">导入</a-tag>
                </template>
                <div class="text-gray-600 mb-4">
                  <p class="mb-2">通过Excel文件批量导入扣分明细，支持：</p>
                  <ul class="list-disc pl-5 text-sm space-y-1">
                    <li>批量新增扣分项</li>
                    <li>按员工工号匹配</li>
                    <li>支持多种扣分类型</li>
                  </ul>
                </div>
                <a-upload-dragger
                  v-model:file-list="fileList"
                  :max-count="1"
                  :before-upload="beforeUpload"
                  :show-upload-list="false"
                  accept=".xlsx,.xls"
                  @change="handleFileChange"
                >
                  <p class="text-4xl text-gray-400">
                    <inbox-outlined />
                  </p>
                  <p class="text-base font-medium">
                    将文件拖到此处，或<span class="text-blue-500">点击上传</span>
                  </p>
                  <p class="text-sm text-gray-400 mt-1">
                    支持 .xlsx, .xls 格式，单次最多导入 1000 条
                  </p>
                </a-upload-dragger>
                <a-alert
                  v-if="importResult"
                  :type="importResult.failed > 0 ? 'warning' : 'success'"
                  show-icon
                  class="mt-4"
                >
                  <template #message>
                    导入完成：成功 {{ importResult.imported }} 条，失败 {{ importResult.failed }} 条
                  </template>
                  <template #description v-if="importResult.message">
                    {{ importResult.message }}
                  </template>
                </a-alert>
                <div class="flex justify-end mt-4">
                  <a-space>
                    <a-button @click="downloadTemplate">
                      <template #icon><file-excel-outlined /></template>
                      下载模板
                    </a-button>
                    <a-button
                      type="primary"
                      :loading="importing"
                      :disabled="!selectedCycleId || fileList.length === 0"
                      @click="handleImport"
                    >
                      <template #icon><upload-outlined /></template>
                      开始导入
                    </a-button>
                  </a-space>
                </div>
              </a-card>
            </a-col>
          </a-row>
        </a-card>
      </a-col>

      <a-col :span="8">
        <a-card title="操作说明">
          <a-steps direction="vertical" :current="-1">
            <a-steps-item title="选择考核周期">
              <template #description>
                从下拉列表中选择要操作的考核周期
              </template>
            </a-steps-item>
            <a-steps-item title="导出数据">
              <template #description>
                点击导出按钮，系统将生成当前周期的考核结果Excel文件
              </template>
            </a-steps-item>
            <a-steps-item title="下载模板">
              <template #description>
                如需导入扣分明细，请先下载模板，按格式填写数据
              </template>
            </a-steps-item>
            <a-steps-item title="上传文件">
              <template #description>
                上传填好的Excel文件，点击开始导入
              </template>
            </a-steps-item>
            <a-steps-item title="查看结果">
              <template #description>
                导入完成后查看导入结果，失败项请根据提示修正后重新导入
              </template>
            </a-steps-item>
          </a-steps>

          <a-divider />

          <div class="text-sm text-gray-600">
            <div class="font-medium mb-2">模板字段说明：</div>
            <a-table
              :columns="templateColumns"
              :data-source="templateFields"
              size="small"
              :pagination="false"
              bordered
            />
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  DownloadOutlined,
  UploadOutlined,
  InboxOutlined,
  FileExcelOutlined,
} from '@ant-design/icons-vue';
import { message, Select } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import {
  getAssessmentCycleList,
  exportAssessmentResults,
  importDeductions,
} from '#/api/hse/assessment-monthly';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;

const cycleLoading = ref(false);
const exporting = ref(false);
const importing = ref(false);
const selectedCycleId = ref<number | string | undefined>();
const cycleList = ref<AssessmentCycle[]>([]);
const fileList = ref<any[]>([]);
const exportResult = ref<{ total: number; data: any[] } | null>(null);
const importResult = ref<{ imported: number; failed: number; total: number; message: string } | null>(null);

const templateColumns = [
  { title: '字段名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '说明', dataIndex: 'desc', key: 'desc' },
  { title: '必填', dataIndex: 'required', key: 'required', width: 60, align: 'center' },
];

const templateFields = [
  { name: 'employee_code', desc: '员工工号', required: '是' },
  { name: 'deduction_item', desc: '扣分项名称', required: '是' },
  { name: 'deduction_type', desc: '扣分类型（violation/accident/inspection/training）', required: '是' },
  { name: 'score', desc: '扣分分值', required: '是' },
  { name: 'evidence', desc: '证据材料说明', required: '否' },
  { name: 'remark', desc: '备注', required: '否' },
];

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res: any = await getAssessmentCycleList({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    if (cycleList.value.length > 0 && !selectedCycleId.value) {
      selectedCycleId.value = cycleList.value[0]!.id;
    }
  } catch (e: any) {
    message.error(e.message || '加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

function handleCycleChange() {
  exportResult.value = null;
  importResult.value = null;
}

async function handleExport() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  exporting.value = true;
  try {
    const res: any = await exportAssessmentResults(selectedCycleId.value);
    exportResult.value = {
      total: res.total || 0,
      data: res.data || [],
    };
    const dataStr = JSON.stringify(res.data || [], null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cycleName = res.cycle?.cycleName || 'assessment';
    link.download = `${cycleName}_考核结果.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('导出成功');
  } catch (e: any) {
    message.error(e.message || '导出失败');
  } finally {
    exporting.value = false;
  }
}

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || file.type === 'application/vnd.ms-excel'
    || file.name.endsWith('.xlsx')
    || file.name.endsWith('.xls');
  if (!isExcel) {
    message.error('只能上传 Excel 文件！');
    return false;
  }
  const isLt10M = file.size / 1024 / 1024 < 10;
  if (!isLt10M) {
    message.error('文件大小不能超过 10MB！');
    return false;
  }
  return false;
};

function handleFileChange(info: any) {
  if (info.fileList.length > 0) {
    fileList.value = [info.fileList[info.fileList.length - 1]];
  } else {
    fileList.value = [];
  }
  importResult.value = null;
}

function downloadTemplate() {
  const templateData = [
    {
      employee_code: 'E001',
      deduction_item: '未按规定佩戴安全帽',
      deduction_type: 'violation',
      score: 2,
      evidence: '现场检查照片',
      remark: '首次违章',
    },
    {
      employee_code: 'E002',
      deduction_item: '安全培训未参加',
      deduction_type: 'training',
      score: 1,
      evidence: '培训签到表',
      remark: '',
    },
  ];
  const dataStr = JSON.stringify(templateData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '扣分明细导入模板.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  message.success('模板下载成功');
}

async function handleImport() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  if (fileList.value.length === 0) {
    message.warning('请先上传文件');
    return;
  }
  importing.value = true;
  try {
    const file = fileList.value[0].originFileObj || fileList.value[0];
    const text = await readFileAsText(file);
    let items: any[] = [];
    try {
      items = JSON.parse(text);
    } catch {
      message.error('文件格式错误，请使用模板文件');
      return;
    }
    if (!Array.isArray(items)) {
      message.error('文件格式错误，数据必须是数组');
      return;
    }
    const res: any = await importDeductions({
      cycle_id: selectedCycleId.value,
      items,
    });
    importResult.value = {
      imported: res.imported || 0,
      failed: res.failed || 0,
      total: res.total || 0,
      message: res.message || '',
    };
    message.success('导入完成');
  } catch (e: any) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

onMounted(() => {
  loadCycleList();
});
</script>
