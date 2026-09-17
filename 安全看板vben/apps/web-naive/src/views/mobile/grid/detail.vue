<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-01-C：移动端「巡查详情」（真实数据）
 * 后端当前无独立 GET /grid-records/:id 端点，故详情复用列表行全字段
 * （由台账列表点击时通过 router state 携带整行记录进入）。
 * 若用户直接输入 URL（无 state）则给出友好提示，不伪造任何字段。
 *
 * H5-GRID-UI-01：巡查详情新增「现场照片」缩略图展示（splitImagePaths 解析
 * image_content），点击可全屏预览；仅展示，不改动任何业务字段。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';

import type { SiteApi } from '#/api/hse/site';

import { splitImagePaths } from '#/api/hse/grid-upload';

import { canUpdateGridRecords } from './grid-access';

defineOptions({ name: 'MobileDetail' });

const route = useRoute();
const router = useRouter();
const { hasAccessByRoles } = useAccess();

const recordId = computed(() => {
  const id = route.params.id;
  return Array.isArray(id) ? id[0] : id;
});

const record = computed<SiteApi.GridInspectionRecord | null>(() => {
  const raw = (history.state as { record?: unknown } | null)?.record;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SiteApi.GridInspectionRecord;
  } catch {
    return null;
  }
});

function isNegative(v: string | null | undefined): boolean {
  const s = (v ?? '').trim();
  return ['', '无', '--', '-', '否', '不需要', '无三违行为'].includes(s);
}

interface Row {
  label: string;
  value: string;
}
const rows = computed<Row[]>(() => {
  const r = record.value;
  if (!r) return [];
  const map: Row[] = [
    { label: '巡查日期', value: r.inspectionDate ? String(r.inspectionDate).slice(0, 10) : '—' },
    { label: '上报时间', value: r.uploadTime || '—' },
    { label: '网格编号', value: r.gridId != null ? String(r.gridId) : '—' },
    { label: '网格级别', value: r.gridLevel || '—' },
    { label: '所属片区', value: r.areaTeam || '—' },
    { label: '巡查位置', value: r.position || '—' },
    { label: '巡查人员', value: r.personnelName || '—' },
    { label: '违规人员', value: r.violatorName || '—' },
    { label: '违规人员性别', value: r.violatorGender || '—' },
    { label: '违规人员年龄', value: r.violatorAge || '—' },
    { label: '车辆类型', value: r.vehicleType || '—' },
    { label: '上报状态', value: r.reportStatus || '—' },
    { label: '三违行为', value: r.violationBehavior || '—' },
    { label: '违规类型判定', value: r.violationTypeResult || '—' },
    { label: '需整改', value: isNegative(r.needRectification) ? '否' : r.needRectification || '是' },
    { label: '整改人', value: r.rectifier || '—' },
    { label: '整改后照片', value: isNegative(r.rectifiedPhoto) ? '无' : '有' },
    { label: '示意图', value: isNegative(r.schematic) ? '无' : '有' },
    { label: '现场照片', value: isNegative(r.imageContent) ? '无' : '有' },
    { label: '创建时间', value: r.createdAt || '—' },
    { label: '更新时间', value: r.updatedAt || '—' },
  ];
  return map.filter((x) => x.value !== '—');
});

/**
 * HSE-MOBILE-GRID-03-B：「补传整改照片」入口显示条件
 *  1) 本页已能正常取得记录（record 非空；后端无独立 GET /:id，记录由台账列表携带进入）；
 *  2) 当前记录位于可修改范围：移动端列表本身由服务端 gridScope 过滤，能进入本页即已通过
 *     行级范围校验；此处仅再按角色做**显示门槛**，真正的授权判定仍在服务端
 *     （requirePermission('hse:site:grid:update') + buildScopeSqlCondition，
 *      越权返回 HTTP 403 + code=SCOPE_DENIED）。
 */
const canRectify = computed(
  () => !!record.value && canUpdateGridRecords(hasAccessByRoles),
);

