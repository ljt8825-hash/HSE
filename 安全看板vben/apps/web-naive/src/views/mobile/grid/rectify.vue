<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-03-B：移动端「补传整改照片」
 *
 * 职责边界（刻意做窄）：
 *   本页只承担「既有巡查记录补传整改照片 + 记录整改人」，不是新的整改管理中心。
 *   不引入整改状态字段/状态机，「是否已完成整改」仍严格由 rectified_photo 承载
 *   （口径与 server/services/sanweiLedgerDerive.js 完全一致：空 / 占位 = 未完成）。
 *
 * 复用的正式链路（不新增任何后端接口）：
 *   - 取数：台账/详情通过 history.state 带入列表行（后端无独立 GET /grid-records/:id，
 *     与 GRID-01-C 详情页处理方式一致）；
 *   - 提交：PUT /api/site-mgmt/grid-records/:id（updateGridInspectionRecord）
 *          —— 该端点既受 requirePermission('hse:site:grid:update') 约束，
 *             又受 gridScope 行级范围约束（own_grid 越权 → 403 + code=SCOPE_DENIED）；
 *   - 上传：POST /api/files/upload/image（uploadGridImage，入库只写相对路径）。
 *
 * 只提交两个业务字段（DB snake_case，与后端 PUT 白名单及 PC 台账单元格保存写法一致）：
 *   rectified_photo、rectifier
 * 绝不提交 gridId / inspectorEmployeeId / personnelName / inspectionDate 等原始字段。
 */
import type { SiteApi } from '#/api/hse/site';

import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { splitImagePaths } from '#/api/hse/grid-upload';
import { getGridAreaList, updateGridInspectionRecord } from '#/api/hse/site';

import { createPhotoGroup, normalizeApiError } from './photo-group';

defineOptions({ name: 'MobileGridRectify' });

const route = useRoute();
const router = useRouter();

/* ===================== 记录入口（与详情页一致：由列表行携带） ===================== */
const recordId = computed(() => {
  const id = route.params.id;
  return Array.isArray(id) ? id[0] : id;
});

function readStateRecord(): null | SiteApi.GridInspectionRecord {
  const raw = (history.state as { record?: unknown } | null)?.record;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as SiteApi.GridInspectionRecord;
    // 防御：state 中的记录必须与路由 id 一致，否则视为未取得记录（不展示错误数据）
    return String(parsed?.id) === String(recordId.value) ? parsed : null;
  } catch {
    return null;
  }
}

const record = ref<null | SiteApi.GridInspectionRecord>(readStateRecord());

/* ===================== 只读展示 ===================== */
function isNegative(v: null | string | undefined): boolean {
  const s = (v ?? '').trim();
  return ['', '无', '--', '-', '否', '不需要', '无三违行为'].includes(s);
}

/** 网格名称（与台账页同一处理：取 grid_areas 映射，失败回退网格编号） */
const gridName = ref('');
async function loadGridName() {
  const id = record.value?.gridId;
  if (id == null) return;
  try {
    const res = await getGridAreaList({ pageSize: 200 });
    const hit = (res.list || []).find((a) => Number(a.id) === Number(id));
    gridName.value = hit?.name || `网格#${id}`;
  } catch {
    gridName.value = `网格#${id}`;
  }
}
void loadGridName();

const viewRows = computed(() => {
  const r = record.value;
  if (!r) return [] as Array<{ label: string; value: string }>;
  return [
    {
      label: '巡查日期',
      value: r.inspectionDate ? String(r.inspectionDate).slice(0, 10) : '—',
    },
    { label: '巡查人员', value: r.personnelName || '—' },
    { label: '网格', value: gridName.value || '—' },
    { label: '需整改', value: isNegative(r.needRectification) ? '否' : r.needRectification || '是' },
  ];
});

