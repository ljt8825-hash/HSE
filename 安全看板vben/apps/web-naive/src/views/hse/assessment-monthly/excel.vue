<script lang="ts" setup>
/**
 * Excel 导入导出（web-naive · 阶段06B-3）
 * 契约来源：apps/web-antd/src/views/hse/assessment-monthly/excel.vue + assessment-monthly.ts
 * 能力：周期下拉(默认首条) / 左右两卡(导出考核结果 / 导入扣分明细) / 右侧「操作说明」步进卡与模板字段说明表。
 * 导出：exportAssessmentResults(cycleId) 返回 { cycle, total, data, message }，旧版在浏览器本地 JSON.stringify(data) 后下载 .json 文件落地
 *      （<cycle_name>_考核结果.json），并非真实 Excel 导出。迁移必须保留这一真实行为，不得伪称生成 xlsx。
 * 导入：「下载模板」同样本地生成 .json 模板（扣分明细导入模板.json）；上传控件接受 .xlsx/.xls 但实际把文件按文本读取并 JSON.parse
 *      后传给 importDeductions({ cycle_id, items })。迁移不再自造模板或解析逻辑之外的能力，如实展示旧版 JSON 模板字段
 *      （employee_code / deduction_item / deduction_type / score / evidence / remark）。
 * 工具栏：下载模板 / 导入 / 导出 / 刷新（隐藏新增）。导入通过隐藏 file input 触发。
 */
import { computed, onMounted, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NAlert,
  NButton,
  NCard,
  NDivider,
  NGi,
  NGrid,
  NSelect,
  NSteps,
  NStep,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseActionBar, HseDataGrid, HsePageLayout, type HseActionKey } from '#/components/hse';
