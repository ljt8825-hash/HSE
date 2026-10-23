<template>
  <HsePageLayout
    :title="$t('page.hse.warningCenter')"
    description="预警与整改闭环中心"
    :auto-content-height="true"
  >
    <template #breadcrumb>
      <NSpace size="small">
        <span class="text-muted-foreground text-xs">HSE · 预警与整改闭环</span>
      </NSpace>
    </template>

    <template #extra>
      <NSpace :size="8">
        <NButton
          v-if="activeTab === 'warnings'"
          type="primary"
          :loading="scanLoading"
          @click="handleScanWarnings"
        >
          扫描预警
        </NButton>
        <NButton v-else-if="activeTab === 'rules'" type="primary" @click="openCreateRuleModal">
          新建规则
        </NButton>
      </NSpace>
    </template>

    <NTabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
      <!-- ============ 标签页1: 风险预警中心 ============ -->
      <NTabPane name="warnings" tab="风险预警中心">
        <div class="tab-content">
          <!-- 顶部统计卡片 -->
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HseStatCard
              v-for="stat in warningStatItems"
              :key="stat.key"
              :title="stat.label"
              :value="stat.value"
              :icon="stat.icon"
              :color="getStatColor(stat.className)"
            />
          </div>

          <!-- 操作栏 -->
          <NCard :bordered="false" class="filter-card">
            <template #header>筛选条件</template>
            <NSpace wrap>
              <NSelect
                v-model:value="warningFilters.source_type"
                placeholder="预警来源"
                clearable
                style="width: 160px"
                :options="sourceTypeOptions"
                @update:value="handleWarningSearch"
              />
              <NSelect
                v-model:value="warningFilters.warning_level"
                placeholder="预警等级"
                clearable
                style="width: 140px"
                :options="warningLevelOptions"
                @update:value="handleWarningSearch"
              />
              <NSelect
                v-model:value="warningFilters.status"
                placeholder="状态"
                clearable
                style="width: 140px"
                :options="warningStatusOptions"
                @update:value="handleWarningSearch"
              />
            </NSpace>
          </NCard>

          <!-- 预警表格 -->
          <NCard :bordered="false" class="table-card">
            <template #header>预警列表</template>
            <HseDataGrid
              :columns="warningColumns"
              :data="warningList"
              :loading="warningLoading"
              row-key="id"
              :pager="{ pageSizes: [10, 20, 50] }"
              :total="warningPagination.itemCount"
              :current-page="warningPagination.page"
              :page-size="warningPagination.pageSize"
              @page-change="onWarningPageChange"
            >
              <template #sourceTypeCell="{ row }">
                <NTag type="info" :bordered="false">{{ row.sourceTypeLabel }}</NTag>
              </template>
              <template #warningLevelCell="{ row }">
                <NTag :type="getColorTagType(row.warningLevelColor)" :bordered="false">
                  {{ row.warningLevelLabel }}
                </NTag>
              </template>
              <template #statusCell="{ row }">
                <NTag :bordered="false">{{ row.statusLabel }}</NTag>
              </template>
              <template #warningActionCell="{ row }">
                <NSpace justify="center" :wrap="false" size="small">
                  <NButton size="small" text type="primary" @click="goWarningDetail(row)">
                    查看详情
                  </NButton>
                  <NButton
                    v-if="canJumpToSource(row)"
                    size="small"
                    text
                    type="primary"
                    @click="goToSourceSystem(row)"
                  >
                    {{ getJumpButtonText(row) }}
                  </NButton>
                  <NButton
                    v-if="row.rectificationTaskId"
                    size="small"
                    text
                    type="primary"
                    @click="goTaskFromWarning(row)"
                  >
                    查看任务
                  </NButton>
                </NSpace>
              </template>
            </HseDataGrid>
          </NCard>
        </div>
      </NTabPane>

      <!-- ============ 标签页2: 整改任务中心 ============ -->
      <NTabPane name="tasks" tab="整改任务中心">
        <div class="tab-content">
          <!-- 操作栏 -->
          <NCard :bordered="false" class="filter-card">
            <template #header>筛选条件</template>
            <NSpace wrap>
              <NSelect
                v-model:value="taskFilters.status"
                placeholder="任务状态"
                clearable
                style="width: 160px"
                :options="taskStatusOptions"
                @update:value="handleTaskSearch"
              />
              <NSelect
                v-model:value="taskFilters.priority"
                placeholder="优先级"
                clearable
                style="width: 140px"
                :options="priorityOptions"
                @update:value="handleTaskSearch"
              />
              <NButton @click="fetchTaskList">刷新</NButton>
            </NSpace>
          </NCard>

          <!-- 任务表格 -->
          <NCard :bordered="false" class="table-card">
            <template #header>整改任务列表</template>
            <HseDataGrid
              :columns="taskColumns"
              :data="taskList"
              :loading="taskLoading"
              row-key="id"
              :pager="{ pageSizes: [10, 20, 50] }"
              :total="taskPagination.itemCount"
              :current-page="taskPagination.page"
              :page-size="taskPagination.pageSize"
              @page-change="onTaskPageChange"
            >
              <template #taskWarningLevelCell="{ row }">
                <NTag :type="getWarningLevelTagType(row.warningLevel)" :bordered="false">
                  {{ row.warningLevelLabel }}
                </NTag>
              </template>
              <template #deadlineCell="{ row }">
                <span :class="getDeadlineClass(row.overdueStatus)">
                  {{ row.deadlineDate }}
                  <span v-if="row.overdueStatus === 'overdue'" class="overdue-tag">逾期</span>
                  <span v-else-if="row.overdueStatus === 'expiring'" class="expiring-tag">
                    即将到期
                  </span>
                </span>
              </template>
              <template #taskStatusCell="{ row }">
                <NTag :type="getColorTagType(row.statusColor)" :bordered="false">
                  {{ row.statusLabel }}
                </NTag>
              </template>
              <template #priorityCell="{ row }">
                <NTag :type="getColorTagType(getPriorityColor(row.priority))" :bordered="false">
                  {{ row.priorityLabel }}
                </NTag>
              </template>
              <template #progressCell="{ row }">
                <NProgress type="line" :percentage="row.progress ?? 0" />
              </template>
              <template #taskActionCell="{ row }">
                <NSpace justify="center" :wrap="false" size="small">
                  <NButton
                    v-if="row.status === 'pending'"
                    size="small"
                    text
                    type="primary"
                    @click="handleDispatch(row)"
                  >
                    下发
                  </NButton>
                  <NButton
                    v-if="row.status === 'dispatched'"
                    size="small"
                    text
                    type="primary"
                    @click="handleProcess(row)"
                  >
                    处理
                  </NButton>
                  <NButton
                    v-if="row.status === 'processing'"
                    size="small"
                    text
                    type="primary"
                    @click="openSubmitProofModal(row)"
                  >
                    提交证明
                  </NButton>
                  <NButton
                    v-if="row.status === 'pending_review'"
                    size="small"
                    text
                    type="primary"
                    @click="openReviewModal(row)"
                  >
                    复核
                  </NButton>
                  <NButton
                    v-if="row.status === 'rejected'"
                    size="small"
                    text
                    type="primary"
                    @click="handleProcess(row)"
                  >
                    处理
                  </NButton>
                </NSpace>
              </template>
            </HseDataGrid>
          </NCard>
        </div>

        <!-- 提交证明 Modal -->
        <NModal
          v-model:show="submitProofModalVisible"
          title="提交整改证明"
          preset="card"
          :mask-closable="false"
          style="width: 520px; max-width: 92vw"
        >
          <NForm label-placement="top">
            <NFormItem label="处理说明" required>
              <NInput
                v-model:value="submitProofForm.process_note"
                type="textarea"
                :rows="4"
                placeholder="请输入处理说明..."
              />
            </NFormItem>
            <NFormItem label="整改进度">
              <NInputNumber
                v-model:value="submitProofForm.progress"
                :min="0"
                :max="100"
                style="width: 100%"
                placeholder="进度百分比"
              />
            </NFormItem>
            <NFormItem label="附件上传">
              <div class="upload-placeholder">
                <NUpload multiple :show-file-list="false" :before-upload="() => false">
                  <NUploadDragger>
                    <div class="upload-text">点击或拖拽文件到此处上传</div>
                    <div class="upload-hint">支持图片、文档等附件</div>
                  </NUploadDragger>
                </NUpload>
              </div>
            </NFormItem>
          </NForm>
          <template #footer>
            <NSpace justify="end">
              <NButton @click="submitProofModalVisible = false">取消</NButton>
              <NButton type="primary" :loading="submitProofLoading" @click="handleSubmitProofConfirm">
                确定
              </NButton>
            </NSpace>
          </template>
        </NModal>

        <!-- 复核 Modal -->
        <NModal
          v-model:show="reviewModalVisible"
          title="任务复核"
          preset="card"
          :mask-closable="false"
          style="width: 520px; max-width: 92vw"
        >
          <NForm label-placement="top">
            <NFormItem label="复核结果" required>
              <NRadioGroup v-model:value="reviewForm.review_result">
                <NRadio value="approved">通过</NRadio>
                <NRadio value="rejected">驳回</NRadio>
              </NRadioGroup>
            </NFormItem>
            <NFormItem label="复核意见">
              <NInput
                v-model:value="reviewForm.review_note"
                type="textarea"
                :rows="4"
                placeholder="请输入复核意见..."
              />
            </NFormItem>
          </NForm>
          <template #footer>
            <NSpace justify="end">
              <NButton @click="reviewModalVisible = false">取消</NButton>
              <NButton type="primary" :loading="reviewLoading" @click="handleReviewConfirm">
                确定
              </NButton>
            </NSpace>
          </template>
        </NModal>
      </NTabPane>

      <!-- ============ 标签页3: 整改闭环分析 ============ -->
      <NTabPane name="analysis" tab="整改闭环分析">
        <div class="tab-content">
          <!-- 年度选择器 -->
          <NCard :bordered="false" class="filter-card">
            <template #header>分析条件</template>
            <NSpace>
              <span class="year-label">统计年度：</span>
              <NSelect
                v-model:value="analysisYear"
                style="width: 120px"
                :options="yearOptions.map((y) => ({ label: `${y} 年`, value: y }))"
                @update:value="fetchAnalysisData"
              />
            </NSpace>
          </NCard>

          <!-- KPI 卡片 -->
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HseStatCard
              title="整改率"
              :value="analysisData?.overall.rectificationRate ?? 0"
              suffix="%"
              icon="lucide:check-circle"
              :color="getStatColor('stat-green')"
            />
            <HseStatCard
              title="逾期率"
              :value="analysisData?.overall.overdueRate ?? 0"
              suffix="%"
              icon="lucide:alert-triangle"
              :color="getStatColor('stat-red')"
            />
            <HseStatCard
              title="重复风险率"
              :value="analysisData?.repeatRiskRate ?? 0"
              suffix="%"
              icon="lucide:repeat"
              :color="getStatColor('stat-gold')"
            />
          </div>

          <!-- 图表区域 -->
          <div class="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <NCard title="月度趋势（任务数 / 整改率）" :bordered="false" class="lg:col-span-7">
              <EchartsUI
                v-if="analysisData?.monthlyTrend?.length"
                ref="trendChartRef"
                style="width: 100%; height: 340px"
              />
              <NEmpty v-else description="暂无数据" />
            </NCard>
            <NCard title="按来源分布（任务数 / 已完成数）" :bordered="false" class="lg:col-span-5">
              <EchartsUI
                v-if="analysisData?.bySource?.length"
                ref="sourceChartRef"
                style="width: 100%; height: 340px"
              />
              <NEmpty v-else description="暂无数据" />
            </NCard>
          </div>

          <!-- 按等级统计表格 -->
          <NCard title="按预警等级统计" :bordered="false" class="table-card">
            <HseDataGrid
              :columns="levelStatColumns"
              :data="analysisData?.byLevel || []"
              row-key="level"
              :pager="false"
            >
              <template #levelStatCell="{ row }">
                <NTag :type="getWarningLevelTagType(row.level)" :bordered="false">
                  {{ row.levelLabel }}
                </NTag>
              </template>
              <template #rateCell="{ row }">
                <NProgress type="line" :percentage="row.rate ?? 0" />
              </template>
            </HseDataGrid>
          </NCard>
        </div>
      </NTabPane>

      <!-- ============ 标签页4: 预警规则管理 ============ -->
      <NTabPane name="rules" tab="预警规则管理">
        <div class="tab-content">
          <!-- 操作栏 -->
          <NCard :bordered="false" class="filter-card">
            <template #header>筛选条件</template>
            <NSpace wrap>
              <NSelect
                v-model:value="ruleFilters.source_type"
                placeholder="预警来源"
                clearable
                style="width: 160px"
                :options="sourceTypeOptions"
                @update:value="handleRuleSearch"
              />
            </NSpace>
          </NCard>

          <!-- 规则表格 -->
          <NCard :bordered="false" class="table-card">
            <template #header>预警规则列表</template>
            <HseDataGrid
              :columns="ruleColumns"
              :data="ruleList"
              :loading="ruleLoading"
              row-key="id"
              :pager="{ pageSizes: [10, 20, 50] }"
              :total="rulePagination.itemCount"
              :current-page="rulePagination.page"
              :page-size="rulePagination.pageSize"
              @page-change="onRulePageChange"
            >
              <template #ruleSourceTypeCell="{ row }">
                <NTag type="info" :bordered="false">{{ row.sourceTypeLabel }}</NTag>
              </template>
              <template #ruleWarningLevelCell="{ row }">
                <NTag :type="getWarningLevelTagType(row.warningLevel)" :bordered="false">
                  {{ row.warningLevelLabel }}
                </NTag>
              </template>
              <template #targetTypeCell="{ row }">
                {{ row.targetType === 'employee' ? '员工' : '组织' }}
              </template>
              <template #ruleVersionCell="{ row }">
                <NTag type="info" :bordered="false">{{ row.version }}</NTag>
              </template>
              <template #ruleStatusCell="{ row }">
                <NSwitch :value="row.status === 'active'" @update:value="handleToggleRule(row)">
                  <template #checked>启用</template>
                  <template #unchecked>停用</template>
                </NSwitch>
              </template>
              <template #ruleActionCell="{ row }">
                <NSpace justify="center" :wrap="false" size="small">
                  <NButton size="small" text type="primary" @click="openEditRuleModal(row)">
                    编辑
                  </NButton>
                  <NButton size="small" text type="primary" @click="openVersionDrawer(row)">
                    版本历史
                  </NButton>
                </NSpace>
              </template>
            </HseDataGrid>
          </NCard>
        </div>

        <!-- 规则编辑 Modal -->
        <NModal
          v-model:show="ruleModalVisible"
          :title="ruleModalMode === 'create' ? '新建预警规则' : '编辑预警规则'"
          preset="card"
          :mask-closable="false"
          style="width: 640px; max-width: 92vw"
        >
          <NForm label-placement="top">
            <NFormItem label="规则名称" required>
              <NInput v-model:value="ruleForm.rule_name" placeholder="请输入规则名称" />
            </NFormItem>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NFormItem label="预警来源" required>
                <NSelect
                  v-model:value="ruleForm.source_type"
                  placeholder="请选择"
                  :options="sourceTypeOptions"
                />
              </NFormItem>
              <NFormItem label="预警等级" required>
                <NSelect
                  v-model:value="ruleForm.warning_level"
                  placeholder="请选择"
                  :options="warningLevelOptions"
                />
              </NFormItem>
              <NFormItem label="对象类型">
                <NSelect
                  v-model:value="ruleForm.target_type"
                  placeholder="请选择"
                  :options="targetTypeOptions"
                />
              </NFormItem>
            </div>
            <NFormItem label="触发条件（JSON 格式）">
              <NInput
                v-model:value="conditionConfigText"
                type="textarea"
                :rows="4"
                placeholder='例如：{"threshold": 80, "operator": "gte"}'
              />
            </NFormItem>
            <NFormItem label="处置动作（JSON 格式）">
              <NInput
                v-model:value="actionConfigText"
                type="textarea"
                :rows="4"
                placeholder='例如：{"action": "create_task", "priority": "high"}'
              />
            </NFormItem>
            <NFormItem label="规则描述">
              <NInput
                v-model:value="ruleForm.description"
                type="textarea"
                :rows="2"
                placeholder="请输入规则描述"
              />
            </NFormItem>
            <NFormItem v-if="ruleModalMode === 'edit'" label="变更说明" required>
              <NInput v-model:value="ruleForm.change_log" placeholder="请说明本次变更内容" />
            </NFormItem>
          </NForm>
          <template #footer>
            <NSpace justify="end">
              <NButton @click="ruleModalVisible = false">取消</NButton>
              <NButton type="primary" :loading="ruleSubmitting" @click="handleRuleSubmit">
                确定
              </NButton>
            </NSpace>
          </template>
        </NModal>

        <!-- 版本历史 Drawer -->
        <NDrawer v-model:show="versionDrawerVisible" :width="520" placement="right">
          <NDrawerContent title="版本历史" :closable="true">
            <NTimeline>
              <NTimelineItem
                v-for="ver in versionList"
                :key="ver.id"
                :color="ver.status === 'active' ? '#52c41a' : '#d9d9d9'"
              >
                <div class="version-item">
                  <div class="version-header">
                    <NTag type="info" :bordered="false">{{ ver.version }}</NTag>
                    <NTag :type="ver.status === 'active' ? 'success' : 'default'" :bordered="false">
                      {{ ver.status === 'active' ? '当前版本' : '历史版本' }}
                    </NTag>
                  </div>
                  <div v-if="ver.changeLog" class="version-log">{{ ver.changeLog }}</div>
                  <div class="version-time">{{ ver.createdAt }}</div>
                </div>
              </NTimelineItem>
            </NTimeline>
            <NEmpty v-if="versionList.length === 0" description="暂无版本记录" />
          </NDrawerContent>
        </NDrawer>
      </NTabPane>
    </NTabs>
  </HsePageLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NTimeline,
  NTimelineItem,
  NEmpty,
  NUpload,
  NUploadDragger,
  NProgress,
  NTabPane,
  NTabs,
} from 'naive-ui';
import type { VxeTableGridColumns } from '@vben/plugins/vxe-table';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { HseDataGrid, HsePageLayout, HseStatCard } from '#/components/hse';
import { $t } from '#/locales';
// 离散 dialog/message：app.vue 未挂载 NDialogProvider/NMessageProvider，
// 故禁止直引 naive-ui 的消息/弹层 composable，统一使用 #/adapter/naive 的离散实例。
import { dialog, message } from '#/adapter/naive';

