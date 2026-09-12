<template>
  <div class="import-button-group">
    <!-- 单按钮模式：传入 buttonLabel 时只显示一个主按钮（合并下载模板+导入数据） -->
    <template v-if="buttonLabel">
      <Button type="primary" @click="openImportModal">
        <template #icon><IconifyIcon icon="lucide:upload" /></template>
        {{ buttonLabel }}
      </Button>
    </template>
    <!-- 默认模式：下载模板 + 导入数据 两个按钮 -->
    <template v-else>
      <template v-if="!hideTemplate">
        <Tooltip v-if="downloadTip" :title="downloadTip">
          <Button @click="handleDownloadTemplate">
            <template #icon><IconifyIcon icon="lucide:download" /></template>
            下载模板
          </Button>
        </Tooltip>
        <Button v-else @click="handleDownloadTemplate">
          <template #icon><IconifyIcon icon="lucide:download" /></template>
          下载模板
        </Button>
      </template>
      <Button type="primary" @click="openImportModal">
        <template #icon><IconifyIcon icon="lucide:upload" /></template>
        导入数据
      </Button>
    </template>
    <ImportModal
      v-model:visible="modalVisible"
      :module="module"
      :module-name="moduleName"
      :upload-hint="uploadHint"
      :insurance-type="insuranceType"
      @refresh="handleRefresh"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Button, Tooltip, message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import ImportModal from './ImportModal.vue';
import { downloadTemplate } from '#/api/hse/insurance';

interface Props {
  /** 模块标识，用于模板下载和上传 */
  module: string;
  /** 模块中文名，用于弹窗标题 */
  moduleName: string;
  /** 下载模板按钮的提示文案（可选；不传则无 tooltip） */
  downloadTip?: string;
  /** 上传弹窗中的提示文案（可选；不传则使用通用提示） */
  uploadHint?: string;
  /** 导入时默认写入的保险类型（如「雇主责任险」「工伤保险」），用于拆分导入 */
  insuranceType?: string;
  /** 是否隐藏「下载模板」按钮（拆分导入时第二个按钮只保留导入） */
  hideTemplate?: boolean;
  /** 自定义按钮文本（如「雇主险」「工伤险」）；传入后仅渲染一个主按钮，点击直接打开导入弹窗 */
  buttonLabel?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 导入完成后触发刷新 */
  (e: 'refresh'): void;
}>();

const modalVisible = ref(false);

function openImportModal() {
  modalVisible.value = true;
}

/**
 * 下载导入模板
 * 优先调用后端接口 /api/import/template/:module
 * 接口不可用时回退到前端生成空模板
 */
async function handleDownloadTemplate() {
  try {
    const blob = await downloadTemplate(props.module);
    if (blob instanceof Blob) {
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
      // 后端返回的不是 blob（可能是 JSON 错误），走兜底
      downloadFallbackTemplate();
    }
  } catch (err) {
    console.warn('模板下载失败，使用前端兜底模板:', err);
    downloadFallbackTemplate();
  }
}

/**
 * 前端兜底：生成空模板文件
 */
