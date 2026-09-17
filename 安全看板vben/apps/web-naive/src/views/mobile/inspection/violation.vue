<script lang="ts" setup>
/**
 * H5-GRID-UI-01 · 07 三违记录
 *
 * 四部分：违规人员（正式员工选择器）→ 三违行为 → 三违照片（3 照片位，
 * 对应 WPS「三违照片：图片1/2/3」Attachment，入库 image_content 逗号分隔）
 * → 提交三违记录（复用现有 POST /api/violations）。
 *
 * 严格冻结边界：
 * 1. 不显示、不计算扣分 / 责任人 / 责任传导 / 审核 / 整改 / 复查结果；
 *    提交成功只提示「已提交，后续由现有 HSE 系统处理」。
 * 2. 违规人员必须从正式员工选择器（GET /api/hse/employee/employees/selector）
 *    中选取并提交 violatorId；不显示身份证号等敏感信息。
 * 3. 检查来源为既有正式枚举（company/township/self），原样提交，不做默认转换。
 * 4. 不显示取证照片于本页编辑（取证照片留在取证流程）；本页三违照片为独立 3 照片位。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import { joinImagePaths } from '#/api/hse/grid-upload';
import { getEmployeeSelectorList } from '#/api/hse/employee';
import { createViolation } from '#/api/hse/violations';

import { createPhotoGroup } from '../grid/photo-group';
import {
  finishFlow,
  flowContext,
  flowReady,
  isoToDate,
  flowState,
} from './flow';

defineOptions({ name: 'MobileInspectionViolation' });

const router = useRouter();

if (!flowReady()) {
  router.replace('/mobile/inspection/start');
}

/* ===================== 违规人员（正式员工选择器，复用既有逻辑思想） ===================== */
interface SelectorRow {
  employee_id: number;
  name: string;
  org_name?: string;
  position_name?: string;
}

const keyword = ref('');
const searching = ref(false);
const searchError = ref('');
const results = ref<SelectorRow[]>([]);
const selected = ref<null | SelectorRow>(null);
let searchTimer: null | ReturnType<typeof setTimeout> = null;

function displayRow(r: SelectorRow): string {
  const parts = [r.name];
  if (r.position_name) parts.push(r.position_name);
  if (r.org_name) parts.push(r.org_name);
  return parts.join(' · ');
}

async function doSearch() {
  const kw = keyword.value.trim();
  if (!kw) {
    results.value = [];
    searchError.value = '';
    return;
  }
  searching.value = true;
  searchError.value = '';
  try {
    const list =
      (await getEmployeeSelectorList({ keyword: kw, limit: 20 })) ?? [];
    results.value = list as unknown as SelectorRow[];
    if (!results.value.length) {
      searchError.value = '未找到匹配的正式员工，请更换关键词';
    }
  } catch {
    searchError.value = '人员搜索失败，请检查网络后重试';
    results.value = [];
  } finally {
    searching.value = false;
  }
}

function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void doSearch(), 350);
}

function pickEmployee(r: SelectorRow) {
  selected.value = r;
  results.value = [];
  keyword.value = '';
}