import {
  getWarnings,
  getWarningStats,
  scanWarnings,
  getTasks,
  getTaskDetail,
  dispatchTask,
  processTask,
  submitProof,
  reviewTask,
  getAnalysis,
  getRules,
  getRuleDetail,
  createRule,
  updateRule,
  toggleRule,
  getRuleVersions,
} from '#/api/hse/warning-center';
import type { WarningCenterApi } from '#/api/hse/warning-center';

defineOptions({ name: 'HseWarningCenter' });

const router = useRouter();

// Canvas 无法解析 CSS 变量，颜色必须用 hex 字符串
const tokens = {
  colorTextBase: '#1f1f1f',
  colorPrimary: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBgElevated: '#ffffff',
  colorBorder: '#f0f0f0',
  colorBgContainer: '#ffffff',
};

// ==================== 当前激活的标签页 ====================
const activeTab = ref<string>('warnings');

// ==================== 下拉选项 ====================
const sourceTypeOptions = [
  { label: '员工风险', value: 'employee_risk' },
  { label: '司机风险', value: 'driver_risk' },
  { label: '事故', value: 'accident' },
  { label: '考核', value: 'assessment' },
  { label: '管理', value: 'management' },
];
const warningLevelOptions = [
  { label: '重大', value: 'critical' },
  { label: '较大', value: 'major' },
  { label: '一般', value: 'minor' },
  { label: '提示', value: 'info' },
];
const warningStatusOptions = [
  { label: '待处理', value: 'pending' },
  { label: '处理中', value: 'processing' },
  { label: '已解决', value: 'resolved' },
  { label: '已关闭', value: 'closed' },
  { label: '已忽略', value: 'ignored' },
];
const taskStatusOptions = [
  { label: '待下发', value: 'pending' },
  { label: '已下发', value: 'dispatched' },
  { label: '处理中', value: 'processing' },
  { label: '待复核', value: 'pending_review' },
  { label: '已关闭', value: 'closed' },
  { label: '已驳回', value: 'rejected' },
];
const priorityOptions = [
  { label: '低', value: 'low' },
  { label: '中', value: 'normal' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' },
];
const targetTypeOptions = [
  { label: '员工', value: 'employee' },
  { label: '组织', value: 'organization' },
];

type TagType = 'default' | 'info' | 'success' | 'warning' | 'error' | 'primary';

function getColorTagType(color: string | null | undefined): TagType {
  const map: Record<string, TagType> = {
    red: 'error',
    orange: 'warning',
    gold: 'warning',
    blue: 'info',
    cyan: 'info',
    green: 'success',
    gray: 'default',
    default: 'default',
  };
  return (color && map[color]) || 'default';
}

function getWarningLevelTagType(level: WarningCenterApi.WarningLevel | string | null): TagType {
  return getColorTagType(getWarningLevelColor(level));
}

// ==================== 标签页1: 风险预警中心 ====================
const warningList = ref<WarningCenterApi.WarningRecord[]>([]);
const warningLoading = ref(false);
const warningStats = ref<WarningCenterApi.WarningStats | null>(null);
const scanLoading = ref(false);

const warningFilters = reactive({
  source_type: undefined as string | undefined,
  warning_level: undefined as string | undefined,
  status: undefined as string | undefined,
});

const warningPagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (page: number) => handleWarningPageChange(page, warningPagination.pageSize),
  onUpdatePageSize: (pageSize: number) => {
    warningPagination.page = 1;
    warningPagination.pageSize = pageSize;
    fetchWarningList();
  },
});

