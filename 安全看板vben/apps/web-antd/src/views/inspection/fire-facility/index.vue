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
          <span>消防设施管理</span>
          <div class="action-group">
            <ImportButtonGroup module="fire-facility" module-name="消防设施管理" @refresh="handleImportRefresh" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增设施
            </Button>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="规格型号">
          <Input
            v-model:value="searchForm.model"
            placeholder="搜索规格型号"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="安装位置">
          <Select
            v-model:value="searchForm.location"
            placeholder="全部位置"
            allow-clear
            style="width: 180px"
            @change="handleSearch"
          >
            <SelectOption v-for="l in locationOptions" :key="l" :value="l">{{ l }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="安装年份">
          <Select
            v-model:value="searchForm.year"
            placeholder="全部年份"
            allow-clear
            style="width: 120px"
            @change="handleSearch"
          >
            <SelectOption v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="安装月份">
          <Select
            v-model:value="searchForm.month"
            placeholder="全部月份"
            allow-clear
            style="width: 120px"
            @change="handleSearch"
          >
            <SelectOption v-for="m in 12" :key="m" :value="m">{{ m }} 月</SelectOption>
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
        :scroll="{ x: 1200 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">{{ record.status }}</Tag>
          </template>
          <template v-else-if="column.key === 'quantity'">
            {{ record.quantity }} 件
          </template>
          <template v-else-if="column.key === 'installDate'">
            {{ formatDate(record.installDate) }}
          </template>
          <template v-else-if="column.key === 'expiryDate'">
            {{ formatDate(record.expiryDate) }}
          </template>
          <template v-else-if="column.key === 'manager'">
            <span :class="{ 'manager-mismatch': isManagerMismatch(record) }">
              {{ record.manager || '-' }}
            </span>
            <Tag v-if="isManagerMismatch(record)" color="warning" class="ml-1">不匹配</Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
            <Popconfirm
              title="确定要删除此消防设施吗？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="handleDelete(record)"
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑消防设施' : '新增消防设施'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="equipmentForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="设施名称" name="name">
              <Input v-model:value="equipmentForm.name" placeholder="请输入设施名称" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="设施类型" name="type">
              <Select v-model:value="equipmentForm.type" placeholder="请选择类型" style="width: 100%">
                <SelectOption v-for="t in typeOptions" :key="t" :value="t">{{ t }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="型号规格" name="model">
              <Input v-model:value="equipmentForm.model" placeholder="请输入型号规格" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="数量" name="quantity">
              <InputNumber v-model:value="equipmentForm.quantity" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="安装位置" name="location">
              <Select
                v-model:value="equipmentForm.location"
                placeholder="请选择转运站"
                style="width: 100%"
                @change="handleLocationChange"
              >
                <SelectOption v-for="l in locationOptions" :key="l" :value="l">{{ l }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="状态" name="status">
              <Select v-model:value="equipmentForm.status" placeholder="请选择状态" style="width: 100%">
                <SelectOption value="正常">正常</SelectOption>
                <SelectOption value="过期">过期</SelectOption>
                <SelectOption value="损坏">损坏</SelectOption>
                <SelectOption value="维修中">维修中</SelectOption>
                <SelectOption value="缺失">缺失</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="安装日期" name="installDate">
              <DatePicker :value="equipmentForm.installDate ?? undefined" @update:value="(v: any) => equipmentForm.installDate = v" style="width: 100%" value-format="YYYY-MM-DD" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="有效期至" name="expiryDate">
              <DatePicker :value="equipmentForm.expiryDate ?? undefined" @update:value="(v: any) => equipmentForm.expiryDate = v" style="width: 100%" value-format="YYYY-MM-DD" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="负责人" name="manager">
              <AutoComplete
                v-model:value="equipmentForm.manager"
                :options="managerOptions"
                placeholder="请选择或输入负责人"
                style="width: 100%"
                @select="handleManagerSelect"
              >
                <template #default>
                  <Input :value="equipmentForm.manager" placeholder="请选择或输入负责人" />
                </template>
              </AutoComplete>
              <div v-if="rosterTip" class="roster-tip">{{ rosterTip }}</div>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="联系电话" name="phone">
              <Input v-model:value="equipmentForm.phone" placeholder="请输入联系电话" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Textarea v-model:value="equipmentForm.remark" :rows="2" placeholder="其他需要说明的事项" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="消防设施详情" width="720px">
      <template v-if="currentRecord">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRecord.name }}</h3>
          <Tag color="blue" class="mr-2">{{ currentRecord.type }}</Tag>
          <Tag :color="getStatusColor(currentRecord.status)">{{ currentRecord.status }}</Tag>
        </div>
        <div class="detail-section">
          <Row :gutter="16">
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">型号规格：</span>
                <span class="detail-value">{{ currentRecord.model || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">数量：</span>
                <span class="detail-value">{{ currentRecord.quantity }} 件</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">安装位置：</span>
                <span class="detail-value">{{ currentRecord.location || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">负责人：</span>
                <span class="detail-value">{{ currentRecord.manager || '-' }}</span>
                <Tag v-if="isManagerMismatch(currentRecord)" color="warning" class="ml-1">花名册不匹配</Tag>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">联系电话：</span>
                <span class="detail-value">{{ currentRecord.phone || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">安装日期：</span>
                <span class="detail-value">{{ formatDate(currentRecord.installDate) }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">有效期至：</span>
                <span class="detail-value">{{ formatDate(currentRecord.expiryDate) }}</span>
              </div>
            </Col>
          </Row>
        </div>
        <div v-if="currentRecord.remark" class="detail-section">
          <div class="detail-label">备注</div>
          <div class="detail-content">{{ currentRecord.remark }}</div>
        </div>
      </template>
    </Drawer>

    <Modal
      v-model:open="personnelMatchVisible"
      title="导入人员匹配校验"
      width="860px"
      :footer="null"
      @cancel="personnelMatchVisible = false"
    >
      <div v-if="personnelMatchLoading" class="match-loading">
        <Spin tip="正在校验人员匹配..." />
      </div>
      <div v-else-if="personnelMatchResult">
        <Alert
          :type="personnelMatchResult.mismatches.length === 0 ? 'success' : 'warning'"
          show-icon
          class="match-alert"
        >
          <template #message>
            <span>
              共校验 {{ personnelMatchResult.total }} 条记录，
              匹配 {{ personnelMatchResult.matched }} 条，
              <span :class="{ 'text-warning': personnelMatchResult.mismatches.length > 0 }">
                不匹配 {{ personnelMatchResult.mismatches.length }} 条
              </span>
            </span>
          </template>
          <template #description v-if="personnelMatchResult.mismatches.length > 0">
            以下记录的负责人在对应转运站花名册中未找到，请核对后修正。
          </template>
        </Alert>

        <Table
          v-if="personnelMatchResult.mismatches.length > 0"
          :columns="matchColumns"
          :data-source="personnelMatchResult.mismatches"
          :pagination="{ pageSize: 8, size: 'small' }"
          :row-key="(record: any) => record.id"
          size="small"
          class="match-table"
          :scroll="{ y: 320 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <Tag color="warning">不匹配</Tag>
            </template>
            <template v-else-if="column.key === 'roster'">
              <span v-if="record.rosterNames.length" class="roster-names">
                {{ record.rosterNames.join('、') }}
              </span>
              <span v-else class="text-muted">该转运站无花名册人员</span>
            </template>
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
  Modal,
  Drawer,
  Tag,
  DatePicker,
  InputNumber,
  Textarea,
  AutoComplete,
  Alert,
  Spin,
  message,
  Popconfirm,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import dayjs from 'dayjs';

import {
  getFireEquipmentList,
  createFireEquipment,
  updateFireEquipment,
  deleteFireEquipment,
  type SiteApi,
} from '#/api/hse/site';
import { getEmployeeList, getDeptTree, type EmployeeApi } from '#/api/hse/employee';

const loading = ref(false);
const equipmentList = ref<SiteApi.FireEquipment[]>([]);

// 卡片交互：当前激活的统计卡片 key
const activeStatKey = ref<string>('');

const searchForm = reactive({
  model: '',
  location: undefined as string | undefined,
  year: undefined as number | undefined,
  month: undefined as number | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const typeOptions = ['灭火器', '消防栓', '喷淋系统', '烟感探测器', '应急照明', '疏散指示牌', '防火门'];

// 安装位置选项：各乡镇转运站（动态加载，兜底硬编码）
const locationOptions = ref<string[]>([
  '宁津镇转运站',
  '柴胡店镇转运站',
  '时集镇转运站',
  '保店镇转运站',
]);

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<SiteApi.FireEquipment | null>(null);
const equipmentForm = reactive<Partial<SiteApi.FireEquipment>>({
  name: '',
  type: '灭火器',
  model: '',
  location: '',
  status: '正常',
  quantity: 1,
  installDate: '',
  expiryDate: '',
  lastCheckDate: '',
  nextCheckDate: '',
  manager: '',
  phone: '',
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules: Record<string, any> = {
  name: [
    { required: true, message: '请输入设施名称', trigger: 'blur' },
    { min: 2, max: 50, message: '名称长度为2-50字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择设施类型', trigger: 'change' }],
  location: [{ required: true, message: '请选择安装位置（转运站）', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  manager: [{ required: true, message: '请选择或输入负责人', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.FireEquipment | null>(null);

// ========= 负责人关联花名册（转运站操作员） =========
// 业务口径（用户确认）：消防设施负责人 = 该转运站所属乡镇作业中心中「职位=转运站操作员」的在岗人员。
// 操作员发生替换（xx辞职/离职 → xx正式员工接替）时，负责人应随现任在岗操作员更新。
const managerOptions = ref<Array<{ value: string; phone?: string; employee_code?: string }>>([]);
const rosterTip = ref('');
const employees = ref<EmployeeApi.EmployeeItem[]>([]);

function isTransferStationOperator(emp: EmployeeApi.EmployeeItem): boolean {
  return emp.position_name === '转运站操作员';
}
// 在岗：org_status=active（后端已将「辞职/死亡」等映射为 left）
function isInService(emp: EmployeeApi.EmployeeItem): boolean {
  return emp.org_status === 'active';
}
// 归一化乡镇键：去掉子位置(值班室1等)/转运站/作业中心/乡镇后缀，用于「安装位置」与操作员部门对齐
function normTownKey(input: string): string {
  return String(input || '')
    .replace(/-.*$/, '')
    .replace(/转运站$/g, '')
    .replace(/作业中心$/g, '')
    .replace(/乡镇$/g, '')
    .replace(/[镇乡]$/g, '')
    .trim();
}
// 负责人可能为多名，以 /、中文顿号等分隔
function splitManagerNames(manager?: string): string[] {
  return String(manager || '')
    .split(/[\/、,，;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
const transferOperators = computed<EmployeeApi.EmployeeItem[]>(() =>
  (employees.value || []).filter((e) => isTransferStationOperator(e) && isInService(e)),
);
function operatorsOfStation(location?: string): EmployeeApi.EmployeeItem[] {
  const key = normTownKey(location || '');
  if (!key) return [];
  return transferOperators.value.filter((op) => normTownKey(op.dept_name || '') === key);
}
// 按职位筛选，仅拉取转运站操作员（后端 positionName 精确过滤）
async function loadEmployees() {
  try {
    const res = await getEmployeeList({ pageSize: 9999, positionName: '转运站操作员' } as any);
    employees.value = res.list ?? [];
  } catch (err) {
    console.warn('加载转运站操作员失败:', err);
    employees.value = [];
  }
}

// 加载转运站选项（从部门树提取含"转运站"的二级部门）
async function loadTransferStations() {
  try {
    const deptTree = await getDeptTree({ includeInactive: false });
    const stations = new Set<string>();
    function collect(nodes: EmployeeApi.DeptNode[]) {
      for (const node of nodes) {
        if (node.level === 2 && node.name.includes('转运站')) {
          stations.add(node.name);
        }
        if (node.children?.length) {
          collect(node.children);
        }
      }
    }
    collect(deptTree);
    if (stations.size > 0) {
      locationOptions.value = Array.from(stations).sort();
    }
  } catch (err) {
    console.warn('加载转运站列表失败，使用兜底列表:', err);
  }
}

// 根据安装位置返回负责人候选（现任在岗转运站操作员）
function fetchRosterForLocation(location: string) {
  if (!location) {
    managerOptions.value = [];
    rosterTip.value = '';
    return;
  }
  const ops = operatorsOfStation(location);
  managerOptions.value = ops.map((e) => ({
    value: e.name || '',
    phone: e.phone || '',
    employee_code: e.employee_code || '',
  }));
  rosterTip.value = ops.length
    ? `已关联 ${location} 转运站操作员 ${ops.length} 人`
    : `未找到 ${location} 的在岗转运站操作员，可手动输入`;
}


function handleLocationChange(value: any) {
  const loc = typeof value === 'string' ? value : '';
  equipmentForm.manager = '';
  equipmentForm.phone = '';
  fetchRosterForLocation(loc);
}

function handleManagerSelect(_value: any, option: any) {
  if (option?.phone) {
    equipmentForm.phone = option.phone;
  }
}

// ========= 统计卡片与表格交互 =========
const statItems = computed(() => {
  const list = equipmentList.value;
  const normal = list.filter((r) => r.status === '正常').length;
  const expired = list.filter((r) => r.status === '过期').length;
  const abnormal = list.filter((r) =>
    ['损坏', '维修中', '缺失'].includes(r.status),
  ).length;
  return [
    { key: 'total', label: '设施总数', value: list.length, color: 'blue' as const, icon: 'lucide:flame' },
    { key: 'normal', label: '正常', value: normal, color: 'green' as const, icon: 'lucide:check-circle-2' },
    { key: 'abnormal', label: '异常', value: abnormal, color: 'orange' as const, icon: 'lucide:alert-triangle' },
    { key: 'expired', label: '已过期', value: expired, color: 'red' as const, icon: 'lucide:clock' },
  ];
});

// 年份选项（从数据中提取 + 当前年份）
const yearOptions = computed(() => {
  const years = new Set<number>();
  for (const item of equipmentList.value) {
    if (item.installDate) {
      years.add(dayjs(item.installDate).year());
    }
  }
  years.add(dayjs().year());
  return Array.from(years).sort((a, b) => b - a);
});

function handleStatCardClick(key: string) {
  if (activeStatKey.value === key) {
    // 再次点击同一卡片 → 取消筛选
    activeStatKey.value = '';
  } else {
    activeStatKey.value = key;
  }
  pagination.page = 1;
}

// ========= 客户端筛选 + 分页 =========
const filteredEquipmentList = computed(() => {
  let list = equipmentList.value;

  // 统计卡片状态筛选
  if (activeStatKey.value === 'normal') {
    list = list.filter((r) => r.status === '正常');
  } else if (activeStatKey.value === 'abnormal') {
    list = list.filter((r) => ['损坏', '维修中', '缺失'].includes(r.status));
  } else if (activeStatKey.value === 'expired') {
    list = list.filter((r) => r.status === '过期');
  }

  // 安装位置筛选
  if (searchForm.location) {
    list = list.filter((r) => r.location === searchForm.location);
  }

  // 规格型号筛选
  if (searchForm.model) {
    const kw = searchForm.model.toLowerCase();
    list = list.filter((r) => r.model?.toLowerCase().includes(kw));
  }

  // 安装年份筛选
  if (searchForm.year) {
    list = list.filter((r) => r.installDate && dayjs(r.installDate).year() === searchForm.year);
  }

  // 安装月份筛选
  if (searchForm.month) {
    list = list.filter((r) => r.installDate && dayjs(r.installDate).month() + 1 === searchForm.month);
  }

  return list;
});

const filteredTotal = computed(() => filteredEquipmentList.value.length);

const paginatedList = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredEquipmentList.value.slice(start, start + pagination.pageSize);
});

// ========= 表格列 =========
const columns = [
  { title: '序号', key: 'index', width: 70, customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1 },
  { title: '设施名称', dataIndex: 'name', key: 'name', width: 180, ellipsis: true },
  { title: '型号规格', dataIndex: 'model', key: 'model', width: 140 },
  { title: '安装位置', dataIndex: 'location', key: 'location', width: 140 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80 },
  { title: '安装日期', dataIndex: 'installDate', key: 'installDate', width: 110 },
  { title: '有效期至', dataIndex: 'expiryDate', key: 'expiryDate', width: 110 },
  { title: '负责人', dataIndex: 'manager', key: 'manager', width: 130 },
  { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 130 },
  { title: '操作', key: 'action', width: 160, fixed: 'right' as const },
];

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    '正常': 'green',
    '过期': 'red',
    '损坏': 'orange',
    '维修中': 'blue',
    '缺失': 'default',
  };
  return map[status] || 'default';
}

function formatDate(date: string | null | undefined) {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

// ========= 数据获取 =========
async function fetchList() {
  loading.value = true;
  try {
    const allList: SiteApi.FireEquipment[] = [];
    let currentPage = 1;
    const pageSize = 200;
    let total = 0;
    do {
      const res = await getFireEquipmentList({
        page: currentPage,
        pageSize,
      });
      const list = res.list || [];
      allList.push(...list);
      total = res.total || 0;
      currentPage++;
    } while (allList.length < total);
    equipmentList.value = allList;
  } catch (err) {
    console.warn('获取消防设施列表失败:', err);
    message.error('获取数据失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
}

function handleReset() {
  searchForm.model = '';
  searchForm.location = undefined;
  searchForm.year = undefined;
  searchForm.month = undefined;
  activeStatKey.value = '';
  pagination.page = 1;
}

function handleTableChange(pag: any) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
}

function handleCreate() {
  editingRecord.value = null;
  Object.assign(equipmentForm, {
    name: '',
    type: '灭火器',
    model: '',
    location: '',
    status: '正常',
    quantity: 1,
    installDate: dayjs().format('YYYY-MM-DD'),
    expiryDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
    lastCheckDate: dayjs().format('YYYY-MM-DD'),
    nextCheckDate: dayjs().add(1, 'month').format('YYYY-MM-DD'),
    manager: '',
    phone: '',
    remark: '',
  });
  rosterTip.value = '';
  managerOptions.value = [];
  modalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(equipmentForm, record);
  if (record.location) {
    fetchRosterForLocation(record.location);
  }
  modalVisible.value = true;
}

function handleView(record: any) {
  currentRecord.value = record;
  detailDrawerVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  modalLoading.value = true;
  try {
    if (editingRecord.value) {
      await updateFireEquipment(editingRecord.value.id, equipmentForm);
      message.success('更新成功');
    } else {
      await createFireEquipment(equipmentForm);
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
    await deleteFireEquipment(record.id);
    message.success('删除成功');
    fetchList();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

// ========= 导入后人员匹配校验 =========
const personnelMatchVisible = ref(false);
const personnelMatchLoading = ref(false);
const personnelMatchResult = ref<{
  total: number;
  matched: number;
  mismatches: Array<{
    id: number;
    name: string;
    location: string;
    manager: string;
    rosterNames: string[];
  }>;
} | null>(null);

// 判断某条记录的负责人是否为本站位在岗转运站操作员（支持多名分隔）
function isManagerMismatch(record: any): boolean {
  const names = splitManagerNames(record.manager);
  if (!names.length || !record.location) return false;
  const opsAtStation = operatorsOfStation(record.location);
  return names.some((n) => !opsAtStation.some((op) => op.name === n));
}

const matchColumns = [
  { title: '设施名称', dataIndex: 'name', key: 'name', width: 160, ellipsis: true },
  { title: '安装位置', dataIndex: 'location', key: 'location', width: 140 },
  { title: '负责人', dataIndex: 'manager', key: 'manager', width: 100 },
  { title: '花名册人员', key: 'roster', ellipsis: true },
  { title: '状态', key: 'status', width: 90, fixed: 'right' as const },
];

// 执行人员匹配校验（转运站操作员口径）
async function checkPersonnelMatch() {
  personnelMatchLoading.value = true;
  personnelMatchVisible.value = true;
  try {
    await loadEmployees();
    const mismatches: Array<{
      id: number;
      name: string;
      location: string;
      manager: string;
      rosterNames: string[];
    }> = [];
    let matched = 0;

    for (const facility of equipmentList.value) {
      const names = splitManagerNames(facility.manager);
      if (!names.length) continue;
      const station = facility.location || '';
      const opsAtStation = operatorsOfStation(station);
      const found = names.every((n) => opsAtStation.some((op) => op.name === n));
      if (found) {
        matched++;
      } else {
        mismatches.push({
          id: facility.id,
          name: facility.name,
          location: station || '-',
          manager: facility.manager,
          rosterNames: opsAtStation.map((e) => e.name),
        });
      }
    }

    const total = equipmentList.value.filter((f) => f.manager).length;
    personnelMatchResult.value = {
      total,
      matched,
      mismatches,
    };
  } catch (err) {
    console.warn('人员匹配校验失败:', err);
    message.error('人员匹配校验失败');
  } finally {
    personnelMatchLoading.value = false;
  }
}

// 导入完成后触发刷新 + 人员匹配
async function handleImportRefresh() {
  await fetchList();
  await checkPersonnelMatch();
}

// 下载不匹配记录
function handleDownloadMatchErrors() {
  if (!personnelMatchResult.value?.mismatches.length) return;
  const headers = '设施名称,安装位置,负责人,花名册人员,状态\n';
  const rows = personnelMatchResult.value.mismatches
    .map((r) => {
      const roster = r.rosterNames.length ? r.rosterNames.join('、') : '无';
      return `"${r.name}","${r.location}","${r.manager}","${roster}","不匹配"`;
    })
    .join('\n');
  const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fire-facility_personnel_mismatch.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  message.success('不匹配记录已下载');
}

// 监听列表变化，自动加载转运站操作员用于匹配标注
watch(equipmentList, () => {
  if (equipmentList.value.length > 0 && employees.value.length === 0) {
    loadEmployees();
  }
});

onMounted(() => {
  fetchList();
  loadTransferStations();
});
</script>

<style scoped lang="scss">
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.action-group {
  display: flex;
  gap: 8px;
}
.filter-form {
  margin-bottom: 16px;
}
.stat-card-wrapper {
  border-radius: 8px;
  transition: all 0.3s;
}
.stat-active {
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.4);
  border-radius: 8px;
}
.manager-mismatch {
  color: hsl(var(--warning));
  font-weight: 600;
}
.ml-1 {
  margin-left: 4px;
}
.roster-tip {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 4px;
}
.detail-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
}
.detail-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.detail-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.detail-label {
  color: hsl(var(--muted-foreground));
  min-width: 100px;
}
.detail-value {
  color: hsl(var(--foreground));
  flex: 1;
}
.detail-content {
  margin-top: 8px;
  padding: 12px;
  background: hsl(var(--muted) / 0.3);
  border-radius: 6px;
  color: hsl(var(--foreground));
  line-height: 1.6;
}
.mr-2 {
  margin-right: 8px;
}
.match-loading {
  text-align: center;
  padding: 48px 0;
}
.match-alert {
  margin-bottom: 16px;
}
.match-table {
  margin-bottom: 16px;
}
.match-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid hsl(var(--border));
}
.text-warning {
  color: hsl(var(--warning));
  font-weight: 600;
}
.text-muted {
  color: hsl(var(--muted-foreground));
}
.roster-names {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
