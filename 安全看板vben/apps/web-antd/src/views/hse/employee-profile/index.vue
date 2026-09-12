<script setup lang="tsx">
/**
 * 员工档案中心 - Sprint5.7
 *
 * 功能:
 *   1. 员工列表（分页 + 搜索 + 组织/岗位筛选）
 *   2. 员工详情（基础信息/组织信息/任职历史/驾驶员信息）
 *
 * 数据来源: employee + employee_assignment（v_employee_current 视图）
 */
import { onMounted, reactive, ref } from 'vue';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Row,
  Col,
  message,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import {
  getProfileList,
  getProfileDetail,
  getProfileAssignments,
  getProfileDriverInfo,
  type EmployeeProfileApi,
} from '#/api/hse/employee-profile';


// ============================================================
// 状态
// ============================================================

// 列表
const loading = ref(false);
const list = ref<EmployeeProfileApi.ProfileListItem[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });
const searchForm = reactive({
  keyword: '',
  org_unit_id: undefined as number | undefined,
  position_id: undefined as number | undefined,
  is_driver: undefined as any,
});

// 详情抽屉
const detailDrawerVisible = ref(false);
const detailLoading = ref(false);
const currentDetail = ref<EmployeeProfileApi.ProfileDetail | null>(null);
const assignments = ref<EmployeeProfileApi.AssignmentItem[]>([]);
const driverInfo = ref<EmployeeProfileApi.DriverInfo | null>(null);

// ============================================================
// 工具函数
// ============================================================
function formatDate(date?: string) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('zh-CN');
}

function maskIdCard(idCard?: string) {
  if (!idCard) return '-';
  if (idCard.startsWith('ENC:')) return '***加密数据***';
  return idCard.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2');
}

function maskPhone(phone?: string) {
  if (!phone) return '-';
  if (phone.startsWith('ENC:')) return '***加密数据***';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

// ============================================================
// 列表加载
// ============================================================
async function loadList() {
  loading.value = true;
  try {
    const res = await getProfileList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword,
      org_unit_id: searchForm.org_unit_id,
      position_id: searchForm.position_id,
      is_driver: searchForm.is_driver,
    });
    list.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    message.error(e.message || '加载档案列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  loadList();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.org_unit_id = undefined;
  searchForm.position_id = undefined;
  searchForm.is_driver = undefined;
  pagination.page = 1;
  loadList();
}

function handleTableChange(pag: any) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  loadList();
}