const warningColumns = ref<VxeTableGridColumns>([
  { title: '预警编号', field: 'warningCode', width: 140 },
  {
    title: '预警来源',
    field: 'sourceTypeLabel',
    width: 110,
    slots: { default: 'sourceTypeCell' },
  },
  {
    title: '预警等级',
    field: 'warningLevelLabel',
    width: 100,
    slots: { default: 'warningLevelCell' },
  },
  { title: '预警对象', field: 'targetName', width: 120 },
  { title: '责任单位', field: 'orgName', width: 140 },
  {
    title: '风险原因',
    field: 'riskReason',
    width: 200,
    showOverflow: false,
  },
  {
    title: '状态',
    field: 'statusLabel',
    width: 100,
    slots: { default: 'statusCell' },
  },
  { title: '创建时间', field: 'createdAt', width: 170 },
  {
    title: '操作',
    field: 'action',
    width: 160,
    fixed: 'right',
    slots: { default: 'warningActionCell' },
  },
]);

// 统计卡片项
const warningStatItems = computed(() => {
  const overall = warningStats.value?.overall;
  return [
    { key: 'pending', label: '待处理', value: overall?.pendingCount ?? 0, className: 'stat-blue', icon: 'lucide:clock' },
    { key: 'processing', label: '处理中', value: overall?.processingCount ?? 0, className: 'stat-gold', icon: 'lucide:sync' },
    { key: 'closed', label: '已关闭', value: overall?.closedCount ?? 0, className: 'stat-green', icon: 'lucide:check-circle' },
    { key: 'critical', label: '重大预警', value: overall?.criticalCount ?? 0, className: 'stat-red', icon: 'lucide:flame' },
  ];
});

