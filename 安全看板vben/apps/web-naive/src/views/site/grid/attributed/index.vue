<script lang="ts" setup>
/**
 * 已归属记录查询（web-naive · 阶段 P2-B1-D-IMPLEMENTATION-04-D-B）
 * route：/site/grid/attributed（三级菜单，父级 /site/grid — 网格管理）
 *
 * 职责：只读查看已完成人员归属（attribution_status = 'attributed' | 'manual_confirmed'）的
 *       网格巡查记录，支持关键字查询与服务端真分页。
 *
 * 重要边界：
 *   - 撤销归属（04-E-B）：仅 manual_confirmed 行提供「撤销归属」（dialog.warning 二次确认，
 *     DECISION-02=A），调用既有 DELETE /api/grid-attribution/revoke（04-E-A 已审计），
 *     请求体仅 { record_id }（DECISION-01=A：reason 不进入 UI）。attributed 行一律无按钮
 *     （后端对 attributed 返回 409 NOT_REVOCABLE）。并发/状态机均由后端保证，前端不重试、
 *     不本地改行状态。
 *   - 状态口径由服务端冻结（IN ('attributed','manual_confirmed')），前端不得自造状态，
 *     亦不得用 id / wps_record_id / inspector_employee_id 非空等方式推断"已归属"。
 *   - 客户端仅提交 page / pageSize / keyword；grid_id / inspector_employee_id / attribution_status
 *     等身份/网格参数一律不提交（服务端也不读取）。
 *   - 权限：requireRole('admin','hse_manager','safety_manager')（后端强制；前端 authority 仅控制菜单可见性）。
 */
import { onMounted, ref } from 'vue';

import { NButton, NInput, NSpace, NTag } from 'naive-ui';
import { $t } from '#/locales';

import { dialog, message } from '#/adapter/naive';
import { HseDataGrid, HsePageLayout } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  listAttributedRecords,
  revokeRecord,
  type AttributedRecord,
} from '#/api/hse/grid-attribution';

defineOptions({ name: 'SiteGridAttributed' });

// ===================== 列表数据（服务端真分页） =====================
const loading = ref(false);
const data = ref<AttributedRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');

