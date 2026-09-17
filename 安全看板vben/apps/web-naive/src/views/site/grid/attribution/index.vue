<script lang="ts" setup>
/**
 * 通道 B 待归属管理（web-naive · 阶段 P2-B1-D-IMPLEMENTATION-04-C）
 * route：/site/grid/attribution（三级菜单，父级 /site/grid — 网格管理）
 *
 * 职责：展示已由 WPS 云缓冲经 Pull Engine 回流到 PostgreSQL、但尚未完成正式人员归属的数据，
 *       并由管理人员通过服务端安全校验完成「人工归属」。
 *
 * 重要边界（遵守 ARCH-03 / WPS 架构边界）：
 *   - 本页面只是「待归属数据的人工处理界面」，绝不声称 WPS 身份已可信 / WPS Creator 已完成认证。
 *   - 人工归属请求仅发送 record_id + candidate_employee_id；
 *     grid_id / inspector_employee_id / attribution_status / source_channel 等一律由服务端派生。
 *   - revoke 后端 API 已存在，但本阶段前端不实现撤销 UI。
 */
import { onMounted, ref } from 'vue';

import {
  NButton,
  NForm,
  NFormItem,
  NModal,
  NSelect,
  NSpace,
  NTag,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseDataGrid,
  HsePageLayout,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { getEmployeeSelectorList } from '#/api/hse/employee';
import {
  attributeRecord,
  getPendingAttributionRecords,
  type PendingAttributionRecord,
} from '#/api/hse/grid-attribution';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteGridAttribution' });

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<PendingAttributionRecord[]>([]);
const pendingCount = ref(0);

async function loadData() {
  loading.value = true;
  try {
    const rows = await getPendingAttributionRecords({ limit: 500, offset: 0 });
    const list = Array.isArray(rows) ? rows : [];
    data.value = list;
    pendingCount.value = list.length;
  } catch {
    // 拦截器已统一提示；列表置空，不本地伪造
    data.value = [];
    pendingCount.value = 0;
  } finally {
    loading.value = false;
  }
}

function onRefresh() {
  loadData();
}

// ===================== 日期格式化 =====================
/** yyyy-MM-dd（巡查日期只取首 10 位，避免时区偏移） */
function formatDateShort(v: any): string {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return s;
}
/** yyyy-MM-dd HH:mm（创建时间） */
function formatDateTimeShort(v: any): string {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/);
  if (m) return m[0].replace('T', ' ');
  return formatDateShort(s);
}