async function fetchWarningList() {
  warningLoading.value = true;
  try {
    const res = await getWarnings({
      source_type: warningFilters.source_type,
      warning_level: warningFilters.warning_level,
      status: warningFilters.status,
      page: warningPagination.page,
      pageSize: warningPagination.pageSize,
    });
    warningList.value = res.list || [];
    warningPagination.itemCount = res.total || 0;
  } catch (err) {
    console.error('获取预警列表失败:', err);
    message.error('获取预警列表失败');
  } finally {
    warningLoading.value = false;
  }
}

async function fetchWarningStats() {
  try {
    warningStats.value = await getWarningStats();
  } catch (err) {
    console.error('获取预警统计失败:', err);
  }
}

function handleWarningSearch() {
  warningPagination.page = 1;
  fetchWarningList();
}

function handleWarningPageChange(page: number, pageSize: number) {
  warningPagination.page = page;
  warningPagination.pageSize = pageSize;
  fetchWarningList();
}

function onWarningPageChange(payload: { currentPage: number; pageSize: number }) {
  warningPagination.page = payload.currentPage;
  warningPagination.pageSize = payload.pageSize;
  fetchWarningList();
}

async function handleScanWarnings() {
  scanLoading.value = true;
  try {
    const res = await scanWarnings();
    const result = res?.data ?? res;
    message.success(`扫描完成，共生成 ${result.totalGenerated ?? 0} 条预警`);
    fetchWarningList();
    fetchWarningStats();
  } catch (err) {
    console.error('扫描预警失败:', err);
    message.error('扫描预警失败');
  } finally {
    scanLoading.value = false;
  }
}

