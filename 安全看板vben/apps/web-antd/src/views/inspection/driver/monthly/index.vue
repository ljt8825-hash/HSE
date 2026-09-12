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
          <span>驾驶员月度考核</span>
          <div class="action-group">
            <ImportButtonGroup module="driver-monthly" module-name="月度考核" @refresh="handleImportRefresh" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增考核
            </Button>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="考核月份">
          <MonthPicker v-model:value="searchForm.month" placeholder="选择月份" style="width: 160px" value-format="YYYY-MM" @change="handleSearch" />
        </FormItem>
        <FormItem label="姓名">
          <Input v-model:value="searchForm.name" placeholder="搜索姓名" allow-clear @change="handleSearch" />
        </FormItem>
        <FormItem label="所属部门">
          <Select v-model:value="searchForm.department" placeholder="全部部门" allow-clear style="width: 160px" @change="handleSearch">
            <SelectOption v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="考核等级">
          <Select v-model:value="searchForm.assessmentLevel" placeholder="全部等级" allow-clear style="width: 140px" @change="handleSearch">
            <SelectOption v-for="l in levelOptions" :key="l" :value="l">{{ l }}</SelectOption>
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
        :scroll="{ x: 1300 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'assessmentLevel'">
            <Tag :color="getLevelColor(record.assessmentLevel)">{{ record.assessmentLevel }}</Tag>
          </template>
          <template v-else-if="column.key === 'name'">
            <span :class="{ 'manager-mismatch': isNameMismatch(record.name) }">{{ record.name || '-' }}</span>
            <Tag v-if="isNameMismatch(record.name)" color="warning" class="ml-1">未匹配</Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
            <Popconfirm title="确定要删除此考核记录吗？" ok-text="删除" cancel-text="取消" @confirm="handleDelete(record)">
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal v-model:open="modalVisible" :title="editingRecord ? '编辑考核记录' : '新增考核记录'" :confirm-loading="modalLoading" width="720px" @ok="handleSave" @cancel="modalVisible = false">
      <Form ref="formRef" :model="formData" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="考核月份" name="month">
              <MonthPicker v-model:value="formData.month" placeholder="选择月份" style="width: 100%" value-format="YYYY-MM" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="姓名" name="name">
              <Input v-model:value="formData.name" placeholder="请输入姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="所属部门" name="department">
              <AutoComplete v-model:value="formData.department" :options="departmentAutoOptions" placeholder="请输入或选择部门" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="评定人" name="assessor">
              <Input v-model:value="formData.assessor" placeholder="请输入评定人" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="安全驾驶得分" name="safetyScore">
              <InputNumber v-model:value="formData.safetyScore" :min="0" :max="100" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="遵章守纪得分" name="disciplineScore">
              <InputNumber v-model:value="formData.disciplineScore" :min="0" :max="100" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="培训学习得分" name="trainingScore">
              <InputNumber v-model:value="formData.trainingScore" :min="0" :max="100" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="总分" name="totalScore">
              <InputNumber v-model:value="formData.totalScore" :min="0" :max="300" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="考核等级" name="assessmentLevel">
              <Select v-model:value="formData.assessmentLevel" placeholder="请选择考核等级" style="width: 100%">
                <SelectOption v-for="l in levelOptions" :key="l" :value="l">{{ l }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="主要问题" name="mainProblem">
              <Textarea v-model:value="formData.mainProblem" :rows="2" placeholder="考核中发现的主要问题" />
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

    <Drawer v-model:open="detailDrawerVisible" title="考核记录详情" width="720px">
      <template v-if="currentRecord">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRecord.name }} · {{ currentRecord.month }}</h3>
          <Tag :color="getLevelColor(currentRecord.assessmentLevel)">{{ currentRecord.assessmentLevel }}</Tag>
        </div>
        <div class="detail-section">
          <Row :gutter="16">
            <Col :span="12"><div class="detail-row"><span class="detail-label">所属部门：</span><span class="detail-value">{{ currentRecord.department || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">评定人：</span><span class="detail-value">{{ currentRecord.assessor || '-' }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">安全驾驶得分：</span><span class="detail-value">{{ currentRecord.safetyScore }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">遵章守纪得分：</span><span class="detail-value">{{ currentRecord.disciplineScore }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">培训学习得分：</span><span class="detail-value">{{ currentRecord.trainingScore }}</span></div></Col>
            <Col :span="12"><div class="detail-row"><span class="detail-label">总分：</span><span class="detail-value">{{ currentRecord.totalScore }}</span></div></Col>
          </Row>
        </div>
        <div v-if="currentRecord.mainProblem" class="detail-section">
          <div class="detail-label">主要问题</div>
          <div class="detail-content">{{ currentRecord.mainProblem }}</div>
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
  Card, Row, Col, Table, Form, FormItem, Input, Select, SelectOption, Button, Modal, Drawer, Tag, MonthPicker, InputNumber, Textarea, AutoComplete, Alert, Spin, message, Popconfirm,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import dayjs from 'dayjs';
import {
  getDriverMonthlyList, createDriverMonthly, updateDriverMonthly, deleteDriverMonthly, type SiteApi,
} from '#/api/hse/site';
import { getEmployeeList } from '#/api/hse/employee';

const loading = ref(false);
const list = ref<SiteApi.DriverMonthly[]>([]);

const activeStatKey = ref<string>('');
const searchForm = reactive({ month: undefined as string | undefined, name: '', department: undefined as string | undefined, assessmentLevel: undefined as string | undefined });
const pagination = reactive({ page: 1, pageSize: 10 });

const levelOptions = ['优秀', '良好', '合格', '不合格'];

const departmentOptions = ref<string[]>([]);
const departmentAutoOptions = computed(() => departmentOptions.value.map((d) => ({ value: d })));

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<SiteApi.DriverMonthly | null>(null);
const formData = reactive<Partial<SiteApi.DriverMonthly>>({
  month: dayjs().format('YYYY-MM'), name: '', department: '', safetyScore: 0, disciplineScore: 0, trainingScore: 0,
  totalScore: 0, assessmentLevel: '', mainProblem: '', assessor: '', remark: '',
});
const formRef = ref<FormInstance>();
const formRules: Record<string, any> = {
  month: [{ required: true, message: '请选择考核月份', trigger: 'change' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }, { min: 2, max: 50, message: '姓名长度为2-50字符', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.DriverMonthly | null>(null);

function deriveLevel(score: number | string): string {
  const s = Number(score) || 0;
  if (s >= 90) return '优秀';
  if (s >= 75) return '良好';
  if (s >= 60) return '合格';
  return '不合格';
}

const statItems = computed(() => {
  const l = list.value;
  const excellent = l.filter((r) => r.assessmentLevel === '优秀').length;
  const qualified = l.filter((r) => r.assessmentLevel === '合格').length;
  const unqualified = l.filter((r) => r.assessmentLevel === '不合格').length;
  return [
    { key: 'total', label: '考核记录数', value: l.length, color: 'blue' as const, icon: 'lucide:clipboard-list' },
    { key: 'excellent', label: '优秀', value: excellent, color: 'green' as const, icon: 'lucide:award' },
    { key: 'qualified', label: '合格', value: qualified, color: 'orange' as const, icon: 'lucide:check' },
    { key: 'unqualified', label: '不合格', value: unqualified, color: 'red' as const, icon: 'lucide:x-circle' },
  ];
});

function handleStatCardClick(key: string) {
  activeStatKey.value = activeStatKey.value === key ? '' : key;
  pagination.page = 1;
}

const filteredList = computed(() => {
  let l = list.value;
  if (activeStatKey.value === 'excellent') l = l.filter((r) => r.assessmentLevel === '优秀');
  else if (activeStatKey.value === 'qualified') l = l.filter((r) => r.assessmentLevel === '合格');
  else if (activeStatKey.value === 'unqualified') l = l.filter((r) => r.assessmentLevel === '不合格');
  if (searchForm.month) l = l.filter((r) => r.month === searchForm.month);
  if (searchForm.name) {
    const kw = searchForm.name.toLowerCase();
    l = l.filter((r) => r.name && r.name.toLowerCase().includes(kw));
  }
  if (searchForm.department) l = l.filter((r) => r.department === searchForm.department);
  if (searchForm.assessmentLevel) l = l.filter((r) => r.assessmentLevel === searchForm.assessmentLevel);
  return l;
});

const filteredTotal = computed(() => filteredList.value.length);
const paginatedList = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredList.value.slice(start, start + pagination.pageSize);
});

const columns = [
  { title: '序号', key: 'index', width: 70, customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1 },
  { title: '考核月份', dataIndex: 'month', key: 'month', width: 110 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 110 },
  { title: '所属部门', dataIndex: 'department', key: 'department', width: 140 },
  { title: '得分', dataIndex: 'totalScore', key: 'totalScore', width: 90 },
  { title: '考核等级', dataIndex: 'assessmentLevel', key: 'assessmentLevel', width: 100 },
  { title: '安全驾驶得分', dataIndex: 'safetyScore', key: 'safetyScore', width: 110 },
  { title: '遵章守纪得分', dataIndex: 'disciplineScore', key: 'disciplineScore', width: 110 },
  { title: '培训学习得分', dataIndex: 'trainingScore', key: 'trainingScore', width: 110 },
  { title: '评定人', dataIndex: 'assessor', key: 'assessor', width: 110 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 140 },
  { title: '操作', key: 'action', width: 170, fixed: 'right' as const },
];

function getLevelColor(level: string) {
  const map: Record<string, string> = { '优秀': 'green', '良好': 'blue', '合格': 'orange', '不合格': 'red' };
  return map[level] || 'default';
}

async function fetchList() {
  loading.value = true;
  try {
    const all: SiteApi.DriverMonthly[] = [];
    let page = 1;
    const pageSize = 200;
    let total = 0;
    do {
      const res = await getDriverMonthlyList({ page, pageSize });
      all.push(...(res.list || []));
      total = res.total || 0;
      page++;
    } while (all.length < total);
    list.value = all;
    departmentOptions.value = Array.from(new Set(all.map((r) => r.department).filter(Boolean))).sort();
  } catch (err) {
    console.warn('获取考核记录列表失败:', err);
    message.error('获取数据失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() { pagination.page = 1; }
function handleReset() {
  searchForm.month = undefined; searchForm.name = ''; searchForm.department = undefined; searchForm.assessmentLevel = undefined;
  activeStatKey.value = ''; pagination.page = 1;
}
function handleTableChange(pag: any) { pagination.page = pag.current; pagination.pageSize = pag.pageSize; }

function handleCreate() {
  editingRecord.value = null;
  Object.assign(formData, {
    month: dayjs().format('YYYY-MM'), name: '', department: '', safetyScore: 0, disciplineScore: 0, trainingScore: 0,
    totalScore: 0, assessmentLevel: '', mainProblem: '', assessor: '', remark: '',
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
// 三项子分变动时自动汇总总分与等级
watch([() => formData.safetyScore, () => formData.disciplineScore, () => formData.trainingScore], () => {
  const sum = (Number(formData.safetyScore) || 0) + (Number(formData.disciplineScore) || 0) + (Number(formData.trainingScore) || 0);
  formData.totalScore = sum;
  formData.assessmentLevel = deriveLevel(sum);
});
async function handleSave() {
  try { await formRef.value?.validate(); } catch { return; }
  modalLoading.value = true;
  try {
    if (editingRecord.value) {
      await updateDriverMonthly(editingRecord.value.id, formData);
      message.success('更新成功');
    } else {
      await createDriverMonthly(formData);
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
    await deleteDriverMonthly(record.id);
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
const personnelMatchResult = ref<{ total: number; matched: number; mismatches: Array<{ id: number; name: string; month: string }> } | null>(null);
const matchColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
  { title: '考核月份', dataIndex: 'month', key: 'month', width: 120 },
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
    const mismatches: Array<{ id: number; name: string; month: string }> = [];
    let matched = 0;
    for (const r of list.value) {
      if (!r.name) continue;
      if (rosterNames.value.has(r.name)) matched++;
      else mismatches.push({ id: r.id, name: r.name, month: r.month || '-' });
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
  const headers = '姓名,考核月份,状态\n';
  const rows = personnelMatchResult.value.mismatches.map((r) => `"${r.name}","${r.month}","未匹配"`).join('\n');
  const blob = new Blob(['﻿' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'driver-monthly_personnel_mismatch.csv';
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
