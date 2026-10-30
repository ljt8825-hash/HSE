<template>
  <Page auto-content-height class="hse-page">
    <Tabs v-model:activeKey="activeTab" class="hse-tabs">
      <!-- ========== Tab 1：安全人员（安环管理部花名册，只读） ========== -->
      <TabPane key="personnel" tab="安全人员">
        <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
          <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
            <Card :bordered="false">
              <Skeleton active :paragraph="{ rows: 2 }" />
            </Card>
          </Col>
        </Row>
        <Row v-else :gutter="[16, 16]" class="mb-4">
          <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
            <HseStatCard
              :title="stat.label"
              :value="stat.value"
              :icon="stat.icon"
              :color="stat.color"
            />
          </Col>
        </Row>

        <Card :bordered="false">
          <template #title>
            <div class="card-header">
              <span>安全人员</span>
              <span class="dept-tag">安环管理部 · 花名册</span>
            </div>
          </template>

          <Form layout="inline" class="filter-form">
            <FormItem label="关键词">
              <Input
                v-model:value="searchForm.keyword"
                placeholder="搜索姓名/职务/电话"
                allow-clear
                @change="handleSearch"
              />
            </FormItem>
            <FormItem label="状态">
              <Select
                v-model:value="searchForm.status"
                placeholder="全部状态"
                allow-clear
                style="width: 120px"
                @change="handleSearch"
              >
                <SelectOption
                  v-for="opt in COMMITTEE_STATUS_FILTER_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </SelectOption>
              </Select>
            </FormItem>
            <FormItem>
              <Button @click="handleReset">重置</Button>
            </FormItem>
          </Form>

          <Table
            :columns="columns"
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
            :row-key="(record) => record.id"
            @change="(handleTableChange as any)"
            size="middle"
            :scroll="{ x: 900 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <Tag :color="orgStatusColor((record as any).org_status)">
                  {{ orgStatusLabel((record as any).org_status) }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
              </template>
            </template>
          </Table>
        </Card>

        <Drawer v-model:open="detailDrawerVisible" title="人员详情" width="500px">
          <template v-if="currentItem">
            <Descriptions :column="1" bordered size="small">
              <DescriptionsItem label="姓名">{{ currentItem.name }}</DescriptionsItem>
              <DescriptionsItem label="员工编号">{{ currentItem.employee_code || '-' }}</DescriptionsItem>
              <DescriptionsItem label="职务">{{ currentItem.position_name || '-' }}</DescriptionsItem>
              <DescriptionsItem label="部门">{{ currentItem.dept_name || '-' }}</DescriptionsItem>
              <DescriptionsItem label="联系电话">{{ currentItem.phone || '-' }}</DescriptionsItem>
              <DescriptionsItem label="性别">{{ currentItem.gender || '-' }}</DescriptionsItem>
              <DescriptionsItem label="年龄">{{ currentItem.age ?? '-' }}</DescriptionsItem>
              <DescriptionsItem label="状态">
                <Tag :color="orgStatusColor(currentItem.org_status)">
                  {{ orgStatusLabel(currentItem.org_status) }}
                </Tag>
              </DescriptionsItem>
            </Descriptions>
          </template>
        </Drawer>
      </TabPane>

      <!-- ========== Tab 2：安委会（组织开展活动，参照其他保险） ========== -->
      <TabPane key="committee" tab="安委会">
        <Card :bordered="false">
          <template #title>
            <div class="card-header">
              <span>安委会记录</span>
            <div class="card-actions">
              <Button @click="handleDownloadTemplate">
                <template #icon><IconifyIcon icon="lucide:download" /></template>
                下载模板
              </Button>
              <Upload
                :before-upload="handleImportExcel"
                :show-upload-list="false"
                accept=".xlsx,.xls"
                :disabled="importing"
              >
                <Button type="primary" :loading="importing">
                  <template #icon><IconifyIcon icon="lucide:upload" /></template>
                  导入数据
                </Button>
              </Upload>
              <Button type="primary" @click="openActivityCreate">
                <template #icon><IconifyIcon icon="lucide:plus" /></template>
                新增活动
              </Button>
            </div>
            </div>
          </template>

          <Form layout="inline" class="filter-form">
            <FormItem label="关键词">
              <Input
                v-model:value="activityKeyword"
                placeholder="活动名称"
                allow-clear
                style="width: 200px"
                @change="handleActivitySearch"
              />
            </FormItem>
            <FormItem>
              <Button @click="handleActivityReset">重置</Button>
            </FormItem>
          </Form>

          <Table
            :columns="activityColumns"
            :data-source="activityList"
            :loading="activityLoading"
            :pagination="{
              current: activityPagination.page,
              pageSize: activityPagination.pageSize,
              total: activityTotal,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条记录`,
            }"
            :row-key="(record) => record.id"
            @change="(handleActivityTableChange as any)"
            size="middle"
            :scroll="{ x: 1000 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'activityDate'">
                {{ (record as any).activityDate ? dayjs((record as any).activityDate).format('YYYY-MM-DD') : '—' }}
              </template>
              <template v-else-if="column.key === 'year'">
                {{ (record as any).activityDate ? dayjs((record as any).activityDate).format('YYYY') : '—' }}
              </template>
              <template v-else-if="column.key === 'action'">
                <Button type="link" size="small" @click="handleViewFile(record as any)">查看</Button>
                <Button type="link" size="small" @click="openActivityEdit(record as any)">编辑</Button>
                <Popconfirm title="确认删除该活动？" ok-type="danger" @confirm="deleteActivityItem(record as any)">
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
              </template>
            </template>
          </Table>
        </Card>

        <!-- 新增/编辑活动 -->
        <Modal
          v-model:open="activityModalVisible"
          :title="activityEditingId ? '编辑安委会活动' : '新增安委会活动'"
          width="720px"
          :footer="null"
          @cancel="activityModalVisible = false"
          destroy-on-close
        >
          <Form layout="vertical" class="mt-4">
            <Row :gutter="16">
              <Col :span="16">
                <FormItem label="活动名称" required>
                  <Input v-model:value="activityForm.activityName" placeholder="请输入活动名称" />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="活动类型">
                  <Select v-model:value="activityForm.activityType" placeholder="请选择">
                    <SelectOption v-for="t in ACTIVITY_TYPES" :key="t" :value="t">{{ t }}</SelectOption>
                  </Select>
                </FormItem>
              </Col>
            </Row>
            <Row :gutter="16">
              <Col :span="8">
                <FormItem label="组织日期">
                  <DatePicker v-model:value="activityForm.activityDate" style="width: 100%" />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="主持部门">
                  <Input v-model:value="activityForm.hostDepartment" placeholder="如：安环管理部" />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="参与人数">
                  <InputNumber v-model:value="activityForm.participants" :min="0" style="width: 100%" />
                </FormItem>
              </Col>
            </Row>
            <Row :gutter="16">
              <Col :span="24">
                <FormItem label="活动地点">
                  <Input v-model:value="activityForm.location" placeholder="请输入活动地点" />
                </FormItem>
              </Col>
            </Row>
            <FormItem label="活动摘要">
              <Textarea v-model:value="activityForm.summary" :rows="3" placeholder="请输入活动摘要/纪要" />
            </FormItem>
            <FormItem label="文档（PDF）">
              <div v-if="activityPdfName" class="pdf-file-row">
                <span class="pdf-file-name">
                  <span class="i-lucide:file-text" />
                  {{ activityPdfName }}
                </span>
                <Button type="link" size="small" danger @click="removeActivityPdf">移除</Button>
              </div>
              <Upload
                v-else
                :before-upload="handleActivityPdfUpload"
                :show-upload-list="false"
                accept=".pdf"
                :disabled="activityUploading"
              >
                <Button :loading="activityUploading">
                  <template #icon><span class="i-lucide:upload" /></template>
                  上传 PDF
                </Button>
              </Upload>
              <div class="pdf-tip">仅支持 .pdf，建议不超过 10MB。文档将随记录保存，可在列表「查看文档」中预览。</div>
            </FormItem>
            <FormItem label="备注">
              <Textarea v-model:value="activityForm.remark" :rows="2" placeholder="请输入备注" />
            </FormItem>
          </Form>
          <div style="margin-top: 24px; text-align: right">
            <Button style="margin-right: 8px" @click="activityModalVisible = false">取消</Button>
            <Button type="primary" :loading="activityModalLoading" @click="saveActivity">保存</Button>
          </div>
        </Modal>

      </TabPane>
    </Tabs>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import {
  Card, Row, Col, Table, Form, FormItem, Input, Select, SelectOption, Button,
  Drawer, Tag, Modal, Popconfirm, Textarea, Upload, DatePicker, InputNumber, message,
  Tabs, TabPane, Skeleton, Descriptions, DescriptionsItem,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import dayjs from 'dayjs';
import HseStatCard from '#/components/hse/StatCard.vue';
import { getEmployeeList, type EmployeeApi } from '#/api/hse/employee';
import {
  COMMITTEE_STATUS_FILTER_OPTIONS,
  orgStatusColor,
  orgStatusLabel,
  toOrgStatusParam,
} from '#/api/hse/employee-status';
import {
  getCommitteeActivityList,
  createCommitteeActivity,
  updateCommitteeActivity,
  deleteCommitteeActivity,
  importCommitteeActivityPdf,
  getCommitteeActivityFile,
  downloadCommitteeActivityTemplate,
  importCommitteeActivityExcel,
  type CommitteeActivityApi,
} from '#/api/hse/goals';

// ===== 公共 =====
const activeTab = ref<'personnel' | 'committee'>('personnel');

// ===== Tab1：安全人员（花名册只读） =====
const ROSTER_DEPT = '安环管理部';

// A-02d.3（B02-DEC-03.17 P2/P4）：状态标签、颜色与筛选项统一收口到 `#/api/hse/employee-status`
//   - 筛选项 value 改为后端编码（原实现以中文标签作为 value，再经只有 5 个中文键的映射反查，
//     A-02d 新增的中间态在中国标签侧无对应键 ⇒ 参数变 undefined、筛选被静默丢弃）
//   - 「返聘」查询编码由历史别名 rehire 纠正为后端正式编码 reinstated（原值查询恒空）

const loading = ref(false);
const statsLoading = ref(false);
const personnelList = ref<EmployeeApi.EmployeeItem[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
  status: undefined as string | undefined,
});
const pagination = reactive({ page: 1, pageSize: 10 });
const detailDrawerVisible = ref(false);
const currentItem = ref<EmployeeApi.EmployeeItem | null>(null);

