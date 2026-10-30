<script setup lang="tsx">
/**
 * 员工花名册导入 V2 - 批次管理主页
 *
 * 功能:
 *   1. 批次列表（分页 + 状态筛选）
 *   2. Excel 上传（上传抽屉）
 *   3. 批次预览（详情抽屉）
 *   4. 异常审核（在预览抽屉内）
 *   5. 确认入库（在预览抽屉内）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  Button,
  Card,
  Drawer,
  Dropdown,
  Input,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Upload,
  message,
  Row,
  Col,
  Alert,
  Result,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';
import {
  getImportBatchList,
  uploadEmployeeRoster,
  getBatchPreview,
  getBatchPendingList,
  resolvePending,
  executeImport,
  deleteImportBatch,
  getClearAllPreview,
  clearAllCascade,
  type EmployeeImportV2Api,
} from '#/api/hse/employee-import-v2';

// ============================================================
// 状态
// ============================================================
const { hasAccessByRoles } = useAccess();
const canImport = computed(() => hasAccessByRoles(['admin', 'safety_manager']));
const canResolve = computed(() =>    hasAccessByRoles(['admin', 'safety_manager']));
const canExecute = computed(() =>    hasAccessByRoles(['admin', 'safety_manager']));
const canClearAll = computed(() =>   hasAccessByRoles(['admin']));

// 列表
const loading = ref(false);
const list = ref<EmployeeImportV2Api.ImportBatch[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });
const searchForm = reactive({
  status: undefined as string | undefined,
});

const statusOptions = [
  { label: '已上传', value: 'uploaded' },
  { label: '待审核', value: 'pending_review' },
  { label: '已入库', value: 'completed' },
  { label: '部分入库', value: 'partial_completed' },
  { label: '入库失败', value: 'failed' },
];

const statusColorMap: Record<string, string> = {
  uploaded: 'default',
  parsing: 'processing',
  pending_review: 'orange',
  completed: 'success',
  partial_completed: 'warning',
  failed: 'error',
};

const statusTextMap: Record<string, string> = {
  uploaded: '已上传',
  parsing: '解析中',
  pending_review: '待审核',
  completed: '已入库',
  partial_completed: '部分入库',
  failed: '失败',
};

const pendingTypeColorMap: Record<string, string> = {
  auto_matched: 'success',
  missing_field: 'warning',
  unknown_dept: 'error',
  unknown_position: 'error',
  id_card_conflict: 'error',
  phone_conflict: 'error',
};

const pendingTypeTextMap: Record<string, string> = {
  auto_matched: '自动匹配',
  missing_field: '字段缺失',
  unknown_dept: '未知部门',
  unknown_position: '未知岗位',
  id_card_conflict: '身份证冲突',
  phone_conflict: '手机号冲突',
};

const pendingStatusColorMap: Record<string, string> = {
  pending: 'warning',
  approved: 'cyan',
  rejected: 'default',
  imported: 'success',
};

const pendingStatusTextMap: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  imported: '已入库',
};

// 上传抽屉
const uploadDrawerVisible = ref(false);
const uploading = ref(false);
const uploadResult = ref<EmployeeImportV2Api.UploadResult | null>(null);

// 详情抽屉
const detailDrawerVisible = ref(false);
const detailLoading = ref(false);
const currentBatch = ref<EmployeeImportV2Api.ImportBatch | null>(null);
const pendingList = ref<EmployeeImportV2Api.ImportPending[]>([]);
const pendingFilter = reactive({
  status: undefined as string | undefined,
  pending_type: undefined as string | undefined,
});

// 审核表单
const resolveForm = reactive({
  visible: false,
  pending: null as EmployeeImportV2Api.ImportPending | null,
  resolution: 'approved' as 'approved' | 'rejected',
  target_org_id: undefined as number | undefined,
  target_unit_id: undefined as number | undefined,
  target_pos_id: undefined as number | undefined,
  remark: '',
});

// 入库结果模态
const importResultVisible = ref(false);
const importResult = ref<EmployeeImportV2Api.ImportResult | null>(null);

// ============================================================
// 列表加载
// ============================================================
async function loadList() {
  loading.value = true;
  try {
    const res = await getImportBatchList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: searchForm.status,
    });
    list.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    message.error(e.message || '加载批次列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  loadList();
}

function handleReset() {
  searchForm.status = undefined;
  pagination.page = 1;
  loadList();
}

function handleDownloadTemplate() {
  const link = document.createElement('a');
  link.href = '/templates/employee_roster_template.xlsx';
  link.download = '员工花名册导入模板.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  message.success('模板下载中...');
}

function handleTableChange(pag: any) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  loadList();
}

// ============================================================
// 上传
// ============================================================
function openUploadDrawer() {
  uploadDrawerVisible.value = true;
  uploadResult.value = null;
}

const uploadProps = {
  accept: '.xlsx,.xls',
  maxCount: 1,
  beforeUpload: (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      message.error(`不支持的文件类型: ${file.name}`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error('文件大小不能超过 10MB');
      return Upload.LIST_IGNORE;
    }
    return true;
  },
  showUploadList: false,
};

async function handleUploadFile(file: File) {
  uploading.value = true;
  try {
    const res = await uploadEmployeeRoster(file);
    uploadResult.value = res;
    message.success(`上传成功：共 ${res.totalRows} 行，成功匹配 ${res.successCount} 条，异常 ${res.pendingCount} 条`);
    loadList();
  } catch (e: any) {
    message.error(e.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

// ============================================================
// 详情 + 待审核
// ============================================================
async function openDetailDrawer(batch: EmployeeImportV2Api.ImportBatch) {
  currentBatch.value = batch;
  detailDrawerVisible.value = true;
  pendingFilter.status = undefined;
  pendingFilter.pending_type = undefined;
  await loadDetail();
}

async function loadDetail() {
  if (!currentBatch.value) return;
  detailLoading.value = true;
  try {
    const res = await getBatchPreview(currentBatch.value.id);
    currentBatch.value = res.batch;
  } catch (e: any) {
    message.error(e.message || '加载批次详情失败');
  } finally {
    detailLoading.value = false;
  }
}

async function loadPendingList() {
  if (!currentBatch.value) return;
  try {
    pendingList.value = await getBatchPendingList(currentBatch.value.id, {
      status: pendingFilter.status,
      pending_type: pendingFilter.pending_type,
    });
  } catch (e: any) {
    message.error(e.message || '加载待确认记录失败');
  }
}

function closeDetailDrawer() {
  detailDrawerVisible.value = false;
  currentBatch.value = null;
  pendingList.value = [];
}

// ============================================================
// 审核
// ============================================================
function openResolveDialog(pending: EmployeeImportV2Api.ImportPending) {
  resolveForm.pending = pending;
  resolveForm.resolution = 'approved';
  resolveForm.target_org_id = pending.target_org_id;
  resolveForm.target_unit_id = pending.target_unit_id;
  resolveForm.target_pos_id = pending.target_pos_id;
  resolveForm.remark = pending.pending_desc || '';
  resolveForm.visible = true;
}

async function handleResolveSubmit() {
  if (!resolveForm.pending) return;
  try {
    await resolvePending(resolveForm.pending.id, {
      resolution: resolveForm.resolution,
      target_org_id: resolveForm.target_org_id,
      target_unit_id: resolveForm.target_unit_id,
      target_pos_id: resolveForm.target_pos_id,
      remark: resolveForm.remark,
    });
    message.success(resolveForm.resolution === 'approved' ? '已通过' : '已拒绝');
    resolveForm.visible = false;
    loadDetail();
    loadPendingList();
    loadList();
  } catch (e: any) {
    message.error(e.message || '操作失败');
  }
}

// 批量审核：仅当所有待审都是 missing_field 等简单异常
async function handleBatchApprove() {
  if (!currentBatch.value) return;
  const items = pendingList.value.filter((p) => p.status === 'pending' && p.target_org_id);
  if (items.length === 0) {
    message.warning('当前筛选下没有可批量通过且已匹配组织/岗位的记录');
    return;
  }
  Modal.confirm({
    title: '批量通过确认',
    content: `将对 ${items.length} 条记录执行通过，请确认目标组织/岗位已正确`,
    onOk: async () => {
      let okCount = 0;
      for (const p of items) {
        try {
          await resolvePending(p.id, {
            resolution: 'approved',
            target_org_id: p.target_org_id,
            target_unit_id: p.target_unit_id,
            target_pos_id: p.target_pos_id,
          });
          okCount++;
        } catch (e: any) {
          // 静默继续
        }
      }
      message.success(`已通过 ${okCount} 条`);
      loadDetail();
      loadPendingList();
      loadList();
    },
  });
}

// ============================================================
// 正式入库
// ============================================================
function openImportConfirm() {
  if (!currentBatch.value) return;

  // 检查是否有未审核的异常数据
  const pendingItems = pendingList.value.filter((p) => p.status === 'pending');
  if (pendingItems.length > 0) {
    Modal.warning({
      title: '存在未审核的异常数据',
      content: `当前批次有 ${pendingItems.length} 条异常数据处于"待审核"状态。请先完成审核（通过/拒绝）后再执行入库。`,
      okText: '我知道了',
    });
    return;
  }

  // 检查是否有可入库的数据
  const approvedItems = pendingList.value.filter((p) => p.status === 'approved');
  if (approvedItems.length === 0) {
    Modal.warning({
      title: '无可入库数据',
      content: '当前批次没有"已通过"状态的记录，请先审核通过后再入库。',
      okText: '我知道了',
    });
    return;
  }

  Modal.confirm({
    title: '确认入库',
    content: `即将把 ${approvedItems.length} 条已通过 (approved) 的记录写入员工主数据，是否继续？`,
    okText: '确认入库',
    cancelText: '取消',
    onOk: handleExecuteImport,
  });
}

async function handleExecuteImport() {
  if (!currentBatch.value) return;
  try {
    const res = await executeImport(currentBatch.value.id);
    importResult.value = res;
    importResultVisible.value = true;
    loadDetail();
    loadPendingList();
    loadList();
  } catch (e: any) {
    message.error(e.message || '入库失败');
  }
}

// ============================================================
// 删除批次
// ============================================================
async function handleDeleteBatch(record: any) {
  try {
    await deleteImportBatch(record.id);
    message.success('批次删除成功');
    loadList();
  } catch (e: any) {
    message.error(e.message || '删除失败');
  }
}

// ============================================================
// 清空所有人员
// ============================================================
const clearAllPreview = ref<any>(null);
const clearAllLoading = ref(false);

function buildClearAllContent(preview: any): string {
  const layers = preview?.layers || {};
  const summary = preview?.summary || {};
  const noAction = layers.noAction || {};
  const setNull = layers.setNull || {};
  const core = layers.core || {};
  const noActionTotal = summary.noActionTotal || 0;
  const setNullTotal = summary.setNullTotal || 0;
  const coreTotal = summary.coreTotal || 0;
  const grandTotal = summary.grandTotal || 0;

  const noActionTables = Object.keys(noAction).length;
  const setNullTables = Object.keys(setNull).length;

  return [
    '此操作将【物理删除】以下数据，且不可逆、不可恢复：',
    '',
    `① 硬引用业务数据（NO ACTION）：${noActionTotal} 条，涉及 ${noActionTables} 张表（风险记录、责任体系、网格检查等）`,
    `② 软引用业务数据（SET NULL）：${setNullTotal} 条，涉及 ${setNullTables} 张表（培训/考核/三违/事故/隐患/合同等）`,
    `③ 人员核心数据：${coreTotal} 条（员工 ${core.employee || 0} 人、待确认 ${core.employee_import_pending || 0} 条、批次 ${core.employee_import_batch || 0} 个；任职关系 employee_assignment 已计入上方业务数据）`,
    '',
    `合计约 ${grandTotal} 条数据将被永久删除。`,
    '请确认已对 backup_97_* / backup_98_* 逻辑备份表做过全量备份，是否继续？',
  ].join('\n');
}

async function openClearAllConfirm() {
  clearAllLoading.value = true;
  try {
    const preview: any = await getClearAllPreview();
    clearAllPreview.value = preview;
    Modal.confirm({
      title: '确定级联清空所有人员信息？',
      content: buildClearAllContent(preview),
      okText: '确认级联清空',
      okType: 'danger',
      cancelText: '取消',
      width: 600,
      onOk: handleClearAll,
    });
  } catch (e: any) {
    const errMsg: string = e?.message || e?.toString() || '未知错误';
    if (errMsg.includes('401') || errMsg.includes('token') || errMsg.includes('认证') || errMsg.includes('登录')) {
      message.error('会话已过期，请重新登录后再试');
    } else if (errMsg.includes('403') || errMsg.includes('权限')) {
      message.error('权限不足，仅管理员可执行清空操作');
    } else {
      message.error('预检查失败：' + errMsg);
    }
  } finally {
    clearAllLoading.value = false;
  }
}

async function handleClearAll() {
  try {
    const res: any = await clearAllCascade();
    const stats = res || {};
    const details = [
      stats.employee ? `员工 ${stats.employee} 人` : '',
      stats.employee_assignment ? `任职 ${stats.employee_assignment} 条` : '',
      stats.employee_import_batch ? `批次 ${stats.employee_import_batch} 个` : '',
      stats.employee_import_pending ? `待确认 ${stats.employee_import_pending} 条` : '',
    ].filter(Boolean).join('、');
    message.success(`级联清空完成：${details || '0 条'}`);
    loadList();
    if (detailDrawerVisible.value) {
      detailDrawerVisible.value = false;
    }
  } catch (e: any) {
    // 增强错误信息：区分 token 过期 / 权限不足 / 外键引用等场景
    const errMsg: string = e?.message || e?.toString() || '未知错误';
    const status: number | undefined = e?.response?.status;
    if (status === 401 || errMsg.includes('401') || errMsg.includes('token') || errMsg.includes('认证') || errMsg.includes('登录')) {
      message.error('会话已过期，请重新登录后再试');
    } else if (status === 403 || errMsg.includes('403') || errMsg.includes('权限')) {
      message.error('权限不足，仅管理员可执行清空操作');
    } else if (errMsg.includes('foreign key') || errMsg.includes('外键') || errMsg.includes('constraint') || errMsg.includes('引用')) {
      message.error('级联清空失败：仍有业务数据引用员工记录，请先清理相关业务数据');
    } else {
      message.error('级联清空失败：' + errMsg);
    }
  }
}

// ============================================================
// 列表列定义
// ============================================================
const columns = [
  {
    title: '批次号',
    dataIndex: 'batch_no',
    width: 240,
    ellipsis: true,
    customRender: ({ record }: any) => (
      <a onClick={() => openDetailDrawer(record)}>{record.batch_no}</a>
    ),
  },
  {
    title: '文件名称',
    dataIndex: 'file_name',
    width: 200,
    ellipsis: true,
  },
  {
    title: '规则版本',
    dataIndex: 'rule_version',
    width: 90,
  },
  {
    title: '总人数',
    dataIndex: 'total_count',
    width: 80,
    align: 'right' as const,
  },
  {
    title: '已匹配',
    dataIndex: 'success_count',
    width: 80,
    align: 'right' as const,
    customRender: ({ record }: any) => (
      <span style="color: #52c41a">{record.success_count || 0}</span>
    ),
  },
  {
    title: '异常',
    dataIndex: 'pending_count',
    width: 80,
    align: 'right' as const,
    customRender: ({ record }: any) => (
      <span style="color: #faad14">{record.pending_count || 0}</span>
    ),
  },
  {
    title: '跳过',
    dataIndex: 'skipped_count',
    width: 70,
    align: 'right' as const,
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    customRender: ({ record }: any) => (
      <Tag color={statusColorMap[record.status] || 'default'}>
        {statusTextMap[record.status] || record.status}
      </Tag>
    ),
  },
  {
    title: '操作人',
    dataIndex: 'operator',
    width: 100,
  },
  {
    title: '导入时间',
    dataIndex: 'created_at',
    width: 170,
    customRender: ({ record }: any) =>
      record.created_at ? new Date(record.created_at).toLocaleString('zh-CN') : '-',
  },
  {
    title: '操作',
    key: 'action',
    width: 180,
    fixed: 'right' as const,
    customRender: ({ record }: any) => (
      <Space size="small">
        <a onClick={() => openDetailDrawer(record)}>详情</a>
        <Popconfirm
          title="确定删除该批次？"
          description="删除后不可恢复，其下的待确认记录也会一并删除。"
          okText="确定删除"
          okType="danger"
          cancelText="取消"
          onConfirm={() => handleDeleteBatch(record)}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>
      </Space>
    ),
  },
];

// pending 列
const pendingColumns = [
  { title: 'Excel行', dataIndex: 'row_num', width: 70 },
  { title: '员工编号', dataIndex: 'employee_no', width: 100, ellipsis: true },
  { title: '姓名', dataIndex: 'employee_name', width: 100 },
  { title: '所属部门', dataIndex: 'raw_dept', width: 120, ellipsis: true },
  { title: '职位', dataIndex: 'raw_position', width: 100, ellipsis: true },
  { title: '班组', dataIndex: 'raw_team', width: 80, ellipsis: true },
  {
    title: '匹配状态',
    dataIndex: 'pending_type',
    width: 110,
    customRender: ({ record }: any) => (
      <Tag color={pendingTypeColorMap[record.pending_type] || 'default'}>
        {pendingTypeTextMap[record.pending_type] || record.pending_type}
      </Tag>
    ),
  },
  {
    title: '描述',
    dataIndex: 'pending_desc',
    ellipsis: true,
    customRender: ({ record }: any) => (
      <Tooltip title={record.pending_desc}>
        <span style="color: #ff4d4f">{record.pending_desc || '-'}</span>
      </Tooltip>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    customRender: ({ record }: any) => (
      <Tag color={pendingStatusColorMap[record.status] || 'default'}>
        {pendingStatusTextMap[record.status] || record.status}
      </Tag>
    ),
  },
  {
    title: '规则版本',
    dataIndex: 'rule_version',
    width: 90,
  },
  {
    title: '操作',
    key: 'action',
    width: 100,
    fixed: 'right' as const,
    customRender: ({ record }: any) => {
      if (record.status !== 'pending') return <span style="color: #bbb">-</span>;
      return <a onClick={() => openResolveDialog(record)}>审核</a>;
    },
  },
];

onMounted(loadList);
</script>

<template>
  <Page>
    <Card>
      <!-- 工具栏 -->
      <Row :gutter="16" style="margin-bottom: 16px" align="middle">
        <Col :flex="1">
          <Space wrap>
            <Select
              v-model:value="searchForm.status"
              placeholder="批次状态"
              style="width: 140px"
              allow-clear
              @change="handleSearch"
            >
              <Select.Option v-for="o in statusOptions" :key="o.value" :value="o.value">
                {{ o.label }}
              </Select.Option>
            </Select>
            <Button @click="handleReset">重置</Button>
            <Button v-if="canImport" type="primary" @click="openUploadDrawer">
              <template #icon><IconifyIcon icon="lucide:upload" /></template>
              上传花名册
            </Button>
            <Button v-if="canImport" @click="handleDownloadTemplate">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              下载导入模板
            </Button>
          </Space>
        </Col>
        <Col v-if="canClearAll">
          <Dropdown :trigger="['click']">
            <Button>
              更多操作
              <IconifyIcon icon="lucide:chevron-down" style="margin-left:4px" />
            </Button>
            <template #overlay>
              <Menu>
                <!-- P0-1 数据删除风险隔离：全量清空入口已暂停（disabled 使 @click 不再触发），
                     真正的安全边界是服务端 PURGE_ALL_PERMANENTLY_DISABLED 的 fail-closed 隔离 -->
                <Menu.Item key="clear-all" danger disabled title="已暂停（P0 数据删除风险隔离）：该操作会物理删除全部人员及关联业务数据，如需清空测试数据请联系系统管理员" @click="openClearAllConfirm">
                  <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
                  清空人员信息（已暂停）
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
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
        :scroll="{ x: 1400 }"
        @change="handleTableChange"
      />
    </Card>

    <!-- 上传抽屉 -->
    <Drawer
      v-model:open="uploadDrawerVisible"
      title="上传员工花名册"
      :width="640"
      :footer-style="{ textAlign: 'right' }"
    >
      <Alert
        message="使用说明"
        type="info"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #description>
          <div>
            1. 支持 .xlsx / .xls 格式；<br />
            2. 请使用系统提供的标准模板，包含 13 个标准字段（员工编号/姓名/身份证号/性别/出生日期/所属部门/班组/职位/入职日期/联系电话/是否驾驶员/驾驶证类型/直接上级）；<br />
            3. 上传后系统将自动解析、校验、组织/岗位匹配；<br />
            4. 异常数据进入待审核，需要人工确认后才能入库。
          </div>
        </template>
      </Alert>
      <Upload.Dragger v-bind="uploadProps" :custom-request="(opts: any) => handleUploadFile(opts.file)" :disabled="uploading">
        <p class="ant-upload-drag-icon">
          <IconifyIcon icon="lucide:inbox" :size="48" color="#1677ff" />
        </p>
        <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
        <p class="ant-upload-hint">仅支持 .xlsx / .xls 格式，文件大小不超过 10MB</p>
      </Upload.Dragger>

      <div v-if="uploadResult" style="margin-top: 24px">
        <Alert type="success" show-icon message="上传解析完成">
          <template #description>
            <Row :gutter="16">
              <Col :span="6">
                <Statistic title="批次号" :value="uploadResult.batchNo" />
              </Col>
              <Col :span="6">
                <Statistic title="总人数" :value="uploadResult.totalRows" />
              </Col>
              <Col :span="6">
                <Statistic
                  title="成功匹配"
                  :value="uploadResult.successCount"
                  :value-style="{ color: '#52c41a' }"
                />
              </Col>
              <Col :span="6">
                <Statistic
                  title="异常待审"
                  :value="uploadResult.pendingCount"
                  :value-style="{ color: '#faad14' }"
                />
              </Col>
            </Row>
            <div style="margin-top: 12px">
              规则版本：<Tag color="blue">{{ uploadResult.ruleVersion }}</Tag>
            </div>
          </template>
        </Alert>
      </div>
    </Drawer>

    <!-- 批次详情 / 审核抽屉 -->
    <Drawer
      v-model:open="detailDrawerVisible"
      :title="`批次详情：${currentBatch?.batch_no || ''}`"
      :width="1180"
      :footer-style="{ textAlign: 'right' }"
      @close="closeDetailDrawer"
    >
      <div v-if="currentBatch">
        <!-- 批次概览 -->
        <Card size="small" style="margin-bottom: 16px">
          <Row :gutter="16">
            <Col :span="4">
              <Statistic title="总人数" :value="currentBatch.total_count" />
            </Col>
            <Col :span="4">
              <Statistic
                title="已匹配"
                :value="currentBatch.success_count"
                :value-style="{ color: '#52c41a' }"
              />
            </Col>
            <Col :span="4">
              <Statistic
                title="异常"
                :value="currentBatch.pending_count"
                :value-style="{ color: '#faad14' }"
              />
            </Col>
            <Col :span="4">
              <Statistic title="跳过" :value="currentBatch.skipped_count" />
            </Col>
            <Col :span="4">
              <Statistic title="规则版本" :value="currentBatch.rule_version" />
            </Col>
            <Col :span="4">
              <Statistic title="状态">
                <template #formatter>
                  <Tag :color="statusColorMap[currentBatch.status]">
                    {{ statusTextMap[currentBatch.status] || currentBatch.status }}
                  </Tag>
                </template>
              </Statistic>
            </Col>
          </Row>
        </Card>

        <!-- 操作栏 -->
        <Space style="margin-bottom: 12px">
          <Button @click="loadPendingList">
            <template #icon><IconifyIcon icon="lucide:refresh" /></template>
            刷新
          </Button>
          <Button
            v-if="canResolve && currentBatch.status === 'pending_review' && pendingList.some(p => p.status === 'pending')"
            @click="handleBatchApprove"
          >
            <template #icon><IconifyIcon icon="lucide:check-check" /></template>
            批量通过
          </Button>
          <Button
            v-if="canExecute && currentBatch.status !== 'completed'"
            type="primary"
            @click="openImportConfirm"
          >
            <template #icon><IconifyIcon icon="lucide:database" /></template>
            确认入库
          </Button>
        </Space>

        <!-- 筛选 -->
        <Space style="margin-bottom: 12px">
          <Select
            v-model:value="pendingFilter.status"
            placeholder="待审状态"
            style="width: 130px"
            allow-clear
            @change="loadPendingList"
          >
            <Select.Option v-for="(label, val) in pendingStatusTextMap" :key="val" :value="val">
              {{ label }}
            </Select.Option>
          </Select>
          <Select
            v-model:value="pendingFilter.pending_type"
            placeholder="异常类型"
            style="width: 130px"
            allow-clear
            @change="loadPendingList"
          >
            <Select.Option v-for="(label, val) in pendingTypeTextMap" :key="val" :value="val">
              {{ label }}
            </Select.Option>
          </Select>
        </Space>

        <!-- 待审记录表 -->
        <Table
          :columns="pendingColumns"
          :data-source="pendingList"
          :loading="detailLoading"
          row-key="id"
          :pagination="{ pageSize: 20, showSizeChanger: true }"
          :scroll="{ x: 1300 }"
          size="small"
        />
      </div>
    </Drawer>

    <!-- 审核弹窗 -->
    <Modal
      v-model:open="resolveForm.visible"
      :title="resolveForm.resolution === 'approved' ? '通过审核' : '拒绝审核'"
      :confirm-loading="false"
      @ok="handleResolveSubmit"
    >
      <div v-if="resolveForm.pending">
        <Alert
          :message="`员工：${resolveForm.pending.employee_name || '-'}（行 ${resolveForm.pending.row_num}）`"
          :description="`所属部门：${resolveForm.pending.raw_dept || '-'} | 职位：${resolveForm.pending.raw_position || '-'} | 异常类型：${pendingTypeTextMap[resolveForm.pending.pending_type] || resolveForm.pending.pending_type}`"
          type="info"
          show-icon
          style="margin-bottom: 16px"
        />
        <div style="margin-bottom: 12px">
          <label>决议：</label>
          <Select v-model:value="resolveForm.resolution" style="width: 200px">
            <Select.Option value="approved">通过</Select.Option>
            <Select.Option value="rejected">拒绝</Select.Option>
          </Select>
        </div>
        <div v-if="resolveForm.resolution === 'approved'" style="margin-bottom: 12px">
          <p style="color: #999">注：当前版本仅展示待审目标，如需修改请联系开发扩展目标选择器。</p>
          <div>目标组织ID：<Input v-model:value="resolveForm.target_org_id" type="number" placeholder="可选" /></div>
          <div style="margin-top: 8px">目标作业单元ID：<Input v-model:value="resolveForm.target_unit_id" type="number" placeholder="可选" /></div>
          <div style="margin-top: 8px">目标岗位ID：<Input v-model:value="resolveForm.target_pos_id" type="number" placeholder="可选" /></div>
        </div>
        <div>
          <label>备注：</label>
          <Input.TextArea v-model:value="resolveForm.remark" :rows="3" placeholder="可填写处理说明" />
        </div>
      </div>
    </Modal>

    <!-- 入库结果 -->
    <Modal
      v-model:open="importResultVisible"
      title="入库结果"
      :footer="null"
    >
      <div v-if="importResult">
        <Result
          :status="importResult.failedCount > 0 ? 'warning' : 'success'"
          :title="importResult.failedCount > 0 ? '部分入库完成' : '入库完成'"
          :sub-title="`共处理 ${importResult.total} 条记录，新增 ${importResult.insertedCount} 个员工，更新 ${importResult.updatedCount} 个员工，创建 ${importResult.assignmentCount} 条任职关系`"
        >
          <template #extra>
            <div v-if="importResult.errors && importResult.errors.length > 0">
              <p style="color: #ff4d4f">失败记录：</p>
              <ul>
                <li v-for="(e, i) in importResult.errors" :key="i">{{ e }}</li>
              </ul>
            </div>
          </template>
        </Result>
      </div>
    </Modal>
  </Page>
</template>