// ============================================================
// 详情加载
// ============================================================
async function openDetail(id: number) {
  detailDrawerVisible.value = true;
  detailLoading.value = true;
  try {
    const [detailRes, assignRes, driverRes] = await Promise.all([
      getProfileDetail(id),
      getProfileAssignments(id),
      getProfileDriverInfo(id),
    ]);
    currentDetail.value = detailRes;
    assignments.value = assignRes;
    driverInfo.value = driverRes;
  } catch (e: any) {
    message.error(e.message || '加载档案详情失败');
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  detailDrawerVisible.value = false;
  currentDetail.value = null;
  assignments.value = [];
  driverInfo.value = null;
}

// ============================================================
// 列定义
// ============================================================
const columns = [
  {
    title: '员工编号',
    dataIndex: 'employee_code',
    width: 110,
    ellipsis: true,
  },
  {
    title: '姓名',
    dataIndex: 'name',
    width: 100,
    customRender: ({ record }: any) => (
      <a onClick={() => openDetail(record.id)}>{record.name}</a>
    ),
  },
  {
    title: '性别',
    dataIndex: 'gender',
    width: 60,
    customRender: ({ record }: any) => (record.gender || '-'),
  },
  {
    title: '年龄',
    dataIndex: 'age',
    width: 60,
    align: 'center' as const,
    customRender: ({ record }: any) => (record.age || '-'),
  },
  {
    title: '所属组织',
    dataIndex: 'org_name',
    width: 160,
    ellipsis: true,
    customRender: ({ record }: any) => (
      <Tooltip title={record.org_name || ''}>
        <span>{record.org_name || '-'}</span>
      </Tooltip>
    ),
  },
  {
    title: '作业单元',
    dataIndex: 'unit_name',
    width: 130,
    ellipsis: true,
    customRender: ({ record }: any) => (record.unit_name || '-'),
  },
  {
    title: '岗位',
    dataIndex: 'position_name',
    width: 130,
    ellipsis: true,
    customRender: ({ record }: any) => (record.position_name || '-'),
  },
  {
    title: '入职日期',
    dataIndex: 'hire_date',
    width: 100,
    customRender: ({ record }: any) => formatDate(record.hire_date),
  },
  {
    title: '是否驾驶员',
    dataIndex: 'is_driver',
    width: 90,
    align: 'center' as const,
    customRender: ({ record }: any) => (
      <Tag color={record.is_driver ? 'blue' : 'default'}>
        {record.is_driver ? '是' : '否'}
      </Tag>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 80,
    align: 'center' as const,
    customRender: ({ record }: any) => (
      <Tag color={record.status === 'active' ? 'green' : 'default'}>
        {record.status === 'active' ? '在职' : (record.status || '-')}
      </Tag>
    ),
  },
  {
    title: '操作',
    key: 'action',
    width: 80,
    customRender: ({ record }: any) => (
      <a onClick={() => openDetail(record.id)}>详情</a>
    ),
  },
];

// 任职历史列
const assignmentColumns = [
  {
    title: '组织',
    dataIndex: 'org_name',
    width: 150,
    ellipsis: true,
  },
  {
    title: '作业单元',
    dataIndex: 'unit_name',
    width: 120,
    ellipsis: true,
  },
  {
    title: '岗位',
    dataIndex: 'position_name',
    width: 120,
    ellipsis: true,
  },
  {
    title: '开始日期',
    dataIndex: 'start_date',
    width: 100,
    customRender: ({ record }: any) => formatDate(record.start_date),
  },
  {
    title: '结束日期',
    dataIndex: 'end_date',
    width: 100,
    customRender: ({ record }: any) => formatDate(record.end_date),
  },
  {
    title: '状态',
    dataIndex: 'is_current',
    width: 80,
    customRender: ({ record }: any) => (
      <Tag color={record.is_current ? 'green' : 'default'}>
        {record.is_current ? '当前' : '历史'}
      </Tag>
    ),
  },
];

onMounted(loadList);
</script>

<template>
  <Page>
    <Card>
      <!-- 工具栏 -->
      <Row :gutter="16" style="margin-bottom: 16px">
        <Col :span="24">
          <Space wrap>
            <HelpButton menuCode="HSE_EMPLOYEE_PROFILE" />
            <Input.Search
              v-model:value="searchForm.keyword"
              placeholder="搜索姓名/员工编号"
              style="width: 240px"
              allow-clear
              @search="handleSearch"
            />
            <Select
              v-model:value="searchForm.is_driver"
              placeholder="是否驾驶员"
              style="width: 120px"
              allow-clear
              @change="handleSearch"
            >
              <Select.Option :value="true">是</Select.Option>
              <Select.Option :value="false">否</Select.Option>
            </Select>
            <Button @click="handleReset">重置</Button>
          </Space>
        </Col>
      </Row>

      <!-- 列表 -->
      <Table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 条`,
        }"
        row-key="id"
        :scroll="{ x: 1300 }"
        @change="handleTableChange"
      />
    </Card>

    <!-- 详情抽屉 -->
    <Drawer
      v-model:open="detailDrawerVisible"
      :title="`员工档案：${currentDetail?.basic.name || ''}`"
      :width="900"
      :footer-style="{ textAlign: 'right' }"
      @close="closeDetail"
    >
      <div v-if="currentDetail" :loading="detailLoading">
        <!-- 基础信息 -->
        <Card title="基础信息" size="small" style="margin-bottom: 16px">
          <Descriptions :column="2" bordered>
            <Descriptions.Item label="员工编号">{{ currentDetail.basic.employee_code || '-' }}</Descriptions.Item>
            <Descriptions.Item label="姓名">{{ currentDetail.basic.name }}</Descriptions.Item>
            <Descriptions.Item label="身份证号">{{ maskIdCard(currentDetail.basic.id_card) }}</Descriptions.Item>
            <Descriptions.Item label="年龄">{{ currentDetail.basic.age || '-' }}</Descriptions.Item>
            <Descriptions.Item label="联系电话">{{ maskPhone(currentDetail.basic.phone) }}</Descriptions.Item>
            <Descriptions.Item label="性别">{{ currentDetail.basic.gender || '-' }}</Descriptions.Item>
            <Descriptions.Item label="出生日期">{{ formatDate(currentDetail.basic.birth_date) }}</Descriptions.Item>
            <Descriptions.Item label="人员类型">{{ currentDetail.basic.person_type || '-' }}</Descriptions.Item>
            <Descriptions.Item label="人员分类">{{ currentDetail.basic.person_category || '-' }}</Descriptions.Item>
            <Descriptions.Item label="是否公益岗">
              <Tag :color="currentDetail.basic.is_public_welfare ? 'blue' : 'default'">
                {{ currentDetail.basic.is_public_welfare ? '是' : '否' }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag :color="currentDetail.basic.status === 'active' ? 'green' : 'default'">
                {{ currentDetail.basic.status === 'active' ? '在职' : (currentDetail.basic.status || '-') }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{{ formatDate(currentDetail.basic.created_at) }}</Descriptions.Item>
          </Descriptions>
        </Card>

        <!-- 当前组织信息 -->
        <Card title="当前组织信息" size="small" style="margin-bottom: 16px">
          <div v-if="currentDetail.currentOrg">
            <Descriptions :column="2" bordered>
              <Descriptions.Item label="所属组织">{{ currentDetail.currentOrg.org_name || '-' }}</Descriptions.Item>
              <Descriptions.Item label="组织编码">{{ currentDetail.currentOrg.org_code || '-' }}</Descriptions.Item>
              <Descriptions.Item label="作业单元">{{ currentDetail.currentOrg.unit_name || '-' }}</Descriptions.Item>
              <Descriptions.Item label="单元类型">{{ currentDetail.currentOrg.unit_type || '-' }}</Descriptions.Item>
              <Descriptions.Item label="当前岗位">{{ currentDetail.currentOrg.position_name || '-' }}</Descriptions.Item>
              <Descriptions.Item label="岗位编码">{{ currentDetail.currentOrg.position_code || '-' }}</Descriptions.Item>
              <Descriptions.Item label="风险等级">
                <Tag :color="{ high: 'red', medium: 'orange', low: 'green' }[currentDetail.currentOrg.risk_level || ''] || 'default'">
                  {{ currentDetail.currentOrg.risk_level || '-' }}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="直接上级">{{ currentDetail.currentOrg.supervisor_name || '-' }}</Descriptions.Item>
              <Descriptions.Item label="任职开始日期">{{ formatDate(currentDetail.currentOrg.start_date) }}</Descriptions.Item>
              <Descriptions.Item label="任职状态">
                <Tag :color="currentDetail.currentOrg.assignment_status === 'active' ? 'green' : 'default'">
                  {{ currentDetail.currentOrg.assignment_status === 'active' ? '在职' : (currentDetail.currentOrg.assignment_status || '-') }}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else style="color: hsl(var(--muted-foreground)); text-align: center; padding: 20px">暂无组织信息</div>
        </Card>

        <!-- 任职历史 -->
        <Card title="任职历史" size="small" style="margin-bottom: 16px">
          <Table
            :columns="assignmentColumns"
            :data-source="assignments"
            :pagination="false"
            row-key="id"
            size="small"
            :scroll="{ x: 700 }"
          />
        </Card>

        <!-- 驾驶员信息 -->
        <Card title="驾驶员信息" size="small">
          <div v-if="driverInfo">
            <Descriptions :column="2" bordered>
              <Descriptions.Item label="是否驾驶员">
                <Tag :color="driverInfo.is_driver ? 'blue' : 'default'">
                  {{ driverInfo.is_driver ? '是' : '否' }}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="驾驶证类型">{{ driverInfo.license_type || '-' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else style="color: hsl(var(--muted-foreground)); text-align: center; padding: 20px">暂无驾驶员信息</div>
        </Card>
      </div>
    </Drawer>
  </Page>
</template>
