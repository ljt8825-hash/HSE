<script lang="ts" setup>
/**
 * MOBILE-05：手机端「三违现场录入」（手机 → 现有正式 API → 服务端责任解析 → 结果回显）
 *
 * 严格边界（本页只采集事实 + 提交 + 展示，不做任何计算）：
 * 1. 复用现有正式链路 POST /api/violations（violationService.create），不新增 /api/mobile/*。
 * 2. 扣分规则零前端实现：普通三违/头盔分层（E-08-11）全部由服务端责任解析与规则配置
 *    计算，本页只展示服务端返回的实际结果。
 * 3. 检查来源复用正式枚举 company / township / self（与 PC 端 CHECK_SOURCE_OPTIONS
 *    同语义同标签），用户所选值**原样提交**；未选择不允许提交，绝不默认转换。
 * 4. 检查人只读展示（登录身份）；服务端按 req.user 权威覆盖 inspector_id/inspector_name
 *    （E-08-08/09），本页不提交任何检查人身份字段。
 * 5. 被检查人员必须从正式员工选择器（GET /api/hse/employee/employees/selector，
 *    PG v_employee_org_full 主数据）中选取，提交 violatorId；
 *    绝不做「姓名 → 自动猜 employeeId」。
 * 6. 图片复用 MOBILE-02 既有上传链（POST /files/upload/image，入库相对路径），
 *    上传结果 joinImagePaths 后随提交写入 image_content，与记录强关联。
 * 7. 提交成功后轮询 GET /api/violations/:id/evidence-chain 展示服务端实际
 *    责任对象与扣分（deductionStatusInfo + deductions），不展示内部技术字段。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import { joinImagePaths } from '#/api/hse/grid-upload';
import { getEmployeeSelectorList } from '#/api/hse/employee';
import {
  createViolation,
  getViolationEvidenceChain,
} from '#/api/hse/violations';

import { createPhotoGroup, normalizeApiError } from '../grid/photo-group';

defineOptions({ name: 'MobileViolationNew' });

const router = useRouter();
const userStore = useUserStore();

/* ===================== 检查人（只读，登录身份） ===================== */
const inspectorName = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '',
);

/* ===================== 检查来源（正式枚举，与 PC 端一致） ===================== */
const CHECK_SOURCE_OPTIONS = [
  { value: 'company', label: '公司查处' },
  { value: 'township', label: '乡镇查处' },
  { value: 'self', label: '自查自纠' },
] as const;
type CheckSource = (typeof CHECK_SOURCE_OPTIONS)[number]['value'];

/* ===================== 被检查人员（正式员工选择器） ===================== */
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
    if (!results.value.length)
      searchError.value = '未找到匹配的正式员工，请更换关键词';
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

/* ===================== 表单 ===================== */
function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const form = ref({
  violationDate: todayStr(),
  violationBehavior: '',
  description: '',
  remark: '',
});
const checkSource = ref<'' | CheckSource>('');

/* ===================== 现场照片（复用 MOBILE-02 上传链） ===================== */
const sceneInput = ref<HTMLInputElement | null>(null);
const scenePhotos = createPhotoGroup(sceneInput);
onBeforeUnmount(() => scenePhotos.dispose());

/* ===================== 提交 ===================== */
type Phase = 'form' | 'submitting' | 'result';
const phase = ref<Phase>('form');
const formError = ref('');
const errorCode = ref('');

const submitButtonText = computed(() => {
  if (phase.value === 'result') return '已提交';
  if (phase.value === 'submitting') return '提交中…';
  return '提交三违记录';
});

