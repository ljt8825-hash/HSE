<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 3" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <SortableStatRow v-else-if="hasVisibleStats" page-key="violations">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key" class="sortable-stat-col" :data-stat-key="stat.key" v-show="isStatVisible(stat.key)">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
          :clickable="true"
          @click="handleStatCardClick(stat.key)"
        />
      </Col>
    </SortableStatRow>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>三违管理</span>
          <Space>
            <HelpButton menuCode="HSE_VIOLATIONS" />
            <Button v-if="isActionVisible('import')" @click="importModalVisible = true">
              <template #icon><IconifyIcon icon="lucide:upload" /></template>
              导入
            </Button>
            <Button v-if="isActionVisible('export')" @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button v-if="isActionVisible('create')" :type="'primary'" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增违章
            </Button>
            <Button v-if="isActionVisible('statistics')" @click="showStatisticsModal = true">
              <template #icon><IconifyIcon icon="lucide:bar-chart-2" /></template>
              统计分析
            </Button>
            <Popconfirm
              v-if="selectedRowKeys.length > 0 && isActionVisible('create')"
              :title="`确定要删除选中的 ${selectedRowKeys.length} 条记录吗？`"
              ok-type="danger"
              @confirm="handleBatchDelete"
            >
              <Button :type="'primary'" danger>
                <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
                批量删除 ({{ selectedRowKeys.length }})
              </Button>
            </Popconfirm>
            <ComponentVisibilitySettings
              title="三违管理显示设置"
              v-model:model-value="config"
              :stat-items="visibilityStatItems"
              :action-buttons="actionButtons"
              @reset="resetToDefault"
            />
          </Space>
        </div>
      </template>

      <Form v-if="isFilterVisible" layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索违章描述/违章人员"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="三违类型">
          <Select
            v-model:value="searchForm.violationType"
            placeholder="全部"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="违章指挥">违章指挥</SelectOption>
            <SelectOption value="违章作业">违章作业</SelectOption>
            <SelectOption value="违反劳动纪律">违反劳动纪律</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="分组名称">
          <Select
            v-model:value="searchForm.areaTeam"
            placeholder="全部"
            allow-clear
            show-search
            option-filter-prop="children"
            @change="handleSearch"
          >
            <SelectOption v-for="item in filterOptions.areaTeams" :key="item" :value="item">{{ item }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="网格等级">
          <Select
            v-model:value="searchForm.gridLevel"
            placeholder="全部"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="item in filterOptions.gridLevels" :key="item" :value="item">{{ item }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="违章日期">
          <RangePicker
            v-model:value="dateRange"
            :placeholder="['开始日期', '结束日期']"
            @change="handleDateChange"
          />
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        ref="tableRef"
        :columns="tableColumns"
        :data-source="dataList"
        :loading="loading"
        :pagination="{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        :row-selection="rowSelection"
        @change="handleTableChange"
        size="middle"
        :scroll="{ x: 1600 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'violationType'">
            <Tag :color="getViolationTypeColor(record.violationType)">
              {{ record.violationType }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'violationLevel'">
            <Tag :color="getViolationLevelColor(record.violationLevel)">
              {{ record.violationLevel }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'riskLevel'">
            <Tag :color="getRiskLevelColor(record.riskLevel)">
              {{ record.riskLevel }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ record.status }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'needRetraining'">
            <Tag v-if="record.needRetraining" color="red">需要复训</Tag>
            <Tag v-else color="green">无需复训</Tag>
          </template>
          <template v-else-if="column.key === 'description'">
            <span class="cell-ellipsis" :title="record.description">{{ record.description }}</span>
          </template>
          <template v-else-if="column.key === 'violationDate'">
            {{ formatDate(record.violationDate) }}
          </template>
          <template v-else-if="column.key === 'uploadTime'">
            {{ formatDateTime(record.uploadTime) }}
          </template>
          <template v-else-if="column.key === 'imageContent' || column.key === 'rectificationPhotos'">
            <span v-if="photoList(record, column.key as any).length === 0" class="muted">无</span>
            <div v-else class="thumb-row">
              <Image
                v-for="(u, i) in photoList(record, column.key as any).slice(0, 4)"
                :key="i"
                :width="38"
                :height="38"
                :src="u"
                :preview="{ src: u }"
                style="border-radius: 4px; object-fit: cover; flex: none"
              />
              <span v-if="photoList(record, column.key as any).length > 4" class="thumb-more">
                +{{ photoList(record, column.key as any).length - 4 }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'reportStatus'">
            <Tag :color="record.reportStatus === '是' ? 'green' : (record.reportStatus === '否' ? 'red' : 'default')">{{ record.reportStatus || '—' }}</Tag>
          </template>
          <template v-else-if="column.key === 'violatorName'">
            <EmployeeName v-if="record.violatorId" :employee-id="record.violatorId" />
            <span v-else>{{ record.violatorName || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button :type="'link'" size="small" @click="handleView(record as any)">查看</Button>
              <Button :type="'link'" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Button v-if="record.status === '待处理' || record.status === '整改中'" :type="'link'" size="small" @click="handleRectify(record as any)">整改</Button>
              <Button v-if="record.status === '待复查'" :type="'link'" size="small" @click="handleReview(record as any)">复查</Button>
              <Popconfirm
                title="确定要删除吗？"
                ok-type="danger"
                @confirm="handleDelete(record as any)"
              >
                <Button :type="'link'" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingViolation ? '编辑违章' : '新增违章'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="violationForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="三违类型" name="violationType" required>
              <Select v-model:value="violationForm.violationType" placeholder="请选择" style="width: 100%">
                <SelectOption value="违章指挥">违章指挥</SelectOption>
                <SelectOption value="违章作业">违章作业</SelectOption>
                <SelectOption value="违反劳动纪律">违反劳动纪律</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="严重程度" name="violationLevel" required>
              <Select v-model:value="violationForm.violationLevel" placeholder="请选择" style="width: 100%">
                <SelectOption value="严重">严重</SelectOption>
                <SelectOption value="一般">一般</SelectOption>
                <SelectOption value="轻微">轻微</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="风险等级" name="riskLevel">
              <Select v-model:value="violationForm.riskLevel" placeholder="请选择" style="width: 100%">
                <SelectOption value="高">高</SelectOption>
                <SelectOption value="中">中</SelectOption>
                <SelectOption value="低">低</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发生时间">
              <TimePicker v-model:value="violationForm.occurTime" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="违章描述" name="description" required>
              <Input.TextArea v-model:value="violationForm.description" :rows="3" placeholder="请输入违章描述" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发生地点" name="location">
              <Input v-model:value="violationForm.location" placeholder="请输入发生地点" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="违章日期" name="violationDate" required>
              <DatePicker v-model:value="violationForm.violationDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="违章人员" name="violatorId">
              <EmployeeSelector v-model:value="violationForm.violatorId" placeholder="选择违章人员" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="违章人身份证号" name="violatorIdCard">
              <Input
                v-model:value="violationForm.violatorIdCard"
                placeholder="可选；未选择人员时用于自动关联"
                :maxlength="18"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="检查人员" name="inspectorId">
              <EmployeeSelector v-model:value="violationForm.inspectorId" placeholder="选择检查人员" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处理人员" name="handlerId">
              <EmployeeSelector v-model:value="violationForm.handlerId" placeholder="选择处理人员" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处罚人员" name="punisherId">
              <EmployeeSelector v-model:value="violationForm.punisherId" placeholder="选择处罚人员" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处罚类型" name="punishmentType">
              <Select v-model:value="violationForm.punishmentType" placeholder="请选择" style="width: 100%">
                <SelectOption value="警告">警告</SelectOption>
                <SelectOption value="罚款">罚款</SelectOption>
                <SelectOption value="记过">记过</SelectOption>
                <SelectOption value="开除">开除</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处罚金额" name="punishmentAmount">
              <InputNumber v-model:value="violationForm.punishmentAmount" placeholder="请输入处罚金额" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="整改措施">
              <Input.TextArea v-model:value="violationForm.rectification" :rows="3" placeholder="请输入整改措施" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="是否需要复训" name="needRetraining">
              <Switch v-model:checked="violationForm.needRetraining" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="状态" name="status">
              <Select v-model:value="violationForm.status" placeholder="请选择" style="width: 100%">
                <SelectOption value="待处理">待处理</SelectOption>
                <SelectOption value="整改中">整改中</SelectOption>
                <SelectOption value="待复查">待复查</SelectOption>
                <SelectOption value="已关闭">已关闭</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Input.TextArea v-model:value="violationForm.remark" :rows="2" placeholder="备注说明" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Modal
      v-model:open="rectifyModalVisible"
      title="整改处理"
      :confirm-loading="rectifyLoading"
      width="560px"
      @ok="handleRectifySave"
      @cancel="rectifyModalVisible = false"
    >
      <Form ref="rectifyFormRef" :model="rectifyForm" :rules="(rectifyFormRules as any)" layout="vertical">
        <FormItem label="处理人员" name="handlerId" required>
          <EmployeeSelector v-model:value="rectifyForm.handlerId" placeholder="选择处理人员" />
        </FormItem>
        <FormItem label="整改措施" name="rectification" required>
          <Input.TextArea v-model:value="rectifyForm.rectification" :rows="4" placeholder="请输入整改措施" />
        </FormItem>
      </Form>
    </Modal>

    <Modal
      v-model:open="reviewModalVisible"
      title="复查确认"
      :confirm-loading="reviewLoading"
      width="560px"
      @ok="handleReviewSave"
      @cancel="reviewModalVisible = false"
    >
      <Form ref="reviewFormRef" :model="reviewForm" :rules="(reviewFormRules as any)" layout="vertical">
        <FormItem label="复查结果" name="reviewResult" required>
          <Select v-model:value="reviewForm.reviewResult" placeholder="请选择" style="width: 100%">
            <SelectOption value="合格">合格</SelectOption>
            <SelectOption value="不合格">不合格</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="复查备注">
          <Input.TextArea v-model:value="reviewForm.remark" :rows="3" placeholder="请输入复查备注" />
        </FormItem>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="违章详情" width="640px">
      <template v-if="currentViolation">
        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem label="三违类型">
            <Tag :color="getViolationTypeColor(currentViolation.violationType)">
              {{ currentViolation.violationType }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="严重程度">
            <Tag :color="getViolationLevelColor(currentViolation.violationLevel)">
              {{ currentViolation.violationLevel }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="风险等级">
            <Tag :color="getRiskLevelColor(currentViolation.riskLevel)">
              {{ currentViolation.riskLevel }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="违章描述">{{ currentViolation.description }}</DescriptionsItem>
          <DescriptionsItem label="发生地点">{{ currentViolation.location || '—' }}</DescriptionsItem>
          <DescriptionsItem label="违章日期">{{ formatDate(currentViolation.violationDate) }}</DescriptionsItem>
          <DescriptionsItem label="发生时间">{{ currentViolation.occurTime || '—' }}</DescriptionsItem>
          <DescriptionsItem label="提交时间">{{ formatDateTime(currentViolation.uploadTime) }}</DescriptionsItem>
          <DescriptionsItem label="昵称">{{ currentViolation.nickname || '—' }}</DescriptionsItem>
          <DescriptionsItem label="分组名称">{{ currentViolation.areaTeam || '—' }}</DescriptionsItem>
          <DescriptionsItem label="姓名（检查人）">{{ currentViolation.inspectorName || '—' }}</DescriptionsItem>
          <DescriptionsItem label="标记">{{ currentViolation.mark || '—' }}</DescriptionsItem>
          <DescriptionsItem label="是否补交">{{ currentViolation.isSupplementary || '—' }}</DescriptionsItem>
          <DescriptionsItem label="当日是否报名">{{ currentViolation.reportStatus || '—' }}</DescriptionsItem>
          <DescriptionsItem label="编号">{{ currentViolation.no || '—' }}</DescriptionsItem>
          <DescriptionsItem label="所属岗位">{{ currentViolation.position || '—' }}</DescriptionsItem>
          <DescriptionsItem label="网格等级">{{ currentViolation.gridLevel || '—' }}</DescriptionsItem>
          <DescriptionsItem label="三违行为">{{ currentViolation.violationBehavior || '—' }}</DescriptionsItem>
          <DescriptionsItem label="三违照片">
            <span v-if="photoList(currentViolation, 'imageContent').length === 0" class="muted">无</span>
            <div v-else class="thumb-row thumb-row--detail">
              <Image
                v-for="(u, i) in photoList(currentViolation, 'imageContent')"
                :key="i"
                :width="92"
                :height="92"
                :src="u"
                :preview="{ src: u }"
                style="border-radius: 6px; object-fit: cover; flex: none"
              />
            </div>
          </DescriptionsItem>
          <DescriptionsItem label="整改后照片">
            <span v-if="photoList(currentViolation, 'rectificationPhotos').length === 0" class="muted">无</span>
            <div v-else class="thumb-row thumb-row--detail">
              <Image
                v-for="(u, i) in photoList(currentViolation, 'rectificationPhotos')"
                :key="i"
                :width="92"
                :height="92"
                :src="u"
                :preview="{ src: u }"
                style="border-radius: 6px; object-fit: cover; flex: none"
              />
            </div>
          </DescriptionsItem>
          <DescriptionsItem label="违章人员">
            <EmployeeName v-if="currentViolation.violatorId" :employee-id="currentViolation.violatorId" />
            <span v-else>{{ currentViolation.violatorName || '—' }}</span>
          </DescriptionsItem>
          <DescriptionsItem label="违章人性别">{{ currentViolation.violatorGender || '—' }}</DescriptionsItem>
          <DescriptionsItem label="违章人年龄">{{ currentViolation.violatorAge || '—' }}</DescriptionsItem>
          <DescriptionsItem label="检查人员">{{ currentViolation.inspectorName || '—' }}</DescriptionsItem>
          <DescriptionsItem label="处理人员">
            <EmployeeName v-if="currentViolation.handlerId" :employee-id="currentViolation.handlerId" />
            <span v-else>{{ currentViolation.handlerName || '—' }}</span>
          </DescriptionsItem>
          <DescriptionsItem label="处罚人员">{{ currentViolation.punisherName || '—' }}</DescriptionsItem>
          <DescriptionsItem label="处罚类型">{{ currentViolation.punishmentType || '—' }}</DescriptionsItem>
          <DescriptionsItem label="处罚金额">{{ currentViolation.punishmentAmount || '—' }}</DescriptionsItem>
          <DescriptionsItem label="整改措施">{{ currentViolation.rectification || '—' }}</DescriptionsItem>
          <DescriptionsItem label="整改时间">{{ currentViolation.rectificationTime ? formatDateTime(currentViolation.rectificationTime) : '-' }}</DescriptionsItem>
          <DescriptionsItem label="复查结果">{{ currentViolation.reviewResult || '—' }}</DescriptionsItem>
          <DescriptionsItem label="复查时间">{{ currentViolation.reviewTime ? formatDateTime(currentViolation.reviewTime) : '-' }}</DescriptionsItem>
          <DescriptionsItem label="是否需要复训">
            <Tag :color="currentViolation.needRetraining ? 'red' : 'green'">
              {{ currentViolation.needRetraining ? '需要复训' : '无需复训' }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="状态">
            <Tag :color="getStatusColor(currentViolation.status)">
              {{ currentViolation.status }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem v-if="currentViolation.remark" label="备注">
            {{ currentViolation.remark }}
          </DescriptionsItem>
        </Descriptions>
      </template>
    </Drawer>

    <Modal
      v-model:open="showStatisticsModal"
      title="三违统计分析"
      :width="900"
      @cancel="showStatisticsModal = false"
    >
      <Tabs v-model:active-key="statisticsTab" type="card">
        <TabPane key="employee" tab="员工三违次数">
          <Table
            :data-source="employeeViolationCount"
            :columns="[
              { title: '排名', key: 'rank', width: 60, customRender: ({ index }) => index + 1 },
              { title: '员工姓名', dataIndex: 'employeeName', key: 'employeeName' },
              { title: '员工ID', dataIndex: 'employeeId', key: 'employeeId', width: 80 },
              { title: '三违次数', dataIndex: 'violationCount', key: 'violationCount', width: 100 },
            ]"
            :pagination="false"
            size="small"
          />
        </TabPane>
        <TabPane key="highRisk" tab="高风险人员">
          <Table
            :data-source="highRiskEmployees"
            :columns="[
              { title: '排名', key: 'rank', width: 60, customRender: ({ index }) => index + 1 },
              { title: '员工姓名', dataIndex: 'employeeName', key: 'employeeName' },
              { title: '员工ID', dataIndex: 'employeeId', key: 'employeeId', width: 80 },
              { title: '高风险次数', dataIndex: 'highRiskCount', key: 'highRiskCount', width: 100 },
            ]"
            :pagination="false"
            size="small"
          />
        </TabPane>
        <TabPane key="department" tab="部门排行">
          <Table
            :data-source="departmentRanking"
            :columns="[
              { title: '排名', key: 'rank', width: 60, customRender: ({ index }) => index + 1 },
              { title: '部门', dataIndex: 'department', key: 'department' },
              { title: '三违次数', dataIndex: 'violationCount', key: 'violationCount', width: 100 },
            ]"
            :pagination="false"
            size="small"
          />
        </TabPane>
        <TabPane key="position" tab="岗位排行">
          <Table
            :data-source="positionRanking"
            :columns="[
              { title: '排名', key: 'rank', width: 60, customRender: ({ index }) => index + 1 },
              { title: '岗位', dataIndex: 'position', key: 'position' },
              { title: '三违次数', dataIndex: 'violationCount', key: 'violationCount', width: 100 },
            ]"
            :pagination="false"
            size="small"
          />
        </TabPane>
      </Tabs>
    </Modal>

    <ImportModal
      v-model:visible="importModalVisible"
      module="violation"
      module-name="三违管理"
      @refresh="() => { fetchData(); fetchFilterOptions(); }"
    />

  </Page>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, nextTick, computed, watch } from 'vue';
import { Button, Card, Col, DatePicker, Descriptions, DescriptionsItem, Drawer, Form, FormItem, Image, Input, InputNumber, Modal, Popconfirm, Row, Select, SelectOption, Skeleton, Space, Switch, Table, Tag, Tabs, TabPane, TimePicker, message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import dayjs, { type Dayjs } from 'dayjs';

import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import ImportModal from '#/components/hse/ImportModal.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';
import { EmployeeName, useEmployeeEvent, useSearchForm, useDataTable } from '#/composables/hse';

import {
  getViolationList,
  getViolationStats,
  createViolation,
  updateViolation,
  deleteViolation,
  batchDeleteViolations,
  exportViolations,
  rectifyViolation,
  reviewViolation,
  getEmployeeViolationCount,
  getHighRiskEmployees,
  getDepartmentRanking,
  getPositionRanking,
  getViolationFilterOptions,
  type ViolationApi,
} from '#/api/hse/violations';

const RangePicker = DatePicker.RangePicker;

const {
  loading,
  dataList,
  total,
  pagination,
  fetchData,
  handleTableChange,
  handleReset: tableHandleReset,
} = useDataTable<ViolationApi.ViolationItem>({
  fetchFn: async ({ page, pageSize }) => {
    const params: ViolationApi.ViolationListParams = {
      page,
      pageSize,
      keyword: searchForm.keyword || undefined,
      violationType: searchForm.violationType,
      areaTeam: searchForm.areaTeam,
      gridLevel: searchForm.gridLevel,
      startDate: searchForm.startDate,
      endDate: searchForm.endDate,
    };
    const res = await getViolationList(params);
    selectedRowKeys.value = [];
    void fetchStats();
    return { list: res.list || [], total: res.total || 0 };
  },
  defaultPageSize: 10,
});

const { form: searchForm, reset: resetSearch } = useSearchForm<{
  keyword: string;
  violationType: string | undefined;
  areaTeam: string | undefined;
  gridLevel: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
}>({
  defaults: {
    keyword: '',
    violationType: undefined,
    areaTeam: undefined,
    gridLevel: undefined,
    startDate: undefined,
    endDate: undefined,
  },
  onSearch: () => tableHandleReset(),
});

const dateRange = ref<[Dayjs, Dayjs] | undefined>(undefined);

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingViolation = ref<ViolationApi.ViolationItem | null>(null);
const violationForm = reactive({
  violationType: '',
  violationLevel: '',
  riskLevel: '中',
  description: '',
  location: '',
  violationDate: undefined as Dayjs | undefined,
  occurTime: undefined as Dayjs | undefined,
  violatorId: undefined as number | undefined,
  violatorIdCard: '',
  inspectorId: undefined as number | undefined,
  handlerId: undefined as number | undefined,
  punisherId: undefined as number | undefined,
  punishmentType: '',
  punishmentAmount: undefined as number | undefined,
  rectification: '',
  needRetraining: false,
  status: '待处理',
  remark: '',
});

const formRef = ref();
const formRules = {
  violationType: [{ required: true, message: '请选择三违类型', trigger: 'change' }],
  violationLevel: [{ required: true, message: '请选择严重程度', trigger: 'change' }],
  description: [{ required: true, message: '请输入违章描述', trigger: 'blur' }],
  violationDate: [{ required: true, message: '请选择违章日期', trigger: 'change' }],
};

const rectifyModalVisible = ref(false);
const rectifyLoading = ref(false);
const rectifyingViolation = ref<ViolationApi.ViolationItem | null>(null);
const rectifyForm = reactive({
  handlerId: undefined as number | undefined,
  handlerName: '',
  rectification: '',
});
const rectifyFormRef = ref();
const rectifyFormRules = {
  handlerId: [{ required: true, message: '请选择处理人员', trigger: 'change' }],
  rectification: [{ required: true, message: '请输入整改措施', trigger: 'blur' }],
};

const reviewModalVisible = ref(false);
const reviewLoading = ref(false);
const reviewingViolation = ref<ViolationApi.ViolationItem | null>(null);
const reviewForm = reactive({
  reviewResult: '',
  remark: '',
});
const reviewFormRef = ref();
const reviewFormRules = {
  reviewResult: [{ required: true, message: '请选择复查结果', trigger: 'change' }],
};

const detailDrawerVisible = ref(false);
const currentViolation = ref<ViolationApi.ViolationItem | null>(null);

const statsData = ref({
  total: 0,
  level1Month: 0,
  level2Month: 0,
  level3Month: 0,
});

const filterOptions = ref({
  areaTeams: [] as string[],
  gridLevels: [] as string[],
});

const selectedRowKeys = ref<number[]>([]);

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: any[]) => {
    selectedRowKeys.value = keys.map(k => Number(k));
  },
}));

const statsLoading = ref(false);

const statItems = computed(() => [
  { key: 'total', label: '违章总数', value: statsData.value.total, icon: 'lucide:bar-chart-3', color: 'blue' },
  { key: 'level1Month', label: '一级网格长（本月）', value: statsData.value.level1Month, icon: 'lucide:shield-alert', color: 'red' },
  { key: 'level2Month', label: '二级网格长（本月）', value: statsData.value.level2Month, icon: 'lucide:shield-alert', color: 'orange' },
  { key: 'level3Month', label: '三级网格长（本月）', value: statsData.value.level3Month, icon: 'lucide:shield-alert', color: 'yellow' },
]);

const originalColumns = ref([
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.current - 1) * pagination.pageSize + index + 1,
  },
  { title: '姓名', dataIndex: 'inspectorName', key: 'inspectorName', width: 110 },
  { title: '所属岗位', dataIndex: 'position', key: 'position', width: 120, ellipsis: true },
  { title: '网格等级', dataIndex: 'gridLevel', key: 'gridLevel', width: 100, align: 'center' as const },
  { title: '日期', dataIndex: 'violationDate', key: 'violationDate', width: 120, align: 'center' as const },
  { title: '三违行为', dataIndex: 'violationBehavior', key: 'violationBehavior', width: 220, ellipsis: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100, align: 'center' as const },
  { title: '操作', key: 'action', width: 280, align: 'center' as const, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'violations');
const tableRef = ref<any>(null);

const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([
  { key: 'import', label: '导入数据' },
  { key: 'export', label: '导出报表' },
  { key: 'create', label: '新增违章' },
  { key: 'statistics', label: '统计分析' },
]);

const { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'violations',
  statItems: visibilityStatItems,
  actionButtons,
});

const hasVisibleStats = computed(() => statItems.value.some((s) => isStatVisible.value(s.key)));

const showStatisticsModal = ref(false);
const importModalVisible = ref(false);
const statisticsTab = ref('employee');
const employeeViolationCount = ref<ViolationApi.EmployeeViolationCount[]>([]);
const highRiskEmployees = ref<ViolationApi.HighRiskEmployee[]>([]);
const departmentRanking = ref<ViolationApi.DepartmentRanking[]>([]);
const positionRanking = ref<ViolationApi.PositionRanking[]>([]);

function formatDate(date: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

function formatDateTime(dateTime: string | null): string {
  if (!dateTime) return '-';
  return dayjs(dateTime).format('YYYY-MM-DD HH:mm:ss');
}

// 将逗号分隔的图片 URL 解析为数组（兼容单 URL / 空值）
function photoList(record: any, key: 'imageContent' | 'rectificationPhotos'): string[] {
  const v = record?.[key];
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
}

function getViolationTypeColor(type?: string): string {
  switch (type) {
    case '违章指挥': return 'red';
    case '违章作业': return 'orange';
    case '违反劳动纪律': return 'yellow';
    default: return 'default';
  }
}

function getViolationLevelColor(level?: string): string {
  switch (level) {
    case '严重': return 'red';
    case '一般': return 'orange';
    case '轻微': return 'yellow';
    default: return 'default';
  }
}

function getRiskLevelColor(level?: string): string {
  switch (level) {
    case '高': return 'red';
    case '中': return 'orange';
    case '低': return 'green';
    default: return 'default';
  }
}

function getStatusColor(status?: string): string {
  switch (status) {
    case '待处理': return 'red';
    case '整改中': return 'orange';
    case '待复查': return 'blue';
    case '已关闭': return 'green';
    default: return 'default';
  }
}

function handleDateChange(_dates: any, dateStrings: [string, string]) {
  searchForm.startDate = dateStrings[0] || undefined;
  searchForm.endDate = dateStrings[1] || undefined;
  handleSearch();
}

// fetchData 已由 useDataTable 接管（见上方），保留 selectedRowKeys 重置与统计刷新副作用

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getViolationStats();
    statsData.value.total = res.total || 0;
    statsData.value.level1Month = res.level1Month || 0;
    statsData.value.level2Month = res.level2Month || 0;
    statsData.value.level3Month = res.level3Month || 0;
  } catch (err) {
    console.warn('获取统计数据失败:', err);
  } finally {
    statsLoading.value = false;
  }
}

async function fetchStatistics() {
  try {
    const [employeeData, highRiskData, deptData, posData] = await Promise.all([
      getEmployeeViolationCount(),
      getHighRiskEmployees(),
      getDepartmentRanking(),
      getPositionRanking(),
    ]);
    employeeViolationCount.value = employeeData || [];
    highRiskEmployees.value = highRiskData || [];
    departmentRanking.value = deptData || [];
    positionRanking.value = posData || [];
  } catch (err) {
    console.warn('获取统计数据失败:', err);
    message.error('获取统计数据失败');
  }
}

async function fetchFilterOptions() {
  try {
    const res = await getViolationFilterOptions();
    filterOptions.value.areaTeams = res.areaTeams || [];
    filterOptions.value.gridLevels = res.gridLevels || [];
  } catch (err) {
    console.warn('获取筛选选项失败:', err);
  }
}

function handleSearch() {
  tableHandleReset();
}

function handleReset() {
  dateRange.value = undefined;
  resetSearch();
}

function handleStatCardClick(key: string) {
  searchForm.keyword = '';
  dateRange.value = undefined;
  searchForm.startDate = undefined;
  searchForm.endDate = undefined;
  searchForm.areaTeam = undefined;
  searchForm.violationType = undefined;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();

  switch (key) {
    case 'level1Month':
      searchForm.gridLevel = '一级网格长';
      searchForm.startDate = `${year}-${month}-01`;
      searchForm.endDate = `${year}-${month}-${daysInMonth}`;
      break;
    case 'level2Month':
      searchForm.gridLevel = '二级网格长';
      searchForm.startDate = `${year}-${month}-01`;
      searchForm.endDate = `${year}-${month}-${daysInMonth}`;
      break;
    case 'level3Month':
      searchForm.gridLevel = '三级网格长';
      searchForm.startDate = `${year}-${month}-01`;
      searchForm.endDate = `${year}-${month}-${daysInMonth}`;
      break;
    default:
      searchForm.gridLevel = undefined;
  }

  pagination.current = 1;
  fetchData();
}

// handleTableChange 已由 useDataTable 接管

function handleCreate() {
  editingViolation.value = null;
  Object.assign(violationForm, {
    violationType: '',
    violationLevel: '',
    riskLevel: '中',
    description: '',
    location: '',
    violationDate: dayjs(),
    occurTime: null,
    violatorId: null,
    violatorIdCard: '',
    inspectorId: null,
    handlerId: null,
    punisherId: null,
    punishmentType: '',
    punishmentAmount: null,
    rectification: '',
    needRetraining: false,
    status: '待处理',
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: ViolationApi.ViolationItem) {
  editingViolation.value = record;
  Object.assign(violationForm, {
    violationType: record.violationType,
    violationLevel: record.violationLevel,
    riskLevel: record.riskLevel || '中',
    description: record.description,
    location: record.location || '',
    violationDate: record.violationDate ? dayjs(record.violationDate) : null,
    occurTime: record.occurTime ? dayjs(record.occurTime) : null,
    violatorId: record.violatorId || null,
    violatorIdCard: (record as any).violatorIdCard || '',
    inspectorId: record.inspectorId || null,
    handlerId: record.handlerId || null,
    punisherId: record.punisherId || null,
    punishmentType: record.punishmentType || '',
    punishmentAmount: record.punishmentAmount || null,
    rectification: record.rectification || '',
    needRetraining: record.needRetraining || false,
    status: record.status,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

function handleView(record: ViolationApi.ViolationItem) {
  currentViolation.value = record;
  detailDrawerVisible.value = true;
}

function handleRectify(record: ViolationApi.ViolationItem) {
  rectifyingViolation.value = record;
  Object.assign(rectifyForm, {
    handlerId: record.handlerId || null,
    handlerName: record.handlerName || '',
    rectification: record.rectification || '',
  });
  rectifyModalVisible.value = true;
}

function handleReview(record: ViolationApi.ViolationItem) {
  reviewingViolation.value = record;
  Object.assign(reviewForm, {
    reviewResult: '',
    remark: '',
  });
  reviewModalVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<ViolationApi.ViolationItem> = {
      violationType: violationForm.violationType,
      violationLevel: violationForm.violationLevel,
      riskLevel: violationForm.riskLevel,
      description: violationForm.description,
      location: violationForm.location,
      violationDate: violationForm.violationDate?.format('YYYY-MM-DD'),
      occurTime: violationForm.occurTime?.format('HH:mm:ss'),
      violatorId: violationForm.violatorId,
      violatorIdCard: violationForm.violatorIdCard || undefined,
      inspectorId: violationForm.inspectorId,
      handlerId: violationForm.handlerId,
      punisherId: violationForm.punisherId,
      punishmentType: violationForm.punishmentType,
      punishmentAmount: violationForm.punishmentAmount,
      rectification: violationForm.rectification,
      needRetraining: violationForm.needRetraining || violationForm.violationLevel === '严重',
      status: violationForm.status,
      remark: violationForm.remark,
    };
    if (editingViolation.value) {
      await updateViolation(editingViolation.value.id, data);
      message.success('更新成功');
    } else {
      await createViolation(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}

async function handleRectifySave() {
  try {
    await rectifyFormRef.value?.validate();
  } catch {
    return;
  }
  rectifyLoading.value = true;
  try {
    await rectifyViolation(rectifyingViolation.value!.id, {
      rectification: rectifyForm.rectification,
      handlerId: rectifyForm.handlerId,
    });
    message.success('整改提交成功');
    rectifyModalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('整改失败:', err);
    message.error('整改失败');
  } finally {
    rectifyLoading.value = false;
  }
}

async function handleReviewSave() {
  try {
    await reviewFormRef.value?.validate();
  } catch {
    return;
  }
  reviewLoading.value = true;
  try {
    await reviewViolation(reviewingViolation.value!.id, {
      reviewResult: reviewForm.reviewResult,
      remark: reviewForm.remark,
    });
    message.success('复查完成');
    reviewModalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('复查失败:', err);
    message.error('复查失败');
  } finally {
    reviewLoading.value = false;
  }
}

async function handleDelete(record: ViolationApi.ViolationItem) {
  try {
    await deleteViolation(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

async function handleBatchDelete() {
  if (!selectedRowKeys.value.length) return;
  try {
    await batchDeleteViolations(selectedRowKeys.value);
    message.success(`成功删除 ${selectedRowKeys.value.length} 条记录`);
    selectedRowKeys.value = [];
    fetchData();
    fetchFilterOptions();
  } catch (err) {
    console.warn('批量删除失败:', err);
    message.error('批量删除失败');
  }
}

async function handleExport() {
  try {
    const blob = await exportViolations();
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `三违记录_${dayjs().format('YYYYMMDD')}.csv`);
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

async function initTableFeatures() {
  await nextTick();
  if (tableRef.value?.$el) {
    initSortable(tableRef.value.$el);
    initResizable(tableRef.value.$el);
  }
}

function handleStatisticsModalOpen() {
  fetchStatistics();
}

watch(showStatisticsModal, (val) => {
  if (val) {
    handleStatisticsModalOpen();
  }
});

// Q5：订阅员工变更事件，离职/调岗时刷新违章列表（violatorName 快照可能过期）
// 实际刷新策略（全量 vs 单条）由业务方后续决定，此处仅验证事件总线通路与订阅生命周期。
const { subscribe: subscribeEmployeeEvents } = useEmployeeEvent();
const unsubscribeEmployeeEvents = subscribeEmployeeEvents(
  ['EMPLOYEE_TRANSFERRED', 'EMPLOYEE_RESIGNED'],
  () => {
    void fetchData();
  },
);
onUnmounted(unsubscribeEmployeeEvents);

onMounted(async () => {
  await Promise.all([fetchStats(), fetchData(), fetchFilterOptions()]);
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
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .cell-ellipsis {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .muted {
    color: hsl(var(--muted-foreground));
  }

  .thumb-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;

    &--detail {
      gap: 8px;
    }
  }

  .thumb-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 38px;
    height: 38px;
    padding: 0 6px;
    border-radius: 4px;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    font-size: 12px;
  }
}
</style>