function goWarningDetail(record: WarningCenterApi.WarningRecord) {
  router.push(`/hse/warning-center/warnings/${record.id}`);
}

function goTaskFromWarning(record: WarningCenterApi.WarningRecord) {
  activeTab.value = 'tasks';
  void nextTick(() => {
    void loadTaskDetail(record.rectificationTaskId as number);
  });
}

function canJumpToSource(record: WarningCenterApi.WarningRecord): boolean {
  if (!record.sourceType) return false;
  return ['employee_risk', 'driver_risk', 'accident', 'assessment'].includes(record.sourceType);
}

function getJumpButtonText(record: WarningCenterApi.WarningRecord): string {
  const map: Record<string, string> = {
    employee_risk: '员工画像',
    driver_risk: '驾驶中心',
    accident: '事故分析',
    assessment: '考核分析',
  };
  return map[record.sourceType] || '查看来源';
}

function goToSourceSystem(record: WarningCenterApi.WarningRecord) {
  switch (record.sourceType) {
    case 'employee_risk':
      if (record.targetType === 'employee' && record.targetId) {
        router.push(`/hse-advanced/risk-profile/${record.targetId}`);
      } else {
        router.push('/hse/employee-profile/list');
      }
      break;
    case 'driver_risk':
      router.push('/hse-advanced/driver-risk-center');
      break;
    case 'accident':
      router.push('/hse-advanced/accident-analysis');
      break;
    case 'assessment':
      router.push('/hse-advanced/assessment-analysis');
      break;
    default:
      message.info('该预警类型暂不支持跳转');
  }
}

// ==================== 标签页2: 整改任务中心 ====================
const taskList = ref<WarningCenterApi.WarningTask[]>([]);
const taskLoading = ref(false);

const taskFilters = reactive({
  status: undefined as string | undefined,
  priority: undefined as string | undefined,
});

const taskPagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (page: number) => handleTaskPageChange(page, taskPagination.pageSize),
  onUpdatePageSize: (pageSize: number) => {
    taskPagination.page = 1;
    taskPagination.pageSize = pageSize;
    fetchTaskList();
  },
});

const taskColumns = ref<VxeTableGridColumns>([
  { title: '任务编号', field: 'taskCode', width: 140 },
  { title: '任务标题', field: 'taskTitle', width: 180 },
  {
    title: '预警等级',
    field: 'warningLevelLabel',
    width: 100,
    slots: { default: 'taskWarningLevelCell' },
  },
  { title: '责任人', field: 'responsibleName', width: 110 },
  { title: '责任单位', field: 'orgName', width: 140 },
  {
    title: '整改期限',
    field: 'deadlineDate',
    width: 140,
    slots: { default: 'deadlineCell' },
  },
  {
    title: '状态',
    field: 'statusLabel',
    width: 110,
    slots: { default: 'taskStatusCell' },
  },
  {
    title: '优先级',
    field: 'priorityLabel',
    width: 90,
    slots: { default: 'priorityCell' },
  },
  {
    title: '进度',
    field: 'progress',
    width: 160,
    slots: { default: 'progressCell' },
  },
  {
    title: '操作',
    field: 'action',
    width: 130,
    fixed: 'right',
    slots: { default: 'taskActionCell' },
  },
]);

// 提交证明 Modal
const submitProofModalVisible = ref(false);
const submitProofLoading = ref(false);
const currentTaskForProof = ref<WarningCenterApi.WarningTask | null>(null);
const submitProofForm = reactive({
  process_note: '',
  progress: 100,
});

// 复核 Modal
const reviewModalVisible = ref(false);
const reviewLoading = ref(false);
const currentTaskForReview = ref<WarningCenterApi.WarningTask | null>(null);
const reviewForm = reactive({
  review_result: 'approved' as 'approved' | 'rejected',
  review_note: '',
});