function mapSubmitError(err: unknown): { code: string; text: string } {
  const n = normalizeApiError(err);
  if (n.codeNumber === 401) {
    return { code: 'UNAUTHORIZED', text: '登录状态已失效，请重新登录后再提交' };
  }
  if (n.codeNumber === 403) {
    return {
      code: 'FORBIDDEN',
      text: n.message || '当前账号无三违提交权限，请联系管理员',
    };
  }
  if (n.isNetwork) {
    return { code: 'NETWORK', text: '网络连接失败，三违记录提交失败，请重试' };
  }
  return {
    code: n.bizCode || 'CREATE_FAILED',
    text: n.message ? `三违记录提交失败：${n.message}` : '三违记录提交失败，请重试',
  };
}

/* ===================== 结果回显（服务端实际结果） ===================== */
interface DeductionRow {
  targetEmployeeName?: null | string;
  targetPosition?: null | string;
  confirmedScore?: null | number | string;
  suggestedScore?: null | number | string;
  cycleName?: null | string;
  isDeleted?: boolean;
}
interface ResultInfo {
  violatorName: string;
  violationBehavior: string;
  checkSource: string;
  violationDate: string;
  statusLabel: string;
  explanation: string;
  deductions: DeductionRow[];
}
const result = ref<null | ResultInfo>(null);

const CHECK_SOURCE_TEXT: Record<string, string> = {
  company: '公司查处',
  township: '乡镇查处',
  self: '自查自纠',
};

function scoreText(d: DeductionRow): string {
  const v = d.confirmedScore ?? d.suggestedScore;
  return v == null || v === '' ? '-' : `${v} 分`;
}

