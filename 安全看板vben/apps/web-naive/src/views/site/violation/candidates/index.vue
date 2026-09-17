<script lang="ts" setup>
/**
 * 三违候选管理（web-naive · 阶段 P2-B1-E-06-IMPLEMENT / E-07 人工审核闭环）
 * route：/site/violation/candidates（三级菜单，父级 /site/violation — 三违管理）
 *
 * 职责：三违候选（pending/confirmed）列表 + 详情证据链 + 人工确认/驳回/撤销确认。
 *       候选由后端从网格巡查台账 violation_behavior 原文按行为字典识别产生（幂等），
 *       正式三违记录【只能】经人工确认产生（无任何自动处罚链路）。
 *
 * 边界：
 *   - 确认/驳回/撤销均 dialog.warning 二次确认；确认时可修正检查来源（company/township/self）
 *     与标准行为（behavior_id，字典驱动下拉，禁选「无三违行为」）；
 *   - 状态机与并发安全由后端保证（FOR UPDATE + 条件 UPDATE + 一对一唯一索引），
 *     前端不重试、不本地改行状态；
 *   - suggested_score 仅展示（推荐分值不作扣分依据；扣分由规则库 GRIDVIOL001 驱动）；
 *   - 详情/证据链来自后端 GET /:id（candidate→gir→vr→audit），前端不拼装证据；
 *   - 权限：后端 requireRole('admin','hse_manager','safety_manager') 强校验；
 *     前端 authority 仅控制菜单/页面可见性。
 */
import { h, onMounted, ref } from 'vue';

import {
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NImage,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NTag,
} from 'naive-ui';
import { $t } from '#/locales';

import { dialog, message } from '#/adapter/naive';
import { HseDataGrid, HsePageLayout } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  confirmCandidate,
  getCandidateDetail,
  listCandidates,
  listCorrectableBehaviors,
  rejectCandidate,
  revokeCandidate,
  type CorrectableBehavior,
  type GridViolationCandidate,
} from '#/api/hse/grid-violation-candidates';

defineOptions({ name: 'SiteViolationCandidates' });