function clearSelected() {
  selected.value = null;
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

/* ===================== 三违行为（常用快选 + 自由文本，减少输入） ===================== */
const BEHAVIOR_PRESETS = ['未佩戴安全帽', '未系安全带', '违章指挥', '冒险作业', '野蛮施工'];

const form = ref({
  violationDate: isoToDate(flowState.startedAt) || '',
  violationBehavior: '',
});

function applyPreset(p: string) {
  const cur = form.value.violationBehavior.trim();
  if (cur.includes(p)) return;
  form.value.violationBehavior = cur ? `${cur}；${p}` : p;
}

/* ===================== 检查来源（既有正式枚举，原样提交） ===================== */
const CHECK_SOURCE_OPTIONS = [
  { value: 'company', label: '公司查处' },
  { value: 'township', label: '乡镇查处' },
  { value: 'self', label: '自查自纠' },
] as const;
type CheckSource = (typeof CHECK_SOURCE_OPTIONS)[number]['value'];
const checkSource = ref<'' | CheckSource>('');

/* ===================== 三违照片（3 照片位：图片1/2/3） ===================== */
const violationInput = ref<HTMLInputElement | null>(null);
const MAX_VIOLATION_PHOTOS = 3;
const photoLimitMsg = ref('');

/** 本地轻量照片组（3 照片位上限，交互契约与 photo-group 一致） */
const violationPhotos = createPhotoGroup(violationInput);

/**
 * 3 照片位守卫：超出上限时整批拒收并提示（对应 WPS 图片1/2/3 业务兼容性，
 * 不扩展新的照片字段模型）。
 */
function onViolationInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  const current = violationPhotos.items.value.length;
  if (current + files.length > MAX_VIOLATION_PHOTOS) {
    input.value = '';
    photoLimitMsg.value = `三违照片最多 ${MAX_VIOLATION_PHOTOS} 张（对应图片1/2/3），请先删除再拍照`;
    return;
  }
  photoLimitMsg.value = '';
  violationPhotos.onInputChange(event);
}

onBeforeUnmount(() => violationPhotos.dispose());

const violationPhotoItems = computed(() => violationPhotos.items.value);

/* ===================== 提交 ===================== */
const submitting = ref(false);
const submitted = ref(false);
const formError = ref('');

function mapSubmitError(err: unknown): string {
  const e = err as any;
  const body = e?.response?.data ?? e ?? {};
  const codeNumber = Number(body?.code);
  const isNetwork =
    !e?.response && typeof e?.code === 'string' && String(e.code).startsWith('ERR');
  if (codeNumber === 401) return '登录状态已失效，请重新登录后再提交';
  if (codeNumber === 403) {
    return String(body?.message ?? '').trim() || '当前账号无三违提交权限，请联系管理员';
  }
  if (isNetwork) return '网络连接失败，三违记录提交失败，请检查网络后重试';
  const msg = String(body?.message ?? '').trim();
  return msg ? `三违记录提交失败：${msg}` : '三违记录提交失败，请重试';
}

const canSubmit = computed(
  () =>
    !!selected.value &&
    !!form.value.violationBehavior.trim() &&
    !!checkSource.value &&
    violationPhotoItems.value.every((i) => i.status === 'done') &&
    violationPhotoItems.value.length > 0,
);

async function onSubmit() {
  if (submitting.value || submitted.value) return;
  formError.value = '';
  if (!selected.value) {
    formError.value = '请从正式人员列表中选择违规人员';
    return;
  }
  if (!form.value.violationBehavior.trim()) {
    formError.value = '请填写三违行为后再提交';
    return;
  }
  if (!checkSource.value) {
    formError.value = '请选择检查来源（原样提交，由服务端判定）';
    return;
  }
  if (violationPhotos.isUploading.value) {
    formError.value = '三违照片正在上传，请等待上传完成后再提交';
    return;
  }
  if (violationPhotos.hasFailed.value) {
    formError.value = '有照片上传失败，请重试或删除后再提交';
    return;
  }
  if (violationPhotoItems.value.length === 0) {
    formError.value = '三违记录必须至少 1 张现场照片';
    return;
  }

  submitting.value = true;
  try {
    const payload: Record<string, unknown> = {
      violatorId: selected.value.employee_id,
      violatorName: selected.value.name, // 服务端会以员工主数据权威姓名覆盖
      violationBehavior: form.value.violationBehavior.trim(),
      violationDate: form.value.violationDate,
      checkSource: checkSource.value,
    };
    const images = joinImagePaths(violationPhotos.donePaths());
    if (images) payload.imageContent = images;

    await createViolation(payload as any);
    submitted.value = true;
  } catch (error) {
    formError.value = mapSubmitError(error);
  } finally {
    submitting.value = false;
  }
}