const statItems = computed(() => {
  const list = personnelList.value;
  const active = list.filter((p) => (p.org_status as string) === 'active').length;
  const left = list.filter((p) => (p.org_status as string) === 'left').length;
  const other = list.length - active - left;
  return [
    { key: 'total', label: '总人数', value: total.value || list.length, icon: 'lucide:users', color: 'blue' as const },
    { key: 'active', label: '在职人数', value: active, icon: 'lucide:user-check', color: 'green' as const },
    { key: 'left', label: '离职人数', value: left, icon: 'lucide:user-x', color: 'red' as const },
    { key: 'other', label: '其他状态', value: other, icon: 'lucide:users-round', color: 'orange' as const },
  ];
});

const columns = [
  { title: '序号', key: 'index', width: 60, align: 'center' as const, customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '职务', dataIndex: 'position_name', key: 'position_name', width: 140, ellipsis: true },
  { title: '部门', dataIndex: 'dept_name', key: 'dept_name', width: 120, ellipsis: true },
  { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 130, align: 'right' as const },
  { title: '状态', key: 'status', width: 90, align: 'center' as const },
  { title: '操作', key: 'action', width: 100, align: 'center' as const, fixed: 'right' as const },
];

async function fetchData() {
  loading.value = true;
  statsLoading.value = true;
  try {
    // A-02d.3：status 直接使用编码；未登记的值显式提示，不再静默丢弃筛选条件
    const statusParam = toOrgStatusParam(searchForm.status);
    if (searchForm.status && !statusParam) {
      message.warning(`未知的状态筛选值「${searchForm.status}」，已忽略该筛选条件`);
    }
    const res = await getEmployeeList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      deptName: ROSTER_DEPT,
      status: statusParam as EmployeeApi.OrgStatus | undefined,
    });
    personnelList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取花名册人员失败:', err);
    message.error('获取人员列表失败');
    personnelList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
    statsLoading.value = false;
  }
}
function handleSearch() { pagination.page = 1; fetchData(); }
function handleReset() { searchForm.keyword = ''; searchForm.status = undefined; pagination.page = 1; fetchData(); }
function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}
function handleView(record: EmployeeApi.EmployeeItem) {
  currentItem.value = record;
  detailDrawerVisible.value = true;
}

