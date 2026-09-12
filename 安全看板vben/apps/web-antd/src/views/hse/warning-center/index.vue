<template>
  <Page auto-content-height class="warning-center-page">
    <template #title>预警与整改中心</template>
    <template #description>风险预警、整改任务、闭环分析与规则管理</template>
    <template #extra>
      <Space :size="8">
        <HelpButton menuCode="HSE_WARNING_LIST" />
        <a-button
          v-if="activeTab === 'warnings'"
          type="primary"
          :loading="scanLoading"
          @click="handleScanWarnings"
        >
          扫描预警
        </a-button>
        <a-button v-else-if="activeTab === 'rules'" type="primary" @click="openCreateRuleModal">
          新建规则
        </a-button>
      </Space>
    </template>
    <Tabs v-model:activeKey="activeTab" @change="handleTabChange">
      <!-- ============ 标签页1: 风险预警中心 ============ -->
      <Tabs.TabPane key="warnings" tab="风险预警中心">
        <div class="tab-content">
          <!-- 顶部统计卡片 -->
          <a-row :gutter="[16, 16]" class="stat-row">
            <a-col :xs="24" :sm="12" :md="6" v-for="stat in warningStatItems" :key="stat.key">
              <a-card :bordered="false" size="small">
                <a-statistic
                  :title="stat.label"
                  :value="stat.value"
                  :value-style="{ color: getStatColor(stat.className) }"
                />
              </a-card>
            </a-col>
          </a-row>

          <!-- 操作栏 -->
          <a-card :bordered="false" class="filter-card">
            <template #title>筛选条件</template>
            <a-space wrap>
              <Select
                v-model:value="warningFilters.source_type"
                placeholder="预警来源"
                allow-clear
                style="width: 160px"
                @change="handleWarningSearch"
              >
                <Select.Option value="employee_risk">员工风险</Select.Option>
                <Select.Option value="driver_risk">司机风险</Select.Option>
                <Select.Option value="accident">事故</Select.Option>
                <Select.Option value="assessment">考核</Select.Option>
                <Select.Option value="management">管理</Select.Option>
              </Select>
              <Select
                v-model:value="warningFilters.warning_level"
                placeholder="预警等级"
                allow-clear
                style="width: 140px"
                @change="handleWarningSearch"
              >
                <Select.Option value="critical">重大</Select.Option>
                <Select.Option value="major">较大</Select.Option>
                <Select.Option value="minor">一般</Select.Option>
                <Select.Option value="info">提示</Select.Option>
              </Select>
              <Select
                v-model:value="warningFilters.status"
                placeholder="状态"
                allow-clear
                style="width: 140px"
                @change="handleWarningSearch"
              >
                <Select.Option value="pending">待处理</Select.Option>
                <Select.Option value="processing">处理中</Select.Option>
                <Select.Option value="resolved">已解决</Select.Option>
                <Select.Option value="closed">已关闭</Select.Option>
                <Select.Option value="ignored">已忽略</Select.Option>
              </Select>
            </a-space>
          </a-card>

          <!-- 预警表格 -->
          <a-card :bordered="false" class="table-card">
            <template #title>预警列表</template>
            <a-table
            :columns="warningColumns"
            :data-source="warningList"
            :loading="warningLoading"
            :pagination="false"
            :row-key="(record: WarningCenterApi.WarningRecord) => record.id"
            size="small"
            :scroll="{ x: 1400 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'sourceTypeLabel'">
                <a-tag color="blue">{{ record.sourceTypeLabel }}</a-tag>
              </template>
              <template v-else-if="column.key === 'warningLevelLabel'">
                <a-tag :color="record.warningLevelColor">{{ record.warningLevelLabel }}</a-tag>
              </template>
              <template v-else-if="column.key === 'riskReason'">
                <a-tooltip :title="record.riskReason || '-'" placement="topLeft">
                  <span class="ellipsis-cell">{{ record.riskReason || '-' }}</span>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'statusLabel'">
                <a-tag>{{ record.statusLabel }}</a-tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-button type="link" size="small" @click="goWarningDetail(record)">查看详情</a-button>
                  <a-button
                    v-if="canJumpToSource(record)"
                    type="link"
                    size="small"
                    @click="goToSourceSystem(record)"
                  >
                    {{ getJumpButtonText(record) }}
                  </a-button>
                  <a-button
                    v-if="record.rectificationTaskId"
                    type="link"
                    size="small"
                    @click="goTaskFromWarning(record)"
                  >
                    查看任务
                  </a-button>
                </a-space>
              </template>
            </template>
            </a-table>

            <div class="pagination-wrapper">
              <a-pagination
                v-model:current="warningPagination.page"
                v-model:pageSize="warningPagination.pageSize"
                :total="warningPagination.total"
                show-size-changer
                show-quick-jumper
                :show-total="(total: number) => `共 ${total} 条记录`"
                @change="handleWarningPageChange"
              />
            </div>
          </a-card>
        </div>
      </Tabs.TabPane>

      <!-- ============ 标签页2: 整改任务中心 ============ -->
      <Tabs.TabPane key="tasks" tab="整改任务中心">
        <div class="tab-content">
          <!-- 操作栏 -->
          <a-card :bordered="false" class="filter-card">
            <template #title>筛选条件</template>
            <a-space wrap>
              <Select
                v-model:value="taskFilters.status"
                placeholder="任务状态"
                allow-clear
                style="width: 160px"
                @change="handleTaskSearch"
              >
                <Select.Option value="pending">待下发</Select.Option>
                <Select.Option value="dispatched">已下发</Select.Option>
                <Select.Option value="processing">处理中</Select.Option>
                <Select.Option value="pending_review">待复核</Select.Option>
                <Select.Option value="closed">已关闭</Select.Option>
                <Select.Option value="rejected">已驳回</Select.Option>
              </Select>
              <Select
                v-model:value="taskFilters.priority"
                placeholder="优先级"
                allow-clear
                style="width: 140px"
                @change="handleTaskSearch"
              >
                <Select.Option value="low">低</Select.Option>
                <Select.Option value="normal">中</Select.Option>
                <Select.Option value="high">高</Select.Option>
                <Select.Option value="urgent">紧急</Select.Option>
              </Select>
              <a-button @click="fetchTaskList">刷新</a-button>
            </a-space>
          </a-card>

          <!-- 任务表格 -->
          <a-card :bordered="false" class="table-card">
            <template #title>整改任务列表</template>
            <a-table
            :columns="taskColumns"
            :data-source="taskList"
            :loading="taskLoading"
            :pagination="false"
            :row-key="(record: WarningCenterApi.WarningTask) => record.id"
            size="small"
            :scroll="{ x: 1600 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'warningLevelLabel'">
                <a-tag :color="getWarningLevelColor(record.warningLevel)">
                  {{ record.warningLevelLabel }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'deadlineDate'">
                <span :class="getDeadlineClass(record.overdueStatus)">
                  {{ record.deadlineDate }}
                  <span v-if="record.overdueStatus === 'overdue'" class="overdue-tag">逾期</span>
                  <span v-else-if="record.overdueStatus === 'expiring'" class="expiring-tag">即将到期</span>
                </span>
              </template>
              <template v-else-if="column.key === 'statusLabel'">
                <a-tag :color="record.statusColor">{{ record.statusLabel }}</a-tag>
              </template>
              <template v-else-if="column.key === 'priorityLabel'">
                <a-tag :color="getPriorityColor(record.priority)">{{ record.priorityLabel }}</a-tag>
              </template>
              <template v-else-if="column.key === 'progress'">
                <a-progress :percent="record.progress" size="small" />
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-button v-if="record.status === 'pending'" type="link" size="small" @click="handleDispatch(record)">
                    下发
                  </a-button>
                  <a-button v-if="record.status === 'dispatched'" type="link" size="small" @click="handleProcess(record)">
                    处理
                  </a-button>
                  <a-button v-if="record.status === 'processing'" type="link" size="small" @click="openSubmitProofModal(record)">
                    提交证明
                  </a-button>
                  <a-button v-if="record.status === 'pending_review'" type="link" size="small" @click="openReviewModal(record)">
                    复核
                  </a-button>
                  <a-button v-if="record.status === 'rejected'" type="link" size="small" @click="handleProcess(record)">
                    处理
                  </a-button>
                </a-space>
              </template>
            </template>
            </a-table>

            <div class="pagination-wrapper">
              <a-pagination
                v-model:current="taskPagination.page"
                v-model:pageSize="taskPagination.pageSize"
                :total="taskPagination.total"
                show-size-changer
                show-quick-jumper
                :show-total="(total: number) => `共 ${total} 条记录`"
                @change="handleTaskPageChange"
              />
            </div>
          </a-card>
        </div>

        <!-- 提交证明 Modal -->
        <a-modal
          v-model:open="submitProofModalVisible"
          title="提交整改证明"
          :confirm-loading="submitProofLoading"
          @ok="handleSubmitProofConfirm"
          @cancel="submitProofModalVisible = false"
        >
          <a-form layout="vertical">
            <a-form-item label="处理说明" required>
              <a-textarea
                v-model:value="submitProofForm.process_note"
                :rows="4"
                placeholder="请输入处理说明..."
              />
            </a-form-item>
            <a-form-item label="整改进度">
              <a-input-number
                v-model:value="submitProofForm.progress"
                :min="0"
                :max="100"
                style="width: 100%"
                placeholder="进度百分比"
              />
            </a-form-item>
            <a-form-item label="附件上传">
              <div class="upload-placeholder">
                <a-upload-dragger :before-upload="() => false" multiple>
                  <p class="ant-upload-text">点击或拖拽文件到此处上传</p>
                  <p class="ant-upload-hint">支持图片、文档等附件</p>
                </a-upload-dragger>
              </div>
            </a-form-item>
          </a-form>
        </a-modal>

        <!-- 复核 Modal -->
        <a-modal
          v-model:open="reviewModalVisible"
          title="任务复核"
          :confirm-loading="reviewLoading"
          @ok="handleReviewConfirm"
          @cancel="reviewModalVisible = false"
        >
          <a-form layout="vertical">
            <a-form-item label="复核结果" required>
              <a-radio-group v-model:value="reviewForm.review_result">
                <a-radio value="approved">通过</a-radio>
                <a-radio value="rejected">驳回</a-radio>
              </a-radio-group>
            </a-form-item>
            <a-form-item label="复核意见">
              <a-textarea
                v-model:value="reviewForm.review_note"
                :rows="4"
                placeholder="请输入复核意见..."
              />
            </a-form-item>
          </a-form>
        </a-modal>
      </Tabs.TabPane>

      <!-- ============ 标签页3: 整改闭环分析 ============ -->
      <Tabs.TabPane key="analysis" tab="整改闭环分析">
        <div class="tab-content">
          <!-- 年度选择器 -->
          <a-card :bordered="false" class="filter-card">
            <template #title>分析条件</template>
            <a-space>
              <span class="year-label">统计年度：</span>
              <Select
                v-model:value="analysisYear"
                style="width: 120px"
                @change="fetchAnalysisData"
              >
                <Select.Option v-for="year in yearOptions" :key="year" :value="year">
                  {{ year }} 年
                </Select.Option>
              </Select>
            </a-space>
          </a-card>

          <!-- KPI 卡片 -->
          <a-row :gutter="[16, 16]" class="stat-row">
            <a-col :xs="24" :sm="8">
              <a-card :bordered="false" size="small">
                <a-statistic
                  title="整改率"
                  :value="analysisData?.overall.rectificationRate ?? 0"
                  suffix="%"
                  :value-style="{ color: getStatColor('stat-green') }"
                />
              </a-card>
            </a-col>
            <a-col :xs="24" :sm="8">
              <a-card :bordered="false" size="small">
                <a-statistic
                  title="逾期率"
                  :value="analysisData?.overall.overdueRate ?? 0"
                  suffix="%"
                  :value-style="{ color: getStatColor('stat-red') }"
                />
              </a-card>
            </a-col>
            <a-col :xs="24" :sm="8">
              <a-card :bordered="false" size="small">
                <a-statistic
                  title="重复风险率"
                  :value="analysisData?.repeatRiskRate ?? 0"
                  suffix="%"
                  :value-style="{ color: getStatColor('stat-gold') }"
                />
              </a-card>
            </a-col>
          </a-row>

          <!-- 图表区域 -->
          <a-row :gutter="[16, 16]" class="chart-row">
            <a-col :xs="24" :lg="14">
              <a-card title="月度趋势（任务数 / 整改率）" :bordered="false">
                <EchartsUI
                  v-if="analysisData?.monthlyTrend?.length"
                  ref="trendChartRef"
                  style="width: 100%; height: 340px"
                />
                <a-empty v-else description="暂无数据" />
              </a-card>
            </a-col>
            <a-col :xs="24" :lg="10">
              <a-card title="按来源分布（任务数 / 已完成数）" :bordered="false">
                <EchartsUI
                  v-if="analysisData?.bySource?.length"
                  ref="sourceChartRef"
                  style="width: 100%; height: 340px"
                />
                <a-empty v-else description="暂无数据" />
              </a-card>
            </a-col>
          </a-row>

          <!-- 按等级统计表格 -->
          <a-card title="按预警等级统计" :bordered="false" class="table-card">
            <a-table
              :columns="levelStatColumns"
              :data-source="analysisData?.byLevel || []"
              :pagination="false"
              :row-key="(record: WarningCenterApi.AnalysisData['byLevel'][number]) => record.level"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'levelLabel'">
                  <a-tag :color="getWarningLevelColor(record.level)">{{ record.levelLabel }}</a-tag>
                </template>
                <template v-else-if="column.key === 'rate'">
                  <a-progress :percent="record.rate" size="small" />
                </template>
              </template>
            </a-table>
          </a-card>
        </div>
      </Tabs.TabPane>

      <!-- ============ 标签页4: 预警规则管理 ============ -->
      <Tabs.TabPane key="rules" tab="预警规则管理">
        <div class="tab-content">
          <!-- 操作栏 -->
          <a-card :bordered="false" class="filter-card">
            <template #title>筛选条件</template>
            <a-space wrap>
              <Select
                v-model:value="ruleFilters.source_type"
                placeholder="预警来源"
                allow-clear
                style="width: 160px"
                @change="handleRuleSearch"
              >
                <Select.Option value="employee_risk">员工风险</Select.Option>
                <Select.Option value="driver_risk">司机风险</Select.Option>
                <Select.Option value="accident">事故</Select.Option>
                <Select.Option value="assessment">考核</Select.Option>
                <Select.Option value="management">管理</Select.Option>
              </Select>
            </a-space>
          </a-card>

          <!-- 规则表格 -->
          <a-card :bordered="false" class="table-card">
            <template #title>预警规则列表</template>
            <a-table
            :columns="ruleColumns"
            :data-source="ruleList"
            :loading="ruleLoading"
            :pagination="false"
            :row-key="(record: WarningCenterApi.WarningRule) => record.id"
            size="small"
            :scroll="{ x: 1400 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'sourceTypeLabel'">
                <a-tag color="blue">{{ record.sourceTypeLabel }}</a-tag>
              </template>
              <template v-else-if="column.key === 'warningLevelLabel'">
                <a-tag :color="getWarningLevelColor(record.warningLevel)">
                  {{ record.warningLevelLabel }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'targetType'">
                {{ record.targetType === 'employee' ? '员工' : '组织' }}
              </template>
              <template v-else-if="column.key === 'version'">
                <a-tag color="cyan">{{ record.version }}</a-tag>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-switch
                  :checked="record.status === 'active'"
                  checked-children="启用"
                  un-checked-children="停用"
                  @click="handleToggleRule(record)"
                />
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-button type="link" size="small" @click="openEditRuleModal(record)">编辑</a-button>
                  <a-button type="link" size="small" @click="openVersionDrawer(record)">版本历史</a-button>
                </a-space>
              </template>
            </template>
            </a-table>

            <div class="pagination-wrapper">
              <a-pagination
                v-model:current="rulePagination.page"
                v-model:pageSize="rulePagination.pageSize"
                :total="rulePagination.total"
                show-size-changer
                show-quick-jumper
                :show-total="(total: number) => `共 ${total} 条记录`"
                @change="handleRulePageChange"
              />
            </div>
          </a-card>
        </div>

        <!-- 规则编辑 Modal -->
        <a-modal
          v-model:open="ruleModalVisible"
          :title="ruleModalMode === 'create' ? '新建预警规则' : '编辑预警规则'"
          width="640px"
          :confirm-loading="ruleSubmitting"
          @ok="handleRuleSubmit"
          @cancel="ruleModalVisible = false"
        >
          <a-form layout="vertical">
            <a-form-item label="规则名称" required>
              <a-input v-model:value="ruleForm.rule_name" placeholder="请输入规则名称" />
            </a-form-item>
            <a-row :gutter="16">
              <a-col :span="8">
                <a-form-item label="预警来源" required>
                  <Select v-model:value="ruleForm.source_type" placeholder="请选择">
                    <Select.Option value="employee_risk">员工风险</Select.Option>
                    <Select.Option value="driver_risk">司机风险</Select.Option>
                    <Select.Option value="accident">事故</Select.Option>
                    <Select.Option value="assessment">考核</Select.Option>
                    <Select.Option value="management">管理</Select.Option>
                  </Select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="预警等级" required>
                  <Select v-model:value="ruleForm.warning_level" placeholder="请选择">
                    <Select.Option value="critical">重大</Select.Option>
                    <Select.Option value="major">较大</Select.Option>
                    <Select.Option value="minor">一般</Select.Option>
                    <Select.Option value="info">提示</Select.Option>
                  </Select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="对象类型">
                  <Select v-model:value="ruleForm.target_type" placeholder="请选择">
                    <Select.Option value="employee">员工</Select.Option>
                    <Select.Option value="organization">组织</Select.Option>
                  </Select>
                </a-form-item>
              </a-col>
            </a-row>
            <a-form-item label="触发条件（JSON 格式）">
              <a-textarea
                v-model:value="conditionConfigText"
                :rows="4"
                placeholder='例如：{"threshold": 80, "operator": "gte"}'
              />
            </a-form-item>
            <a-form-item label="处置动作（JSON 格式）">
              <a-textarea
                v-model:value="actionConfigText"
                :rows="4"
                placeholder='例如：{"action": "create_task", "priority": "high"}'
              />
            </a-form-item>
            <a-form-item label="规则描述">
              <a-textarea
                v-model:value="ruleForm.description"
                :rows="2"
                placeholder="请输入规则描述"
              />
            </a-form-item>
            <a-form-item v-if="ruleModalMode === 'edit'" label="变更说明" required>
              <a-input v-model:value="ruleForm.change_log" placeholder="请说明本次变更内容" />
            </a-form-item>
          </a-form>
        </a-modal>

        <!-- 版本历史 Drawer -->
        <a-drawer
          v-model:open="versionDrawerVisible"
          title="版本历史"
          width="520"
          placement="right"
        >
          <a-timeline>
            <a-timeline-item
              v-for="ver in versionList"
              :key="ver.id"
              :color="ver.status === 'active' ? 'green' : 'gray'"
            >
              <div class="version-item">
                <div class="version-header">
                  <a-tag color="cyan">{{ ver.version }}</a-tag>
                  <a-tag :color="ver.status === 'active' ? 'green' : 'default'">
                    {{ ver.status === 'active' ? '当前版本' : '历史版本' }}
                  </a-tag>
                </div>
                <div class="version-log" v-if="ver.changeLog">{{ ver.changeLog }}</div>
                <div class="version-time">{{ ver.createdAt }}</div>
              </div>
            </a-timeline-item>
          </a-timeline>
          <a-empty v-if="versionList.length === 0" description="暂无版本记录" />
        </a-drawer>
      </Tabs.TabPane>
    </Tabs>
  </Page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Pagination,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Upload,
} from 'ant-design-vue';
import { useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { useAntdDesignTokens } from '@vben/hooks';
import { HelpButton } from '#/components/hse';

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

const router = useRouter();

// ==================== 当前激活的标签页 ====================
const activeTab = ref<string>('warnings');

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
  total: 0,
});