function backToWorkbench() {
  finishFlow();
  void router.replace('/mobile/index');
}

function backToCapture() {
  void router.back();
}
</script>

<template>
  <div class="vio-page">
    <!-- ===== 提交成功态：不显示任何扣分/责任结果 ===== -->
    <template v-if="submitted">
      <section class="card">
        <h2 class="card__title card__title--ok">三违记录已提交</h2>
        <p class="card__hint">
          记录已进入现有 HSE 业务链路；后续处理（责任传导、扣分、审核、整改、复查）
          由现有 HSE / PC 系统完成，本端不再显示。
        </p>
      </section>
      <button type="button" class="primary-btn m-btn" @click="backToWorkbench">
        返回工作台
      </button>
    </template>

    <!-- ===== 表单态 ===== -->
    <template v-else>
      <section class="card">
        <h2 class="card__title">违规人员 <em class="field__req">必选</em></h2>
        <template v-if="!selected">
          <input
            v-model="keyword"
            class="field__input"
            type="search"
            enterkeyhint="search"
            placeholder="输入姓名 / 工号搜索正式员工"
            @input="onKeywordInput"
            @keyup.enter="doSearch"
          />
          <p v-if="searching" class="card__hint">搜索中…</p>
          <p v-else-if="searchError" class="card__hint card__hint--warn">{{ searchError }}</p>
          <ul v-if="results.length" class="emp-list">
            <li v-for="r in results" :key="r.employee_id">
              <button type="button" class="emp-item" @click="pickEmployee(r)">
                <span class="emp-item__name">{{ displayRow(r) }}</span>
                <span class="emp-item__pick">选择</span>
              </button>
            </li>
          </ul>
          <p class="card__desc">必须从正式人员列表选择；不显示身份证号等敏感信息。</p>
        </template>
        <template v-else>
          <div class="picked">
            <span class="picked__name">{{ displayRow(selected) }}</span>
            <button type="button" class="picked__clear" @click="clearSelected">重选</button>
          </div>
        </template>
      </section>

      <section class="card">
        <h2 class="card__title">三违行为 <em class="field__req">必填</em></h2>
        <div class="preset-row">
          <button
            v-for="p in BEHAVIOR_PRESETS"
            :key="p"
            type="button"
            class="preset-chip m-btn"
            @click="applyPreset(p)"
          >
            {{ p }}
          </button>
        </div>
        <textarea
          v-model="form.violationBehavior"
          class="field__input field__input--area"
          rows="3"
          maxlength="500"
          placeholder="描述现场三违行为，如：未佩戴安全帽"
        ></textarea>
      </section>

      <section class="card">
        <h2 class="card__title">检查来源 <em class="field__req">必选</em></h2>
        <div class="src-group">
          <label v-for="o in CHECK_SOURCE_OPTIONS" :key="o.value" class="src-item">
            <input v-model="checkSource" type="radio" name="vioCheckSource" :value="o.value" />
            <span>{{ o.label }}</span>
          </label>
        </div>
        <p class="card__desc">检查来源原样提交，由服务端权威判定。</p>
      </section>

      <section class="card">
        <h2 class="card__title">三违照片 <em class="field__req">必拍</em></h2>
        <p class="card__desc">
          三个照片位（对应图片1 / 图片2 / 图片3）；每张可查看、删除、失败重试。
        </p>
        <div v-if="violationPhotoItems.length" class="photo-grid">
          <div v-for="(item, idx) in violationPhotoItems" :key="item.key" class="photo-item">
            <span class="photo-item__slot">图片{{ idx + 1 }}</span>
            <img
              class="photo-item__img"
              :src="item.status === 'done' ? item.webPath : item.previewUrl"
              :alt="item.name"
            />
            <span
              class="photo-item__badge"
              :class="`photo-item__badge--${item.status}`"
            >
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
                @click="violationPhotos.retry(item)"
              >
                重试
              </button>
              <button
                type="button"
                class="photo-item__op photo-item__op--danger"
                :disabled="item.status === 'uploading'"
                @click="violationPhotos.remove(item)"
              >
                删除
              </button>
            </div>
            <p v-if="item.status === 'failed'" class="photo-item__err">{{ item.error }}</p>
          </div>
        </div>
        <input
          ref="violationInput"
          class="photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          @change="onViolationInputChange"
        />
        <button
          type="button"
          class="photo-add m-btn"
          :disabled="violationPhotoItems.length >= 3"
          @click="violationPhotos.trigger()"
        >
          + 拍照（{{ violationPhotoItems.length }}/3）
        </button>
        <p v-if="photoLimitMsg" class="card__hint card__hint--warn">{{ photoLimitMsg }}</p>
      </section>

      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

      <div class="actions">
        <button type="button" class="actions__back m-btn" :disabled="submitting" @click="backToCapture">
          返回
        </button>
        <button
          type="button"
          class="actions__submit m-btn"
          :disabled="submitting || !canSubmit"
          @click="onSubmit"
        >
          {{ submitting ? '提交中…' : '提交三违记录' }}
        </button>
      </div>

      <p class="footnote">
        检查人 {{ flowContext?.employeeName || '—' }}（{{ flowContext?.employeeCode || '—' }}）
        由登录身份自动确定；提交后由现有 HSE 系统处理。
      </p>
    </template>
  </div>