// ===== Tab2：安委会组织开展活动 =====
const ACTIVITY_TYPES = ['安委会会议', '安全例会', '专项检查', '应急演练', '教育培训', '其他'];

const activityList = ref<CommitteeActivityApi.ActivityItem[]>([]);
const activityTotal = ref(0);
const activityLoading = ref(false);
const activityKeyword = ref('');
const activityPagination = reactive({ page: 1, pageSize: 10 });

const activityColumns = [
  { title: '序号', key: 'index', width: 60, align: 'center' as const, customRender: ({ index }: { index: number }) => (activityPagination.page - 1) * activityPagination.pageSize + index + 1 },
  { title: '年份', key: 'year', width: 80, align: 'center' as const },
  { title: '日期', dataIndex: 'activityDate', key: 'activityDate', width: 120, align: 'center' as const },
  { title: '会议名称', dataIndex: 'activityName', key: 'activityName', width: 220, ellipsis: true },
  { title: '会议地点', dataIndex: 'location', key: 'location', width: 160, ellipsis: true },
  { title: '参与人数', dataIndex: 'participants', key: 'participants', width: 90, align: 'center' as const },
  { title: '操作', key: 'action', width: 200, align: 'center' as const, fixed: 'right' as const },
];

async function fetchActivities() {
  activityLoading.value = true;
  try {
    const res = await getCommitteeActivityList({
      page: activityPagination.page,
      pageSize: activityPagination.pageSize,
      keyword: activityKeyword.value || undefined,
    });
    activityList.value = res.list || [];
    activityTotal.value = res.total || 0;
  } catch (err) {
    console.warn('获取安委会活动失败:', err);
    message.error('获取活动列表失败');
    activityList.value = [];
    activityTotal.value = 0;
  } finally {
    activityLoading.value = false;
  }
}
function handleActivitySearch() { activityPagination.page = 1; fetchActivities(); }
function handleActivityReset() { activityKeyword.value = ''; activityPagination.page = 1; fetchActivities(); }
function handleActivityTableChange(pag: { current: number; pageSize: number }) {
  activityPagination.page = pag.current;
  activityPagination.pageSize = pag.pageSize;
  fetchActivities();
}

