<script setup lang="ts">
/**
 * 员工主档案页 - R1-Phase1 收尾 · 提示词-40 任务 C
 *
 * 入口：EmployeeName 组件点击（useEmployeeLink.openProfile）→ /hse/employee/:id
 * 结构：基本信息卡片 + 组织岗位卡片 + 关联业务 Tab（渐进式加载 / 分页 / 空态 / 错误态）
 *
 * 约束：自身不渲染可点击 EmployeeName（避免循环跳转）；页面容器用 @vben/common-ui 的 Page；
 *       不修改数据库结构 / 其他模块 / 菜单 / 登录代码。
 */
import { computed, h, onMounted, reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  Button,
  Card,
  Col,
  Descriptions,
  DescriptionsItem,
  Empty,
  Row,
  Skeleton,
  TabPane,
  Table,
  Tabs,
  Tag,
  message,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { useAntdDesignTokens } from '@vben/hooks';
import { EmployeeName } from '#/composables/hse';
import {
  getEmployeeAccidents,
  getEmployeeEmergencyPlans,
  getEmployeeHazards,
  getEmployeeProfile,
  getEmployeeTraining,
  getEmployeeViolations,
} from '#/api/hse/employee';
import type { EmployeeApi } from '#/api/hse/employee';

const { tokens } = useAntdDesignTokens();
const route = useRoute();
const router = useRouter();
const employeeId = computed(() => Number(route.params.id));

function goBack() {
  router.back();
}

// ============================================================
// 主档案
// ============================================================
const profileLoading = ref(false);
const profileError = ref<string | null>(null);
const profile = ref<EmployeeApi.EmployeeProfileResponse | null>(null);

async function loadProfile() {
  profileLoading.value = true;
  profileError.value = null;
  try {
    profile.value = await getEmployeeProfile(employeeId.value);
  } catch (e: any) {
    profileError.value = e?.message || '加载员工档案失败';
    profile.value = null;
  } finally {
    profileLoading.value = false;
  }
}

function dash(v: string | number | null | undefined) {
  return v === null || v === undefined || v === '' ? '-' : v;
}

// ============================================================
// 关联业务 Tab（渐进式加载）
// ============================================================
type TabKey = 'hazards' | 'accidents' | 'emergency' | 'training' | 'violations';

interface TabState {
  data: any[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  loaded: boolean;
}

const tabKeys: TabKey[] = ['hazards', 'accidents', 'emergency', 'training', 'violations'];
const tabLabels: Record<TabKey, string> = {
  hazards: '隐患记录',
  accidents: '事故记录',
  emergency: '应急预案',
  training: '培训记录',
  violations: '三违记录',
};

const tabStates = reactive<Record<TabKey, TabState>>(
  Object.fromEntries(
    tabKeys.map((k) => [k, { data: [], total: 0, page: 1, pageSize: 10, loading: false, loaded: false }]),
  ) as unknown as Record<TabKey, TabState>,
);

const activeTab = ref<TabKey>('hazards');

function statusColor(s?: string | null): string {
  switch (s) {
    case '在职':
      return 'green';
    case '离职':
      return 'red';
    case '待岗':
      return 'gold';
    case '退休':
      return 'blue';
    case '返聘':
      return 'cyan';
    default:
      return 'default';
  }
}

const empNameRender = (id?: number | null) =>
  id ? h(EmployeeName, { employeeId: id }) : '-';

const tagRender = (text?: string | null) =>
  h(Tag, { color: statusColor(text) }, () => text || '-');

// 各 Tab 列定义（人员列用 EmployeeName 渲染，可点击跳转其他员工档案）
const tabColumns: Record<TabKey, any[]> = {
  hazards: [
    { title: '编号', dataIndex: 'no', width: 80 },
    { title: '日期', dataIndex: 'hazardDate', width: 120 },
    { title: '类别', dataIndex: 'category', width: 120 },
    { title: '级别', dataIndex: 'level', width: 100 },
    { title: '检查人', dataIndex: 'checkerId', width: 120, customRender: ({ text }: any) => empNameRender(text) },
    { title: '整改人', dataIndex: 'fixerId', width: 120, customRender: ({ text }: any) => empNameRender(text) },
    { title: '状态', dataIndex: 'status', width: 100, customRender: ({ text }: any) => tagRender(text) },
  ],
  accidents: [
    { title: '编号', dataIndex: 'no', width: 80 },
    { title: '日期', dataIndex: 'accidentDate', width: 120 },
    { title: '类型', dataIndex: 'accidentType', width: 140 },
    { title: '级别', dataIndex: 'level', width: 100 },
    { title: '处理人', dataIndex: 'handlerId', width: 120, customRender: ({ text }: any) => empNameRender(text) },
    { title: '状态', dataIndex: 'status', width: 100, customRender: ({ text }: any) => tagRender(text) },
  ],
  emergency: [
    { title: '名称', dataIndex: 'name', width: 200 },
    { title: '类型', dataIndex: 'type', width: 120 },
    { title: '级别', dataIndex: 'level', width: 100 },
    { title: '负责人', dataIndex: 'responsiblePersonId', width: 120, customRender: ({ text }: any) => empNameRender(text) },
    { title: '状态', dataIndex: 'status', width: 100, customRender: ({ text }: any) => tagRender(text) },
  ],
  training: [
    { title: '姓名', dataIndex: 'name', width: 120 },
    { title: '培训类型', dataIndex: 'trainingType', width: 140 },
    { title: '日期', dataIndex: 'trainingDate', width: 120 },
    { title: '结果', dataIndex: 'result', width: 100 },
    { title: '分数', dataIndex: 'score', width: 100 },
  ],
  violations: [
    { title: '编号', dataIndex: 'no', width: 120 },
    { title: '日期', dataIndex: 'violationDate', width: 120 },
    { title: '类型', dataIndex: 'violationType', width: 160 },
    { title: '姓名', dataIndex: 'name', width: 120 },
    { title: '岗位', dataIndex: 'position', width: 140 },
    { title: '状态', dataIndex: 'status', width: 100, customRender: ({ text }: any) => tagRender(text) },
  ],
};

async function loadTab(key: TabKey) {
  const s = tabStates[key];
  if (s.loading) return;
  s.loading = true;
  try {
    const id = employeeId.value;
    let res;
    switch (key) {
      case 'hazards':
        res = await getEmployeeHazards(id, { page: s.page, pageSize: s.pageSize });
        break;
      case 'accidents':
        res = await getEmployeeAccidents(id, { page: s.page, pageSize: s.pageSize });
        break;
      case 'emergency':
        res = await getEmployeeEmergencyPlans(id, { page: s.page, pageSize: s.pageSize });
        break;
      case 'training':
        res = await getEmployeeTraining(id, { page: s.page, pageSize: s.pageSize });
        break;
      case 'violations':
        res = await getEmployeeViolations(id, { page: s.page, pageSize: s.pageSize });
        break;
    }
    s.data = res!.list;
    s.total = res!.total;
    s.loaded = true;
  } catch (e: any) {
    message.error(e?.message || '加载失败');
  } finally {
    s.loading = false;
  }
}

function onTabChange(key: string | number) {
  const k = key as TabKey;
  activeTab.value = k;
  if (!tabStates[k].loaded) {
    loadTab(k);
  }
}

function onTableChange(pag: { current: number; pageSize: number }) {
  const s = tabStates[activeTab.value];
  s.page = pag.current;
  s.pageSize = pag.pageSize;
  loadTab(activeTab.value);
}

const activePagination = computed(() => {
  const s = tabStates[activeTab.value];
  return {
    current: s.page,
    pageSize: s.pageSize,
    total: s.total,
    showSizeChanger: true,
    showTotal: (t: number) => `共 ${t} 条`,
  };
});

const activeColumns = computed(() => tabColumns[activeTab.value]);
const activeData = computed(() => tabStates[activeTab.value].data);
const activeLoading = computed(() => tabStates[activeTab.value].loading);

onMounted(() => {
  loadProfile();
  // 渐进式加载：仅初始可见的隐患记录 Tab 在挂载时加载，其余 Tab 切换时再请求
  loadTab('hazards');
});
</script>

<template>
  <Page>
    <div :style="{ background: tokens.colorBgLayout, padding: '16px' }">
      <!-- 加载态 -->
      <Skeleton v-if="profileLoading" :loading="true" active />

      <!-- 错误 / 不存在态 -->
      <Card v-else-if="profileError || !profile">
        <Empty :description="profileError || '未找到该员工'" />
      </Card>

      <!-- 档案内容 -->
      <template v-else>
        <div :style="{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }">
          <Button @click="goBack">返回</Button>
          <span :style="{ fontSize: '18px', fontWeight: 600 }">{{ profile?.name }} · 员工档案</span>
          <Tag :color="statusColor(profile?.status)">{{ profile?.status || '-' }}</Tag>
        </div>

        <Row :gutter="16">
          <!-- 基本信息 -->
          <Col :xs="24" :md="12">
            <Card title="基本信息" :style="{ marginBottom: '16px' }">
              <Descriptions :column="1" bordered size="small">
                <DescriptionsItem label="姓名">{{ dash(profile?.name) }}</DescriptionsItem>
                <DescriptionsItem label="员工编号">{{ dash(profile?.employeeCode) }}</DescriptionsItem>
                <DescriptionsItem label="性别">{{ dash(profile?.gender) }}</DescriptionsItem>
                <DescriptionsItem label="年龄">{{ profile?.age ?? '-' }}</DescriptionsItem>
                <DescriptionsItem label="身份证号">{{ dash(profile?.idCard) }}</DescriptionsItem>
                <DescriptionsItem label="联系电话">{{ dash(profile?.phone) }}</DescriptionsItem>
                <DescriptionsItem label="入职日期">{{ dash(profile?.hireDate) }}</DescriptionsItem>
                <DescriptionsItem label="在职状态">
                  <Tag :color="statusColor(profile?.status)">{{ profile?.status || '-' }}</Tag>
                </DescriptionsItem>
              </Descriptions>
            </Card>
          </Col>

          <!-- 组织与岗位 -->
          <Col :xs="24" :md="12">
            <Card title="组织与岗位" :style="{ marginBottom: '16px' }">
              <Descriptions :column="1" bordered size="small">
                <DescriptionsItem label="所属组织">{{ dash(profile?.orgName) }}</DescriptionsItem>
                <DescriptionsItem label="组织类型">{{ dash(profile?.orgType) }}</DescriptionsItem>
                <DescriptionsItem label="岗位">{{ dash(profile?.positionName) }}</DescriptionsItem>
                <DescriptionsItem label="运营单位">{{ dash(profile?.unitName) }}</DescriptionsItem>
                <DescriptionsItem label="是否驾驶员">
                  <Tag :color="profile?.isDriver ? 'blue' : 'default'">
                    {{ profile?.isDriver ? '是' : '否' }}
                  </Tag>
                </DescriptionsItem>
              </Descriptions>
            </Card>
          </Col>
        </Row>

        <!-- 关联业务 -->
        <Card title="关联业务数据">
          <Tabs v-model:activeKey="activeTab" @change="onTabChange">
            <TabPane v-for="k in tabKeys" :key="k" :tab="tabLabels[k]">
              <Table
                :columns="activeColumns"
                :data-source="activeData"
                :pagination="activePagination"
                :loading="activeLoading"
                row-key="id"
                size="small"
                :scroll="{ x: 'max-content' }"
                @change="(p: any) => onTableChange(p)"
              />
            </TabPane>
          </Tabs>
        </Card>
      </template>
    </div>
  </Page>
</template>