import {
  exportAssessmentResults,
  getAssessmentCycleList,
  importDeductions,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { dialog, message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyExcel' });

const cycleLoading = ref(false);
const exporting = ref(false);
const importing = ref(false);
const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const selectedCycleId = ref<number | string | undefined>();

const exportResult = ref<{ total: number } | null>(null);
const importResult = ref<{ imported: number; failed: number; total: number; message: string } | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);

const templateColumns = computed<VxeTableGridColumns>(() => [
  { title: '字段名', field: 'name', width: 160, align: 'left' },
  { title: '说明', field: 'desc', minWidth: 220, align: 'left', showOverflow: 'tooltip' },
  { title: '必填', field: 'required', width: 80, align: 'center' },
]);
const templateFields = [
  { name: 'employee_code', desc: '员工工号', required: '是' },
  { name: 'deduction_item', desc: '扣分项名称', required: '是' },
  { name: 'deduction_type', desc: '扣分类型（violation/accident/inspection/training）', required: '是' },
  { name: 'score', desc: '扣分分值', required: '是' },
  { name: 'evidence', desc: '证据材料说明', required: '否' },
  { name: 'remark', desc: '备注', required: '否' },
];

// 模板字段为静态常量；VXE 会为每行写入内部 id 做行键，深拷贝一份避免改动原始常量
const templateData = computed(() => templateFields.map((item) => ({ ...item })));

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res = await getAssessmentCycleList({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    if (cycleList.value.length > 0 && !selectedCycleId.value) {
      selectedCycleId.value = cycleList.value[0]!.id;
    }
  } catch {
    message.error('加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

function handleCycleChange() {
  exportResult.value = null;
  importResult.value = null;
}

function onDownloadTemplate() {
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
  triggerDownload('扣分明细导入模板.json', JSON.stringify(templateData, null, 2));
  message.success('模板下载成功');
}

function onExport() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  exporting.value = true;
  exportAssessmentResults(selectedCycleId.value)
    .then((res) => {
      exportResult.value = { total: res.total || 0 };
      triggerDownload(`${res.cycle?.cycleName || 'assessment'}_考核结果.json`, JSON.stringify(res.data || [], null, 2));
      message.success('导出成功');
    })
    .catch(() => message.error('导出失败'))
    .finally(() => {
      exporting.value = false;
    });
}

function onImportAction() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  fileInput.value?.click();
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importing.value = true;
  try {
    const text = await readFileAsText(file);
    let items: any[];
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
    const res = await importDeductions({ cycle_id: selectedCycleId.value!, items });
    importResult.value = {
      imported: res.imported || 0,
      failed: res.failed || 0,
      total: res.total || 0,
      message: res.message || '',
    };
    message.success('导入完成');
    // 任务A：人工扣分上限提示（纯 advisory）——导入行超类别上限时警示，数据已照常保存
    if (res.capWarnings && res.capWarnings.length > 0) {
      const lines = res.capWarnings.map(
        (w) =>
          `第 ${w.row} 行（${w.employee || '-'}）「${w.category}」类别扣分将达 ${w.wouldTotal} 分，超过类别上限 ${w.cap} 分`,
      );
      dialog.warning({
        title: '类别扣分上限提示',
        content: `${lines.join('\n')}\n人工扣分不受上限强制限制，已照常保存。`,
      });
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    importing.value = false;
    input.value = '';
  }
}

const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  create: { hidden: true },
});

onMounted(() => {
  loadCycleList();
});
</script>

<template>
  <HsePageLayout title="Excel 导入导出">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        :exporting="exporting"
        @refresh="loadCycleList"
        @download-template="onDownloadTemplate"
        @import="onImportAction"
        @export="onExport"
      />
    </template>

    <div class="mb-4">
      <NSelect
        v-model:value="selectedCycleId"
        placeholder="请选择考核周期"
        :loading="cycleLoading"
        :options="cycleList.map((c) => ({ label: c.cycleName, value: c.id }))"
        style="max-width: 320px"
        @update:value="handleCycleChange"
      />
    </div>

    <input ref="fileInput" type="file" accept=".xlsx,.xls" style="display: none" @change="onFileChange" />

    <NGrid :x-gap="16" :y-gap="16" cols="1 l:2" responsive="screen">
      <!-- 导出考核结果 -->
      <NGi>
        <NCard size="small" title="导出考核结果" :bordered="false">
          <template #header-extra>
            <NButton size="tiny" secondary type="success" disabled>导出</NButton>
          </template>
          <div class="mb-4 text-muted-foreground">
            <p class="mb-2">导出当前考核周期的所有考核结果，包含：</p>
            <ul class="list-disc space-y-1 pl-5 text-sm">
              <li>考核对象基本信息</li>
              <li>各项指标得分明细</li>
              <li>扣分明细</li>
              <li>总分与排名</li>
            </ul>
          </div>
          <NAlert
            v-if="exportResult"
            class="mb-4"
            type="success"
            :show-icon="true"
          >
            导出成功，共 {{ exportResult.total }} 条数据（本地 JSON 文件，非 xlsx）
          </NAlert>
          <div class="flex justify-end">
            <NButton type="primary" :loading="exporting" :disabled="!selectedCycleId" @click="onExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出考核结果
            </NButton>
          </div>
        </NCard>
      </NGi>

      <!-- 导入扣分明细 -->
      <NGi>
        <NCard size="small" title="导入扣分明细" :bordered="false">
          <template #header-extra>
            <NButton size="tiny" secondary type="info" disabled>导入</NButton>
          </template>
          <div class="mb-4 text-muted-foreground">
            <p class="mb-2">通过文件批量导入扣分明细，支持：</p>
            <ul class="list-disc space-y-1 pl-5 text-sm">
              <li>批量新增扣分项</li>
              <li>按员工工号匹配</li>
              <li>支持多种扣分类型</li>
            </ul>
          </div>
          <NAlert
            v-if="importResult"
            class="mb-4"
            :type="importResult.failed > 0 ? 'warning' : 'success'"
            :show-icon="true"
          >
            导入完成：成功 {{ importResult.imported }} 条，失败 {{ importResult.failed }} 条
          </NAlert>
          <div class="flex justify-end gap-2">
            <NButton @click="onDownloadTemplate">
              <template #icon><IconifyIcon icon="lucide:file-spreadsheet" /></template>
              下载模板
            </NButton>
            <NButton type="primary" :loading="importing" :disabled="!selectedCycleId" @click="onImportAction">
              <template #icon><IconifyIcon icon="lucide:upload" /></template>
              开始导入
            </NButton>
          </div>
        </NCard>
      </NGi>
    </NGrid>

    <NCard title="操作说明" :bordered="false" class="mt-4">
      <NSteps :current="0" vertical>
        <NStep title="选择考核周期" description="从下拉列表中选择要操作的考核周期" />
        <NStep title="导出数据" description="点击导出按钮，系统将生成当前周期的考核结果 JSON 文件" />
        <NStep title="下载模板" description="如需导入扣分明细，请先下载模板，按格式填写数据" />
        <NStep title="上传文件" description="上传填好的 JSON 文件，点击开始导入" />
        <NStep title="查看结果" description="导入完成后查看导入结果，失败项请根据提示修正后重新导入" />
      </NSteps>

      <NDivider />
      <div class="text-sm text-muted-foreground">
        <div class="mb-2 font-medium text-foreground">模板字段说明：</div>
        <HseDataGrid :columns="templateColumns" :data="templateData" :pager="false" />
      </div>
    </NCard>
  </HsePageLayout>
</template>

<style scoped>
.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}
.text-foreground {
  color: hsl(var(--foreground));
}
</style>