// 新增/编辑
const activityModalVisible = ref(false);
const activityModalLoading = ref(false);
const activityEditingId = ref<number | null>(null);
const activityUploading = ref(false);
const activityPdfName = ref('');
const activityForm = reactive({
  activityName: '',
  activityType: '',
  activityDate: null as any,
  hostDepartment: '',
  participants: 0,
  location: '',
  summary: '',
  pdfFile: '',
  originalName: '',
  remark: '',
});

function openActivityCreate() {
  activityEditingId.value = null;
  Object.assign(activityForm, {
    activityName: '', activityType: '', activityDate: null, hostDepartment: '',
    participants: 0, location: '', summary: '', pdfFile: '', originalName: '', remark: '',
  });
  activityPdfName.value = '';
  activityModalVisible.value = true;
}
function openActivityEdit(record: CommitteeActivityApi.ActivityItem) {
  activityEditingId.value = record.id;
  Object.assign(activityForm, {
    activityName: record.activityName || '',
    activityType: record.activityType || '',
    activityDate: record.activityDate ? dayjs(record.activityDate) : null,
    hostDepartment: record.hostDepartment || '',
    participants: record.participants || 0,
    location: record.location || '',
    summary: record.summary || '',
    pdfFile: record.pdfFile || '',
    originalName: record.originalName || '',
    remark: record.remark || '',
  });
  activityPdfName.value = record.originalName || '';
  activityModalVisible.value = true;
}
async function handleActivityPdfUpload(file: any) {
  const raw: File = (file.originFileObj || file) as File;
  if (!raw.name.toLowerCase().endsWith('.pdf')) {
    message.warning('请选择 PDF 文件');
    return false;
  }
  activityUploading.value = true;
  try {
    const res = await importCommitteeActivityPdf(raw);
    activityForm.pdfFile = res.storedName;
    activityForm.originalName = res.originalName;
    activityPdfName.value = res.originalName;
    message.success('PDF 上传完成');
  } catch (e: any) {
    message.error(e?.message || 'PDF 上传失败');
  } finally {
    activityUploading.value = false;
  }
  return false;
}
function removeActivityPdf() {
  activityForm.pdfFile = '';
  activityForm.originalName = '';
  activityPdfName.value = '';
}
async function saveActivity() {
  if (!activityForm.activityName.trim()) {
    message.warning('请填写活动名称');
    return;
  }
  activityModalLoading.value = true;
  try {
    const payload: Partial<CommitteeActivityApi.ActivityItem> = {
      activityName: activityForm.activityName.trim(),
      activityType: activityForm.activityType || undefined,
      activityDate: activityForm.activityDate ? dayjs(activityForm.activityDate).format('YYYY-MM-DD') : undefined,
      hostDepartment: activityForm.hostDepartment || undefined,
      participants: activityForm.participants || 0,
      location: activityForm.location || undefined,
      summary: activityForm.summary || undefined,
      pdfFile: activityForm.pdfFile || undefined,
      originalName: activityForm.originalName || undefined,
      remark: activityForm.remark || undefined,
    };
    if (activityEditingId.value) {
      await updateCommitteeActivity(activityEditingId.value, payload);
      message.success('更新成功');
    } else {
      await createCommitteeActivity(payload);
      message.success('新增成功');
    }
    activityModalVisible.value = false;
    fetchActivities();
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  } finally {
    activityModalLoading.value = false;
  }
}
async function deleteActivityItem(record: CommitteeActivityApi.ActivityItem) {
  try {
    await deleteCommitteeActivity(record.id);
    message.success('删除成功');
    fetchActivities();
  } catch (e) {
    console.warn('删除活动失败:', e);
    message.error('删除失败');
  }
}