async function fetchTaskList() {
  taskLoading.value = true;
  try {
    const res = await getTasks({
      status: taskFilters.status,
      priority: taskFilters.priority,
      page: taskPagination.page,
      pageSize: taskPagination.pageSize,
    });
    taskList.value = res.list || [];
    taskPagination.itemCount = res.total || 0;
  } catch (err) {
    console.error('获取任务列表失败:', err);
    message.error('获取任务列表失败');
  } finally {
    taskLoading.value = false;
  }
}

async function loadTaskDetail(taskId: number) {
  try {
    await getTaskDetail(taskId);
    message.info('已定位到该任务，请在列表中查看');
  } catch (err) {
    console.error('获取任务详情失败:', err);
    message.error('获取任务详情失败');
  }
}

function handleTaskSearch() {
  taskPagination.page = 1;
  fetchTaskList();
}

function handleTaskPageChange(page: number, pageSize: number) {
  taskPagination.page = page;
  taskPagination.pageSize = pageSize;
  fetchTaskList();
}

function onTaskPageChange(payload: { currentPage: number; pageSize: number }) {
  taskPagination.page = payload.currentPage;
  taskPagination.pageSize = payload.pageSize;
  fetchTaskList();
}

async function handleDispatch(record: WarningCenterApi.WarningTask) {
  try {
    await dispatchTask(record.id);
    message.success('任务已下发');
    fetchTaskList();
  } catch (err) {
    console.error('任务下发失败:', err);
    message.error('任务下发失败');
  }
}

async function handleProcess(record: WarningCenterApi.WarningTask) {
  try {
    await processTask(record.id);
    message.success('任务已开始处理');
    fetchTaskList();
  } catch (err) {
    console.error('任务处理失败:', err);
    message.error('任务处理失败');
  }
}

function openSubmitProofModal(record: WarningCenterApi.WarningTask) {
  currentTaskForProof.value = record;
  submitProofForm.process_note = '';
  submitProofForm.progress = record.progress || 100;
  submitProofModalVisible.value = true;
}

async function handleSubmitProofConfirm() {
  if (!currentTaskForProof.value) return;
  if (!submitProofForm.process_note.trim()) {
    message.warning('请填写处理说明');
    return;
  }
  submitProofLoading.value = true;
  try {
    await submitProof(currentTaskForProof.value.id, {
      process_note: submitProofForm.process_note,
      progress: submitProofForm.progress,
    });
    message.success('整改证明已提交');
    submitProofModalVisible.value = false;
    fetchTaskList();
  } catch (err) {
    console.error('提交整改证明失败:', err);
    message.error('提交整改证明失败');
  } finally {
    submitProofLoading.value = false;
  }
}

function openReviewModal(record: WarningCenterApi.WarningTask) {
  currentTaskForReview.value = record;
  reviewForm.review_result = 'approved';
  reviewForm.review_note = '';
  reviewModalVisible.value = true;
}

async function handleReviewConfirm() {
  if (!currentTaskForReview.value) return;
  reviewLoading.value = true;
  try {
    await reviewTask(currentTaskForReview.value.id, {
      review_result: reviewForm.review_result,
      review_note: reviewForm.review_note,
    });
    message.success(reviewForm.review_result === 'approved' ? '复核通过，任务已关闭' : '已驳回，需重新处理');
    reviewModalVisible.value = false;
    fetchTaskList();
  } catch (err) {
    console.error('复核失败:', err);
    message.error('复核失败');
  } finally {
    reviewLoading.value = false;
  }
}

// ==================== 标签页3: 整改闭环分析 ====================
const analysisData = ref<WarningCenterApi.AnalysisData | null>(null);
const analysisYear = ref<number>(new Date().getFullYear());
const yearOptions = computed(() => {
  const current = new Date().getFullYear();
  const arr: number[] = [];
  for (let y = current; y >= current - 4; y--) {
    arr.push(y);
  }
  return arr;
});

const trendChartRef = ref<EchartsUIType>();
const sourceChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTrendChart, resize: resizeTrendChart } = useEcharts(trendChartRef);
const { renderEcharts: renderSourceChart, resize: resizeSourceChart } = useEcharts(sourceChartRef);

const levelStatColumns = ref<VxeTableGridColumns>([
  {
    title: '预警等级',
    field: 'levelLabel',
    width: 140,
    slots: { default: 'levelStatCell' },
  },
  { title: '任务数', field: 'total', width: 120 },
  { title: '完成数', field: 'closed', width: 120 },
  {
    title: '完成率',
    field: 'rate',
    slots: { default: 'rateCell' },
  },
]);

async function fetchAnalysisData() {
  try {
    analysisData.value = await getAnalysis(analysisYear.value);
  } catch (err) {
    console.error('获取分析数据失败:', err);
    message.error('获取分析数据失败');
  }
}

const trendChartOption = computed<ECOption>(() => {
  const monthly = analysisData.value?.monthlyTrend ?? [];
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: { data: ['任务数', '整改率'], top: 0 },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: monthly.map((item) => item.month),
      axisLabel: { color: tokens.colorTextBase },
      axisLine: { lineStyle: { color: tokens.colorBorder } },
    },
    yAxis: [
      {
        type: 'value',
        name: '任务数',
        nameTextStyle: { color: tokens.colorTextBase },
        axisLabel: { color: tokens.colorTextBase },
        splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
      },
      {
        type: 'value',
        name: '整改率(%)',
        nameTextStyle: { color: tokens.colorTextBase },
        axisLabel: { color: tokens.colorTextBase, formatter: '{value}%' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '任务数',
        type: 'bar',
        barWidth: '40%',
        data: monthly.map((item) => item.total),
        itemStyle: { color: tokens.colorPrimary, borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '整改率',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: monthly.map((item) => item.rate),
        lineStyle: { color: tokens.colorSuccess, width: 2 },
        itemStyle: { color: tokens.colorSuccess },
      },
    ],
  };
});