// ===================== 表格列 =====================
// 字段严格对齐后端 GET /pending 返回的 snake_case（后端未做驼峰转换）
// 05-E-B：修正 personnel_name 列标题（原误标"违规人员"，实为巡查人员）；
//         增补 serial_no / violator_name / grid_level / position / upload_time 展示列，
//         仅供 admin 人工比对判断，不参与任何自动归属逻辑。
const columns = ref<VxeTableGridColumns>([
  { title: 'ID', field: 'id', width: 90, align: 'center', fixed: 'left' },
  {
    title: '记录编号',
    field: 'serial_no',
    width: 110,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '巡查日期',
    field: 'inspection_date',
    minWidth: 120,
    align: 'center',
    formatter: ({ cellValue }: any) => formatDateShort(cellValue),
  },
  {
    title: '作业区域',
    field: 'area_team',
    minWidth: 140,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '网格层级',
    field: 'grid_level',
    width: 100,
    align: 'center',
  },
  {
    title: '岗位',
    field: 'position',
    width: 110,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '巡查人员',
    field: 'personnel_name',
    minWidth: 110,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '违规人员',
    field: 'violator_name',
    minWidth: 110,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '违章行为',
    field: 'violation_behavior',
    minWidth: 220,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '上传时间',
    field: 'upload_time',
    minWidth: 150,
    align: 'center',
    formatter: ({ cellValue }: any) => formatDateTimeShort(cellValue),
  },
  {
    title: '归属状态',
    field: 'attribution_status',
    minWidth: 100,
    align: 'center',
    slots: { default: 'status' },
  },
  {
    title: '创建时间',
    field: 'created_at',
    minWidth: 160,
    align: 'center',
    formatter: ({ cellValue }: any) => formatDateTimeShort(cellValue),
  },
  {
    title: '操作',
    field: 'action',
    width: 120,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

// ===================== 人工归属弹窗 =====================
const modalOpen = ref(false);
const submitting = ref(false);
const currentRecord = ref<PendingAttributionRecord | null>(null);
const selectedEmployeeId = ref<number | null>(null);
const employeeOptions = ref<{ label: string; value: number }[]>([]);
const employeeSearching = ref(false);

/**
 * 后端 /employees/selector 的实际运行时形态（已实测）：
 *  1) data 是「数字键对象」而非数组（{"0":{…}}）——由员工域路由链上的响应中间件对顶层数组做对象展开所致；
 *  2) 元素字段为 camelCase（employeeId / name / orgName / unitName / positionName），
 *     与 api/hse/employee.ts 声明的 snake_case 不一致。
 * 因此这里做「形状 + 字段名」双重兼容归一化，保证选择器可用（不改后端、不动共享类型）。
 */
type EmpLite = Record<string, any>;

function normalizeEmployeeList(raw: any): EmpLite[] {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === 'object'
      ? Object.values(raw)
      : [];
  return arr.filter((x): x is EmpLite => !!x && typeof x === 'object');
}

/** 员工主键：仅接受可转为正整数的值（camelCase 优先，兼容 snake_case） */
function pickEmployeeId(it: EmpLite): number | null {
  const n = Number(it?.employeeId ?? it?.employee_id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 员工展示名：姓名（所属组织 / 作业单元 / 岗位），空值剔除 + 去重 */
function buildEmpLabel(it: EmpLite): string {
  const parts = [it?.orgName ?? it?.org_name, it?.unitName ?? it?.unit_name, it?.positionName ?? it?.position_name]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  const uniq = [...new Set(parts)];
  const name = String(it?.name ?? '');
  return uniq.length > 0 ? `${name}（${uniq.join(' / ')}）` : name;
}

async function onSearchEmployees(keyword: string) {
  employeeSearching.value = true;
  try {
    const raw = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 20 });
    employeeOptions.value = normalizeEmployeeList(raw)
      .map((it) => {
        const id = pickEmployeeId(it);
        return id === null ? null : { label: buildEmpLabel(it), value: id };
      })
      .filter((o): o is { label: string; value: number } => o !== null);
  } catch {
    employeeOptions.value = [];
  } finally {
    employeeSearching.value = false;
  }
}

function openAttribute(row: PendingAttributionRecord) {
  currentRecord.value = row;
  selectedEmployeeId.value = null;
  employeeOptions.value = [];
  modalOpen.value = true;
}

async function onConfirm() {
  if (!currentRecord.value || !selectedEmployeeId.value) return;
  submitting.value = true;
  try {
    // 仅提交服务端需要的两个字段；其余由服务端派生
    await attributeRecord({
      record_id: currentRecord.value.id,
      candidate_employee_id: selectedEmployeeId.value,
    });
    // 正常成功路径（后端 code=0 → 拦截器正常 resolve）
    await resolveSuccess();
  } catch (err: any) {
    // 兼容：若后端仍为「success 时 code=HTTP 状态码(200)」的旧版本（未重启加载 04-B 修复），
    // 该响应会被 defaultResponseInterceptor 判为非成功码而抛出；抛出物同样是「响应体」。
    // 以 success===true 判定为真实成功，绝不在前端伪造状态。
    if (unwrapPayload(err)?.success === true) {
      await resolveSuccess();
    } else {
      handleAttributeError(err);
    }
  } finally {
    submitting.value = false;
  }
}

/** 成功统一处理：提示 + 关闭弹窗 + 重新读取服务端 pending（不本地改行、不 fake） */
async function resolveSuccess() {
  message.success('归属成功');
  modalOpen.value = false;
  await loadData();
}

/**
 * 归一化「错误/响应载荷」：
 * requestClient 的 catch 分支抛出的是【响应体本身】（见 packages/effects/request/src/request-client.ts:
 * `throw error.response ? error.response.data : error;`），因此 err.code / err.message 即可直接读取；
 * 此处同时兼容「axios 原始响应对象（业务体在 err.data / err.response.data）」形态，防止上游实现变化。
 */
function unwrapPayload(err: any): any {
  if (!err || typeof err !== 'object') return {};
  if (err.code !== undefined || err.message !== undefined || err.success !== undefined) {
    return err;
  }
  return err.data ?? err.response?.data ?? err;
}

/** 失败映射：GRID_NONE / GRID_MULTIPLE / 409 / 401 / 403 / 500 */
function handleAttributeError(err: any) {
  const code = unwrapPayload(err)?.code;
  if (code === 'GRID_NONE') {
    message.error('该员工当前没有唯一有效网格，无法归属。');
  } else if (code === 'GRID_MULTIPLE') {
    message.error('该员工存在多个有效网格，无法自动确定归属。');
  } else if (
    code === 409 ||
    code === 'RECORD_NOT_PENDING' ||
    code === 'REVOKE_CONFLICT' ||
    code === 'NOT_REVOCABLE'
  ) {
    message.error('该记录已被其他操作人员处理，请刷新后重试。');
  } else if (code === 401) {
    message.error('登录状态已失效，请重新登录。');
  } else if (code === 403) {
    message.error('您没有执行人工归属操作的权限。');
  } else if (code === 'EMPLOYEE_INVALID') {
    message.error('候选员工不存在或已失效，请重新选择。');
  } else if (code === 'INVALID_RECORD_ID' || code === 'INVALID_EMPLOYEE_ID') {
    message.error('提交参数无效，请刷新后重试。');
  } else {
    // 其他（含 500 / ATTRIBUTE_FAILED / 网络异常）：统一兜底，不暴露底层错误细节
    message.error('人工归属失败，请稍后重试。');
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteGridAttributionDesc')"
    :title="$t('page.hse.siteGridAttribution')"
  >
    <template #extra>
      <NSpace>
        <span class="text-sm text-gray-600">待处理数量：{{ pendingCount }}</span>
        <NButton type="primary" secondary @click="onRefresh">刷新</NButton>
      </NSpace>
    </template>

    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="false"
    >
      <template #status="{ row }">
        <NTag
          v-if="row.attribution_status === 'pending'"
          size="small"
          type="warning"
          :bordered="false"
        >
          待归属
        </NTag>
        <span v-else class="text-gray-500">{{ row.attribution_status || '-' }}</span>
      </template>

      <template #action="{ row }">
        <NButton
          size="small"
          type="primary"
          secondary
          @click="openAttribute(row)"
        >
          人工归属
        </NButton>
      </template>
    </HseDataGrid>

    <!-- 人工归属弹窗 -->
    <NModal
      v-model:show="modalOpen"
      title="人工归属"
      preset="card"
      style="width: 560px; max-width: 92vw"
      :mask-closable="false"
    >
      <div class="mb-3 text-sm text-gray-500">
        待归属记录 ID：<span class="font-medium text-gray-800">{{ currentRecord?.id }}</span>
        <span v-if="currentRecord?.serial_no" class="ml-3">
          记录编号：<span class="font-medium text-gray-800">{{ currentRecord.serial_no }}</span>
        </span>
      </div>
      <!-- 05-E-B：确认前展示历史业务摘要，辅助 admin 人工判断（只读展示，不参与提交） -->
      <div
        v-if="currentRecord"
        class="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
      >
        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <span class="text-gray-500">巡查日期：</span>{{ formatDateShort(currentRecord.inspection_date) || '-' }}
          </div>
          <div>
            <span class="text-gray-500">作业区域：</span>{{ currentRecord.area_team || '-' }}
          </div>
          <div>
            <span class="text-gray-500">巡查人员：</span>{{ currentRecord.personnel_name || '-' }}
          </div>
          <div>
            <span class="text-gray-500">违规人员：</span>{{ currentRecord.violator_name || '-' }}
          </div>
          <div class="col-span-2">
            <span class="text-gray-500">违章行为：</span>{{ currentRecord.violation_behavior || '-' }}
          </div>
          <div class="col-span-2">
            <span class="text-gray-500">上传时间：</span>{{ formatDateTimeShort(currentRecord.upload_time) || '-' }}
          </div>
        </div>
      </div>
      <NForm label-placement="top">
        <NFormItem label="选择归属人员" required>
          <NSelect
            v-model:value="selectedEmployeeId"
            placeholder="输入姓名 / 工号搜索"
            filterable
            remote
            clearable
            :loading="employeeSearching"
            :options="employeeOptions"
            @search="onSearchEmployees"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="modalOpen = false">取消</NButton>
          <NButton
            type="primary"
            :loading="submitting"
            :disabled="!selectedEmployeeId"
            @click="onConfirm"
          >
            确认归属
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