/** 当前整改后照片（复用 splitImagePaths：过滤占位文本，保留相对/绝对地址） */
const currentPhotos = computed(() => splitImagePaths(record.value?.rectifiedPhoto));

/* ===================== 可编辑字段（仅 rectifier + rectifiedPhoto） ===================== */
const rectifier = ref(record.value?.rectifier || '');

const newPhotoInput = ref<HTMLInputElement | null>(null);
const newPhotos = createPhotoGroup(newPhotoInput);
onBeforeUnmount(() => newPhotos.dispose());

/**
 * 组装 rectified_photo 最终值：保留既有非占位照片（原样保留，含 WPS 绝对 URL），
 * 追加本次补传的相对路径并去重。
 * 占位符集合与 server/services/sanweiLedgerDerive.js 的判定口径一致（'--' / '-' / '无'）。
 */
const PLACEHOLDER_VALUES = ['--', '-', '无'];
function composeRectifiedPhoto(
  existingRaw: null | string | undefined,
  addedPaths: string[],
): string {
  const kept = String(existingRaw ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '' && !PLACEHOLDER_VALUES.includes(p));
  const out = [...kept];
  for (const p of addedPaths) {
    if (p && !out.includes(p)) out.push(p);
  }
  return out.join(',');
}

/* ===================== 提交 ===================== */
const submitting = ref(false);
const submitted = ref(false);
const formError = ref('');
const serverCode = ref('');

const submitButtonText = computed(() => {
  if (submitted.value) return '整改已提交';
  if (submitting.value) return '提交中…';
  return '提交整改';
});

/** §17：区分权限失败 / 记录不存在 / 网络错误 / 提交失败（上传失败由 photo-group 单独负责） */
function mapSubmitError(err: unknown): { code: string; text: string } {
  const n = normalizeApiError(err);
  // 行级范围受限：后端对 own_grid 越权统一返回 403 + code=SCOPE_DENIED
  if (n.bizCode === 'SCOPE_DENIED' || n.codeNumber === 403) {
    return { code: 'SCOPE_DENIED', text: '无权整改该网格记录' };
  }
  if (n.codeNumber === 401) {
    return { code: 'UNAUTHORIZED', text: '登录状态已失效，请重新登录后再提交' };
  }
  if (n.codeNumber === -2) {
    return { code: 'NOT_FOUND', text: '记录不存在或已被删除，请返回台账刷新后重试' };
  }
  if (n.isNetwork) {
    return { code: 'NETWORK', text: '网络连接失败，整改提交失败，请重试' };
  }
  return {
    code: n.bizCode || 'RECTIFY_FAILED',
    text: n.message ? `整改提交失败：${n.message}` : '整改提交失败，请重试',
  };
}

async function onSubmit() {
  if (submitting.value || submitted.value) return; // §18 防重复提交
  formError.value = '';
  serverCode.value = '';

  const current = record.value;
  if (!current) {
    formError.value = '未获取到巡查记录，请从巡查台账或详情页进入本页';
    return;
  }
  if (newPhotos.isUploading.value) {
    formError.value = '图片正在上传，请等待上传完成后再提交';
    return;
  }
  if (newPhotos.hasFailed.value) {
    formError.value = '有图片上传失败，请重试或删除该图片后再提交';
    return;
  }
  const added = newPhotos.donePaths();
  if (added.length === 0) {
    formError.value = '请先拍照或选择整改后照片';
    return;
  }

  // 仅两个业务字段；snake_case 与后端 PUT 白名单（GRID_RECORD_EDITABLE）逐字对应
  const payload: Record<string, string> = {
    rectified_photo: composeRectifiedPhoto(current.rectifiedPhoto, added),
  };
  const who = rectifier.value.trim();
  if (who) payload.rectifier = who;

  submitting.value = true;
  try {
    // 响应即 PostgreSQL 的 RETURNING * 最新行（正式 API 返回，非本地伪造）
    const updated = await updateGridInspectionRecord(current.id, payload);
    record.value = updated ?? current;
    submitted.value = true;
    // 成功后回到详情页，并携带服务端返回的最新记录（保证最终状态来自正式 API）
    setTimeout(() => {
      void router.replace({
        path: `/mobile/grid/detail/${recordId.value}`,
        state: { record: JSON.stringify(record.value) },
      });
    }, 800);
  } catch (error) {
    const mapped = mapSubmitError(error);
    serverCode.value = mapped.code;
    formError.value = mapped.text;
  } finally {
    submitting.value = false;
  }
}