</template>

<style scoped>
.vio-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.card__title--ok {
  color: #237804;
}

.card__desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a8f99;
}

.card__hint {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: #646a73;
}

.card__hint--warn {
  color: #d46b08;
}

.field__req {
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  color: #d4380d;
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

.field__input--area {
  min-height: 84px;
  line-height: 1.5;
  resize: vertical;
  margin-top: 10px;
}

/* 人员搜索 */
.emp-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.emp-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: none;
  border-bottom: 1px solid #f2f3f5;
  background: #fff;
  padding: 11px 12px;
  font-size: 14px;
  color: #1f2329;
  text-align: left;
  cursor: pointer;
}

.emp-item:last-child {
  border-bottom: none;
}

.emp-item__pick {
  flex-shrink: 0;
  font-size: 12px;
  color: #2f7dcd;
}

.picked {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 8px;
  padding: 10px 12px;
}

.picked__name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
}

.picked__clear {
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #646a73;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

/* 行为快选 */
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  border: 1px solid #d0d5dd;
  border-radius: 999px;
  background: #fff;
  color: #2f7dcd;
  font-size: 13px;
  padding: 7px 14px;
  cursor: pointer;
}

/* 检查来源 */
.src-group {
  display: flex;
  gap: 8px;
}

.src-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2329;
  cursor: pointer;
}

.src-item:has(input:checked) {
  border-color: #2f7dcd;
  background: #eaf3fc;
  color: #2f7dcd;
  font-weight: 600;
}

/* 三违照片 */
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

.photo-item__slot {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  color: #1f2329;
  background: rgb(255 255 255 / 85%);
}

.photo-item__img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
}

.photo-item__badge {
  position: absolute;
  bottom: 40px;
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
  border-radius: 10px;
  background: #eaf3fc;
  color: #2f7dcd;
  font-size: 15px;
  font-weight: 600;
  padding: 14px;
  cursor: pointer;
}

.photo-add:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 提示与动作 */
.form-error {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #d4380d;
  background: #fff1f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 10px;
}

.actions__back {
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

.actions__back:disabled,
.actions__submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.primary-btn {
  width: 100%;
  border: none;
  background: #2f7dcd;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  min-height: 50px;
  border-radius: 12px;
  cursor: pointer;
}

.footnote {
  margin: 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}
</style>