function downloadFallbackTemplate() {
  const moduleHeaders: Record<string, string[]> = {
    hazards: ['序号', '隐患描述', '整改措施', '检查时间', '检查人员', '整改人员', '整改时间', '是否整改完成'],
    accidents: ['事故标题', '事故等级', '事故类型', '事故状态', '发生地点', '事故经过', '处理结果', '责任人'],
    training: ['培训标题', '培训类型', '培训状态', '培训讲师', '培训时间', '培训地点', '参训人数'],
    personnel: ['姓名', '部门', '岗位', '身份证号', '手机号', '保险状态', '参保日期', '到期日期'],
    objectives: ['目标标题', '年度', '目标状态', '责任部门', '目标值', '完成值', '考核周期'],
    vehicle: ['车牌号', '车辆类型', '保险类型', '保险公司', '保单号', '参保日期', '到期日期', '保费金额'],
    'over-age': ['姓名', '性别', '年龄', '部门', '岗位', '入职日期', '健康状态', '备注'],
    emergency: ['预案名称', '预案类型', '预案等级', '适用场景', '负责人', '联系电话', '最近演练日期'],
    drill: ['预案名称', '演练类型', '演练日期', '演练地点', '参加人数', '演练结果', '评估人'],
    'risk-control': ['风险点名称', '风险等级', '管控措施', '责任部门', '责任人', '排查周期', '状态'],
    regulations: ['制度名称', '制度编号', '发布日期', '生效日期', '适用部门', '状态'],
    committee: ['姓名', '职务', '部门', '安全职责', '任职日期', '联系方式'],
    assessment: ['考核对象', '考核周期', '考核指标', '目标值', '完成值', '考核结果', '备注'],
    budget: ['费用项目', '预算年度', '预算金额', '支出金额', '支出日期', '经办人', '备注'],
    ledger: ['姓名', '身份证号', '部门', '岗位', '网格层级', '培训频次', '培训类型', '培训日期', '培训时长', '培训内容', '考核结果', '分数', '讲师', '备注'],
    'new-employee': ['姓名', '部门', '岗位', '入职日期', '培训日期', '培训结果', '备注'],
    // [DEPRECATED] 以下 driver / driver-assessment / driver-violation / driver-monthly 三套表头为 antd 版已淘汰功能（功能已迁移至 web-naive），请勿维护
    driver: ['姓名', '部门', '驾照类型', '培训日期', '培训项目', '考核结果', '备注'],
    violation: ['违章标题', '违章类型', '违章级别', '违章状态', '违章人员', '所属部门', '发现区域', '发现人', '发现日期', '整改措施', '整改期限', '整改人'],
    'fire-facility': ['设施名称', '设施类型', '型号规格', '安装位置', '设施状态', '数量', '安装日期', '有效期', '上次检查', '下次检查', '负责人', '联系电话'],
    'driver-assessment': ['档案编号', '姓名', '驾驶证件号', '准驾车型', '所属部门', '车辆编号', '评估日期', '评估结果', '评估等级', '有效期至', '联系电话', '备注'],
    'driver-violation': ['姓名', '车牌号', '违章时间', '违章地点', '违章类别', '违章事实描述', '扣分', '罚款金额', '处理状态', '处理方式', '处理结果', '备注'],
    'driver-monthly': ['考核月份', '姓名', '所属部门', '安全驾驶得分', '遵章守纪得分', '培训学习得分', '得分', '考核等级', '主要问题', '评定人', '备注'],
    grid: ['片区/班组', '上传时间', '检查人姓名', '网格等级', '所属岗位', '违章人姓名', '违章人性别', '违章人年龄', '车辆类型/保洁员', '上报状态', '图片内容', '"三违"行为', '三违类型.输出结果', '需要整改', '整改执行人', '整改后的照片', '示意图'],
    'ai-analysis': ['分析主题', '分析类型', '数据来源', '分析日期', '分析结果', '建议措施'],
    bi: ['指标名称', '指标类型', '统计周期', '指标值', '同比', '环比'],
    cockpit: ['看板名称', '看板类型', '数据维度', '刷新周期', '状态'],
    iot: ['设备名称', '设备编号', '设备类型', '安装位置', '在线状态', '最近数据'],
    'supply-chain': ['供应商名称', '供应类型', '评估日期', '评估结果', '风险等级', '备注'],
    reports: ['报表名称', '报表类型', '统计周期', '生成日期', '状态', '备注'],
    workflow: ['流程编码', '流程名称', '流程描述', '流程状态', '排序', '备注'],
    inspection: ['检查项目', '检查类型', '检查日期', '责任部门', '检查结果', '整改期限', '备注'],
    audit: ['操作人', '操作类型', '操作对象', '操作时间', 'IP地址', '操作结果', '备注'],
    default: ['字段1', '字段2', '字段3', '字段4', '字段5'],
  };

  const headers: string[] = moduleHeaders[props.module] || moduleHeaders.default || [];
  const csvContent = '\uFEFF' + headers.join(',') + '\n';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${props.module}_template.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  message.info('模板生成中，已下载空模板');
}

function handleRefresh() {
  emit('refresh');
}
</script>

<style scoped lang="scss">
.import-button-group {
  display: inline-flex;
  gap: 8px;
}
</style>