function onCancel() {
  void router.back();
}
</script>

<template>
  <div class="rectify-page">
    <button type="button" class="rectify-page__back" @click="onCancel">← 返回</button>

    <template v-if="record">
      <!-- 只读信息 -->
      <section class="card">
        <h2 class="card__title">巡查信息</h2>
        <div v-for="row in viewRows" :key="row.label" class="row">
          <span class="row__label">{{ row.label }}</span>
          <span class="row__value">{{ row.value }}</span>
        </div>
        <div class="row">
          <span class="row__label">整改人</span>
          <span class="row__value">{{ record.rectifier || '—' }}</span>
        </div>
      </section>

      <!-- 当前整改后照片（只读） -->
      <section class="card">
        <h2 class="card__title">当前整改后照片</h2>
        <div v-if="currentPhotos.length > 0" class="photo-grid">
          <div v-for="p in currentPhotos" :key="p" class="photo-item">
            <img class="photo-item__img" :src="p" :alt="p" />
          </div>
        </div>
        <p v-else class="card__empty">暂无整改照片</p>
      </section>

      <!-- 补传整改照片（可编辑） -->
      <section class="card">
        <h2 class="card__title">补传整改照片</h2>
        <p class="card__desc">
          可拍照或从相册选择，支持多张；上传失败可单张重试。补传照片将追加到现有整改后照片。
        </p>

        <div v-if="newPhotos.items.value.length > 0" class="photo-grid">
          <div v-for="item in newPhotos.items.value" :key="item.key" class="photo-item">
            <img
              class="photo-item__img"
              :src="item.status === 'done' ? item.webPath : item.previewUrl"
              :alt="item.name"
            />
            <span class="photo-item__badge" :class="`photo-item__badge--${item.status}`">
              {{
                item.status === 'uploading'
                  ? '上传中'
                  : item.status === 'done'
                    ? '已上传'
                    : '上传失败'
              }}
            </span>
            <div class="photo-item__ops">
              <button
                v-if="item.status === 'failed'"
                type="button"
                class="photo-item__op"
                @click="newPhotos.retry(item)"
              >
                重试
              </button>
              <button
                type="button"
                class="photo-item__op photo-item__op--danger"
                :disabled="item.status === 'uploading'"
                @click="newPhotos.remove(item)"
              >
                删除
              </button>
            </div>
            <p v-if="item.status === 'failed'" class="photo-item__err">{{ item.error }}</p>
          </div>
        </div>

        <input
          ref="newPhotoInput"
          class="photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          @change="newPhotos.onInputChange"
        />
        <button type="button" class="photo-add m-btn" @click="newPhotos.trigger()">
          + 拍照 / 选择照片
        </button>
      </section>

      <!-- 整改人（可选） -->
      <section class="card">
        <h2 class="card__title">整改人</h2>
        <label class="field" for="mn-rectifier">
          <span class="field__label">整改人（选填）</span>
          <input
            id="mn-rectifier"
            v-model="rectifier"
            class="field__input"
            type="text"
            maxlength="50"
            placeholder="填写实际完成整改的人员姓名"
          />
        </label>
      </section>

      <!-- 错误提示：上传失败 / 提交失败 / 权限失败 / 记录不存在 / 网络错误 分别区分 -->
      <p
        v-if="formError"
        class="form-error"
        :class="{ 'form-error--block': serverCode === 'SCOPE_DENIED' }"
        role="alert"
      >
        {{ formError }}
      </p>

      <div class="actions">
        <button type="button" class="actions__cancel m-btn" :disabled="submitting" @click="onCancel">
          取消
        </button>
        <button
          type="button"
          class="actions__submit m-btn"
          :disabled="submitting || submitted"
          @click="onSubmit"
        >
          {{ submitButtonText }}
        </button>
      </div>

      <p class="footnote">
        提交后以「整改后照片」是否存在有效图片作为整改完成口径，由服务器保存并判定。
      </p>
    </template>

    <section v-else class="card">
      <h2 class="card__title">补传整改照片</h2>
      <p v-if="recordId" class="card__id">记录 ID：{{ recordId }}</p>
      <p class="card__empty">
        未获取到巡查记录，请从巡查台账列表点击具体记录进入。
      </p>
    </section>
  </div>