function goRectify() {
  const r = record.value;
  if (!r) return;
  router.push({
    path: `/mobile/grid/rectify/${r.id}`,
    state: { record: JSON.stringify(r) },
  });
}

/* ===== H5-GRID-UI-01：现场照片展示（点击全屏预览） ===== */
const scenePhotos = computed(() =>
  record.value ? splitImagePaths(record.value.imageContent) : [],
);

const previewUrl = ref('');

function openPreview(url: string) {
  previewUrl.value = url;
}

function closePreview() {
  previewUrl.value = '';
}

function back() {
  router.back();
}
</script>

<template>
  <div class="detail-page">
    <button type="button" class="detail-page__back" @click="back">← 返回</button>

    <div v-if="record" class="detail-card">
      <p class="detail-card__title">巡查详情</p>
      <p class="detail-card__id">记录 ID：{{ record.id }}</p>

      <div
        v-for="row in rows"
        :key="row.label"
        class="detail-row"
      >
        <span class="detail-row__label">{{ row.label }}</span>
        <span class="detail-row__value">{{ row.value }}</span>
      </div>

      <!-- H5-GRID-UI-01：现场照片（可点击全屏预览） -->
      <div v-if="scenePhotos.length" class="detail-photos">
        <p class="detail-photos__title">现场照片（{{ scenePhotos.length }}）</p>
        <div class="detail-photos__grid">
          <img
            v-for="(p, i) in scenePhotos"
            :key="p"
            class="detail-photos__thumb"
            :src="p"
            :alt="`现场照片${i + 1}`"
            @click="openPreview(p)"
          />
        </div>
      </div>

      <!-- HSE-MOBILE-GRID-03-B：补传整改照片入口（仅记录已取得且具备修改权限时显示） -->
      <button
        v-if="canRectify"
        type="button"
        class="detail-card__action m-btn"
        @click="goRectify"
      >
        补传整改照片
      </button>
    </div>

    <!-- 全屏照片预览 -->
    <div
      v-if="previewUrl"
      class="detail-preview"
      role="dialog"
      aria-label="照片预览"
      @click="closePreview"
    >
      <img class="detail-preview__img" :src="previewUrl" alt="现场照片预览" />
    </div>

    <div v-else class="detail-card">
      <p class="detail-card__title">巡查详情</p>
      <p v-if="recordId" class="detail-card__id">记录 ID：{{ recordId }}</p>
      <p class="detail-card__placeholder">
        未获取到记录详情，请从巡查台账列表点击具体记录进入。
      </p>
      <p class="detail-card__hint">
        提示：直接打开本页面不含记录数据，需从台账列表进入。
      </p>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-page__back {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  min-height: 36px;
  border: none;
  background: transparent;
  color: #2f7dcd;
  font-size: 14px;
  padding: 6px 8px 6px 0;
  cursor: pointer;
}

.detail-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.detail-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2329;
}

.detail-card__id {
  margin: 8px 0 12px;
  font-size: 13px;
  color: #646a73;
}

/* GRID-03-B：补传整改照片入口 */
.detail-card__action {
  display: block;
  width: 100%;
  margin-top: 16px;
  border: none;
  border-radius: 12px;
  background: #2f7dcd;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 13px;
  cursor: pointer;
}

.detail-row {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f2f3f5;
  font-size: 14px;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row__label {
  flex: 0 0 92px;
  color: #8a8f99;
}

.detail-row__value {
  flex: 1;
  color: #1f2329;
  word-break: break-word;
}

.detail-card__placeholder {
  margin: 12px 0 0;
  font-size: 13px;
  color: #646a73;
}

.detail-card__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a8f99;
  line-height: 1.6;
}

/* H5-GRID-UI-01：现场照片展示 */
.detail-photos {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid #f2f3f5;
}

.detail-photos__title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
}

.detail-photos__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.detail-photos__thumb {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  cursor: zoom-in;
}

.detail-preview {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 85%);
  cursor: zoom-out;
}

.detail-preview__img {
  max-width: 94vw;
  max-height: 90dvh;
  object-fit: contain;
}
</style>