// ===================== 列表数据（服务端真分页） =====================
const loading = ref(false);
const data = ref<GridViolationCandidate[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const statusFilter = ref<string>('pending');

const statusOptions = [
  { label: '待确认（pending/confirmed）', value: '' },
  { label: '待确认', value: 'pending' },
  { label: '已确认', value: 'confirmed' },
  { label: '已驳回', value: 'rejected' },
  { label: '已撤销', value: 'revoked' },
];

/** 检查来源展示 */
const SOURCE_TEXT: Record<string, string> = {
  company: '公司查处',
  township: '乡镇查处',
  self: '自查自纠',
  unknown: '无法判定（需人工）',
};
/** 候选状态展示 */
const STATUS_META: Record<string, { text: string; type: 'warning' | 'success' | 'error' | 'default' }> = {
  pending: { text: '待确认', type: 'warning' },
  confirmed: { text: '已确认', type: 'success' },
  rejected: { text: '已驳回', type: 'error' },
  revoked: { text: '已撤销', type: 'default' },
};

/** 候选状态展示（模板内安全访问） */
function statusMeta(status: string) {
  return STATUS_META[status];
}

async function loadData() {
  loading.value = true;
  try {
    const res = await listCandidates({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
      status: statusFilter.value || undefined,
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

function onSearch() {
  page.value = 1;
  loadData();
}

function onReset() {
  keyword.value = '';
  statusFilter.value = 'pending';
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

// ===================== 日期格式化 =====================
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

// ===================== 人工确认（二次确认 + 可修正检查来源） =====================
const CONFIRM_ERROR_HINTS: Record<string, string> = {
  CANDIDATE_NOT_PENDING: '该候选当前状态不可确认，请刷新后重试',
  ALREADY_CONFIRMED: '该候选已确认过正式记录，请刷新页面',
  CONFIRM_CONFLICT: '候选状态已发生变化，请刷新页面后重试',
  INVALID_INSPECTION_SOURCE: '检查来源不合法（仅 company/township/self）',
  INVALID_BEHAVIOR_ID: '标准行为参数不合法',
  BEHAVIOR_NOT_IN_DICT: '所选标准行为不在字典中或已停用',
  BEHAVIOR_NOT_VIOLATION: '不得修正为非三违标准行为（如「无三违行为」）',
};

// ===================== 详情（证据链，后端 GET /:id） =====================
const detailShow = ref(false);
const detailLoading = ref(false);
const detailData = ref<Record<string, any> | null>(null);

function fmtDateTime(v: any): string {
  if (v == null || v === '') return '-';
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : s;
}

async function openDetail(row: GridViolationCandidate) {
  detailShow.value = true;
  detailLoading.value = true;
  detailData.value = null;
  try {
    const d = await getCandidateDetail(row.id);
    detailData.value = (d ?? {}) as Record<string, any>;
  } catch {
    detailData.value = null;
  } finally {
    detailLoading.value = false;
  }
}

/** 确认弹窗内选中的检查来源 / 标准行为（NSelect） */
const behaviorOptions = ref<CorrectableBehavior[]>([]);
let behaviorOptionsLoaded = false;

async function ensureBehaviorOptions() {
  if (behaviorOptionsLoaded) return;
  try {
    const rows = await listCorrectableBehaviors();
    behaviorOptions.value = Array.isArray(rows) ? rows : [];
    behaviorOptionsLoaded = true;
  } catch {
    behaviorOptions.value = [];
  }
}

function showConfirmModal(row: GridViolationCandidate) {
  if (row.candidate_status !== 'pending') return;
  const selectedSource = ref<string>(row.inspection_source ?? 'unknown');
  const selectedBehaviorId = ref<number | null>(row.behavior_id ?? null);
  ensureBehaviorOptions();
  dialog.warning({
    title: '三违候选确认',
    content: () =>
      h('div', { style: 'white-space:pre-line;line-height:1.8' }, [
        `将确认以下候选为正式三违记录：\n`,
        `候选ID：${row.id}（巡查记录 ${row.grid_record_id}）\n`,
        `违规人员：${row.violator_name || '-'}　巡查日期：${formatDateShort(row.inspection_date)}\n`,
        `原始行为：${row.raw_violation_behavior || '-'}\n`,
        h('div', { style: 'margin-top:8px;display:flex;align-items:center;gap:8px' }, [
          '标准行为（可修正）：',
          h(NSelect, {
            value: selectedBehaviorId.value,
            options: behaviorOptions.value.map((b) => ({
              label: `${b.behavior_name}（${b.behavior_code}）`,
              value: b.id,
            })),
            filterable: true,
            style: 'width:300px',
            onUpdateValue: (v: number) => {
              selectedBehaviorId.value = v;
            },
          }),
        ]),
        h('div', { style: 'margin-top:8px;display:flex;align-items:center;gap:8px' }, [
          '检查来源（可修正）：',
          h(NSelect, {
            value: selectedSource.value,
            options: [
              { label: '公司查处（确认后按规则库扣分）', value: 'company' },
              { label: '乡镇查处（不扣分）', value: 'township' },
              { label: '自查自纠（不扣分）', value: 'self' },
              ...(row.inspection_source === 'unknown'
                ? [{ label: '无法判定（落库为未标注）', value: 'unknown' }]
                : []),
            ],
            style: 'width:240px',
            onUpdateValue: (v: string) => {
              selectedSource.value = v;
            },
          }),
        ]),
        `\n建议扣分：${row.suggested_score == null ? '-' : String(row.suggested_score)} 分` +
          `（最终扣分由规则库 GRIDVIOL001 按检查来源判定：仅公司查处扣分，self/township 0 分）\n` +
          `确认后将创建正式三违记录（来源可追溯：候选→巡查记录），` +
          `所有修正以最终提交值为准并写入审计。`,
      ]),
    positiveText: '确认生成正式记录',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const payload: { inspection_source: string; behavior_id?: number } = {
          inspection_source: selectedSource.value,
        };
        if (
          selectedBehaviorId.value != null &&
          Number(selectedBehaviorId.value) !== Number(row.behavior_id)
        ) {
          payload.behavior_id = Number(selectedBehaviorId.value);
        }
        await confirmCandidate(row.id, payload);
        message.success('候选已确认并生成正式三违记录');
      } catch (err: any) {
        const code = typeof err?.code === 'string' ? err.code : '';
        const hint =
          CONFIRM_ERROR_HINTS[code] ??
          (typeof err?.message === 'string' && err.message ? err.message : '确认失败，请稍后重试');
        message.error(hint);
      } finally {
        await loadData();
      }
    },
  });
}

// ===================== 驳回（二次确认） =====================
function onReject(row: GridViolationCandidate) {
  if (row.candidate_status !== 'pending') return;
  dialog.warning({
    title: '驳回候选确认',
    content:
      `将驳回以下三违候选（不生成正式记录）：\n` +
      `候选ID：${row.id}（巡查记录 ${row.grid_record_id}）\n` +
      `规范行为：${row.dict_behavior_name || row.behavior_text}\n` +
      `驳回后：该候选进入「已驳回」，不再进入确认队列。`,
    positiveText: '确认驳回',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await rejectCandidate(row.id, {});
        message.success('候选已驳回');
      } catch (err: any) {
        message.error(
          typeof err?.message === 'string' && err.message ? err.message : '驳回失败，请稍后重试',
        );
      } finally {
        await loadData();
      }
    },
  });
}

// ===================== 撤销确认（二次确认，仅 confirmed） =====================
function onRevoke(row: GridViolationCandidate) {
  if (row.candidate_status !== 'confirmed') return;
  dialog.warning({
    title: '撤销确认',
    content:
      `将撤销以下候选的人工确认：\n` +
      `候选ID：${row.id}（正式记录 ${row.confirmed_violation_id ?? '-'}）\n` +
      `撤销后：候选进入「已撤销」，对应正式三违记录将被删除（软删，可追溯）。`,
    positiveText: '确认撤销',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await revokeCandidate(row.id, {});
        message.success('确认已撤销');
      } catch (err: any) {
        message.error(
          typeof err?.message === 'string' && err.message ? err.message : '撤销失败，请稍后重试',
        );
      } finally {
        await loadData();
      }
    },
  });
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { title: '候选ID', field: 'id', width: 90, align: 'center', fixed: 'left' },
  {
    title: '巡查记录ID',
    field: 'grid_record_id',
    minWidth: 105,
    align: 'center',
  },
  {
    title: '巡查日期',
    field: 'inspection_date',
    minWidth: 105,
    align: 'center',
    formatter: ({ cellValue }: any) => formatDateShort(cellValue),
  },
  {
    title: '规范行为',
    field: 'dict_behavior_name',
    minWidth: 140,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '原始行为（gir 原文）',
    field: 'raw_violation_behavior',
    minWidth: 200,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '违规人员',
    field: 'violator_name',
    minWidth: 100,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '检查人员',
    field: 'personnel_name',
    minWidth: 100,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '作业区域',
    field: 'area_team',
    minWidth: 120,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '网格',
    field: 'grid_level',
    minWidth: 90,
    align: 'center',
    formatter: ({ row }: any) =>
      [row?.grid_level, row?.position].filter((v: any) => v != null && v !== '').join(' / ') || '-',
  },
  {
    title: '检查来源',
    field: 'inspection_source',
    minWidth: 120,
    align: 'center',
    formatter: ({ cellValue }: any) => SOURCE_TEXT[cellValue] || cellValue || '-',
  },
  {
    title: '推荐分值',
    field: 'suggested_score',
    minWidth: 90,
    align: 'center',
    formatter: ({ cellValue }: any) => (cellValue == null ? '-' : String(cellValue)),
  },
  {
    title: '推荐规则',
    field: 'suggested_rule_id',
    minWidth: 95,
    align: 'center',
    formatter: ({ row }: any) => (row?.suggested_rule_id ? `#${row.suggested_rule_id}` : '-'),
  },
  {
    title: '候选状态',
    field: 'candidate_status',
    minWidth: 95,
    align: 'center',
    slots: { default: 'status' },
  },
  {
    title: '正式记录ID',
    field: 'confirmed_violation_id',
    minWidth: 100,
    align: 'center',
    formatter: ({ row }: any) => (row?.confirmed_violation_id ? String(row.confirmed_violation_id) : '-'),
  },
  {
    title: '创建时间',
    field: 'created_at',
    minWidth: 140,
    align: 'center',
    formatter: ({ cellValue }: any) => fmtDateTime(cellValue),
  },
  {
    title: '操作',
    field: 'action',
    width: 240,
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
    :description="$t('page.hse.siteViolationCandidatesDesc')"
    :title="$t('page.hse.siteViolationCandidates')"
  >
    <template #extra>
      <NSpace align="center">
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          style="width: 220px"
          @update:value="onSearch"
        />
        <NInput
          v-model:value="keyword"
          clearable
          placeholder="行为原文 / 违规人员 / 巡查人员 / ID"
          style="width: 240px"
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
          v-if="statusMeta(row.candidate_status)"
          size="small"
          :type="statusMeta(row.candidate_status)!.type"
          :bordered="false"
        >
          {{ statusMeta(row.candidate_status)!.text }}
        </NTag>
        <span v-else class="text-gray-500">{{ row.candidate_status || '-' }}</span>
      </template>
      <template #action="{ row }">
        <NSpace :size="6" :wrap="false" justify="center">
          <NButton
            size="small"
            secondary
            @click="openDetail(row)"
          >
            详情
          </NButton>
          <NButton
            v-if="row.candidate_status === 'pending'"
            size="small"
            type="primary"
            secondary
            @click="showConfirmModal(row)"
          >
            确认
          </NButton>
          <NButton
            v-if="row.candidate_status === 'pending'"
            size="small"
            type="error"
            secondary
            @click="onReject(row)"
          >
            驳回
          </NButton>
          <NButton
            v-if="row.candidate_status === 'confirmed'"
            size="small"
            type="warning"
            secondary
            @click="onRevoke(row)"
          >
            撤销确认
          </NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <NModal
      v-model:show="detailShow"
      preset="card"
      style="width: 760px"
      title="候选详情与证据链"
    >
      <NSpin :show="detailLoading">
        <template v-if="detailData && detailData.candidate">
          <NDescriptions :column="2" size="small" bordered label-placement="left">
            <NDescriptionsItem label="候选ID">{{ detailData.candidate.id }}</NDescriptionsItem>
            <NDescriptionsItem label="候选状态">
              <NTag
                v-if="statusMeta(detailData.candidate.candidate_status)"
                size="small"
                :type="statusMeta(detailData.candidate.candidate_status)!.type"
                :bordered="false"
              >
                {{ statusMeta(detailData.candidate.candidate_status)!.text }}
              </NTag>
              <span v-else>{{ detailData.candidate.candidate_status }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem label="巡查记录ID（gir）">
              {{ detailData.candidate.grid_record_id }}
            </NDescriptionsItem>
            <NDescriptionsItem label="检查日期">
              {{ formatDateShort(detailData.candidate.inspection_date) || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="违规人员">
              {{ detailData.candidate.violator_name || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="检查人员">
              {{ detailData.candidate.personnel_name || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="标准行为">
              {{ detailData.candidate.dict_behavior_name || '-' }}
              （{{ detailData.candidate.behavior_code || '-' }}）
            </NDescriptionsItem>
            <NDescriptionsItem label="原始行为（gir 原文）">
              {{ detailData.candidate.raw_violation_behavior || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="检查来源">
              {{ SOURCE_TEXT[detailData.candidate.inspection_source] || detailData.candidate.inspection_source || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="推荐分值 / 规则">
              {{ detailData.candidate.suggested_score ?? '-' }} /
              {{ detailData.candidate.suggested_rule_id ? `#${detailData.candidate.suggested_rule_id}` : '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="网格 / 岗位">
              {{ [detailData.candidate.grid_level, detailData.candidate.position].filter(v => v).join(' / ') || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="命中依据">
              {{ detailData.candidate.candidate_reason || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="台账编号">
              {{ detailData.candidate.serial_no || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="创建时间">
              {{ fmtDateTime(detailData.candidate.created_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="证据图片" :span="2">
              <NImage
                v-if="detailData.candidate.image_content"
                :src="detailData.candidate.image_content"
                style="max-height: 160px"
                object-fit="contain"
              />
              <span v-else class="text-gray-500">无</span>
            </NDescriptionsItem>
            <NDescriptionsItem label="正式记录（vr）" :span="2">
              <template v-if="detailData.violation_record">
                ID {{ detailData.violation_record.id }} ·
                类型 {{ detailData.violation_record.violation_type || '-' }} ·
                来源 {{ detailData.violation_record.source_type }} ·
                检查来源 {{ detailData.violation_record.check_source || '未标注' }} ·
                状态 {{ detailData.violation_record.status }}
                <template v-if="detailData.violation_record.is_deleted">（已软删）</template>
                <br />
                确认时间：{{ fmtDateTime(detailData.violation_record.confirmed_at) }}
              </template>
              <span v-else class="text-gray-500">尚未确认（无正式记录）</span>
            </NDescriptionsItem>
            <NDescriptionsItem label="审计轨迹" :span="2">
              <div
                v-for="(a, i) in detailData.audit_trail || []"
                :key="i"
                style="font-size: 12px; line-height: 1.9"
              >
                [{{ fmtDateTime(a.created_at) }}] {{ a.action }} · 操作人 {{ a.username || '-' }}
                <template v-if="a.changed_fields">（{{ String(a.changed_fields) }}）</template>
              </div>
              <span v-if="!(detailData.audit_trail || []).length" class="text-gray-500">无</span>
            </NDescriptionsItem>
          </NDescriptions>
        </template>
        <div v-else-if="!detailLoading" class="text-gray-500" style="padding: 24px; text-align: center">
          候选不存在或查询失败
        </div>
      </NSpin>
    </NModal>
  </HsePageLayout>
</template>
