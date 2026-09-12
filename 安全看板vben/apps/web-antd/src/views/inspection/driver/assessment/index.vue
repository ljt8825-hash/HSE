<!-- [DEPRECATED] antd 版已被淘汰，功能已迁移至 web-naive，请勿维护 -->
<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
        <div :class="{ 'stat-card-wrapper': true, 'stat-active': activeStatKey === stat.key }">
          <HseStatCard
            :title="stat.label"
            :value="stat.value"
            :icon="stat.icon"
            :color="stat.color"
            :clickable="true"
            @click="handleStatCardClick(stat.key)"
          />
        </div>
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>交通安全档案</span>
          <div class="action-group">
            <ImportButtonGroup module="driver-assessment" module-name="交通安全档案" @refresh="handleImportRefresh" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增档案
            </Button>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="姓名">
          <Input v-model:value="searchForm.name" placeholder="搜索姓名" allow-clear @change="handleSearch" />
        </FormItem>
        <FormItem label="所属部门">
          <Select v-model:value="searchForm.department" placeholder="全部部门" allow-clear style="width: 160px" @change="handleSearch">
            <SelectOption v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="评估状态">
          <Select v-model:value="searchForm.status" placeholder="全部状态" allow-clear style="width: 140px" @change="handleSearch">
            <SelectOption v-for="s in statusOptions" :key="s" :value="s">{{ s }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="建档年份">
          <Select v-model:value="searchForm.archiveYear" placeholder="全部年份" allow-clear style="width: 120px" @change="handleSearch">
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
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: filteredTotal,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="handleTableChange"
        size="middle"
        :scroll="{ x: 1400 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">{{ record.status }}</Tag>
          </template>
          <template v-else-if="column.key === 'assessmentDate' || column.key === 'expiryDate'">
            {{ formatDate(record[column.key]) }}
          </template>
          <template v-else-if="column.key === 'name'">
            <span :class="{ 'manager-mismatch': isNameMismatch(record.name) }">{{ record.name || '-' }}</span>
            <Tag v-if="isNameMismatch(record.name)" color="warning" class="ml-1">未匹配</Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
            <Popconfirm title="确定要删除此评估档案吗？" ok-text="删除" cancel-text="取消" @confirm="handleDelete(record)">
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑评估档案' : '新增评估档案'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="formData" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="姓名" name="name">
              <Input v-model:value="formData.name" placeholder="请输入姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="档案编号" name="archiveNo">
              <Input v-model:value="formData.archiveNo" placeholder="请输入档案编号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="驾驶证件号" name="idCard">
              <Input v-model:value="formData.idCard" placeholder="请输入驾驶证件号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="准驾车型" name="licenseType">
              <Select v-model:value="formData.licenseType" placeholder="请选择准驾车型" style="width: 100%">
                <SelectOption v-for="t in licenseTypeOptions" :key="t" :value="t">{{ t }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="所属部门" name="department">
              <AutoComplete v-model:value="formData.department" :options="departmentAutoOptions" placeholder="请输入或选择部门" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="车辆编号" name="vehicleNo">
              <Input v-model:value="formData.vehicleNo" placeholder="请输入车辆编号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="评估日期" name="assessmentDate">
              <DatePicker :value="formData.assessmentDate ?? undefined" @update:value="(v: any) => formData.assessmentDate = v" style="width: 100%" value-format="YYYY-MM-DD" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="评估结果" name="assessmentResult">
              <Select v-model:value="formData.assessmentResult" placeholder="请选择评估结果" style="width: 100%">
                <SelectOption value="合格">合格</SelectOption>
                <SelectOption value="不合格">不合格</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="评估等级" name="assessmentLevel">
              <Select v-model:value="formData.assessmentLevel" placeholder="请选择评估等级" style="width: 100%">
                <SelectOption v-for="l in assessmentLevelOptions" :key="l" :value="l">{{ l }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="有效期至" name="expiryDate">
              <DatePicker :value="formData.expiryDate ?? undefined" @update:value="(v: any) => formData.expiryDate = v" style="width: 100%" value-format="YYYY-MM-DD" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="联系电话" name="phone">
              <Input v-model:value="formData.phone" placeholder="请输入联系电话" />
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

    <Drawer v-model:open="detailDrawerVisible" title="评估档案详情" width="720px">
      <template v-if="currentRecord">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRecord.name }}</h3>
          <Tag :color="getStatusColor(currentRecord.status)">{{ currentRecord.status }}</Tag>
        </div>
        <div class="detail-section">
          <Row :gutter="16">
            <Col :span="12"><div class="detail-row"><span class="detail-label">档案编号：</span><span class="detail-value">{{ currentRecord.archiveNo || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">驾驶证件号：</span><span class="detail-value">{{ currentRecord.idCard || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">准驾车型：</span><span class="detail-value">{{ currentRecord.licenseType || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">所属部门：</span><span class="detail-value">{{ currentRecord.department || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">车辆编号：</span><span class="detail-value">{{ currentRecord.vehicleNo || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">评估结果：</span><span class="detail-value">{{ currentRecord.assessmentResult || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">评估等级：</span><span class="detail-value">{{ currentRecord.assessmentLevel || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">联系电话：</span><span class="detail-value">{{ currentRecord.phone || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">评估日期：</span><span class="detail-value">{{ formatDate(currentRecord.assessmentDate) }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">有效期至：</span><span class="detail-value">{{ formatDate(currentRecord.expiryDate) }}</span></div></Col>
          </Row>
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
  Card, Row, Col, Table, Form, FormItem, Input, Select, SelectOption, Button, Modal, Drawer, Tag, DatePicker, Textarea, AutoComplete, Alert, Spin, message, Popconfirm,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import dayjs from 'dayjs';
import {
  getDriverAssessmentList, createDriverAssessment, updateDriverAssessment, deleteDriverAssessment, type SiteApi,
} from '#/api/hse/site';
import { getEmployeeList } from '#/api/hse/employee';

const loading = ref(false);
const list = ref<SiteApi.DriverAssessment[]>([]);

const activeStatKey = ref<string>('');
const searchForm = reactive({ name: '', department: undefined as string | undefined, status: undefined as string | undefined, archiveYear: undefined as number | undefined });
const pagination = reactive({ page: 1, pageSize: 10 });

const licenseTypeOptions = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'D', 'E'];
const assessmentLevelOptions = ['优', '良', '中', '差'];
const statusOptions = ['有效', '已过期', '待复检'];

const departmentOptions = ref<string[]>([]);
const departmentAutoOptions = computed(() => departmentOptions.value.map((d) => ({ value: d })));

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<SiteApi.DriverAssessment | null>(null);
const formData = reactive<Partial<SiteApi.DriverAssessment>>({
  name: '', archiveNo: '', idCard: '', licenseType: '', department: '', vehicleNo: '',
  assessmentDate: '', assessmentResult: '合格', assessmentLevel: '', expiryDate: '', phone: '', remark: '',
});
const formRef = ref<FormInstance>();
const formRules: Record<string, any> = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }, { min: 2, max: 50, message: '姓名长度为2-50字符', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.DriverAssessment | null>(null);

// ========= 派生状态 =========
function deriveStatus(expiryDate: string | null | undefined): string {
  if (!expiryDate) return '有效';
  const exp = dayjs(expiryDate).startOf('day');
  const today = dayjs().startOf('day');
  if (exp.isBefore(today)) return '已过期';
  if (exp.diff(today, 'day') <= 30) return '待复检';
  return '有效';
}

const listWithStatus = computed(() => list.value.map((r) => ({ ...r, status: deriveStatus(r.expiryDate) })));

const statItems = computed(() => {
  const l = listWithStatus.value;
  const valid = l.filter((r) => r.status === '有效').length;
  const expired = l.filter((r) => r.status === '已过期').length;
  const review = l.filter((r) => r.status === '待复检').length;
  return [
    { key: 'total', label: '档案总数', value: l.length, color: 'blue' as const, icon: 'lucide:file-text' },
    { key: 'valid', label: '有效', value: valid, color: 'green' as const, icon: 'lucide:check-circle-2' },
    { key: 'expired', label: '已过期', value: expired, color: 'red' as const, icon: 'lucide:clock' },
    { key: 'review', label: '待复检', value: review, color: 'orange' as const, icon: 'lucide:alert-triangle' },
  ];
});

const yearOptions = computed(() => {
  const years = new Set<number>();
  for (const item of list.value) {
    if (item.assessmentDate) years.add(dayjs(item.assessmentDate).year());
  }
  years.add(dayjs().year());
  return Array.from(years).sort((a, b) => b - a);
});

function handleStatCardClick(key: string) {
  activeStatKey.value = activeStatKey.value === key ? '' : key;
  pagination.page = 1;
}

const filteredList = computed(() => {
  let l = listWithStatus.value;
  if (activeStatKey.value && activeStatKey.value !== 'total') {
    l = l.filter((r) => r.status === activeStatKey.value);
  }
  if (searchForm.name) {
    const kw = searchForm.name.toLowerCase();
    l = l.filter((r) => r.name && r.name.toLowerCase().includes(kw));
  }
  if (searchForm.department) l = l.filter((r) => r.department === searchForm.department);
  if (searchForm.status) l = l.filter((r) => r.status === searchForm.status);
  if (searchForm.archiveYear) l = l.filter((r) => r.assessmentDate && dayjs(r.assessmentDate).year() === searchForm.archiveYear);
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
  { title: '驾驶证件号', dataIndex: 'idCard', key: 'idCard', width: 160 },
  { title: '准驾车型', dataIndex: 'licenseType', key: 'licenseType', width: 90 },
  { title: '所属部门', dataIndex: 'department', key: 'department', width: 140 },
  { title: '车辆编号', dataIndex: 'vehicleNo', key: 'vehicleNo', width: 120 },
  { title: '档案编号', dataIndex: 'archiveNo', key: 'archiveNo', width: 120 },
  { title: '评估日期', dataIndex: 'assessmentDate', key: 'assessmentDate', width: 120 },
  { title: '评估结果', dataIndex: 'assessmentResult', key: 'assessmentResult', width: 90 },
  { title: '有效期至', dataIndex: 'expiryDate', key: 'expiryDate', width: 120 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 130 },
  { title: '操作', key: 'action', width: 170, fixed: 'right' as const },
];

function getStatusColor(status?: string) {
  const map: Record<string, string> = { '有效': 'green', '已过期': 'red', '待复检': 'orange' };
  return (status && map[status]) || 'default';
}

function formatDate(date: string | null | undefined) {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

async function fetchList() {
  loading.value = true;
  try {
    const all: SiteApi.DriverAssessment[] = [];
    let page = 1;
    const pageSize = 200;
    let total = 0;
    do {
      const res = await getDriverAssessmentList({ page, pageSize });
      all.push(...(res.list || []));
      total = res.total || 0;
      page++;
    } while (all.length < total);
    list.value = all;
    departmentOptions.value = Array.from(new Set(all.map((r) => r.department).filter(Boolean))).sort();
  } catch (err) {
    console.warn('获取评估档案列表失败:', err);
    message.error('获取数据失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() { pagination.page = 1; }
function handleReset() {
  searchForm.name = ''; searchForm.department = undefined; searchForm.status = undefined; searchForm.archiveYear = undefined;
  activeStatKey.value = ''; pagination.page = 1;
}
function handleTableChange(pag: any) { pagination.page = pag.current; pagination.pageSize = pag.pageSize; }

function handleCreate() {
  editingRecord.value = null;
  Object.assign(formData, {
    name: '', archiveNo: '', idCard: '', licenseType: '', department: '', vehicleNo: '',
    assessmentDate: dayjs().format('YYYY-MM-DD'), assessmentResult: '合格', assessmentLevel: '',
    expiryDate: dayjs().add(1, 'year').format('YYYY-MM-DD'), phone: '', remark: '',
  });
  modalVisible.value = true;
}
function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(formData, record);
  modalVisible.value = true;
}
function handleView(record: any) {
  currentRecord.value = { ...record, status: deriveStatus(record.expiryDate) };
  detailDrawerVisible.value = true;
}
async function handleSave() {
  try { await formRef.value?.validate(); } catch { return; }
  modalLoading.value = true;
  try {
    if (editingRecord.value) {
      await updateDriverAssessment(editingRecord.value.id, formData);
      message.success('更新成功');
    } else {
      await createDriverAssessment(formData);
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
    await deleteDriverAssessment(record.id);
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
const personnelMatchResult = ref<{ total: number; matched: number; mismatches: Array<{ id: number; name: string; department: string }> } | null>(null);
const matchColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
  { title: '所属部门', dataIndex: 'department', key: 'department', width: 160 },
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
    const mismatches: Array<{ id: number; name: string; department: string }> = [];
    let matched = 0;
    for (const r of list.value) {
      if (!r.name) continue;
      if (rosterNames.value.has(r.name)) matched++;
      else mismatches.push({ id: r.id, name: r.name, department: r.department || '-' });
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
  const headers = '姓名,所属部门,状态\n';
  const rows = personnelMatchResult.value.mismatches.map((r) => `"${r.name}","${r.department}","未匹配"`).join('\n');
  const blob = new Blob(['﻿' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'driver-assessment_personnel_mismatch.csv';
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
