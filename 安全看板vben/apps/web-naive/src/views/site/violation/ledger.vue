<script lang="ts" setup>
/**
 * 三违台账（web-naive · 阶段06B-1）
 * route：/site/violation/ledger（三级菜单，父级 /site/violation — 三违管理）
 * 数据源：网格长巡查台账（grid_inspection_records），按以下条件筛选后展示：
 *   1) 三违行为 ≠ 「无三违行为」（且非空）
 *   2) 在 1) 基础上，整改后照片列有内容（排除 -- / - / 无 等占位符）
 * 通过 GET /grid-records?hasViolation=1&hasRectifiedPhoto=1 服务端筛选。
 * 本页为派生态台账（只读展示 + 筛选 + 分页），不提供新增/删除/单元格编辑（避免误改底层巡查台账）。
 */
import { onMounted, reactive, ref } from 'vue';

import { NButton, NCard, NGi, NImage, NImageGroup, NInput, NSelect, NSpace } from 'naive-ui';
import { $t } from '#/locales';

import { HseDataGrid, HsePageLayout, HseSearchPanel } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { getGridInspectionFilterOptions, getGridInspectionList, type SiteApi } from '#/api/hse/site';

defineOptions({ name: 'SiteViolationLedger' });

// ===================== 图片解析 =====================
// 图片字段以逗号分隔存放 webpath，拆分成数组供预览；排除占位文本（"--" / "-" / "无" 等），
// 仅保留真正像图片路径的值，避免把占位符当 src 渲染裂图。
const IMG_PATH_RE = /(\/uploads\/|^https?:\/\/|\.(?:jpe?g|png|gif|webp|bmp)(?:[?#].*)?$)/i;
function toImageList(value?: string | null): string[] {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => IMG_PATH_RE.test(p));
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<SiteApi.GridInspectionRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(100);

const searchForm = reactive({
  keyword: '',
  areaTeam: undefined as string | undefined,
  gridLevel: undefined as string | undefined,
  reportStatus: undefined as string | undefined,
});

const filterOptions = ref<SiteApi.GridInspectionFilterOptions>({
  areaTeams: [],
  gridLevels: [],
  reportStatuses: [],
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getGridInspectionList({
      keyword: searchForm.keyword || undefined,
      areaTeam: searchForm.areaTeam,
      gridLevel: searchForm.gridLevel,
      reportStatus: searchForm.reportStatus,
      hasViolation: true,
      hasRectifiedPhoto: true,
      page: page.value,
      pageSize: pageSize.value,
    });
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

async function loadFilterOptions() {
  try {
    const res = await getGridInspectionFilterOptions();
    filterOptions.value = {
      areaTeams: res.areaTeams ?? [],
      gridLevels: res.gridLevels ?? [],
      reportStatuses: res.reportStatuses ?? [],
    };
  } catch {
    /* ignore */
  }
}

function onSearch() {
  page.value = 1;
  loadData();
}
function onReset() {
  Object.assign(searchForm, {
    keyword: '',
    areaTeam: undefined,
    gridLevel: undefined,
    reportStatus: undefined,
  });
  page.value = 1;
  loadData();
}
function onRefresh() {
  loadData();
}

// ===================== 表格列 =====================
/** 日期展示：统一为 yyyy-MM-dd；优先截取原字符串首 10 位，避免时区偏移 */
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

const columns = ref<VxeTableGridColumns>([
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    fixed: 'left',
    formatter: (params: any) => (params?.rowIndex ?? 0) + (page.value - 1) * pageSize.value + 1,
  },
  { title: '昵称', field: 'nickname', minWidth: 110, align: 'center' },
  { title: '分组名称', field: 'areaTeam', minWidth: 120, align: 'center' },
  { title: '姓名', field: 'personnelName', minWidth: 100, align: 'center' },
  { title: '所属岗位', field: 'position', minWidth: 130, align: 'center' },
  { title: '网格等级', field: 'gridLevel', minWidth: 115, align: 'center' },
  {
    title: '日期',
    field: 'inspectionDate',
    minWidth: 110,
    align: 'center',
    formatter: ({ cellValue }: any) => formatDateShort(cellValue),
  },
  { title: '三违照片', field: 'imageContent', minWidth: 120, align: 'center', slots: { default: 'imageContent' } },
  {
    title: '三违行为',
    field: 'violationBehavior',
    minWidth: 220,
    align: 'left',
    showOverflow: 'tooltip',
  },
  { title: '违章人姓名', field: 'violatorName', minWidth: 110, align: 'center' },
  { title: '违章人性别', field: 'violatorGender', minWidth: 105, align: 'center' },
  { title: '违章人年龄', field: 'violatorAge', minWidth: 105, align: 'center' },
  { title: '整改后照片', field: 'rectifiedPhoto', minWidth: 120, align: 'center', slots: { default: 'rectifiedPhoto' } },
  { title: '当日是否报名', field: 'signupToday', minWidth: 125, align: 'center' },
  { title: '标记', field: 'marker', minWidth: 90, align: 'center' },
  { title: '是否补交', field: 'isResubmit', minWidth: 100, align: 'center' },
  { title: '提交时间', field: 'uploadTime', minWidth: 165, align: 'center' },
  { title: '编号', field: 'serialNo', minWidth: 110, align: 'center' },
]);

onMounted(async () => {
  await Promise.all([loadData(), loadFilterOptions()]);
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteViolationLedgerDesc')"
    :title="$t('page.hse.siteViolationLedger')"
  >
    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="网格长 / 片区 / 违章人 / 违章行为"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.areaTeam"
          placeholder="片区/班组"
          clearable
          filterable
          :options="filterOptions.areaTeams.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.gridLevel"
          placeholder="网格级别"
          clearable
          :options="filterOptions.gridLevels.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.reportStatus"
          placeholder="上报状态"
          clearable
          :options="filterOptions.reportStatuses.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 筛选说明 & 统计 -->
    <NCard :bordered="false" class="mb-4" size="small" title="筛选说明">
      <div class="flex items-center justify-between gap-4 text-sm text-gray-600">
        <span>
          本台账从「网格长巡查台账」中筛选：三违行为非「无三违行为」，且整改后照片有内容；共
          {{ total }} 条，每页 {{ pageSize }} 条分页浏览。
        </span>
        <NSpace>
          <NButton size="small" secondary @click="onRefresh">刷新</NButton>
        </NSpace>
      </div>
    </NCard>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :pager="true"
      @page-change="onPageChange"
    >
      <template #imageContent="{ row }">
        <NImageGroup v-if="toImageList(row.imageContent).length">
          <NImage
            v-for="src in toImageList(row.imageContent)"
            :key="src"
            :src="src"
            :preview-src="src"
            width="56"
            height="56"
            object-fit="cover"
            class="mr-1"
          />
        </NImageGroup>
        <span v-else class="text-gray-400">-</span>
      </template>

      <template #rectifiedPhoto="{ row }">
        <NImageGroup v-if="toImageList(row.rectifiedPhoto).length">
          <NImage
            v-for="src in toImageList(row.rectifiedPhoto)"
            :key="src"
            :src="src"
            :preview-src="src"
            width="56"
            height="56"
            object-fit="cover"
            class="mr-1"
          />
        </NImageGroup>
        <span v-else class="text-gray-400">-</span>
      </template>
    </HseDataGrid>
  </HsePageLayout>
</template>