</template>

<style scoped>
.rectify-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 8px;
}

.rectify-page__back {
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

.card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.card__title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
}

.card__desc {
  margin: -4px 0 10px;
  font-size: 12px;
  color: #8a8f99;
  line-height: 1.6;
}

.card__empty {
  margin: 8px 0 0;
  font-size: 13px;
  color: #8a8f99;
}

.card__id {
  margin: 8px 0 0;
  font-size: 13px;
  color: #646a73;
}

.row {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f3f5;
  font-size: 14px;
}

.row:last-child {
  border-bottom: none;
}

.row__label {
  flex: 0 0 76px;
  color: #8a8f99;
}

.row__value {
  flex: 1;
  color: #1f2329;
  word-break: break-word;
}

.field {
  display: block;
}

.field__label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #646a73;
}

.field__input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  color: #1f2329;
  font-size: 15px;
  font-family: inherit;
  padding: 10px 12px;
  appearance: none;
}

.field__input:focus {
  border-color: #2f7dcd;
  outline: 2px solid #eaf3fc;
}

.photo-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.photo-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #f2f3f5;
}

.photo-item__img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
}

.photo-item__badge {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 11px;
  line-height: 1.4;
  padding: 1px 6px;
  border-radius: 999px;
  color: #fff;
  background: rgb(0 0 0 / 55%);
}

.photo-item__badge--done {
  background: #2f7dcd;
}

.photo-item__badge--failed {
  background: #d4380d;
}

.photo-item__ops {
  display: flex;
  gap: 4px;
  padding: 4px;
}

.photo-item__op {
  flex: 1;
  min-height: 32px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #2f7dcd;
  font-size: 12px;
  cursor: pointer;
}

.photo-item__op--danger {
  color: #d4380d;
}

.photo-item__op:disabled {
  opacity: 0.5;
  cursor: default;
}

.photo-item__err {
  margin: 0;
  padding: 0 4px 4px;
  font-size: 11px;
  color: #d4380d;
}

.photo-add {
  width: 100%;
  margin-top: 10px;
  border: 1px dashed #2f7dcd;
  border-radius: 8px;
  background: #eaf3fc;
  color: #2f7dcd;
  font-size: 14px;
  font-weight: 600;
  padding: 12px;
  cursor: pointer;
}

.form-error {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #d4380d;
  background: #fff1f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.form-error--block {
  border: 1px solid #ffccc7;
  font-weight: 600;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 10px;
}

.actions__cancel {
  border: 1px solid #d0d5dd;
  border-radius: 12px;
  background: #fff;
  color: #646a73;
  font-size: 15px;
  padding: 14px;
  cursor: pointer;
}

.actions__submit {
  border: none;
  border-radius: 12px;
  background: #2f7dcd;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  padding: 14px;
  cursor: pointer;
}

.actions__cancel:disabled,
.actions__submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.footnote {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #8a8f99;
  line-height: 1.6;
}

@media (min-width: 768px) {
  .photo-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
