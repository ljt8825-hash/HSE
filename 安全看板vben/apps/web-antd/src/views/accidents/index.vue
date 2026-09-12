<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <SortableStatRow v-else-if="hasVisibleStats" page-key="accidents">
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
          <span>{{ $t('hse.accidents.title') }}</span>
          <Space>
            <HelpButton menuCode="HSE_ACCIDENT_MANAGEMENT" />
            <ImportButtonGroup
              v-if="isActionVisible('import')"
              module="accidents"
              :module-name="$t('hse.accidents.title')"
              @refresh="table.fetchData"
            />
            <Button v-if="isActionVisible('export')" :loading="exportLoading" @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              {{ $t('hse.accidents.action.export') }}
            </Button>
            <Button v-if="isActionVisible('create')" type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              {{ $t('hse.accidents.action.create') }}
            </Button>
            <ComponentVisibilitySettings
              :title="$t('hse.accidents.visibilityTitle')"
              v-model:model-value="config"
              :stat-items="visibilityStatItems"
              :action-buttons="actionButtons"
              @reset="resetToDefault"
            />
          </Space>
        </div>
      </template>

      <Form v-if="isFilterVisible" layout="inline" class="filter-form">
        <FormItem :label="$t('hse.accidents.search.keyword')">
          <Input
            v-model:value="search.form.keyword"
            :placeholder="$t('hse.accidents.search.keywordPlaceholder')"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem :label="$t('hse.accidents.search.year')">
          <Select
            v-model:value="search.form.year"
            :placeholder="$t('hse.accidents.search.allYear')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="y in yearOptions" :key="y" :value="y">
              {{ y }} {{ $t('hse.accidents.yearUnit') }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.accidents.search.month')">
          <Select
            v-model:value="search.form.month"
            :placeholder="$t('hse.accidents.search.allMonth')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="m in 12" :key="m" :value="m">
              {{ m }} {{ $t('hse.accidents.monthUnit') }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.accidents.search.level')">
          <Select
            v-model:value="search.form.level"
            :placeholder="$t('hse.accidents.search.allLevel')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="major">{{ $t('hse.accidents.level.major') }}</SelectOption>
            <SelectOption value="serious">{{ $t('hse.accidents.level.serious') }}</SelectOption>
            <SelectOption value="general">{{ $t('hse.accidents.level.general') }}</SelectOption>
            <SelectOption value="minor">{{ $t('hse.accidents.level.minor') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.accidents.search.type')">
          <Select
            v-model:value="search.form.type"
            :placeholder="$t('hse.accidents.search.allType')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="traffic">{{ $t('hse.accidents.type.traffic') }}</SelectOption>
            <SelectOption value="occupational">{{ $t('hse.accidents.type.occupational') }}</SelectOption>
            <SelectOption value="equipment">{{ $t('hse.accidents.type.equipment') }}</SelectOption>
            <SelectOption value="fire">{{ $t('hse.accidents.type.fire') }}</SelectOption>
            <SelectOption value="environmental">{{ $t('hse.accidents.type.environmental') }}</SelectOption>
            <SelectOption value="other">{{ $t('hse.accidents.type.other') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.accidents.search.status')">
          <Select
            v-model:value="search.form.status"
            :placeholder="$t('hse.accidents.search.allStatus')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="open">{{ $t('hse.accidents.status.open') }}</SelectOption>
            <SelectOption value="reported">{{ $t('hse.accidents.status.reported') }}</SelectOption>
            <SelectOption value="investigating">{{ $t('hse.accidents.status.investigating') }}</SelectOption>
            <SelectOption value="processing">{{ $t('hse.accidents.status.processing') }}</SelectOption>
            <SelectOption value="closed">{{ $t('hse.accidents.status.closed') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.accidents.expiry.title')">
          <Select
            v-model:value="search.form.expiryStatus"
            :placeholder="$t('hse.accidents.search.allExpiry')"
            allow-clear
            @change="handleSearch"
            style="width: 130px"
          >
            <SelectOption value="normal">{{ $t('hse.accidents.expiry.normal') }}</SelectOption>
            <SelectOption value="expiring">{{ $t('hse.accidents.expiry.expiring') }}</SelectOption>
            <SelectOption value="expired">{{ $t('hse.accidents.expiry.expired') }}</SelectOption>
            <SelectOption value="closed">{{ $t('hse.accidents.expiry.closed') }}</SelectOption>
            <SelectOption value="permanent">{{ $t('hse.accidents.expiry.permanent') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">{{ $t('hse.accidents.action.reset') }}</Button>
        </FormItem>
      </Form>

      <Table
        ref="tableRef"
        :columns="tableColumns"
        :data-source="table.dataList"
        :loading="table.loading"
        :pagination="table.pagination"
        :row-key="(record) => record.id"
        @change="table.handleTableChange"
        size="middle"
        :scroll="{ x: 1500 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'level'">
            <Tag :color="getLevelColor(record.level)">
              {{ getLevelText(record.level) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'type'">
            {{ getTypeText(record.type) }}
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ getStatusText(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'reportGroup'">
            <Switch
              :checked="!!record.reportGroup"
              :checked-children="$t('hse.accidents.reportGroup.reported')"
              :un-checked-children="$t('hse.accidents.reportGroup.unreported')"
              size="small"
              @change="(v) => handleReportGroupChange(record as any, v as boolean)"
            />
          </template>
          <template v-else-if="column.key === 'expiryStatus'">
            <Badge
              :status="getExpiryBadgeStatus(record.expiryStatus)"
              :text="getExpiryText(record.expiryStatus)"
            />
          </template>
          <template v-else-if="column.key === 'occurredAt'">
            {{ formatDate(record.occurredAt) }}
          </template>
          <template v-else-if="column.key === 'casualties'">
            <Tag :color="record.casualties > 0 ? 'red' : 'default'">
              {{ record.casualties }} {{ $t('hse.accidents.deadUnit') }} / {{ record.injuries }} {{ $t('hse.accidents.injuredUnit') }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'economicLoss'">
            ¥{{ formatMoney(record.economicLoss) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleView(record as any)">
                {{ $t('hse.accidents.action.view') }}
              </Button>
              <Button type="link" size="small" @click="handleEdit(record as any)">
                {{ $t('hse.accidents.action.edit') }}
              </Button>
              <Popconfirm
                :title="$t('hse.accidents.action.deleteConfirm')"
                :ok-text="$t('hse.accidents.action.confirmDelete')"
                :cancel-text="$t('hse.accidents.action.cancel')"
                @confirm="handleDelete(record as any)"
              >
                <Button type="link" size="small" danger>
                  {{ $t('hse.accidents.action.delete') }}
                </Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingAccident ? $t('hse.accidents.action.editTitle') : $t('hse.accidents.action.createTitle')"
      :confirm-loading="modalLoading"
      width="780px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="accidentForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem :label="$t('hse.accidents.form.title')" required>
              <Input v-model:value="accidentForm.title" :placeholder="$t('hse.accidents.form.titlePlaceholder')" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="$t('hse.accidents.form.description')">
              <Textarea
                v-model:value="accidentForm.description"
                :rows="3"
                :placeholder="$t('hse.accidents.form.descriptionPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem :label="$t('hse.accidents.form.level')" required>
              <Select v-model:value="accidentForm.level" :placeholder="$t('hse.accidents.form.levelPlaceholder')" style="width: 100%">
                <SelectOption value="major">{{ $t('hse.accidents.level.major') }}</SelectOption>
                <SelectOption value="serious">{{ $t('hse.accidents.level.serious') }}</SelectOption>
                <SelectOption value="general">{{ $t('hse.accidents.level.general') }}</SelectOption>
                <SelectOption value="minor">{{ $t('hse.accidents.level.minor') }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem :label="$t('hse.accidents.form.type')" required>
              <Select v-model:value="accidentForm.type" :placeholder="$t('hse.accidents.form.typePlaceholder')" style="width: 100%">
                <SelectOption value="traffic">{{ $t('hse.accidents.type.traffic') }}</SelectOption>
                <SelectOption value="occupational">{{ $t('hse.accidents.type.occupational') }}</SelectOption>
                <SelectOption value="equipment">{{ $t('hse.accidents.type.equipment') }}</SelectOption>
                <SelectOption value="fire">{{ $t('hse.accidents.type.fire') }}</SelectOption>
                <SelectOption value="environmental">{{ $t('hse.accidents.type.environmental') }}</SelectOption>
                <SelectOption value="other">{{ $t('hse.accidents.type.other') }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem :label="$t('hse.accidents.form.status')">
              <Select v-model:value="accidentForm.status" :placeholder="$t('hse.accidents.form.statusPlaceholder')" style="width: 100%">
                <SelectOption value="reported">{{ $t('hse.accidents.status.reported') }}</SelectOption>
                <SelectOption value="investigating">{{ $t('hse.accidents.status.investigating') }}</SelectOption>
                <SelectOption value="processing">{{ $t('hse.accidents.status.processing') }}</SelectOption>
                <SelectOption value="closed">{{ $t('hse.accidents.status.closed') }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.accidents.form.location')" required>
              <Input v-model:value="accidentForm.location" :placeholder="$t('hse.accidents.form.locationPlaceholder')" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.accidents.form.occurredAt')" required>
              <DatePicker
                v-model:value="accidentForm.occurredAt"
                show-time
                style="width: 100%"
                :placeholder="$t('hse.accidents.form.occurredAtPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.accidents.form.reporter')" required>
              <EmployeeSelector
                v-model:value="accidentForm.reporterId"
                mode="single"
                placeholder="选择报告人"
                @change="onReporterChange"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处理人员">
              <EmployeeSelector v-model:value="accidentForm.handlerId" mode="single" placeholder="选择处理人员" @change="onHandlerChange" />
            </FormItem>
          </Col>
          <Col :span="4">
            <FormItem :label="$t('hse.accidents.form.casualties')">
              <InputNumber v-model:value="accidentForm.casualties" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="4">
            <FormItem :label="$t('hse.accidents.form.injuries')">
              <InputNumber v-model:value="accidentForm.injuries" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem :label="$t('hse.accidents.form.economicLoss')">
              <InputNumber
                v-model:value="accidentForm.economicLoss"
                :min="0"
                style="width: 100%"
                :placeholder="$t('hse.accidents.form.economicLossPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.accidents.form.rectificationDeadlineDays')">
              <InputNumber
                v-model:value="accidentForm.rectificationDeadlineDays"
                :min="0"
                :max="365"
                style="width: 100%"
                :placeholder="$t('hse.accidents.form.rectificationDeadlineDaysPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.accidents.form.relatedHazardId')">
              <InputNumber
                v-model:value="accidentForm.relatedHazardId"
                :min="1"
                style="width: 100%"
                :placeholder="$t('hse.accidents.form.relatedHazardIdPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.accidents.form.relatedEmergencyId')">
              <InputNumber
                v-model:value="accidentForm.relatedEmergencyId"
                :min="1"
                style="width: 100%"
                :placeholder="$t('hse.accidents.form.relatedEmergencyIdPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="$t('hse.accidents.form.remark')">
              <Textarea v-model:value="accidentForm.remark" :rows="2" :placeholder="$t('hse.accidents.form.remarkPlaceholder')" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer
      v-model:open="detailDrawerVisible"
      :title="$t('hse.accidents.detail.title')"
      width="760px"
    >
      <template v-if="currentAccident">
        <div class="detail-actions mb-4">
          <Space>
            <Popconfirm
              v-if="currentAccident.status === 'reported'"
              :title="$t('hse.accidents.action.startInvestigateConfirm')"
              @confirm="handleStatusChange('investigating')"
            >
              <Button type="primary">{{ $t('hse.accidents.action.startInvestigate') }}</Button>
            </Popconfirm>
            <Popconfirm
              v-if="currentAccident.status === 'investigating'"
              :title="$t('hse.accidents.action.startProcessingConfirm')"
              @confirm="handleStatusChange('processing')"
            >
              <Button type="primary">{{ $t('hse.accidents.action.startProcessing') }}</Button>
            </Popconfirm>
            <Popconfirm
              v-if="currentAccident.status === 'processing'"
              :title="$t('hse.accidents.action.closeConfirm')"
              ok-type="danger"
              @confirm="handleStatusChange('closed')"
            >
              <Button type="primary">{{ $t('hse.accidents.action.close') }}</Button>
            </Popconfirm>
            <Button @click="handleEdit(currentAccident)">{{ $t('hse.accidents.action.edit') }}</Button>
          </Space>
        </div>

        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem :label="$t('hse.accidents.detail.title')">{{ currentAccident.title }}</DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.level')">
            <Tag :color="getLevelColor(currentAccident.level)">
              {{ getLevelText(currentAccident.level) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.type')">
            {{ getTypeText(currentAccident.type) }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.status')">
            <Tag :color="getStatusColor(currentAccident.status)">
              {{ getStatusText(currentAccident.status) }}
            </Tag>
            <Badge
              :status="getExpiryBadgeStatus(currentAccident.expiryStatus)"
              :text="getExpiryText(currentAccident.expiryStatus)"
              style="margin-left: 12px"
            />
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.location')">{{ currentAccident.location }}</DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.occurredAt')">
            {{ formatDate(currentAccident.occurredAt) }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.reportedAt')">
            {{ formatDate(currentAccident.reportedAt) }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.reporter')">
            <EmployeeName v-if="currentAccident.reporterId" :employee-id="currentAccident.reporterId" />
            <span v-else>{{ currentAccident.reporter || '-' }}</span>
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.casualties')">
            {{ currentAccident.casualties }} {{ $t('hse.accidents.deadUnit') }} / {{ currentAccident.injuries }} {{ $t('hse.accidents.injuredUnit') }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.economicLoss')">
            ¥{{ formatMoney(currentAccident.economicLoss) }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.rectificationDeadlineDays')">
            {{ currentAccident.rectificationDeadlineDays || 30 }} {{ $t('hse.accidents.dayUnit') }}
          </DescriptionsItem>
          <DescriptionsItem v-if="currentAccident.handlerId || currentAccident.handler" :label="$t('hse.accidents.detail.handler')">
            <EmployeeName v-if="currentAccident.handlerId" :employee-id="currentAccident.handlerId" />
            <span v-else>{{ currentAccident.handler }}</span>
          </DescriptionsItem>
          <DescriptionsItem v-if="currentAccident.handlerId" :label="'处理人上级'">
            <EmployeeName v-if="currentAccident.handlerSupervisorId" :employee-id="currentAccident.handlerSupervisorId" />
            <span v-else>{{ currentAccident.handlerSupervisorName || '-' }}</span>
          </DescriptionsItem>
          <DescriptionsItem v-if="currentAccident.closedAt" :label="$t('hse.accidents.detail.closedAt')">
            {{ formatDate(currentAccident.closedAt) }}
          </DescriptionsItem>
          <DescriptionsItem v-if="currentAccident.relatedHazardId" :label="$t('hse.accidents.detail.relatedHazardId')">
            #{{ currentAccident.relatedHazardId }}
          </DescriptionsItem>
          <DescriptionsItem v-if="currentAccident.relatedEmergencyId" :label="$t('hse.accidents.detail.relatedEmergencyId')">
            #{{ currentAccident.relatedEmergencyId }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('hse.accidents.detail.description')">{{ currentAccident.description }}</DescriptionsItem>
          <DescriptionsItem v-if="currentAccident.remark" :label="$t('hse.accidents.detail.remark')">
            {{ currentAccident.remark }}
          </DescriptionsItem>
        </Descriptions>

        <!-- 附件列表与历史版本 Tabs -->
        <Tabs v-model:activeKey="detailTab" class="detail-tabs">
          <TabPane :tab="$t('hse.accidents.version.tabAttachments')" key="attachments">
            <div class="attachment-section">
              <div class="attachment-toolbar">
                <Input
                  v-model:value="uploadVersion"
                  :placeholder="$t('hse.accidents.attachment.versionPlaceholder')"
                  style="width: 160px"
                  allow-clear
                />
                <Upload
                  :show-upload-list="false"
                  :before-upload="(file) => handleUploadAttachment(file)"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                >
                  <Button type="primary" :loading="attachmentUploading">
                    <template #icon><IconifyIcon icon="lucide:upload" /></template>
                    {{ $t('hse.accidents.attachment.upload') }}
                  </Button>
                </Upload>
              </div>
              <Table
                :columns="attachmentColumns"
                :data-source="attachmentList"
                :loading="attachmentLoading"
                size="small"
                :pagination="false"
                :row-key="(record) => record.id"
                :locale="{ emptyText: $t('hse.accidents.attachment.empty') }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'originalName'">
                    <a :href="record.fileUrl" target="_blank" rel="noopener">{{ record.originalName }}</a>
                    <Tag v-if="record.isLatest" color="green" style="margin-left: 8px">
                      {{ $t('hse.accidents.attachment.isLatest') }}
                    </Tag>
                  </template>
                  <template v-else-if="column.key === 'fileSize'">
                    {{ formatFileSize(record.fileSize) }}
                  </template>
                  <template v-else-if="column.key === 'createdAt'">
                    {{ formatDateTime(record.createdAt) }}
                  </template>
                  <template v-else-if="column.key === 'action'">
                    <a :href="record.fileUrl" target="_blank" rel="noopener">
                      {{ $t('hse.accidents.attachment.download') }}
                    </a>
                    <Popconfirm
                      :title="$t('hse.accidents.attachment.deleteConfirm')"
                      :ok-text="$t('hse.accidents.action.confirmDelete')"
                      :cancel-text="$t('hse.accidents.action.cancel')"
                      @confirm="handleDeleteAttachment(record as any)"
                    >
                      <Button type="link" size="small" danger>
                        {{ $t('hse.accidents.attachment.delete') }}
                      </Button>
                    </Popconfirm>
                  </template>
                </template>
              </Table>
            </div>
          </TabPane>
          <TabPane :tab="$t('hse.accidents.version.tabVersions')" key="versions">
            <Table
              :columns="versionColumns"
              :data-source="versionList"
              :loading="versionLoading"
              size="small"
              :pagination="false"
              :row-key="(record) => record.id"
              :locale="{ emptyText: $t('hse.accidents.version.empty') }"
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
          </TabPane>
        </Tabs>
      </template>
    </Drawer>

  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue';
import {
  Card,
  Row,
  Col,
  Table,
  Form,
  FormItem,
  Input,
  Select,
  SelectOption,
  Button,
  Switch,
  Modal,
  Drawer,
  Tag,
  Badge,
  DatePicker,
  InputNumber,
  Textarea,
  Tabs,
  TabPane,
  Upload,
  message,
  Popconfirm,
  Skeleton,
  Space,
  Descriptions,
  DescriptionsItem,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';
import { useSearchForm, useDataTable, EmployeeName } from '#/composables/hse';
import dayjs, { type Dayjs } from 'dayjs';
import { $t } from '#/locales';

import {
  getAccidentList,
  getAccidentStats,
  createAccident,
  updateAccident,
  deleteAccident,
  getAccidentAttachments,
  uploadAccidentAttachment,
  deleteAccidentAttachment,
  getAccidentVersions,
  exportAccidents,
  type AccidentsApi,
} from '#/api/hse/accidents';

const currentYear = new Date().getFullYear();
const yearOptions = computed(() => {
  const years = [];
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    years.push(y);
  }
  return years;
});

// 搜索表单交给 useSearchForm 托管；onSearch 触发列表回到第 1 页重新拉取
const search = useSearchForm({
  defaults: {
    keyword: '',
    level: undefined as string | undefined,
    type: undefined as string | undefined,
    status: undefined as string | undefined,
    year: undefined as number | undefined,
    month: undefined as number | undefined,
    expiryStatus: undefined as AccidentsApi.ExpiryStatus | undefined,
  },
  onSearch: () => table.handleReset(),
});

// 列表数据 / 分页 / loading 交给 useDataTable 托管（reactive 包裹以拆包嵌套 ref）
const table = reactive(
  useDataTable<AccidentsApi.AccidentItem>({
    fetchFn: async ({ page, pageSize }) => {
      await fetchStats();
      const params: AccidentsApi.AccidentListParams = {
        page,
        pageSize,
        keyword: search.form.keyword || undefined,
        level: search.form.level,
        type: search.form.type,
        status: search.form.status,
        year: search.form.year,
        month: search.form.month,
        expiryStatus: search.form.expiryStatus,
      };
      return getAccidentList(params);
    },
    defaultPageSize: 10,
    paginationExtra: {
      showSizeChanger: true,
      showQuickJumper: true,
      showTotal: (t: number) => $t('hse.accidents.totalRecords', { total: t }),
    },
  }),
);

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingAccident = ref<AccidentsApi.AccidentItem | null>(null);
const accidentForm = reactive({
  title: '',
  description: '',
  level: 'general' as AccidentsApi.AccidentItem['level'],
  type: 'other' as AccidentsApi.AccidentItem['type'],
  status: 'reported' as AccidentsApi.AccidentItem['status'],
  location: '',
  occurredAt: undefined as Dayjs | undefined,
  reporter: '',
  reporterId: null as number | null,
  handler: '',
  handlerId: null as number | null,
  casualties: 0,
  injuries: 0,
  economicLoss: 0,
  rectificationDeadlineDays: 30,
  relatedHazardId: undefined as number | undefined,
  relatedEmergencyId: undefined as number | undefined,
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  title: [
    { required: true, message: $t('hse.accidents.validate.titleRequired'), trigger: 'blur' },
    { min: 3, max: 100, message: $t('hse.accidents.validate.titleLength'), trigger: 'blur' },
  ],
  level: [{ required: true, message: $t('hse.accidents.validate.levelRequired'), trigger: 'change' }],
  type: [{ required: true, message: $t('hse.accidents.validate.typeRequired'), trigger: 'change' }],
  location: [{ required: true, message: $t('hse.accidents.validate.locationRequired'), trigger: 'blur' }],
  occurredAt: [{ required: true, message: $t('hse.accidents.validate.occurredAtRequired'), trigger: 'change' }],
  reporter: [{ required: true, message: $t('hse.accidents.validate.reporterRequired'), trigger: 'blur' }],
  casualties: [
    { required: true, message: $t('hse.accidents.validate.casualtiesRequired'), trigger: 'change' },
    { type: 'number', min: 0, message: $t('hse.accidents.validate.casualtiesMin'), trigger: 'change' },
  ],
  injuries: [
    { required: true, message: $t('hse.accidents.validate.injuriesRequired'), trigger: 'change' },
    { type: 'number', min: 0, message: $t('hse.accidents.validate.injuriesMin'), trigger: 'change' },
  ],
  economicLoss: [
    { required: true, message: $t('hse.accidents.validate.economicLossRequired'), trigger: 'change' },
    { type: 'number', min: 0, message: $t('hse.accidents.validate.economicLossMin'), trigger: 'change' },
  ],
};

const detailDrawerVisible = ref(false);
const currentAccident = ref<AccidentsApi.AccidentItem | null>(null);

// 详情 Drawer Tab 切换
const detailTab = ref<'attachments' | 'versions'>('attachments');

// 附件列表状态
const attachmentList = ref<AccidentsApi.Attachment[]>([]);
const attachmentLoading = ref(false);
const attachmentUploading = ref(false);
const uploadVersion = ref('');
const attachmentColumns = [
  { title: $t('hse.accidents.attachment.fileName'), key: 'originalName', width: 280 },
  { title: $t('hse.accidents.attachment.version'), dataIndex: 'version', key: 'version', width: 90 },
  { title: $t('hse.accidents.attachment.uploadedBy'), dataIndex: 'uploadedBy', key: 'uploadedBy', width: 100 },
  { title: $t('hse.accidents.attachment.fileSize'), key: 'fileSize', width: 100 },
  { title: $t('hse.accidents.attachment.uploadedAt'), key: 'createdAt', width: 160 },
  { title: $t('hse.accidents.action.title'), key: 'action', width: 130 },
];

// 历史版本状态
const versionList = ref<AccidentsApi.VersionRecord[]>([]);
const versionLoading = ref(false);
const versionColumns = [
  { title: $t('hse.accidents.version.version'), dataIndex: 'version', key: 'version', width: 100 },
  { title: $t('hse.accidents.version.changeType'), key: 'changeType', width: 110 },
  { title: $t('hse.accidents.version.changeSummary'), dataIndex: 'changeSummary', key: 'changeSummary' },
  { title: $t('hse.accidents.version.changedBy'), dataIndex: 'changedBy', key: 'changedBy', width: 110 },
  { title: $t('hse.accidents.version.changedAt'), key: 'createdAt', width: 160 },
];

// 报表导出
const exportLoading = ref(false);

const statsData = ref<AccidentsApi.AccidentStats>({
  total: 0,
  major: 0,
  serious: 0,
  general: 0,
  minor: 0,
  openCount: 0,
  closedCount: 0,
  totalCasualties: 0,
  totalInjuries: 0,
  totalEconomicLoss: 0,
  expiring: 0,
  expired: 0,
});

const statsLoading = ref(false);

const statItems = computed(() => [
  { key: 'total', label: $t('hse.accidents.stats.total'), value: statsData.value.total, color: 'blue', icon: 'lucide:bar-chart-3' },
  { key: 'major', label: $t('hse.accidents.stats.major'), value: statsData.value.major, color: 'red', icon: 'lucide:alert-triangle' },
  { key: 'openCount', label: $t('hse.accidents.stats.open'), value: statsData.value.openCount, color: 'orange', icon: 'lucide:clock' },
  { key: 'casualties', label: $t('hse.accidents.stats.casualties'), value: statsData.value.totalCasualties, color: 'red', icon: 'lucide:heart-pulse' },
  {
    key: 'loss',
    label: $t('hse.accidents.stats.loss'),
    value: formatMoney(statsData.value.totalEconomicLoss / 10000),
    color: 'orange',
    icon: 'lucide:dollar-sign',
  },
]);

const originalColumns = ref([
  { title: $t('hse.accidents.column.title'), dataIndex: 'title', key: 'title', width: 200 },
  { title: $t('hse.accidents.column.level'), key: 'level', width: 90 },
  { title: $t('hse.accidents.column.type'), key: 'type', width: 100 },
  { title: $t('hse.accidents.column.status'), key: 'status', width: 100 },
  { title: $t('hse.accidents.column.reportGroup'), key: 'reportGroup', width: 100, align: 'center' as const },
  { title: $t('hse.accidents.expiry.title'), key: 'expiryStatus', width: 110, align: 'center' as const },
  { title: $t('hse.accidents.column.occurredAt'), key: 'occurredAt', width: 160 },
  { title: $t('hse.accidents.column.casualties'), key: 'casualties', width: 130 },
  { title: $t('hse.accidents.column.economicLoss'), key: 'economicLoss', width: 120 },
  { title: $t('hse.accidents.action.title'), key: 'action', width: 200, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'accidents');
const tableRef = ref<any>(null);

const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([
  { key: 'import', label: $t('hse.accidents.action.import') },
  { key: 'export', label: $t('hse.accidents.action.export') },
  { key: 'create', label: $t('hse.accidents.action.create') },
]);

const { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'accidents',
  statItems: visibilityStatItems,
  actionButtons,
});

const hasVisibleStats = computed(() => statItems.value.some((s) => isStatVisible.value(s.key)));

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

function formatMoney(value: number): string {
  return (value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// 文件大小格式化
function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getLevelColor(level: string): string {
  const map: Record<string, string> = {
    major: 'red',
    serious: 'orange',
    general: 'blue',
    minor: 'default',
  };
  return map[level] || 'default';
}

function getLevelText(level: string): string {
  const map: Record<string, string> = {
    major: $t('hse.accidents.level.major'),
    serious: $t('hse.accidents.level.serious'),
    general: $t('hse.accidents.level.general'),
    minor: $t('hse.accidents.level.minor'),
  };
  return map[level] || level;
}

function getTypeText(type: string): string {
  const map: Record<string, string> = {
    traffic: $t('hse.accidents.type.traffic'),
    occupational: $t('hse.accidents.type.occupational'),
    equipment: $t('hse.accidents.type.equipment'),
    fire: $t('hse.accidents.type.fire'),
    environmental: $t('hse.accidents.type.environmental'),
    other: $t('hse.accidents.type.other'),
  };
  return map[type] || type;
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    reported: 'gold',
    investigating: 'orange',
    processing: 'blue',
    closed: 'green',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    reported: $t('hse.accidents.status.reported'),
    investigating: $t('hse.accidents.status.investigating'),
    processing: $t('hse.accidents.status.processing'),
    closed: $t('hse.accidents.status.closed'),
  };
  return map[status] || status;
}

// 时效状态 → Antd Badge 状态映射
function getExpiryBadgeStatus(status?: string): 'success' | 'warning' | 'error' | 'default' | 'processing' {
  const map: Record<string, 'success' | 'warning' | 'error' | 'default' | 'processing'> = {
    normal: 'success',       // 绿色 正常
    expiring: 'warning',     // 黄色 临期
    expired: 'error',        // 红色 过期
    closed: 'default',       // 灰色 已结案
    permanent: 'default',    // 灰色 长期有效
    unknown: 'default',
  };
  return map[status || 'unknown'] || 'default';
}

function getExpiryText(status?: string): string {
  const map: Record<string, string> = {
    normal: $t('hse.accidents.expiry.normal'),
    expiring: $t('hse.accidents.expiry.expiring'),
    expired: $t('hse.accidents.expiry.expired'),
    closed: $t('hse.accidents.expiry.closed'),
    permanent: $t('hse.accidents.expiry.permanent'),
    unknown: $t('hse.accidents.expiry.unknown'),
  };
  return map[status || 'unknown'] || $t('hse.accidents.expiry.unknown');
}

// 变更类型颜色
function getChangeTypeColor(type: string): string {
  const map: Record<string, string> = {
    create: 'green',
    update: 'blue',
    import: 'cyan',
    revise: 'orange',
  };
  return map[type] || 'default';
}

// 变更类型文本
function getChangeTypeText(type: string): string {
  const fallbackMap: Record<string, string> = {
    create: $t('hse.accidents.version.changeTypeCreate'),
    update: $t('hse.accidents.version.changeTypeUpdate'),
    import: $t('hse.accidents.version.changeTypeImport'),
    revise: $t('hse.accidents.version.changeTypeRevise'),
  };
  return fallbackMap[type] || type;
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const stats = await getAccidentStats();
    statsData.value = stats;
  } catch (err) {
    console.warn('获取事故统计失败:', err);
    message.error($t('hse.message.fetchStatsFailed'));
    statsData.value = {
      total: 0, major: 0, serious: 0, general: 0, minor: 0,
      openCount: 0, closedCount: 0,
      totalCasualties: 0, totalInjuries: 0, totalEconomicLoss: 0,
      expiring: 0, expired: 0,
    };
  } finally {
    statsLoading.value = false;
  }
}

function handleSearch() {
  table.handleReset();
}

function handleReset() {
  search.reset();
}

// 统计卡点击联动过滤
function handleStatCardClick(key: string) {
  // 重置所有其他过滤项（含 level，避免残留筛选影响统计卡联动）
  search.form.keyword = '';
  search.form.level = undefined;
  search.form.type = undefined;
  search.form.status = undefined;
  search.form.year = undefined;
  search.form.month = undefined;
  search.form.expiryStatus = undefined;

  switch (key) {
    case 'major':
      search.form.level = 'major';
      break;
    case 'openCount':
      // 未结案件：后端 status=open 统一过滤所有非已结案状态（reported/investigating/processing）
      search.form.status = 'open';
      break;
    default:
      search.form.level = undefined;
  }

  table.handleReset();
}

function handleCreate() {
  editingAccident.value = null;
  Object.assign(accidentForm, {
    title: '',
    description: '',
    level: 'general',
    type: 'other',
    status: 'reported',
    location: '',
    occurredAt: dayjs(),
    reporter: '',
    reporterId: null,
    handler: '',
    handlerId: null,
    casualties: 0,
    injuries: 0,
    economicLoss: 0,
    rectificationDeadlineDays: 30,
    relatedHazardId: undefined,
    relatedEmergencyId: undefined,
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: AccidentsApi.AccidentItem) {
  editingAccident.value = record;
  Object.assign(accidentForm, {
    title: record.title,
    description: record.description,
    level: record.level,
    type: record.type,
    status: record.status,
    location: record.location,
    occurredAt: dayjs(record.occurredAt),
    reporter: record.reporter,
    reporterId: record.reporterId ?? null,
    handler: record.handler || '',
    handlerId: record.handlerId ?? null,
    casualties: record.casualties,
    injuries: record.injuries,
    economicLoss: record.economicLoss,
    rectificationDeadlineDays: record.rectificationDeadlineDays || 30,
    relatedHazardId: record.relatedHazardId || undefined,
    relatedEmergencyId: record.relatedEmergencyId || undefined,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

function handleView(record: AccidentsApi.AccidentItem) {
  currentAccident.value = record;
  detailDrawerVisible.value = true;
  detailTab.value = 'attachments';
  attachmentList.value = [];
  versionList.value = [];
  uploadVersion.value = '';
  fetchAttachments(record.id);
  fetchVersions(record.id);
}

// 获取附件列表
async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getAccidentAttachments(id);
    attachmentList.value = res || [];
  } catch (err) {
    console.warn('获取附件列表失败:', err);
    message.error($t('hse.accidents.attachment.loadFailed'));
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

// 上传附件
async function handleUploadAttachment(file: File) {
  if (!currentAccident.value) return false;
  attachmentUploading.value = true;
  try {
    await uploadAccidentAttachment(currentAccident.value.id, file, {
      version: uploadVersion.value || undefined,
      uploadedBy: 'admin',
    });
    message.success($t('hse.accidents.attachment.uploadSuccess'));
    uploadVersion.value = '';
    await fetchAttachments(currentAccident.value.id);
  } catch (err) {
    console.warn('附件上传失败:', err);
    message.error($t('hse.accidents.attachment.uploadFailed'));
  } finally {
    attachmentUploading.value = false;
  }
  return false; // 阻止 antd Upload 默认上传
}

// 删除附件
async function handleDeleteAttachment(record: AccidentsApi.Attachment) {
  if (!currentAccident.value) return;
  try {
    await deleteAccidentAttachment(currentAccident.value.id, record.id);
    message.success($t('hse.accidents.attachment.deleteSuccess'));
    await fetchAttachments(currentAccident.value.id);
  } catch (err) {
    console.warn('附件删除失败:', err);
    message.error($t('hse.accidents.attachment.deleteFailed'));
  }
}

// 获取历史版本
async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getAccidentVersions(id);
    versionList.value = res || [];
  } catch (err) {
    console.warn('获取历史版本失败:', err);
    message.error($t('hse.accidents.version.loadFailed'));
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

// 报表导出
async function handleExport() {
  exportLoading.value = true;
  try {
    const blob = await exportAccidents();
    if (!(blob instanceof Blob)) {
      message.error($t('hse.accidents.export.failed'));
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `accidents_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success($t('hse.accidents.export.success'));
  } catch (err) {
    console.warn('导出失败:', err);
    message.error($t('hse.accidents.export.failed'));
  } finally {
    exportLoading.value = false;
  }
}

async function handleStatusChange(newStatus: string) {
  if (!currentAccident.value) return;
  try {
    const updateData: Partial<AccidentsApi.AccidentItem> = { status: newStatus as any };
    if (newStatus === 'closed') {
      updateData.closedAt = new Date().toISOString();
    }
    await updateAccident(currentAccident.value.id, updateData);
    message.success($t('hse.accidents.message.statusUpdated'));
    currentAccident.value = { ...currentAccident.value, ...updateData };
    table.fetchData();
  } catch (err) {
    console.warn('状态更新失败:', err);
    message.error($t('hse.message.updateFailed'));
  }
}

// 报送集团开关：列表单元格切换即保存（乐观更新，失败回滚）
async function handleReportGroupChange(record: AccidentsApi.AccidentItem, checked: boolean) {
  const prev = !!record.reportGroup;
  record.reportGroup = checked;
  try {
    await updateAccident(record.id, { report_group: checked });
    message.success(
      checked
        ? $t('hse.accidents.reportGroup.reportedSuccess')
        : $t('hse.accidents.reportGroup.unreportedSuccess'),
    );
  } catch (err) {
    record.reportGroup = prev;
    console.warn('报送集团状态更新失败:', err);
    message.error($t('hse.message.updateFailed'));
  }
}

function onHandlerChange(item: any) {
  accidentForm.handler = item?.name ?? '';
}

function onReporterChange(item: any) {
  accidentForm.reporter = item?.name ?? '';
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!accidentForm.title) {
    message.warning($t('hse.accidents.validate.titleRequired'));
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<AccidentsApi.AccidentItem> = {
      title: accidentForm.title,
      description: accidentForm.description,
      level: accidentForm.level,
      type: accidentForm.type,
      status: accidentForm.status,
      location: accidentForm.location,
      occurredAt:
        accidentForm.occurredAt?.toISOString() || new Date().toISOString(),
      reporter: accidentForm.reporter,
      handler: accidentForm.handler,
      casualties: accidentForm.casualties,
      injuries: accidentForm.injuries,
      economicLoss: accidentForm.economicLoss,
      rectificationDeadlineDays: accidentForm.rectificationDeadlineDays,
      relatedHazardId: accidentForm.relatedHazardId || null,
      relatedEmergencyId: accidentForm.relatedEmergencyId || null,
      remark: accidentForm.remark,
    };
    data.handlerId = accidentForm.handlerId;
    data.reporterId = accidentForm.reporterId;
    if (editingAccident.value) {
      await updateAccident(editingAccident.value.id, data);
      message.success($t('hse.accidents.message.updateSuccess'));
      // 编辑成功后同步详情抽屉(若正在查看同一条记录)与列表对应行，避免抽屉仍显示旧值
      if (currentAccident.value && currentAccident.value.id === editingAccident.value.id) {
        currentAccident.value = { ...currentAccident.value, ...data };
      }
    } else {
      await createAccident(data);
      message.success($t('hse.accidents.message.createSuccess'));
    }
    modalVisible.value = false;
    table.fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error($t('hse.message.saveFailed'));
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: AccidentsApi.AccidentItem) {
  try {
    await deleteAccident(record.id);
    message.success($t('hse.accidents.message.deleteSuccess'));
    table.fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error($t('hse.message.deleteFailed'));
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
  await table.fetchData();
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

  .detail-tabs {
    margin-top: 16px;
  }

  .attachment-section {
    .attachment-toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
  }
}
</style>