const sourceChartOption = computed<ECOption>(() => {
  const bySource = analysisData.value?.bySource ?? [];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['任务数', '已完成数'], top: 0 },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: bySource.map((item) => item.sourceTypeLabel),
      axisLabel: { color: tokens.colorTextBase },
    },
    series: [
      {
        name: '任务数',
        type: 'bar',
        data: bySource.map((item) => item.total),
        barGap: 0,
        itemStyle: { color: tokens.colorPrimary },
      },
      {
        name: '已完成数',
        type: 'bar',
        data: bySource.map((item) => item.closed),
        itemStyle: { color: tokens.colorSuccess },
      },
    ],
  };
});

function handleResize() {
  resizeTrendChart();
  resizeSourceChart();
}

// ==================== 标签页4: 预警规则管理 ====================
const ruleList = ref<WarningCenterApi.WarningRule[]>([]);
const ruleLoading = ref(false);

const ruleFilters = reactive({
  source_type: undefined as string | undefined,
});

const rulePagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (page: number) => handleRulePageChange(page, rulePagination.pageSize),
  onUpdatePageSize: (pageSize: number) => {
    rulePagination.page = 1;
    rulePagination.pageSize = pageSize;
    fetchRuleList();
  },
});

const ruleColumns = ref<VxeTableGridColumns>([
  { title: '规则编号', field: 'ruleCode', width: 140 },
  { title: '规则名称', field: 'ruleName', width: 200 },
  {
    title: '预警来源',
    field: 'sourceTypeLabel',
    width: 110,
    slots: { default: 'ruleSourceTypeCell' },
  },
  {
    title: '预警等级',
    field: 'warningLevelLabel',
    width: 100,
    slots: { default: 'ruleWarningLevelCell' },
  },
  {
    title: '对象类型',
    field: 'targetType',
    width: 100,
    slots: { default: 'targetTypeCell' },
  },
  {
    title: '版本',
    field: 'version',
    width: 90,
    slots: { default: 'ruleVersionCell' },
  },
  {
    title: '状态',
    field: 'status',
    width: 110,
    slots: { default: 'ruleStatusCell' },
  },
  {
    title: '操作',
    field: 'action',
    width: 160,
    fixed: 'right',
    slots: { default: 'ruleActionCell' },
  },
]);

// 规则编辑 Modal
const ruleModalVisible = ref(false);
const ruleModalMode = ref<'create' | 'edit'>('create');
const ruleSubmitting = ref(false);
const currentEditingRule = ref<WarningCenterApi.WarningRule | null>(null);
const conditionConfigText = ref('');
const actionConfigText = ref('');
const ruleForm = reactive({
  rule_name: '',
  source_type: undefined as WarningCenterApi.SourceType | undefined,
  warning_level: undefined as WarningCenterApi.WarningLevel | undefined,
  target_type: 'employee' as WarningCenterApi.TargetType,
  description: '',
  change_log: '',
});

// 版本历史 Drawer
const versionDrawerVisible = ref(false);
const versionList = ref<WarningCenterApi.RuleVersion[]>([]);
const versionLoading = ref(false);

async function fetchRuleList() {
  ruleLoading.value = true;
  try {
    const res = await getRules({
      source_type: ruleFilters.source_type,
      page: rulePagination.page,
      pageSize: rulePagination.pageSize,
    });
    ruleList.value = res.list || [];
    rulePagination.itemCount = res.total || 0;
  } catch (err) {
    console.error('获取规则列表失败:', err);
    message.error('获取规则列表失败');
  } finally {
    ruleLoading.value = false;
  }
}

function handleRuleSearch() {
  rulePagination.page = 1;
  fetchRuleList();
}

function handleRulePageChange(page: number, pageSize: number) {
  rulePagination.page = page;
  rulePagination.pageSize = pageSize;
  fetchRuleList();
}

function onRulePageChange(payload: { currentPage: number; pageSize: number }) {
  rulePagination.page = payload.currentPage;
  rulePagination.pageSize = payload.pageSize;
  fetchRuleList();
}

function openCreateRuleModal() {
  ruleModalMode.value = 'create';
  currentEditingRule.value = null;
  ruleForm.rule_name = '';
  ruleForm.source_type = undefined;
  ruleForm.warning_level = undefined;
  ruleForm.target_type = 'employee';
  ruleForm.description = '';
  ruleForm.change_log = '';
  conditionConfigText.value = '';
  actionConfigText.value = '';
  ruleModalVisible.value = true;
}

async function openEditRuleModal(record: WarningCenterApi.WarningRule) {
  ruleModalMode.value = 'edit';
  currentEditingRule.value = record;
  try {
    const detail = await getRuleDetail(record.id);
    ruleForm.rule_name = detail.ruleName;
    ruleForm.source_type = detail.sourceType;
    ruleForm.warning_level = detail.warningLevel;
    ruleForm.target_type = detail.targetType;
    ruleForm.description = detail.description || '';
    ruleForm.change_log = '';
    conditionConfigText.value = detail.conditionConfig
      ? JSON.stringify(detail.conditionConfig, null, 2)
      : '';
    actionConfigText.value = detail.actionConfig
      ? JSON.stringify(detail.actionConfig, null, 2)
      : '';
  } catch {
    // 详情获取失败时使用列表数据回填
    ruleForm.rule_name = record.ruleName;
    ruleForm.source_type = record.sourceType;
    ruleForm.warning_level = record.warningLevel;
    ruleForm.target_type = record.targetType;
    ruleForm.description = record.description || '';
    ruleForm.change_log = '';
    conditionConfigText.value = record.conditionConfig
      ? JSON.stringify(record.conditionConfig, null, 2)
      : '';
    actionConfigText.value = record.actionConfig
      ? JSON.stringify(record.actionConfig, null, 2)
      : '';
  }
  ruleModalVisible.value = true;
}