async function loadData() {
  loading.value = true;
  try {
    const res = await listAttributedRecords({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
    });
    const d = (res ?? {}) as Partial<typeof res>;
    data.value = Array.isArray(d.list) ? d.list : [];
    total.value = typeof d.total === 'number' ? d.total : 0;
  } catch {
    // 拦截器已统一提示；列表置空，不本地伪造
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/** 查询 / 重置：筛选条件变化一律重置回第 1 页（服务端分页协议） */
function onSearch() {
  page.value = 1;
  loadData();
}

function onReset() {
  keyword.value = '';
  page.value = 1;
  loadData();
}

function onRefresh() {
  loadData();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 撤销归属（04-E-B，仅 manual_confirmed） =====================
/**
 * 仅消费既有后端 DELETE /api/grid-attribution/revoke（04-B 实现，04-E-A 审计通过）。
 * 状态机与并发安全均由后端保证（FOR UPDATE + 条件 UPDATE 守卫），前端不重试、
 * 不本地改行状态——一切以服务端返回与重新查询为准。
 * 请求体仅 { record_id }（DECISION-01=A：reason 不进入 UI）。
 */

/** 错误码 → 提示文案（requestClient 抛出的就是响应体本身，读 err.code/err.message） */
const REVOKE_ERROR_HINTS: Record<string, string> = {
  NOT_REVOCABLE: '该记录当前状态不可撤销，请刷新后重试',
  RECORD_NOT_FOUND: '记录不存在或已被处理，请刷新页面',
  REVOKE_CONFLICT: '记录状态已发生变化，请刷新页面后重试',
};

function onRevoke(row: AttributedRecord) {
  if (row.attribution_status !== 'manual_confirmed') return;
  dialog.warning({
    title: '撤销归属确认',
    content:
      `将撤销以下记录的人工归属：\n` +
      `记录ID：${row.id}\n` +
      `记录编号：${row.serial_no || '-'}\n` +
      `归属巡查人：${row.inspector_name || '-'}\n` +
      `归属网格：${row.grid_name ? `${row.grid_name} / ${row.grid_township ?? ''}` : '-'}\n` +
      `撤销后：状态回到「待归属」，巡查人与网格归属将被清空，` +
      `该记录回到待归属队列，需重新人工归属。`,
    positiveText: '确认撤销',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await revokeRecord({ record_id: row.id });
        message.success('撤销归属成功');
      } catch (err: any) {
        const code = typeof err?.code === 'string' ? err.code : '';
        const hint =
          REVOKE_ERROR_HINTS[code] ??
          (typeof err?.message === 'string' && err.message
            ? err.message
            : '撤销失败，请稍后重试');
        message.error(hint);
      } finally {
        // 无论成败都重查：成功=该行回 pending 后从本页消失；失败=状态可能已被他人改变
        await loadData();
      }
    },
  });
}

// ===================== 日期格式化（与 04-C 页面一致） =====================
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

// ===================== 归属状态展示 =====================
/** 标签文案：attributed=已归属（系统）；manual_confirmed=已归属（人工确认）。不自造状态。 */
function statusTag(row: AttributedRecord): { text: string; type: 'info' | 'success' } {
  return row.attribution_status === 'attributed'
    ? { text: '已归属', type: 'info' }
    : { text: '人工归属', type: 'success' };
}

// ===================== 表格列 =====================
// 字段严格对齐后端 GET /attributed 返回的 snake_case（服务端联表带出 inspector_name / grid_name）
const columns = ref<VxeTableGridColumns>([
  { title: 'ID', field: 'id', width: 90, align: 'center', fixed: 'left' },
  {
    title: '巡查日期',
    field: 'inspection_date',
    minWidth: 110,
    align: 'center',
    formatter: ({ cellValue }: any) => formatDateShort(cellValue),
  },
  {
    title: '作业区域',
    field: 'area_team',
    minWidth: 130,
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
    minWidth: 200,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '归属网格',
    field: 'grid_name',
    minWidth: 140,
    align: 'center',
    showOverflow: 'tooltip',
    formatter: ({ row }: any) => {
      const parts = [row?.grid_name, row?.grid_township].filter(
        (v: any): v is string => typeof v === 'string' && v.trim() !== '',
      );
      return parts.length > 0 ? parts.join(' / ') : '-';
    },
  },
  {
    title: '归属巡查人',
    field: 'inspector_name',
    minWidth: 110,
    align: 'center',
    showOverflow: 'tooltip',
    formatter: ({ row }: any) =>
      row?.inspector_name ? String(row.inspector_name) : '-',
  },
  {
    title: '归属状态',
    field: 'attribution_status',
    minWidth: 100,
    align: 'center',
    slots: { default: 'status' },
  },
  {
    title: '记录编号',
    field: 'serial_no',
    minWidth: 140,
    align: 'center',
    showOverflow: 'tooltip',
    formatter: ({ row }: any) => (row?.serial_no ? String(row.serial_no) : '-'),
  },
  {
    title: '操作',
    field: 'action',
    width: 100,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteGridAttributedDesc')"
    :title="$t('page.hse.siteGridAttributed')"
  >
    <template #extra>
      <NSpace align="center">
        <NInput
          v-model:value="keyword"
          clearable
          placeholder="记录编号 / 巡查人员 / 违规人员 / 记录ID"
          style="width: 260px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <NButton type="primary" secondary @click="onSearch">查询</NButton>
        <NButton secondary @click="onReset">重置</NButton>
        <NButton secondary @click="onRefresh">刷新</NButton>
      </NSpace>
    </template>

    <HseDataGrid
      :columns="columns"
      :current-page="page"
      :data="data"
      :loading="loading"
      :page-size="pageSize"
      :pager="{ pageSizes: [10, 20, 30, 50, 100] }"
      :total="total"
      row-key="id"
      @page-change="onPageChange"
    >
      <template #status="{ row }">
        <NTag
          v-if="row.attribution_status === 'attributed' || row.attribution_status === 'manual_confirmed'"
          size="small"
          :type="statusTag(row).type"
          :bordered="false"
        >
          {{ statusTag(row).text }}
        </NTag>
        <span v-else class="text-gray-500">{{ row.attribution_status || '-' }}</span>
      </template>
      <template #action="{ row }">
        <!-- 仅 manual_confirmed 可撤销（与后端状态机一致：attributed → 409 NOT_REVOCABLE） -->
        <NButton
          v-if="row.attribution_status === 'manual_confirmed'"
          size="small"
          type="warning"
          secondary
          @click="onRevoke(row)"
        >
          撤销归属
        </NButton>
        <span v-else class="text-gray-500">-</span>
      </template>
    </HseDataGrid>
  </HsePageLayout>
</template>