const warningColumns = [
  { title: '预警编号', dataIndex: 'warningCode', key: 'warningCode', width: 140 },
  { title: '预警来源', key: 'sourceTypeLabel', width: 110 },
  { title: '预警等级', key: 'warningLevelLabel', width: 100 },
  { title: '预警对象', dataIndex: 'targetName', key: 'targetName', width: 120 },
  { title: '责任单位', dataIndex: 'orgName', key: 'orgName', width: 140 },
  { title: '风险原因', key: 'riskReason', width: 200, ellipsis: true },
  { title: '状态', key: 'statusLabel', width: 100 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 160, fixed: 'right' as const },
];

// 统计卡片项
const warningStatItems = computed(() => {
  const overall = warningStats.value?.overall;
  return [
    { key: 'pending', label: '待处理', value: overall?.pendingCount ?? 0, className: 'stat-blue' },
    { key: 'processing', label: '处理中', value: overall?.processingCount ?? 0, className: 'stat-gold' },
    { key: 'closed', label: '已关闭', value: overall?.closedCount ?? 0, className: 'stat-green' },
    { key: 'critical', label: '重大预警', value: overall?.criticalCount ?? 0, className: 'stat-red' },
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
    warningPagination.total = res.total || 0;
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
  total: 0,
});

const taskColumns = [
  { title: '任务编号', dataIndex: 'taskCode', key: 'taskCode', width: 140 },
  { title: '任务标题', dataIndex: 'taskTitle', key: 'taskTitle', width: 180 },
  { title: '预警等级', key: 'warningLevelLabel', width: 100 },
  { title: '责任人', dataIndex: 'responsibleName', key: 'responsibleName', width: 110 },
  { title: '责任单位', dataIndex: 'orgName', key: 'orgName', width: 140 },
  { title: '整改期限', key: 'deadlineDate', width: 140 },
  { title: '状态', key: 'statusLabel', width: 110 },
  { title: '优先级', key: 'priorityLabel', width: 90 },
  { title: '进度', key: 'progress', width: 160 },
  { title: '操作', key: 'action', width: 130, fixed: 'right' as const },
];

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
    taskPagination.total = res.total || 0;
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
const { tokens } = useAntdDesignTokens();
const { renderEcharts: renderTrendChart, resize: resizeTrendChart } = useEcharts(trendChartRef);
const { renderEcharts: renderSourceChart, resize: resizeSourceChart } = useEcharts(sourceChartRef);

const levelStatColumns = [
  { title: '预警等级', key: 'levelLabel', width: 140 },
  { title: '任务数', dataIndex: 'total', key: 'total', width: 120 },
  { title: '完成数', dataIndex: 'closed', key: 'closed', width: 120 },
  { title: '完成率', key: 'rate' },
];

async function fetchAnalysisData() {
  try {
    analysisData.value = await getAnalysis(analysisYear.value);
    await nextTick();
    if (analysisData.value.monthlyTrend.length) {
      renderTrendChart(trendChartOption.value);
    }
    if (analysisData.value.bySource.length) {
      renderSourceChart(sourceChartOption.value);
    }
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
  total: 0,
});

const ruleColumns = [
  { title: '规则编号', dataIndex: 'ruleCode', key: 'ruleCode', width: 140 },
  { title: '规则名称', dataIndex: 'ruleName', key: 'ruleName', width: 200 },
  { title: '预警来源', key: 'sourceTypeLabel', width: 110 },
  { title: '预警等级', key: 'warningLevelLabel', width: 100 },
  { title: '对象类型', key: 'targetType', width: 100 },
  { title: '版本', key: 'version', width: 90 },
  { title: '状态', key: 'status', width: 110 },
  { title: '操作', key: 'action', width: 160, fixed: 'right' as const },
];

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
    rulePagination.total = res.total || 0;
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
  Modal.confirm({
    title: '确认操作',
    content: `确定要${record.status === 'active' ? '停用' : '启用'}规则「${record.ruleName}」吗？`,
    onOk: async () => {
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
  () => activeTab.value,
  (newKey) => {
    if (newKey === 'analysis') {
      void nextTick(() => {
        fetchAnalysisData();
      });
    }
  },
);

// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(() => {
  // 初始加载标签页1数据
  Promise.all([
    fetchWarningList(),
    fetchWarningStats(),
  ]);
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});

void [
  Button,
  Card,
  Col,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  Pagination,
  Radio,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Upload,
];
</script>

<style scoped lang="scss">
.warning-center-page {
  :deep(.ant-tabs-content) {
    background: transparent;
  }
}

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

// 表格
:deep(.ant-table-wrapper) {
  overflow: hidden;
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

// 分页
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 16px;
  margin-top: 0;
}

// 上传占位
.upload-placeholder {
  :deep(.ant-upload-dragger) {
    padding: 16px;
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

<!-- 设计系统对齐：保留 :deep(.ant-tabs-content{background:transparent})、:deep(.ant-table-wrapper{overflow:hidden})、:deep(.ant-upload-dragger{padding}) —— 均为布局/容器调整，主题无关 -->