function safeParseJson(text: string): Record<string, any> | undefined {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function handleRuleSubmit() {
  if (!ruleForm.rule_name.trim()) {
    message.warning('请填写规则名称');
    return;
  }
  if (!ruleForm.source_type) {
    message.warning('请选择预警来源');
    return;
  }
  if (!ruleForm.warning_level) {
    message.warning('请选择预警等级');
    return;
  }
  if (ruleModalMode.value === 'edit' && !ruleForm.change_log.trim()) {
    message.warning('请填写变更说明');
    return;
  }

  // 校验 JSON 格式
  if (conditionConfigText.value.trim()) {
    if (!safeParseJson(conditionConfigText.value)) {
      message.error('触发条件 JSON 格式错误');
      return;
    }
  }
  if (actionConfigText.value.trim()) {
    if (!safeParseJson(actionConfigText.value)) {
      message.error('处置动作 JSON 格式错误');
      return;
    }
  }

  ruleSubmitting.value = true;
  try {
    if (ruleModalMode.value === 'create') {
      await createRule({
        rule_name: ruleForm.rule_name,
        source_type: ruleForm.source_type,
        warning_level: ruleForm.warning_level,
        target_type: ruleForm.target_type,
        condition_config: safeParseJson(conditionConfigText.value),
        action_config: safeParseJson(actionConfigText.value),
        description: ruleForm.description,
      });
      message.success('规则创建成功');
    } else if (currentEditingRule.value) {
      await updateRule(currentEditingRule.value.id, {
        rule_name: ruleForm.rule_name,
        source_type: ruleForm.source_type,
        warning_level: ruleForm.warning_level,
        target_type: ruleForm.target_type,
        condition_config: safeParseJson(conditionConfigText.value),
        action_config: safeParseJson(actionConfigText.value),
        description: ruleForm.description,
        change_log: ruleForm.change_log,
      });
      message.success('规则更新成功');
    }
    ruleModalVisible.value = false;
    fetchRuleList();
  } catch (err) {
    console.error('保存规则失败:', err);
    message.error('保存规则失败');
  } finally {
    ruleSubmitting.value = false;
  }
}

function handleToggleRule(record: WarningCenterApi.WarningRule) {
  dialog.warning({
    title: '确认操作',
    content: `确定要${record.status === 'active' ? '停用' : '启用'}规则「${record.ruleName}」吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await toggleRule(record.id);
        message.success(`${record.status === 'active' ? '停用' : '启用'}成功`);
        fetchRuleList();
      } catch (err) {
        console.error('切换规则状态失败:', err);
        message.error('操作失败');
      }
    },
  });
}

async function openVersionDrawer(record: WarningCenterApi.WarningRule) {
  versionDrawerVisible.value = true;
  versionList.value = [];
  versionLoading.value = true;
  try {
    // 优先使用规则自带版本信息，再调用版本接口
    if (record.versions && record.versions.length > 0) {
      versionList.value = record.versions;
    } else {
      versionList.value = await getRuleVersions(record.id);
    }
  } catch (err) {
    console.error('获取版本历史失败:', err);
    message.error('获取版本历史失败');
  } finally {
    versionLoading.value = false;
  }
}

// ==================== 工具函数 ====================
function getStatColor(className: string): string {
  const colorMap: Record<string, string> = {
    'stat-blue': tokens.colorPrimary,
    'stat-gold': tokens.colorWarning,
    'stat-green': tokens.colorSuccess,
    'stat-red': tokens.colorError,
  };
  return colorMap[className] || tokens.colorTextBase;
}

function getWarningLevelColor(level: WarningCenterApi.WarningLevel | string | null): string {
  const map: Record<string, string> = {
    critical: 'red',
    major: 'orange',
    minor: 'gold',
    info: 'blue',
  };
  return map[level as string] || 'default';
}

function getPriorityColor(priority: WarningCenterApi.Priority | string): string {
  const map: Record<string, string> = {
    low: 'default',
    normal: 'blue',
    high: 'orange',
    urgent: 'red',
  };
  return map[priority] || 'default';
}

function getDeadlineClass(overdueStatus: string): string {
  if (overdueStatus === 'overdue') return 'deadline-overdue';
  if (overdueStatus === 'expiring') return 'deadline-expiring';
  return '';
}

// ==================== 标签页切换 ====================
function handleTabChange(key: string | number) {
  if (key === 'warnings') {
    fetchWarningList();
    fetchWarningStats();
  } else if (key === 'tasks') {
    fetchTaskList();
  } else if (key === 'analysis') {
    fetchAnalysisData();
  } else if (key === 'rules') {
    fetchRuleList();
  }
}

// ==================== 生命周期 ====================
watch(
  () => analysisData.value,
  async () => {
    await nextTick();
    if (trendChartRef.value) renderTrendChart(trendChartOption.value);
    if (sourceChartRef.value) renderSourceChart(sourceChartOption.value);
  },
  { deep: true },
);

onMounted(() => {
  Promise.all([fetchWarningList(), fetchWarningStats()]);
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped lang="scss">
.tab-content {
  padding: 0;
}

// 统计卡片
.stat-row {
  margin-bottom: 16px;
}

.filter-card,
.table-card {
  margin-bottom: 16px;
}

.ellipsis-cell {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

// 截止日期样式
.deadline-overdue {
  color: hsl(var(--error));
  font-weight: 600;
}

.deadline-expiring {
  color: hsl(var(--warning));
  font-weight: 600;
}

.overdue-tag {
  margin-left: 4px;
  padding: 0 4px;
  font-size: 11px;
  color: hsl(var(--error-foreground));
  background: hsl(var(--error));
  border-radius: 2px;
}

.expiring-tag {
  margin-left: 4px;
  padding: 0 4px;
  font-size: 11px;
  color: hsl(var(--warning-foreground));
  background: hsl(var(--warning));
  border-radius: 2px;
}

// 上传占位
.upload-placeholder {
  .upload-text {
    font-size: 14px;
    color: hsl(var(--foreground));
  }

  .upload-hint {
    margin-top: 4px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }
}

// 版本历史
.version-item {
  padding-bottom: 4px;

  .version-header {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
  }

  .version-log {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    margin-bottom: 4px;
    line-height: 1.5;
  }

  .version-time {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }
}
</style>