// 下载导入模板
async function handleDownloadTemplate() {
  try {
    const blob = await downloadCommitteeActivityTemplate();
    if (!(blob instanceof Blob)) throw new Error('未获取到模板文件');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '安委会活动导入模板.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('模板已开始下载');
  } catch (e: any) {
    message.error(e?.message || '模板下载失败');
  }
}

// 导入 Excel（批量写入安委会活动）
const importing = ref(false);
async function handleImportExcel(file: any) {
  const raw: File = (file.originFileObj || file) as File;
  const name = raw.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    message.warning('请选择 Excel 文件（.xlsx / .xls）');
    return false;
  }
  importing.value = true;
  try {
    const res = await importCommitteeActivityExcel(raw);
    message.success(`成功导入 ${res.inserted} 条会议记录`);
    fetchActivities();
  } catch (e: any) {
    message.error(e?.message || '导入失败');
  } finally {
    importing.value = false;
  }
  return false;
}

// 查看文档（点击 → 新窗口打开 PDF）
async function handleViewFile(record: CommitteeActivityApi.ActivityItem) {
  if (!record.id) return;
  if (!record.pdfFile) {
    message.warning('该会议尚未导入文档，请通过「编辑」上传');
    return;
  }
  const loadingH = message.loading('正在打开文档…', 0);
  try {
    const blob = await getCommitteeActivityFile(record.id);
    if (!(blob instanceof Blob)) throw new Error('服务器未返回有效的文件数据');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // 给浏览器 1 分钟时间建立文档/iframe 引用再回收
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e: any) {
    message.error(e?.message || '文件加载失败');
  } finally {
    loadingH();
  }
}

onMounted(() => {
  fetchData();
  fetchActivities();
});
</script>

<style scoped lang="scss">
.hse-page {
  .hse-tabs {
    :deep(.ant-tabs-nav) {
      margin-bottom: 16px;
    }
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .card-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  }

  .dept-tag {
    font-size: 12px;
    font-weight: 400;
    color: hsl(var(--primary));
    padding: 2px 10px;
    border-radius: 999px;
    background: hsl(var(--primary) / 0.1);
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .text-muted {
    color: hsl(var(--muted-foreground));
  }

  .pdf-file-row {
    display: flex;
    align-items: center;
    gap: 8px;

    .pdf-file-name {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: hsl(var(--foreground) / 0.85);
    }
  }

  .pdf-tip {
    margin-top: 6px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }
}
</style>
