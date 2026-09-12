<template>
  <Page auto-content-height class="hse-page">
    <SortableStatRow v-if="hasVisibleStats" page-key="insurance-personnel">
      <template v-if="statsLoading">
        <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
          <Card :bordered="false">
            <Skeleton active :paragraph="{ rows: 2 }" />
          </Card>
        </Col>
      </template>
      <template v-else>
        <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key" class="sortable-stat-col" :data-stat-key="stat.key" v-show="isStatVisible(stat.key)">
          <HseStatCard
            :title="stat.label"
            :value="stat.value"
            :icon="stat.icon"
            :color="(stat.color as any)"
            :clickable="true"
            @click="handleStatClick(stat.key)"
          />
        </Col>
      </template>
    </SortableStatRow>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <div class="card-title">人员保险</div>

          <div class="header-right">
            <Space>
              <HelpButton menuCode="HSE_INSURANCE" />
              <Button @click="policyManageVisible = true">
                <template #icon><IconifyIcon icon="lucide:file-text" /></template>
                保单管理
              </Button>
              <Button
                v-if="isActionVisible('create')"
                :disabled="selectedRowKeys.length === 0"
                :loading="syncLoading"
                @click="handleSyncSelected"
              >
                <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
                同步花名册 ({{ selectedRowKeys.length }})
              </Button>
              <ImportButtonGroup v-if="isActionVisible('import')" module="personnel" module-name="人员保险" button-label="雇主险" insurance-type="雇主责任险" :upload-hint="'支持 Excel (.xlsx/.xls) / CSV。推荐表头：雇员姓名、证件号码、保险起期、保险止期、雇主险保额（支持 80万 格式）、岗位名称、生效时间；保险类型可留空（自动按雇主险导入）。必填：姓名 + 证件号码（或工号）。'" @refresh="fetchData" />
              <ImportButtonGroup v-if="isActionVisible('import')" module="personnel" module-name="人员保险" button-label="工伤险" insurance-type="工伤保险" :upload-hint="'支持 Excel (.xlsx/.xls) / CSV。推荐表头：姓名、工号（或证件号码）、保险起期、保险止期、保额、保费；保险类型可留空（自动按工伤险导入）。'" @refresh="fetchData" />
              <Button v-if="isActionVisible('export')" @click="handleExport">
                <template #icon><IconifyIcon icon="lucide:download" /></template>
                导出
              </Button>
              <Button v-if="isActionVisible('create')" type="primary" @click="handleCreate">
                <template #icon><IconifyIcon icon="lucide:plus" /></template>
                新增人员
              </Button>
              <ComponentVisibilitySettings
                title="人员保险显示设置"
                v-model:model-value="config"
                :stat-items="visibilityStatItems"
                :action-buttons="actionButtons"
                @reset="resetToDefault"
              />
            </Space>
          </div>
        </div>
      </template>

      <Form v-if="isFilterVisible" layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="姓名/身份证/手机号"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="部门">
          <Select
            v-model:value="searchForm.department"
            placeholder="全部部门"
            allow-clear
            :loading="deptLoading"
            @change="handleSearch"
          >
            <SelectOption v-for="dept in departmentOptions" :key="dept" :value="dept">
              {{ dept }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem label="保险状态">
          <DynamicStatusFilter
            v-model="searchForm.complianceStatus"
            :data-source="personnelList"
            status-field="complianceStatus"
            :label-map="{ compliant: '合规', noncompliant: '不合规' }"
            :order="['compliant', 'noncompliant']"
            @change="handleSearch"
          />
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <div class="view-list">
        <Table
          ref="tableRef"
          :columns="tableColumns"
          :data-source="personnelList"
          :loading="loading"
          :pagination="{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条记录`,
          }"
          :row-selection="{
            selectedRowKeys: selectedRowKeys,
            onChange: (onSelectionChange as any),
          }"
          :row-key="(record: any) => record.rowKey"
          @change="(handleTableChange as any)"
          size="middle"
          :scroll="{ x: 1400 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'idCard'">
              {{ maskIdCard(record.idCard) }}
            </template>
            <template v-else-if="column.key === 'action'">
              <Space>
                <Button type="link" size="small" @click="handleViewDetail(record as any)">查看</Button>
                <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
                <Button type="link" size="small" @click="handleRenewal(record as any)">续保</Button>
                <Popconfirm
                  title="确定要删除吗？"
                  ok-type="danger"
                  @confirm="handleDelete(record as any)"
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            </template>
          </template>
        </Table>
      </div>

    </Card>

    <Modal
      v-model:open="personModalVisible"
      :title="editingPerson ? '编辑人员' : '新增人员'"
      :confirm-loading="personModalLoading"
      width="700px"
      @ok="handleSavePerson"
      @cancel="personModalVisible = false"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="人员" required>
              <!-- 任务7：EmployeeSelector 使用真实声明的 mode="single"（移除未声明的 multiple 属性）；
                   通过 @change 获取选择项并只读展示姓名/部门/岗位；
                   filterStatus 后端契约尚不可靠（SelectorParams 无 status 字段），
                   依赖保存时服务端 resolveEmployee 校验兜底（不存在/已离职/ID工号矛盾均拒绝）。 -->
              <EmployeeSelector
                v-if="!editingPerson"
                v-model:value="personForm.employeeId"
                mode="single"
                placeholder="请选择人员"
                style="width: 100%"
                @change="handleEmployeeChange"
              />
              <template v-else>
                <Input :value="selectedPersonName || '（编辑中：所属人员已锁定）'" disabled />
                <div v-if="selectedPersonDept || selectedPersonPos" style="margin-top: 4px; color: #999; font-size: 12px">
                  {{ selectedPersonDept }} / {{ selectedPersonPos }}
                </div>
              </template>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保险类型">
              <!-- 任务9（提示词09）：下拉由生产常量 PERSONNEL_INSURANCE_TYPES 渲染（与后端字典对齐） -->
              <Select v-model:value="personForm.insuranceType" placeholder="请选择" style="width: 100%">
                <SelectOption
                  v-for="t in PERSONNEL_INSURANCE_TYPES"
                  :key="t"
                  :value="t"
                >{{ t }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保单号">
              <Input v-model:value="personForm.policyNo" placeholder="请输入保单号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保费">
              <InputNumber v-model:value="personForm.premium" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保额">
              <InputNumber v-model:value="personForm.coverageAmount" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保险起期">
              <DatePicker v-model:value="personForm.startDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保险到期">
              <DatePicker v-model:value="personForm.expireDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注">
              <Input.TextArea v-model:value="personForm.remark" :rows="2" placeholder="请输入备注" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Modal
      v-model:open="renewalModalVisible"
      title="续保操作"
      :confirm-loading="renewalLoading"
      width="500px"
      @ok="handleRenewalConfirm"
      @cancel="renewalModalVisible = false"
    >
      <Form layout="vertical">
        <FormItem label="新到期日期" required>
          <DatePicker v-model:value="renewalForm.policyEndDate" style="width: 100%" />
        </FormItem>
        <FormItem label="保险起期">
          <DatePicker v-model:value="renewalForm.policyStartDate" style="width: 100%" />
        </FormItem>
        <FormItem label="保费">
          <InputNumber v-model:value="renewalForm.premium" style="width: 100%" :min="0" />
        </FormItem>
        <FormItem label="续保备注">
          <Input.TextArea v-model:value="renewalForm.remark" :rows="3" placeholder="请输入备注..." />
        </FormItem>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="人员保险详情" width="720px">
      <template v-if="currentDetail">
        <Tabs v-model:activeKey="detailActiveTab">
          <Tabs.TabPane key="info" tab="基本信息">
            <div class="sync-row" v-if="currentDetail">
              <Tag :color="getSyncStatusColor((currentDetail as any).syncStatus)">
                {{ getSyncStatusText((currentDetail as any).syncStatus) }}
              </Tag>
              <Button size="small" :loading="syncLoading" @click="handleSyncDetail">
                <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
                同步花名册信息
              </Button>
            </div>
            <Descriptions :column="1" bordered size="small">
              <DescriptionsItem label="姓名">{{ currentDetail.personName }}</DescriptionsItem>
              <DescriptionsItem label="身份证号">{{ maskIdCard(currentDetail.idCard) }}</DescriptionsItem>
              <DescriptionsItem label="部门">{{ currentDetail.department || '-' }}</DescriptionsItem>
              <DescriptionsItem label="岗位">{{ currentDetail.position || '-' }}</DescriptionsItem>
            </Descriptions>
            <!-- 雇主险 -->
            <div class="ins-type-section">
              <div class="ins-type-title">雇主险</div>
              <Descriptions :column="1" bordered size="small">
                <DescriptionsItem label="参保状态">
                  <Tag :color="getInsuranceStatusColor(currentDetail.employer.status)">
                    {{ getInsuranceStatusText(currentDetail.employer.status) }}
                  </Tag>
                </DescriptionsItem>
                <DescriptionsItem label="保单号">{{ currentDetail.employer.policyNo || '-' }}</DescriptionsItem>
                <DescriptionsItem label="生效日期">{{ currentDetail.employer.startDate ? formatDate(currentDetail.employer.startDate) : '-' }}</DescriptionsItem>
                <DescriptionsItem label="到期日期">{{ currentDetail.employer.expireDate ? formatDate(currentDetail.employer.expireDate) : '-' }}</DescriptionsItem>
                <DescriptionsItem label="保费">{{ currentDetail.employer.premium || 0 }} 元</DescriptionsItem>
              </Descriptions>
            </div>
            <!-- 工伤险 -->
            <div class="ins-type-section">
              <div class="ins-type-title">工伤险</div>
              <Descriptions :column="1" bordered size="small">
                <DescriptionsItem label="参保状态">
                  <Tag :color="getInsuranceStatusColor(currentDetail.injury.status)">
                    {{ getInsuranceStatusText(currentDetail.injury.status) }}
                  </Tag>
                </DescriptionsItem>
                <DescriptionsItem label="保单号">{{ currentDetail.injury.policyNo || '-' }}</DescriptionsItem>
                <DescriptionsItem label="生效日期">{{ currentDetail.injury.startDate ? formatDate(currentDetail.injury.startDate) : '-' }}</DescriptionsItem>
                <DescriptionsItem label="到期日期">{{ currentDetail.injury.expireDate ? formatDate(currentDetail.injury.expireDate) : '-' }}</DescriptionsItem>
                <DescriptionsItem label="保费">{{ currentDetail.injury.premium || 0 }} 元</DescriptionsItem>
              </Descriptions>
            </div>
          </Tabs.TabPane>

          <Tabs.TabPane key="attachments" tab="附件列表">
            <div class="attachment-upload">
              <Upload
                :show-upload-list="false"
                :before-upload="handleBeforeUploadAttachment"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              >
                <Button type="primary" size="small">
                  <template #icon><IconifyIcon icon="lucide:upload" /></template>
                  上传附件
                </Button>
              </Upload>
              <span class="upload-tip">支持 PDF/Word/Excel/图片，单文件不超过 10MB</span>
            </div>
            <Table
              :columns="attachmentColumns"
              :data-source="attachmentList"
              :loading="attachmentLoading"
              size="small"
              :pagination="false"
              row-key="id"
              class="mt-4"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'originalName'">
                  <a @click="handleDownloadAttachment(record as any)" class="link-text">
                    {{ record.originalName }}
                  </a>
                </template>
                <template v-else-if="column.key === 'fileSize'">
                  {{ formatFileSize(record.fileSize) }}
                </template>
                <template v-else-if="column.key === 'version'">
                  <Tag color="blue" v-if="record.isLatest">v{{ record.version }} (最新)</Tag>
                  <Tag v-else>v{{ record.version }}</Tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <Space>
                    <Button type="link" size="small" @click="handleDownloadAttachment(record as any)">下载</Button>
                    <Popconfirm title="确定删除该附件？" ok-type="danger" @confirm="handleDeleteAttachment(record as any)">
                      <Button type="link" size="small" danger>删除</Button>
                    </Popconfirm>
                  </Space>
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane key="versions" tab="历史版本">
            <Table
              :columns="versionColumns"
              :data-source="versionList"
              :loading="versionLoading"
              size="small"
              :pagination="false"
              row-key="id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'changeType'">
                  <Tag :color="getChangeTypeColor(record.changeType)">
                    {{ getChangeTypeText(record.changeType) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'createdAt'">
                  {{ formatDateTime(record.createdAt) }}
                </template>
              </template>
            </Table>
          </Tabs.TabPane>
        </Tabs>
      </template>
    </Drawer>

    <!-- 保单管理：居中悬浮菜单（替代原 Dropdown 二级菜单） -->
    <Modal
      v-model:open="policyManageVisible"
      title="保单管理"
      width="880px"
      :footer="null"
      :bodyStyle="{ paddingTop: '12px' }"
      @cancel="policyManageVisible = false"
    >
      <div class="policy-modal">
        <div class="policy-modal-head">
          <Alert
            type="info"
            message="保单主文档管理：上传 PDF 保单文件后，可在线预览、编辑保单号/年份，或删除。"
            show-icon
          />
          <Button type="primary" @click="openPolicyImport">
            <template #icon><IconifyIcon icon="lucide:file-up" /></template>
            导入保单
          </Button>
        </div>
        <Table
          :columns="policyTableColumns"
          :data-source="policyList"
          :loading="policyLoading"
          :pagination="false"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'type'">
              <Tag :color="record.type === '工伤保险' ? 'green' : 'blue'">{{ record.type }}</Tag>
            </template>
            <template v-else-if="column.key === 'policyNo'">
              {{ record.policyNo || '-' }}
            </template>
            <template v-else-if="column.key === 'year'">
              {{ record.year || '-' }}
            </template>
            <template v-else-if="column.key === 'view'">
              <Button type="link" size="small" @click="openPolicy(record)">查看</Button>
            </template>
            <template v-else-if="column.key === 'edit'">
              <Button type="link" size="small" @click="openPolicyEdit(record)">编辑</Button>
            </template>
            <template v-else-if="column.key === 'delete'">
              <Popconfirm title="确定删除该保单？" ok-type="danger" @confirm="handlePolicyDelete(record)">
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </template>
          </template>
          <template #emptyText>
            <div class="policy-empty-text">
              <span>暂无保单，请先</span>
              <Button type="link" size="small" @click="openPolicyImport">导入保单</Button>
            </div>
          </template>
        </Table>
      </div>
    </Modal>

    <!-- 保单管理：导入 / 编辑保单弹窗（editingPolicy 非空时进入编辑模式） -->
    <Modal
      v-model:open="policyImportVisible"
      :title="editingPolicy ? '编辑保单' : '导入保单'"
      :ok-text="editingPolicy ? '保存' : '导入'"
      width="520px"
      :confirm-loading="policyImportLoading"
      @ok="handlePolicyImportOk"
      @cancel="handlePolicyImportCancel"
    >
      <Form layout="vertical">
        <Alert
          v-if="!editingPolicy"
          type="info"
          message="上传 PDF 保单文件，导入后在「保单管理」菜单中点击即可在线预览。"
          style="margin-bottom: 16px"
        />
        <FormItem label="保单名称" required>
          <Input v-model:value="policyForm.name" placeholder="如：2026年度雇主责任险保单" />
        </FormItem>
        <FormItem label="保险类型" required>
          <Select v-model:value="policyForm.type" style="width: 100%">
            <!-- 任务5（提示词10）：保单管理导入/编辑弹窗与人员记录新增/编辑共享生产常量 PERSONNEL_INSURANCE_TYPES，禁止硬编码双险 option -->
            <SelectOption v-for="t in PERSONNEL_INSURANCE_TYPES" :key="t" :value="t">{{ t }}</SelectOption>
          </Select>
        </FormItem>
        <Row :gutter="16">
          <Col :span="14">
            <FormItem label="保单号">
              <Input v-model:value="policyForm.policyNo" placeholder="如：PICC-2026-XXXX" />
            </FormItem>
          </Col>
          <Col :span="10">
            <FormItem label="保险年份">
              <Input v-model:value="policyForm.year" placeholder="如：2026" />
            </FormItem>
          </Col>
        </Row>
        <FormItem v-if="!editingPolicy" label="保单文件 (PDF)">
          <Upload
            :file-list="policyFileList"
            :before-upload="handlePolicyBeforeUpload"
            :show-upload-list="true"
            accept=".pdf"
            :max-count="1"
          >
            <Button>
              <template #icon><IconifyIcon icon="lucide:upload" /></template>
              选择 PDF 文件
            </Button>
          </Upload>
          <span class="upload-tip">仅支持 PDF，单文件不超过 10MB</span>
        </FormItem>
      </Form>
    </Modal>

    <!-- 保单管理：直接新窗口打开（用浏览器原生 PDF viewer 完整渲染，无 iframe 适配问题） -->
  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, nextTick, computed, h } from 'vue';
import { Alert, Button, Card, Col, DatePicker, Descriptions, DescriptionsItem, Drawer, Form, FormItem, Input, InputNumber, Modal, Popconfirm, Row, Select, SelectOption, Skeleton, Space, Table, Tabs, Tag, Upload, message } from 'ant-design-vue'; // [Vben官方] 显式按需导入 antd 组件，参考 apps/web-antd/src/views/demos/antd/index.vue
import { IconifyIcon } from '@vben/icons'; // [Vben官方] 图标改用 IconifyIcon(icon prop)，参考 @vben/icons 与 layouts/basic.vue
import dayjs, { type Dayjs } from 'dayjs';
import { $t } from '#/locales';

import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import DynamicStatusFilter from '#/components/hse/DynamicStatusFilter.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';

import {
  getPersonnelList,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
  getPolicyStats,
  getPersonnelDepartments,
  syncPersonnelFromRoster,
  getInsuranceAttachments,
  uploadInsuranceAttachment,
  deleteInsuranceAttachment,
  getInsuranceVersions,
  exportPersonnelInsurance,
  getPolicyDocuments,
  importPolicyPdf,
  deletePolicy,
  updatePolicy,
  getPolicyFile,
  PERSONNEL_INSURANCE_TYPES,
  type InsuranceApi,
  type InsuranceAttachment,
  type InsuranceVersionRecord,
} from '#/api/hse/insurance';
// 任务7：险种状态显示映射统一来自共享生产模块（页面列/详情按 status 显示）
import { getInsuranceStatusColor, getInsuranceStatusText } from '#/api/hse/personnel-status';

const loading = ref(false);
const statsLoading = ref(false);
const personnelList = ref<InsuranceApi.PersonnelItemPivoted[]>([]);
const total = ref(0);
const policyStats = ref<InsuranceApi.PolicyStats | null>(null);

const departmentOptions = ref<string[]>([]);
const deptLoading = ref(false);

const searchForm = reactive({
  keyword: '',
  department: undefined as string | undefined,
  insuranceStatus: undefined as string | undefined,
  complianceStatus: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const selectedRowKeys = ref<number[]>([]);

const personModalVisible = ref(false);
const personModalLoading = ref(false);
const editingPerson = ref<InsuranceApi.PersonnelItem | null>(null);
// 编辑时展示已锁定人员的姓名（不参与写入）
const selectedPersonName = ref('');
// 任务7：新增时通过 EmployeeSelector @change 只读展示所选人员姓名/部门/岗位
const selectedPersonDept = ref('');
const selectedPersonPos = ref('');
const personForm = reactive({
  // 任务1/2：人员主数据稳定 ID；姓名/部门/岗位由服务端从花名册解析，客户端不手工填写
  employeeId: undefined as number | undefined,
  insuranceType: '雇主责任险',
  coverageAmount: undefined as number | undefined,
  premium: undefined as number | undefined,
  startDate: undefined as Dayjs | undefined,
  expireDate: undefined as Dayjs | undefined,
  isCurrent: true,
  policyNo: '',
  remark: '',
});

const renewalModalVisible = ref(false);
const renewalLoading = ref(false);
const syncLoading = ref(false);
const renewalPerson = ref<InsuranceApi.PersonnelItem | null>(null);
const renewalForm = reactive({
  policyStartDate: undefined as Dayjs | undefined,
  policyEndDate: undefined as Dayjs | undefined,
  premium: undefined as number | undefined,
  remark: '',
});

// 详情 Drawer 相关
const detailDrawerVisible = ref(false);
const detailActiveTab = ref('info');
const currentDetail = ref<InsuranceApi.PersonnelItemPivoted | null>(null);

// 附件相关
const attachmentList = ref<InsuranceAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentColumns = ref([
  { title: '文件名', key: 'originalName', dataIndex: 'originalName' },
  { title: '版本', key: 'version', width: 140, align: 'center' as const },
  { title: '大小', key: 'fileSize', width: 100, align: 'center' as const },
  { title: '上传人', key: 'uploadedBy', dataIndex: 'uploadedBy', width: 100 },
  { title: '操作', key: 'action', width: 120, align: 'center' as const },
]);

// 版本履历相关
const versionList = ref<InsuranceVersionRecord[]>([]);
const versionLoading = ref(false);
const versionColumns = ref([
  { title: '版本号', key: 'version', dataIndex: 'version', width: 100 },
  { title: '变更类型', key: 'changeType', width: 100, align: 'center' as const },
  { title: '变更说明', key: 'changeSummary', dataIndex: 'changeSummary' },
  { title: '操作人', key: 'changedBy', dataIndex: 'changedBy', width: 100 },
  { title: '变更时间', key: 'createdAt', width: 170 },
]);

// 保额展示：800000 → "80万" / 100000 → "10万" / 850000 → "85万" / 125000 → "12.5万"；<1万 显示原数字
function formatCoverageAmount(v: number | undefined | null): string {
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0) return '';
  if (num >= 10000) {
    const wan = num / 10000;
    const text = Number.isInteger(wan) ? String(wan) : String(Math.round(wan * 10) / 10);
    return `${text}万`;
  }
  return String(num);
}

// 日期解析降级：后端旧数据可能返回破损日期（如 "Fri May 01"，node-pg Date 被 String 化）；
// dayjs 解析为 Invalid Date 后 format 出 "Invalid Date" 字符串，回传后端会触发 schema 400。
// 解析失败一律置空（undefined → 提交时转 null，后端 dateString 允许 null/''）。
function safeDayjs(v: string | null | undefined): Dayjs | undefined {
  if (!v) return undefined;
  const d = dayjs(v);
  return d.isValid() ? d : undefined;
}

const originalColumns = ref([
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: '姓名', key: 'personName', width: 100, customRender: ({ record }: any) => record?.personName || record?.name || '-' },
  { title: '身份证号', dataIndex: 'idCard', key: 'idCard', width: 170 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 120 },
  { title: '岗位', dataIndex: 'position', key: 'position', width: 120 },
  // 雇主险列：当前有效（insured/expiring）→ 显示保额（80万/10万）；已过期 → "已过期"；无投保 → "未参保"
  { title: '雇主险', key: 'employerStatus', width: 110, customRender: ({ record }: any) => {
    const em = record?.employer || {};
    const st = em.status || 'uninsured';
    if (st === 'insured' || st === 'expiring') {
      const txt = formatCoverageAmount(em.coverage);
      return h('span', { class: 'font-medium text-green-600' }, txt || '已参保');
    }
    if (st === 'expired') return h(Tag, { color: getInsuranceStatusColor(st) }, () => '已过期');
    return h('span', { class: 'text-muted-foreground' }, '未参保');
  }},
  // 工伤险列：按月缴纳、无日期概念——存在工伤保险记录（身份证匹配花名册）即"已参保"，否则"未参保"
  { title: '工伤险', key: 'injuryStatus', width: 100, customRender: ({ record }: any) => {
    const hasInj = record?.injury?.recordExists === true;
    if (hasInj) return h(Tag, { color: 'green' }, () => '已参保');
    return h(Tag, { color: 'default' }, () => '未参保');
  }},
  { title: '保险状态', key: 'complianceStatus', width: 100, customRender: ({ record }: any) => {
    const st = record?.complianceStatus;
    if (st === 'compliant') return h(Tag, { color: 'green' }, () => '合规');
    if (st === 'noncompliant') return h(Tag, { color: 'red' }, () => '不合规');
    return h(Tag, { color: 'default' }, () => '—');
  }},
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'insurance-personnel');
const tableRef = ref<any>(null);

const statItems = computed(() => {
  const stats = policyStats.value;
  if (!stats) {
    return [
      { key: 'total', label: '人员总数', value: total.value, icon: 'lucide:users', color: 'blue' },
      { key: 'insured', label: '已参保', value: 0, icon: 'lucide:shield-check', color: 'green' },
      { key: 'noncompliant', label: '不合规', value: 0, icon: 'lucide:alert-octagon', color: 'red' },
      { key: 'expired', label: '已过期', value: 0, icon: 'lucide:alert-circle', color: 'orange' },
    ];
  }
  return [
    { key: 'total', label: '人员总数', value: stats.total || total.value, icon: 'lucide:users', color: 'blue' },
    { key: 'insured', label: '已参保', value: stats.active, icon: 'lucide:shield-check', color: 'green' },
    { key: 'noncompliant', label: '不合规', value: stats.noncompliant ?? 0, icon: 'lucide:alert-octagon', color: 'red' },
    { key: 'expired', label: '已过期', value: stats.expired, icon: 'lucide:alert-circle', color: 'orange' },
  ];
});
const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([
  { key: 'import', label: '导入数据' },
  { key: 'export', label: '导出报表' },
  { key: 'create', label: '新增人员' },
]);

const { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'insurance-personnel',
  statItems: visibilityStatItems,
  actionButtons,
});

const hasVisibleStats = computed(() => statItems.value.some((s) => isStatVisible.value(s.key)));

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

function maskIdCard(idCard?: string): string {
  if (!idCard) return '-';
  // 花名册身份证号加密存储（ENC: 前缀），不展示原始值
  if (idCard.startsWith('ENC:')) return '已加密';
  if (idCard.length < 8) return idCard;
  return idCard.substring(0, 4) + '**********' + idCard.substring(idCard.length - 4);
}

function getSyncStatusColor(status?: string): string {
  const map: Record<string, string> = {
    synced: 'green',
    unsynced: 'orange',
    missing: 'red',
  };
  return map[status || ''] || 'default';
}

function getSyncStatusText(status?: string): string {
  const map: Record<string, string> = {
    synced: '已同步',
    unsynced: '待同步',
    missing: '花名册缺失',
  };
  return map[status || ''] || '未知';
}

async function fetchData() {
  loading.value = true;
  try {
    const params: InsuranceApi.PersonnelListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      department: searchForm.department,
      insuranceStatus: searchForm.insuranceStatus,
      complianceStatus: searchForm.complianceStatus,
    };

    const res = await getPersonnelList(params);
    personnelList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取人员列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.personnel') }));
    personnelList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getPolicyStats();
    policyStats.value = res;
  } catch (err) {
    console.warn('获取统计失败:', err);
    message.error($t('hse.message.fetchStatsFailed'));
    policyStats.value = {
      total: 80,
      active: 65,
      expiring30d: 10,
      expired: 5,
      highRisk: 28,
      byType: {},
      byDepartment: {},
    };
  } finally {
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.department = undefined;
  searchForm.insuranceStatus = undefined;
  searchForm.complianceStatus = undefined;
  pagination.page = 1;
  fetchData();
}

// 统计卡片点击联动：根据卡片类型自动设置保险状态筛选并刷新
function handleStatClick(key: string) {
  searchForm.keyword = '';
  searchForm.department = undefined;
  searchForm.insuranceStatus = undefined;
  searchForm.complianceStatus = undefined;
  switch (key) {
    case 'insured':
      searchForm.insuranceStatus = 'insured';
      break;
    case 'noncompliant':
      // 联动"保险状态"筛选器（DynamicStatusFilter v-model=searchForm.complianceStatus 自动选中"不合规"）
      searchForm.complianceStatus = 'noncompliant';
      break;
    case 'expired':
      searchForm.insuranceStatus = 'expired';
      break;
    // 'total' 无需额外筛选，显示全部人员
  }
  pagination.page = 1;
  fetchData();
}

// 从后端获取实际存在的部门列表，动态填充部门筛选下拉
async function fetchDepartments() {
  deptLoading.value = true;
  try {
    const res = await getPersonnelDepartments();
    departmentOptions.value = res.departments || [];
  } catch (err) {
    console.warn('获取部门列表失败:', err);
    departmentOptions.value = [];
  } finally {
    deptLoading.value = false;
  }
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function onSelectionChange(keys: number[]) {
  selectedRowKeys.value = keys;
}

/** 任务7：EmployeeSelector @change 只读展示所选人员姓名/部门/岗位（不参与写入） */
function handleEmployeeChange(item: any) {
  if (item && item.employee_id) {
    selectedPersonName.value = item.name || '';
    selectedPersonDept.value = item.org_name || '';
    selectedPersonPos.value = item.position_name || '';
  } else {
    selectedPersonName.value = '';
    selectedPersonDept.value = '';
    selectedPersonPos.value = '';
  }
}

function handleCreate() {
  editingPerson.value = null;
  selectedPersonName.value = '';
  selectedPersonDept.value = '';
  selectedPersonPos.value = '';
  Object.assign(personForm, {
    employeeId: undefined,
    insuranceType: '雇主责任险',
    coverageAmount: undefined,
    premium: undefined,
    startDate: undefined,
    expireDate: undefined,
    isCurrent: true,
    policyNo: '',
    remark: '',
  });
  personModalVisible.value = true;
}

function handleEdit(record: InsuranceApi.PersonnelItemPivoted, insType?: 'employer' | 'injury') {
  const info = insType === 'injury' ? record.injury : record.employer;
  // 任务7：有记录 ID（历史/停用/未来均可编辑）才进入编辑；参保显示与可编辑性分离
  if (!info?.id) {
    message.warning('该险种无记录可编辑');
    return;
  }
  editingPerson.value = { id: info.id } as any;
  selectedPersonName.value = record.personName || '';
  selectedPersonDept.value = record.department || '';
  selectedPersonPos.value = record.position || '';
  Object.assign(personForm, {
    // 编辑锁定所属人员（默认不可换人）；employeeId 仅展示
    employeeId: record.employeeId ?? undefined,
    insuranceType: insType === 'injury' ? '工伤保险' : '雇主责任险',
    coverageAmount: info.coverage,
    premium: info.premium,
    startDate: safeDayjs(info.startDate),
    expireDate: safeDayjs(info.expireDate),
    // 任务7：从真实 isCurrent 回显（禁止用 hasInsurance 反推，避免停用保单被意外激活）
    isCurrent: info.isCurrent,
    policyNo: info.policyNo || '',
    remark: '',
  });
  personModalVisible.value = true;
}

async function handleSavePerson() {
  // 任务1/2：新增必须携带合法 employeeId；姓名/身份证不再作为写入字段
  if (!personForm.employeeId) {
    message.warning('请选择人员');
    return;
  }
  personModalLoading.value = true;
  try {
    const payload = {
      employeeId: personForm.employeeId,
      insuranceType: personForm.insuranceType,
      coverageAmount: personForm.coverageAmount,
      premium: personForm.premium,
      startDate: personForm.startDate?.format('YYYY-MM-DD') ?? null,
      expireDate: personForm.expireDate?.format('YYYY-MM-DD') ?? null,
      isCurrent: personForm.isCurrent,
      policyNo: personForm.policyNo || '',
      remark: personForm.remark || '',
    };
    if (editingPerson.value) {
      // 编辑：不发送 employeeId → 不修改关联人（锁定）
      const { employeeId: _omit, ...updatePayload } = payload;
      await updatePersonnel(editingPerson.value.id, updatePayload);
      message.success('更新成功');
    } else {
      await createPersonnel(payload);
      message.success('创建成功');
    }
    personModalVisible.value = false;
    fetchData();
    fetchStats();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
    personModalVisible.value = false;
    fetchData();
  } finally {
    personModalLoading.value = false;
  }
}

async function handleDelete(record: InsuranceApi.PersonnelItemPivoted) {
  try {
    // 透视数据一行可能对应两张子表记录，分别删除
    const ids: number[] = [];
    if (record.employer.id) ids.push(record.employer.id);
    if (record.injury.id) ids.push(record.injury.id);
    if (!ids.length) { message.warning('无记录可删除'); return; }
    // 逐条删除（按现有 API）
    for (const id of ids) {
      await deletePersonnel(id);
    }
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
    fetchData();
  }
}

function handleRenewal(record: InsuranceApi.PersonnelItemPivoted) {
  renewalPerson.value = { id: record.employer.id || 0, premium: record.employer.premium } as any;
  renewalForm.policyStartDate = dayjs();
  renewalForm.policyEndDate = dayjs().add(1, 'year');
  renewalForm.premium = record.employer.premium;
  renewalForm.remark = '';
  renewalModalVisible.value = true;
}

async function handleRenewalConfirm() {
  if (!renewalForm.policyEndDate) {
    message.warning('请选择新到期日期');
    return;
  }
  if (!renewalPerson.value) return;
  renewalLoading.value = true;
  try {
    const data = {
      startDate: renewalForm.policyStartDate?.format('YYYY-MM-DD') ?? null,
      expireDate: renewalForm.policyEndDate.format('YYYY-MM-DD'),
      premium: renewalForm.premium,
      remark: renewalForm.remark,
    };
    await updatePersonnel(renewalPerson.value.id, {
      startDate: data.startDate,
      expireDate: data.expireDate,
      premium: data.premium,
      remark: data.remark,
    });
    message.success('续保成功');
    renewalModalVisible.value = false;
    fetchData();
    fetchStats();
  } catch (err: any) {
    console.warn('续保失败:', err);
    message.error(`续保失败: ${err?.message || '未知错误'}`);
    renewalModalVisible.value = false;
    fetchData();
  } finally {
    renewalLoading.value = false;
  }
}

// ========== 同步花名册（C6 批量 / C7 单条 提示词-143；任务5：使用 employeeId） ==========
async function handleSyncSelected() {
  if (selectedRowKeys.value.length === 0) return;
  syncLoading.value = true;
  try {
    // 批量同步：使用选中行的人员主数据 ID（employeeId），rowKey 即 employee:${employeeId}
    const employeeIds = selectedRowKeys.value
      .map((k: number) => {
        const m = /^employee:(\d+)$/.exec(String(k));
        return m ? Number(m[1]) : null;
      })
      .filter((v: number | null): v is number => v != null && v > 0);
    if (employeeIds.length === 0) {
      message.warning('未选中有效人员（需员工主数据 ID）');
      return;
    }
    const res = await syncPersonnelFromRoster(employeeIds);
    if (res.failed && res.failed.length > 0) {
      message.warning(`同步完成：成功 ${res.synced} 人，失败 ${res.failed.length} 人`);
    } else {
      message.success(`成功同步 ${res.synced} 人`);
    }
    selectedRowKeys.value = [];
    fetchData();
  } catch (err: any) {
    console.warn('同步失败:', err);
    message.error(`同步失败: ${err?.message || '未知错误'}`);
  } finally {
    syncLoading.value = false;
  }
}

async function handleSyncDetail() {
  if (!currentDetail.value) return;
  syncLoading.value = true;
  try {
    // 详情同步：使用当前人员的 employeeId（不再取 employer.id / injury.id）
    const empId = currentDetail.value.employeeId;
    if (!empId) { message.warning('当前人员缺少员工主数据 ID，无法同步'); return; }
    const res = await syncPersonnelFromRoster([empId]);
    if (res.synced > 0) {
      message.success('已同步花名册最新信息');
      const rk = currentDetail.value.rowKey;
      const updated = personnelList.value.find((r) => r.rowKey === rk);
      if (updated) currentDetail.value = updated;
      fetchData();
    } else {
      message.warning((res.errors && res.errors[0]) || '未找到花名册匹配，同步跳过');
    }
  } catch (err: any) {
    console.warn('同步失败:', err);
    message.error(`同步失败: ${err?.message || '未知错误'}`);
  } finally {
    syncLoading.value = false;
  }
}

// ========== 详情 Drawer ==========
function handleViewDetail(record: InsuranceApi.PersonnelItemPivoted) {
  currentDetail.value = record;
  detailActiveTab.value = 'info';
  detailDrawerVisible.value = true;
  nextTick(() => {
    // 挂附件/版本履历到雇主险记录上（如有）
    if (record.employer.id) {
      fetchAttachments(record.employer.id);
      fetchVersions(record.employer.id);
    }
  });
}

async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getInsuranceAttachments('personnel', id);
    attachmentList.value = res || [];
  } catch (err) {
    console.warn('获取附件列表失败:', err);
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getInsuranceVersions('personnel', id);
    versionList.value = res || [];
  } catch (err) {
    console.warn('获取版本履历失败:', err);
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

function handleBeforeUploadAttachment(file: File) {
  const isLt10M = file.size / 1024 / 1024 < 10;
  if (!isLt10M) {
    message.error('文件大小不能超过 10MB');
    return false;
  }
  if (!currentDetail.value) return false;
  const detailId = currentDetail.value.employer.id || currentDetail.value.injury.id || 0;
  uploadInsuranceAttachment('personnel', detailId, file, { uploadedBy: 'admin' })
    .then(() => {
      message.success('上传成功');
      if (currentDetail.value) fetchAttachments(detailId);
    })
    .catch((err) => {
      console.warn('上传失败:', err);
      message.error('上传失败');
    });
  return false;
}

function handleDownloadAttachment(record: InsuranceAttachment) {
  if (record.fileUrl) {
    window.open(record.fileUrl, '_blank');
  }
}

async function handleDeleteAttachment(record: InsuranceAttachment) {
  if (!currentDetail.value) return;
  const detailId = currentDetail.value.employer.id || currentDetail.value.injury.id || 0;
  try {
    await deleteInsuranceAttachment('personnel', detailId, record.id);
    message.success('删除成功');
    fetchAttachments(detailId);
  } catch (err) {
    console.warn('删除附件失败:', err);
    message.error('删除失败');
  }
}

// ========== 版本变更类型辅助函数 ==========
function getChangeTypeColor(type: string): string {
  switch (type) {
    case 'create':
      return 'green';
    case 'update':
      return 'blue';
    case 'import':
      return 'cyan';
    case 'revise':
      return 'orange';
    case 'delete':
      return 'red';
    default:
      return 'default';
  }
}

function getChangeTypeText(type: string): string {
  switch (type) {
    case 'create':
      return '新增';
    case 'update':
      return '更新';
    case 'import':
      return '导入';
    case 'revise':
      return '修订';
    case 'delete':
      return '删除';
    default:
      return type;
  }
}

// ========== 文件大小格式化 ==========
function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ========== 日期时间格式化 ==========
function formatDateTime(date: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

// ========== 导出报表 ==========
async function handleExport() {
  try {
    const blob = await exportPersonnelInsurance();
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `人员保险清单_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出失败:', err);
    message.error('导出失败');
  }
}

// ========== 保单管理（雇主险 / 工伤险 主保单文档） ==========
const policyList = ref<any[]>([]);
const policyManageVisible = ref(false);
const policyLoading = ref(false);
const policyImportVisible = ref(false);
const policyImportLoading = ref(false);
const policyFile = ref<File | null>(null);
const policyFileList = ref<any[]>([]);
/** 编辑模式：非空时为正在编辑的保单记录 */
const editingPolicy = ref<any>(null);
const policyForm = reactive({
  name: '',
  type: '雇主责任险',
  policyNo: '',
  year: '',
});

/** 保单管理浮窗表格列 */
const policyTableColumns = [
  { title: '保险类型', key: 'type', dataIndex: 'type', width: 120 },
  { title: '保单号',   key: 'policyNo', dataIndex: 'policyNo', width: 220 },
  { title: '保险年份', key: 'year', dataIndex: 'year', width: 100 },
  { title: '查看文档', key: 'view', width: 100 },
  { title: '编辑',     key: 'edit', width: 80 },
  { title: '删除',     key: 'delete', width: 80 },
];

async function fetchPolicies() {
  policyLoading.value = true;
  try {
    const res = await getPolicyDocuments();
    policyList.value = res.list || [];
  } catch (err) {
    console.warn('获取保单列表失败:', err);
    policyList.value = [];
  } finally {
    policyLoading.value = false;
  }
}

function openPolicyImport() {
  editingPolicy.value = null;
  policyForm.name = '';
  policyForm.type = '雇主责任险';
  policyForm.policyNo = '';
  policyForm.year = '';
  policyImportVisible.value = true;
}

/** 打开编辑弹窗：填充已有保单信息 */
function openPolicyEdit(p: any) {
  editingPolicy.value = p;
  policyForm.name = p.name || '';
  policyForm.type = p.type || '雇主责任险';
  policyForm.policyNo = p.policyNo || '';
  policyForm.year = p.year || '';
  policyFile.value = null;
  policyFileList.value = [];
  policyImportVisible.value = true;
}

function handlePolicyBeforeUpload(file: any) {
  const rawFile: File = (file.originFileObj || file) as File;
  const isPdf = rawFile.type === 'application/pdf' || /\.pdf$/i.test(rawFile.name || '');
  if (!isPdf) {
    message.error('仅支持 PDF 文件');
    return false;
  }
  if (rawFile.size / 1024 / 1024 > 10) {
    message.error('文件大小不能超过 10MB');
    return false;
  }
  policyFile.value = rawFile;
  policyFileList.value = [file];
  if (!policyForm.name) {
    policyForm.name = (rawFile.name || '').replace(/\.pdf$/i, '');
  }
  return false;
}

async function handlePolicyImportOk() {
  if (!policyForm.name.trim()) {
    message.warning('请填写保单名称');
    return;
  }
  policyImportLoading.value = true;
  try {
    if (editingPolicy.value) {
      // 编辑模式：更新保单元信息（保单号/年份/名称/类型）
      await updatePolicy(editingPolicy.value.id, {
        name: policyForm.name.trim(),
        type: policyForm.type,
        policyNo: policyForm.policyNo.trim(),
        year: policyForm.year.trim(),
      });
      message.success('更新成功');
    } else {
      if (!policyFile.value) {
        message.warning('请先选择 PDF 文件');
        return;
      }
      await importPolicyPdf(policyFile.value, {
        name: policyForm.name.trim(),
        type: policyForm.type,
        policyNo: policyForm.policyNo.trim(),
        year: policyForm.year.trim(),
      });
      message.success('导入成功');
    }
    policyImportVisible.value = false;
    editingPolicy.value = null;
    policyFile.value = null;
    policyFileList.value = [];
    policyForm.name = '';
    policyForm.policyNo = '';
    policyForm.year = '';
    fetchPolicies();
  } catch (err: any) {
    console.warn('保单操作失败:', err);
    message.error(err?.message || '操作失败');
  } finally {
    policyImportLoading.value = false;
  }
}

function handlePolicyImportCancel() {
  policyImportVisible.value = false;
  editingPolicy.value = null;
  policyFile.value = null;
  policyFileList.value = [];
  policyForm.name = '';
  policyForm.policyNo = '';
  policyForm.year = '';
}

/** 删除保单 */
async function handlePolicyDelete(p: any) {
  try {
    await deletePolicy(p.id);
    message.success('删除成功');
    fetchPolicies();
  } catch (err: any) {
    console.warn('保单删除失败:', err);
    message.error(err?.message || '删除失败');
  }
}

// ========== 保单查看：受保护文件接口获取 Blob 后新窗口预览 ==========
// 经 requestClient（Bearer Token）拉取，避免匿名 /uploads/insurance 直链；
// 创建临时 Blob URL 由浏览器原生 PDF viewer 渲染（行为与原先一致）。
async function openPolicy(record: any) {
  if (!record.id) return;
  try {
    // 记录 ID 定位（服务端从记录解析文件名），不再提交物理文件名
    const blob = await getPolicyFile('policies', record.id);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // 延迟释放 Blob URL（新窗口加载完成后浏览器已持有内容）
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err: any) {
    console.warn('保单打开失败:', err);
    message.error(err?.message || '保单打开失败');
  }
}

async function initTableFeatures() {
  await nextTick();
  if (tableRef.value?.$el) {
    initSortable(tableRef.value.$el);
    initResizable(tableRef.value.$el);
  }
}

onMounted(async () => {
  await Promise.all([fetchStats(), fetchData(), fetchDepartments(), fetchPolicies()]);
  await initTableFeatures();
});
</script>

<style scoped lang="scss">
.hse-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: hsl(var(--foreground));
    }

    .header-right {
      display: flex;
      align-items: center;
    }
  }

  .ins-type-tabs {
    margin-bottom: 12px;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .tab-badge {
    margin-left: 8px;
  }

  .sync-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .expiring-soon {
    color: hsl(var(--warning));
    font-weight: 500;
  }

  .muted-text {
    color: hsl(var(--muted-foreground));
  }

  .attachment-upload {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;

    .upload-tip {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
    }
  }

  .link-text {
    color: hsl(var(--primary));
    cursor: pointer;
    &:hover {
      text-decoration: underline;
    }
  }

  .mt-4 {
    margin-top: 16px;
  }
}

.ins-type-section {
  margin-top: 16px;

  .ins-type-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 8px;
    padding-left: 8px;
    border-left: 3px solid var(--primary-color, #1677ff);
  }
}

/* 保单管理浮窗（居中 Modal） */
.policy-modal {
  .policy-modal-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    > :first-child {
      flex: 1;
    }
  }

  .policy-empty-text {
    padding: 8px 0;
    color: var(--color-text-secondary, #6b7280);
  }
}
</style>