/** 从单次证据链响应提取去重后的有效扣分行（与 PC 端 transmissionTargets 同语义）。 */
function extractDeductions(last: any): DeductionRow[] {
  const info = last?.deductionStatusInfo ?? {};
  // 双源取数（E-09 §八）：优先 statusInfo.deductions（驼峰，网格候选域）；
  // 手工创建记录（source_type=NULL）状态为 history、statusInfo 不透出 deductions，
  // 回退 evidence-chain 顶层原始行（蛇形，含 target_position）。
  const rawRows = (last?.deductions ?? []).map((d: any) => ({
    id: d.id,
    targetEmployeeName: d.targetEmployeeName ?? d.target_employee_name ?? null,
    targetPosition: d.targetPosition ?? d.target_position ?? null,
    cycleName: d.cycleName ?? d.cycle_name ?? null,
    confirmedScore: d.confirmedScore ?? d.confirmed_score,
    suggestedScore: d.suggestedScore ?? d.suggested_score,
    isDeleted: !!(d.isDeleted ?? d.is_deleted),
  }));
  const infoRows = (info.deductions ?? []).map((d: any) => ({
    id: d.id,
    targetEmployeeName: d.targetEmployeeName ?? null,
    targetPosition: null,
    cycleName: d.cycleName ?? null,
    confirmedScore: d.confirmedScore ?? null,
    suggestedScore: d.suggestedScore ?? null,
    isDeleted: !!(d.isDeleted ?? d.is_deleted),
  }));
  const rows = infoRows.length ? infoRows : rawRows;
  const seen = new Set<string>();
  const out: DeductionRow[] = [];
  for (const d of rows) {
    if (!d || d.isDeleted) continue;
    const key = String(d.targetEmployeeName ?? `deduction-${d.id}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/**
 * 轮询证据链：扣分由服务端事件异步落库（fire-and-forget），提交成功后
 * 短暂轮询至取到有效扣分行，或状态收敛为明确的「不扣分/身份未解析」，或超时。
 */
async function loadResult(id: number, tries = 7): Promise<void> {
  let last: any = null;
  let deductions: DeductionRow[] = [];
  for (let i = 0; i < tries; i += 1) {
    await new Promise((r) => setTimeout(r, i === 0 ? 300 : 800));
    try {
      last = await getViolationEvidenceChain(id);
    } catch {
      continue; // 网络抖动重试
    }
    deductions = extractDeductions(last);
    if (deductions.length > 0) break;
    const st = last?.deductionStatusInfo?.status;
    if (st === 'no_deduct' || st === 'unresolved') break;
  }
  const info = last?.deductionStatusInfo ?? {};
  result.value = {
    violatorName: last?.violation?.violatorName || selected.value?.name || '-',
    violationBehavior: last?.violation?.violationBehavior || form.value.violationBehavior,
    checkSource:
      CHECK_SOURCE_TEXT[String(last?.violation?.checkSource ?? '')] ||
      String(last?.violation?.checkSource ?? checkSource.value ?? '-'),
    violationDate: String(last?.violation?.violationDate ?? form.value.violationDate),
    statusLabel: String(info.label ?? '处理中'),
    explanation: String(info.explanation ?? ''),
    deductions,
  };
}

async function onSubmit() {
  if (phase.value !== 'form') return; // 提交中/已成功禁止重复提交
  formError.value = '';
  errorCode.value = '';

  if (!selected.value) {
    formError.value = '请从正式人员列表中选择被检查人员';
    return;
  }
  if (!form.value.violationBehavior.trim()) {
    formError.value = '请填写「三违行为」后再提交';
    return;
  }
  if (!checkSource.value) {
    formError.value = '请选择检查来源（原样提交，由服务端判定扣分）';
    return;
  }
  if (scenePhotos.isUploading.value) {
    formError.value = '图片正在上传，请等待上传完成后再提交';
    return;
  }
  if (scenePhotos.hasFailed.value) {
    formError.value = '有图片上传失败，请重试或删除该图片后再提交';
    return;
  }

  phase.value = 'submitting';
  try {
    const payload: Record<string, unknown> = {
      violatorId: selected.value.employee_id,
      violatorName: selected.value.name, // 服务端会以员工主数据权威姓名覆盖
      violationBehavior: form.value.violationBehavior.trim(),
      violationDate: form.value.violationDate,
      checkSource: checkSource.value, // 原样提交，不做任何默认转换
    };
    if (form.value.description.trim())
      payload.description = form.value.description.trim();
    if (form.value.remark.trim()) payload.remark = form.value.remark.trim();
    const scene = joinImagePaths(scenePhotos.donePaths());
    if (scene) payload.imageContent = scene;

    const created = (await createViolation(
      payload as any,
    )) as unknown as { id: number };
    const newId = Number((created as any)?.id);
    if (!Number.isInteger(newId) || newId <= 0) {
      throw new Error('missing-id');
    }
    await loadResult(newId);
    phase.value = 'result';
  } catch (error) {
    if (error instanceof Error && error.message === 'missing-id') {
      formError.value = '提交结果异常（未取得记录编号），请到 PC 端三违记录页核对';
      errorCode.value = 'MISSING_ID';
    } else {
      const mapped = mapSubmitError(error);
      errorCode.value = mapped.code;
      formError.value = mapped.text;
    }
    phase.value = 'form';
  } finally {
    if (phase.value === 'submitting') phase.value = 'form';
  }
}

function goLedger() {
  void router.push('/mobile/index');
}

function resetForm() {
  selected.value = null;
  keyword.value = '';
  results.value = [];
  checkSource.value = '';
  form.value = {
    violationDate: todayStr(),
    violationBehavior: '',
    description: '',
    remark: '',
  };
  scenePhotos.items.value = [];
  result.value = null;
  formError.value = '';
  errorCode.value = '';
  phase.value = 'form';
}
</script>

<template>
  <div class="new-page">
    <!-- ===== 结果回显态：只展示服务端实际返回 ===== -->
    <template v-if="phase === 'result' && result">
      <section class="card result-card">
        <h2 class="card__title card__title--ok">提交成功</h2>
        <div class="rows">
          <div class="row"><span class="row__label">被检查人员</span><span>{{ result.violatorName }}</span></div>
          <div class="row"><span class="row__label">三违行为</span><span>{{ result.violationBehavior || '—' }}</span></div>
          <div class="row"><span class="row__label">检查来源</span><span>{{ result.checkSource }}</span></div>
          <div class="row"><span class="row__label">检查日期</span><span>{{ result.violationDate }}</span></div>
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">责任结果</h2>
        <p class="status-line">
          <span class="status-badge">{{ result.statusLabel }}</span>
        </p>
        <p v-if="result.explanation" class="card__desc">{{ result.explanation }}</p>

        <div v-if="result.deductions.length" class="dedu-list">
          <div v-for="(d, i) in result.deductions" :key="i" class="dedu-item">
            <div class="dedu-item__head">
              <span class="dedu-item__name">{{ d.targetEmployeeName || '—' }}</span>
              <span class="dedu-item__score">-{{ scoreText(d) }}</span>
            </div>
            <p v-if="d.targetPosition" class="dedu-item__sub">{{ d.targetPosition }}</p>
            <p v-if="d.cycleName" class="dedu-item__sub">{{ d.cycleName }}</p>
          </div>
        </div>
        <p v-else class="card__desc">本记录当前无有效扣分（以服务端判定为准）。</p>
        <p class="footnote">以上为服务端责任解析与规则配置的实际计算结果，前端不做任何计算。</p>
      </section>

      <div class="actions">
        <button type="button" class="actions__cancel m-btn" @click="goLedger">返回首页</button>
        <button type="button" class="actions__submit m-btn" @click="resetForm">再录一条</button>
      </div>
    </template>

    <!-- ===== 表单态 ===== -->
    <template v-else>
      <!-- 检查人：只读 -->
      <section class="new-page__identity">
        <span class="new-page__identity-label">当前检查人</span>
        <span class="new-page__identity-name">{{ inspectorName || '—' }}</span>
        <span class="new-page__identity-hint">由登录账号自动确定，不可修改</span>
      </section>

      <!-- 被检查人员：正式员工选择 -->
      <section class="card">
        <h2 class="card__title">被检查人员 <em class="field__req">必选</em></h2>
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
          <p v-if="searching" class="card__desc">搜索中…</p>
          <p v-else-if="searchError" class="card__desc card__desc--warn">{{ searchError }}</p>
          <ul v-if="results.length" class="emp-list">
            <li v-for="r in results" :key="r.employee_id">
              <button type="button" class="emp-item" @click="pickEmployee(r)">
                <span class="emp-item__name">{{ displayRow(r) }}</span>
                <span class="emp-item__pick">选择</span>
              </button>
            </li>
          </ul>
          <p class="card__desc">必须从正式人员列表选择；同名人员请按组织/岗位仔细区分。</p>
        </template>
        <template v-else>
          <div class="picked">
            <span class="picked__name">{{ displayRow(selected) }}</span>
            <button type="button" class="picked__clear" @click="clearSelected">重选</button>
          </div>
        </template>
      </section>

      <!-- 三违行为 -->
      <section class="card">
        <h2 class="card__title">三违行为 <em class="field__req">必填</em></h2>
        <textarea
          v-model="form.violationBehavior"
          class="field__input field__input--area"
          rows="3"
          maxlength="500"
          placeholder="描述现场三违行为，如：不戴安全头盔"
        ></textarea>
        <p class="card__desc">三违扣分由服务端责任解析及规则配置计算，本页仅展示服务端返回的实际扣分结果。</p>
      </section>

      <!-- 检查来源 -->
      <section class="card">
        <h2 class="card__title">检查来源 <em class="field__req">必选</em></h2>
        <div class="src-group">
          <label v-for="o in CHECK_SOURCE_OPTIONS" :key="o.value" class="src-item">
            <input v-model="checkSource" type="radio" name="checkSource" :value="o.value" />
            <span>{{ o.label }}</span>
          </label>
        </div>
        <p class="card__desc">检查来源原样提交，由服务端权威判定；来源与身份不符时以后端判定为准。</p>
      </section>

      <!-- 基本信息 -->
      <section class="card">
        <h2 class="card__title">检查信息</h2>
        <label class="field" for="mv-date">
          <span class="field__label">检查日期</span>
          <input id="mv-date" v-model="form.violationDate" class="field__input" type="date" />
        </label>
        <label class="field" for="mv-desc">
          <span class="field__label">情况说明</span>
          <textarea
            id="mv-desc"
            v-model="form.description"
            class="field__input field__input--area"
            rows="2"
            maxlength="500"
            placeholder="选填"
          ></textarea>
        </label>
      </section>

      <!-- 现场照片 -->
      <section class="card">
        <h2 class="card__title">现场照片</h2>
        <p class="card__desc">可拍照或从相册选择，支持多张；上传失败可单张重试。照片随记录一并提交。</p>
        <div v-if="scenePhotos.items.value.length > 0" class="photo-grid">
          <div v-for="item in scenePhotos.items.value" :key="item.key" class="photo-item">
            <img
              class="photo-item__img"
              :src="item.status === 'done' ? item.webPath : item.previewUrl"
              :alt="item.name"
            />
            <span class="photo-item__badge" :class="`photo-item__badge--${item.status}`">
              {{ item.status === 'uploading' ? '上传中' : item.status === 'done' ? '已上传' : '上传失败' }}
            </span>
            <div class="photo-item__ops">
              <button
                v-if="item.status === 'failed'"
                type="button"
                class="photo-item__op"
                @click="scenePhotos.retry(item)"
              >
                重试
              </button>
              <button
                type="button"
                class="photo-item__op photo-item__op--danger"
                :disabled="item.status === 'uploading'"
                @click="scenePhotos.remove(item)"
              >
                删除
              </button>
            </div>
            <p v-if="item.status === 'failed'" class="photo-item__err">{{ item.error }}</p>
          </div>
        </div>
        <input
          ref="sceneInput"
          class="photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          @change="scenePhotos.onInputChange"
        />
        <button type="button" class="photo-add m-btn" @click="scenePhotos.trigger()">
          + 拍照 / 选择照片
        </button>
      </section>

      <!-- 错误提示 -->
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

      <div class="actions">
        <button type="button" class="actions__cancel m-btn" :disabled="phase === 'submitting'" @click="goLedger">
          取消
        </button>
        <button
          type="button"
          class="actions__submit m-btn"
          :disabled="phase === 'submitting'"
          @click="onSubmit"
        >
          {{ submitButtonText }}
        </button>
      </div>

      <p class="footnote">检查人与检查范围由服务器按登录账号自动确定，页面不提供选择或填写。</p>
    </template>
  </div>
</template>

<style scoped>
.new-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 8px;
}

/* 身份只读区 */
.new-page__identity {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  background: #eaf3fc;
  border-radius: 12px;
  padding: 12px 14px;
}

.new-page__identity-label {
  font-size: 13px;
  color: #646a73;
}

.new-page__identity-name {
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
}

.new-page__identity-hint {
  font-size: 12px;
  color: #8a8f99;
}

/* 卡片 */
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

.card__desc--warn {
  color: #d46b08;
}

/* 字段 */
.field {
  display: block;
  margin-top: 12px;
}

.field__label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #646a73;
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

/* 结果 */
.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  gap: 12px;
  font-size: 14px;
  color: #1f2329;
}

.row__label {
  flex-shrink: 0;
  width: 76px;
  color: #646a73;
}

.status-line {
  margin: 0 0 4px;
}

.status-badge {
  display: inline-block;
  border-radius: 999px;
  background: #eaf3fc;
  color: #2f7dcd;
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
}

.dedu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.dedu-item {
  border: 1px solid #ffe7ba;
  background: #fffbe6;
  border-radius: 8px;
  padding: 10px 12px;
}

.dedu-item__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.dedu-item__name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
}

.dedu-item__score {
  font-size: 15px;
  font-weight: 700;
  color: #d4380d;
}

.dedu-item__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #8a8f99;
}

/* 图片 */
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
}

@media (min-width: 768px) {
  .photo-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
