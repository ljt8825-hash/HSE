<!-- [DEPRECATED] antd 版已被淘汰，功能已迁移至 web-naive，请勿维护 -->
<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
        <div :class="{ 'stat-card-wrapper': true, 'stat-active': activeStatKey === stat.key }">
          <HseStatCard :title="stat.label" :value="stat.value" :icon="stat.icon" :color="stat.color" :clickable="true" @click="handleStatCardClick(stat.key)" />
        </div>
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>驾驶员违章记录</span>
          <div class="action-group">
            <ImportButtonGroup module="driver-violation" module-name="驾驶员违章记录" @refresh="handleImportRefresh" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增违章
            </Button>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="姓名">
          <Input v-model:value="searchForm.name" placeholder="搜索姓名" allow-clear @change="handleSearch" />
        </FormItem>
        <FormItem label="车牌号">
          <Input v-model:value="searchForm.plateNo" placeholder="搜索车牌号" allow-clear @change="handleSearch" />
        </FormItem>
        <FormItem label="违章类别">
          <Select v-model:value="searchForm.violationType" placeholder="全部类别" allow-clear style="width: 140px" @change="handleSearch">
            <SelectOption v-for="t in violationTypeOptions" :key="t" :value="t">{{ t }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="处理状态">
          <Select v-model:value="searchForm.handleStatus" placeholder="全部状态" allow-clear style="width: 140px" @change="handleSearch">
            <SelectOption value="待处理">待处理</SelectOption>
            <SelectOption value="已处理">已处理</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="违章年份">
          <Select v-model:value="searchForm.year" placeholder="全部年份" allow-clear style="width: 120px" @change="handleSearch">
            <SelectOption v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="paginatedList"
        :loading="loading"
        :pagination="{ current: pagination.page, pageSize: pagination.pageSize, total: filteredTotal, showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` }"
        :row-key="(record: any) => record.id"
        @change="handleTableChange"
        size="middle"
        :scroll="{ x: 1400 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'handleStatus'">
            <Tag :color="getStatusColor(record.handleStatus)">{{ record.handleStatus }}</Tag>
          </template>
          <template v-else-if="column.key === 'violationTime'">
            {{ formatDateTime(record.violationTime) }}
          </template>
          <template v-else-if="column.key === 'name'">
            <span :class="{ 'manager-mismatch': isNameMismatch(record.name) }">{{ record.name || '-' }}</span>
            <Tag v-if="isNameMismatch(record.name)" color="warning" class="ml-1">未匹配</Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
            <Popconfirm title="确定要删除此违章记录吗？" ok-text="删除" cancel-text="取消" @confirm="handleDelete(record)">
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal v-model:open="modalVisible" :title="editingRecord ? '编辑违章记录' : '新增违章记录'" :confirm-loading="modalLoading" width="720px" @ok="handleSave" @cancel="modalVisible = false">
      <Form ref="formRef" :model="formData" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="姓名" name="name">
              <Input v-model:value="formData.name" placeholder="请输入姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="车牌号" name="plateNo">
              <Input v-model:value="formData.plateNo" placeholder="请输入车牌号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="违章时间" name="violationTime">
              <DatePicker :value="formData.violationTime ?? undefined" @update:value="(v: any) => formData.violationTime = v" style="width: 100%" show-time value-format="YYYY-MM-DD HH:mm" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="违章地点" name="violationLocation">
              <Input v-model:value="formData.violationLocation" placeholder="请输入违章地点" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="违章类别" name="violationType">
              <Select v-model:value="formData.violationType" placeholder="请选择违章类别" style="width: 100%">
                <SelectOption v-for="t in violationTypeOptions" :key="t" :value="t">{{ t }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处理状态" name="handleStatus">
              <Select v-model:value="formData.handleStatus" placeholder="请选择处理状态" style="width: 100%">
                <SelectOption value="待处理">待处理</SelectOption>
                <SelectOption value="已处理">已处理</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="扣分" name="demeritPoints">
              <InputNumber v-model:value="formData.demeritPoints" :min="0" :max="12" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="罚款金额(元)" name="fineAmount">
              <InputNumber v-model:value="formData.fineAmount" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处理方式" name="handleMethod">
              <Input v-model:value="formData.handleMethod" placeholder="请输入处理方式" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="处理结果" name="handleResult">
              <Input v-model:value="formData.handleResult" placeholder="请输入处理结果" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="违章事实描述" name="violationDesc">
              <Textarea v-model:value="formData.violationDesc" :rows="2" placeholder="请描述违章事实" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Textarea v-model:value="formData.remark" :rows="2" placeholder="其他需要说明的事项" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="违章记录详情" width="720px">
      <template v-if="currentRecord">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRecord.name }} · {{ currentRecord.plateNo }}</h3>
          <Tag :color="getStatusColor(currentRecord.handleStatus)">{{ currentRecord.handleStatus }}</Tag>
        </div>
        <div class="detail-section">
          <Row :gutter="16">
            <Col :span="12"><div class="detail-row"><span class="detail-label">违章时间：</span><span class="detail-value">{{ formatDateTime(currentRecord.violationTime) }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">违章地点：</span><span class="detail-value">{{ currentRecord.violationLocation || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">违章类别：</span><span class="detail-value">{{ currentRecord.violationType || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">扣分：</span><span class="detail-value">{{ currentRecord.demeritPoints }} 分</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">罚款金额：</span><span class="detail-value">{{ currentRecord.fineAmount }} 元</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">处理方式：</span><span class="detail-value">{{ currentRecord.handleMethod || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">处理结果：</span><span class="detail-value">{{ currentRecord.handleResult || '-' }}</span></div></Col>
          </Row>
        </div>
        <div v-if="currentRecord.violationDesc" class="detail-section">
          <div class="detail-label">违章事实描述</div>
          <div class="detail-content">{{ currentRecord.violationDesc }}</div>
        </div>
        <div v-if="currentRecord.remark" class="detail-section">
          <div class="detail-label">备注</div>
          <div class="detail-content">{{ currentRecord.remark }}</div>
        </div>
      </template>
    </Drawer>

    <Modal v-model:open="personnelMatchVisible" title="导入人员匹配校验" width="860px" :footer="null" @cancel="personnelMatchVisible = false">
      <div v-if="personnelMatchLoading" class="match-loading"><Spin tip="正在校验人员匹配..." /></div>
      <div v-else-if="personnelMatchResult">
        <Alert :type="personnelMatchResult.mismatches.length === 0 ? 'success' : 'warning'" show-icon class="match-alert">
          <template #message>
            <span>共校验 {{ personnelMatchResult.total }} 条记录，匹配 {{ personnelMatchResult.matched }} 条，
              <span :class="{ 'text-warning': personnelMatchResult.mismatches.length > 0 }">不匹配 {{ personnelMatchResult.mismatches.length }} 条</span>
            </span>
          </template>
          <template #description v-if="personnelMatchResult.mismatches.length > 0">以下记录的姓名在花名册中未找到，请核对后修正。</template>
        </Alert>
        <Table v-if="personnelMatchResult.mismatches.length > 0" :columns="matchColumns" :data-source="personnelMatchResult.mismatches"
          :pagination="{ pageSize: 8, size: 'small' }" :row-key="(record: any) => record.id" size="small" class="match-table" :scroll="{ y: 320 }">
          <template #bodyCell="{ column }">
            <template v-if="column.key === 'status'"><Tag color="warning">未匹配</Tag></template>
          </template>
        </Table>
        <div class="match-actions">
          <Button @click="handleDownloadMatchErrors">下载不匹配记录</Button>
          <Button type="primary" @click="personnelMatchVisible = false">关闭</Button>
        </div>
      </div>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import {
  Card, Row, Col, Table, Form, FormItem, Input, Select, SelectOption, Button, Modal, Drawer, Tag, DatePicker, InputNumber, Textarea, Alert, Spin, message, Popconfirm,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import dayjs from 'dayjs';
import {
  getDriverViolationList, createDriverViolation, updateDriverViolation, deleteDriverViolation, type SiteApi,
} from '#/api/hse/site';
import { getEmployeeList } from '#/api/hse/employee';

const loading = ref(false);
const list = ref<SiteApi.DriverViolation[]>([]);

const activeStatKey = ref<string>('');
const searchForm = reactive({ name: '', plateNo: '', violationType: undefined as string | undefined, handleStatus: undefined as string | undefined, year: undefined as number | undefined });
const pagination = reactive({ page: 1, pageSize: 10 });

const violationTypeOptions = ['超速', '闯红灯', '违停', '疲劳驾驶', '酒驾', '其它'];

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<SiteApi.DriverViolation | null>(null);
const formData = reactive<Partial<SiteApi.DriverViolation>>({
  name: '', plateNo: '', violationTime: '', violationLocation: '', violationType: '', violationDesc: '',
  demeritPoints: 0, fineAmount: 0, handleStatus: '待处理', handleMethod: '', handleResult: '', remark: '',
});
const formRef = ref<FormInstance>();
const formRules: Record<string, any> = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }, { min: 2, max: 50, message: '姓名长度为2-50字符', trigger: 'blur' }],
  plateNo: [{ required: true, message: '请输入车牌号', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.DriverViolation | null>(null);

const statItems = computed(() => {
  const l = list.value;
  const pending = l.filter((r) => r.handleStatus === '待处理').length;
  const handled = l.filter((r) => r.handleStatus === '已处理').length;
  return [
    { key: 'total', label: '违章总数', value: l.length, color: 'blue' as const, icon: 'lucide:list' },
    { key: 'pending', label: '未处理', value: pending, color: 'red' as const, icon: 'lucide:alert-circle' },
    { key: 'handled', label: '已处理', value: handled, color: 'green' as const, icon: 'lucide:check-circle-2' },
    { key: 'rectify', label: '待完成整改', value: pending, color: 'orange' as const, icon: 'lucide:alert-triangle' },
  ];
});

const yearOptions = computed(() => {
  const years = new Set<number>();
  for (const item of list.value) {
    if (item.violationTime) years.add(dayjs(item.violationTime).year());
  }
  years.add(dayjs().year());
  return Array.from(years).sort((a, b) => b - a);
});

function handleStatCardClick(key: string) {
  activeStatKey.value = activeStatKey.value === key ? '' : key;
  pagination.page = 1;
}

const filteredList = computed(() => {
  let l = list.value;
  if (activeStatKey.value === 'pending' || activeStatKey.value === 'rectify') {
    l = l.filter((r) => r.handleStatus === '待处理');
  } else if (activeStatKey.value === 'handled') {
    l = l.filter((r) => r.handleStatus === '已处理');
  }
  if (searchForm.name) {
    const kw = searchForm.name.toLowerCase();
    l = l.filter((r) => r.name && r.name.toLowerCase().includes(kw));
  }
  if (searchForm.plateNo) {
    const kw = searchForm.plateNo.toLowerCase();
    l = l.filter((r) => r.plateNo && r.plateNo.toLowerCase().includes(kw));
  }
  if (searchForm.violationType) l = l.filter((r) => r.violationType === searchForm.violationType);
  if (searchForm.handleStatus) l = l.filter((r) => r.handleStatus === searchForm.handleStatus);
  if (searchForm.year) l = l.filter((r) => r.violationTime && dayjs(r.violationTime).year() === searchForm.year);
  return l;
});

const filteredTotal = computed(() => filteredList.value.length);
const paginatedList = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredList.value.slice(start, start + pagination.pageSize);
});

const columns = [
  { title: '序号', key: 'index', width: 70, customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 110 },
  { title: '车牌号', dataIndex: 'plateNo', key: 'plateNo', width: 120 },
  { title: '违章时间', dataIndex: 'violationTime', key: 'violationTime', width: 150 },
  { title: '违章地点', dataIndex: 'violationLocation', key: 'violationLocation', width: 140 },
  { title: '违章类别', dataIndex: 'violationType', key: 'violationType', width: 110 },
  { title: '扣分', dataIndex: 'demeritPoints', key: 'demeritPoints', width: 80 },
  { title: '罚款(元)', dataIndex: 'fineAmount', key: 'fineAmount', width: 100 },
  { title: '处理状态', dataIndex: 'handleStatus', key: 'handleStatus', width: 100 },
  { title: '处理结果', dataIndex: 'handleResult', key: 'handleResult', width: 120 },
  { title: '操作', key: 'action', width: 170, fixed: 'right' as const },
];

function getStatusColor(status: string) {
  return status === '已处理' ? 'green' : 'red';
}

function formatDateTime(date: string | null | undefined) {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

async function fetchList() {
  loading.value = true;
  try {
    const all: SiteApi.DriverViolation[] = [];
    let page = 1;
    const pageSize = 200;
    let total = 0;
    do {
      const res = await getDriverViolationList({ page, pageSize });
      all.push(...(res.list || []));
      total = res.total || 0;
      page++;
    } while (all.length < total);
    list.value = all;
  } catch (err) {
    console.warn('获取违章记录列表失败:', err);
    message.error('获取数据失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() { pagination.page = 1; }
function handleReset() {
  searchForm.name = ''; searchForm.plateNo = ''; searchForm.violationType = undefined; searchForm.handleStatus = undefined; searchForm.year = undefined;
  activeStatKey.value = ''; pagination.page = 1;
}
function handleTableChange(pag: any) { pagination.page = pag.current; pagination.pageSize = pag.pageSize; }

function handleCreate() {
  editingRecord.value = null;
  Object.assign(formData, {
    name: '', plateNo: '', violationTime: dayjs().format('YYYY-MM-DD HH:mm'), violationLocation: '', violationType: '',
    violationDesc: '', demeritPoints: 0, fineAmount: 0, handleStatus: '待处理', handleMethod: '', handleResult: '', remark: '',
  });
  modalVisible.value = true;
}
function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(formData, record);
  modalVisible.value = true;
}
function handleView(record: any) {
  currentRecord.value = record;
  detailDrawerVisible.value = true;
}
async function handleSave() {
  try { await formRef.value?.validate(); } catch { return; }
  modalLoading.value = true;
  try {
    if (editingRecord.value) {
      await updateDriverViolation(editingRecord.value.id, formData);
      message.success('更新成功');
    } else {
      await createDriverViolation(formData);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchList();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}
async function handleDelete(record: any) {
  try {
    await deleteDriverViolation(record.id);
    message.success('删除成功');
    fetchList();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

// ========= 花名册匹配 =========
const rosterNames = ref<Set<string>>(new Set());
const personnelMatchVisible = ref(false);
const personnelMatchLoading = ref(false);
const personnelMatchResult = ref<{ total: number; matched: number; mismatches: Array<{ id: number; name: string; plateNo: string }> } | null>(null);
const matchColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
  { title: '车牌号', dataIndex: 'plateNo', key: 'plateNo', width: 140 },
  { title: '状态', key: 'status', width: 90, fixed: 'right' as const },
];
function isNameMismatch(name: string): boolean {
  if (!name) return false;
  return !rosterNames.value.has(name);
}
async function loadRosterNames() {
  try {
    const res = await getEmployeeList({ pageSize: 9999 });
    rosterNames.value = new Set((res.list || []).map((e) => e.name).filter(Boolean));
  } catch (err) {
    console.warn('加载花名册失败:', err);
  }
}
async function checkPersonnelMatch() {
  personnelMatchLoading.value = true;
  personnelMatchVisible.value = true;
  try {
    await loadRosterNames();
    const mismatches: Array<{ id: number; name: string; plateNo: string }> = [];
    let matched = 0;
    for (const r of list.value) {
      if (!r.name) continue;
      if (rosterNames.value.has(r.name)) matched++;
      else mismatches.push({ id: r.id, name: r.name, plateNo: r.plateNo || '-' });
    }
    personnelMatchResult.value = { total: list.value.filter((r) => r.name).length, matched, mismatches };
  } catch (err) {
    console.warn('人员匹配校验失败:', err);
    message.error('人员匹配校验失败');
  } finally {
    personnelMatchLoading.value = false;
  }
}
async function handleImportRefresh() {
  await fetchList();
  await checkPersonnelMatch();
}
function handleDownloadMatchErrors() {
  if (!personnelMatchResult.value?.mismatches.length) return;
  const headers = '姓名,车牌号,状态\n';
  const rows = personnelMatchResult.value.mismatches.map((r) => `"${r.name}","${r.plateNo}","未匹配"`).join('\n');
  const blob = new Blob(['﻿' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'driver-violation_personnel_mismatch.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  message.success('不匹配记录已下载');
}

watch(list, () => {
  if (list.value.length > 0 && rosterNames.value.size === 0) loadRosterNames();
});

onMounted(() => {
  fetchList();
  loadRosterNames();
});
</script>

<style scoped lang="scss">
.card-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.action-group { display: flex; gap: 8px; }
.filter-form { margin-bottom: 16px; }
.stat-card-wrapper { border-radius: 8px; transition: all 0.3s; }
.stat-active { box-shadow: 0 0 0 2px hsl(var(--primary) / 0.4); border-radius: 8px; }
.manager-mismatch { color: hsl(var(--warning)); font-weight: 600; }
.ml-1 { margin-left: 4px; }
.detail-section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid hsl(var(--border)); &:last-child { border-bottom: none; margin-bottom: 0; } }
.detail-title { margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: hsl(var(--foreground)); }
.detail-row { display: flex; align-items: center; margin-bottom: 8px; }
.detail-label { color: hsl(var(--muted-foreground)); min-width: 100px; }
.detail-value { color: hsl(var(--foreground)); flex: 1; }
.detail-content { margin-top: 8px; padding: 12px; background: hsl(var(--muted) / 0.3); border-radius: 6px; color: hsl(var(--foreground)); line-height: 1.6; }
.match-loading { text-align: center; padding: 48px 0; }
.match-alert { margin-bottom: 16px; }
.match-table { margin-bottom: 16px; }
.match-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid hsl(var(--border)); }
.text-warning { color: hsl(var(--warning)); font-weight: 600; }
</style>
