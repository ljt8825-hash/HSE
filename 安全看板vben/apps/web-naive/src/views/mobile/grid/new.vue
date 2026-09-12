<script lang="ts" setup>
/**
 * HSE-MOBILE-GRID-02-B：移动端「新增巡查」（手机 → 现有正式 API → PostgreSQL）
 *
 * 严格边界（本阶段只做界面，不碰后端）：
 * 1. 复用现有 POST /api/site-mgmt/grid-records（createGridInspectionRecord），不新建 /api/mobile/*。
 * 2. 提交体仅使用后端 GRID_RECORD_CREATE_CAMELS 白名单字段（camelCase）。
 * 3. 绝不提交 inspectorEmployeeId / employeeId / gridId：身份与 grid_id 均由服务器按
 *    req.user.id → users.employee_id → employee.id 及 gridScope 派生（fail-closed）。
 * 4. 图片复用 POST /api/files/upload/image，入库只写相对路径 /uploads/images/<filename>。
 * 5. 不做定位/离线/整改状态机（分别属 GRID-04 / 更后阶段）。
 */
import type { ComputedRef, Ref } from 'vue';

import type { SiteApi } from '#/api/hse/site';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import { joinImagePaths, uploadGridImage } from '#/api/hse/grid-upload';
import { createGridInspectionRecord } from '#/api/hse/site';

defineOptions({ name: 'MobileGridNew' });

const router = useRouter();
const userStore = useUserStore();

/* ===================== 只读身份展示（不可编辑、不可选择） ===================== */
const inspectorName = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '',
);

/* ===================== 选项（沿用 PC 台账既有词汇表） ===================== */
const GRID_LEVEL_OPTIONS = ['一级网格长', '二级网格长', '三级网格长', '总网格长'];
const POSITION_OPTIONS = [
  '网格长',
  '网格员',
  '安全员',
  '班组长',
  '公司管理',
  '乡镇作业中心经理',
  '管理员',
];
const REPORT_STATUS_OPTIONS = ['待上报', '已上报', '未上报'];
const GENDER_OPTIONS = ['男', '女'];
const RECTIFY_OPTIONS = ['是', '否'];

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ===================== 表单模型 ===================== */
const form = reactive({
  inspectionDate: todayStr(),
  areaTeam: '',
  gridLevel: '',
  position: '',
  // 现场问题
  violationBehavior: '',
  violationTypeResult: '',
  reportStatus: '',
  vehicleType: '',
  // 违规人员
  violatorName: '',
  violatorGender: '',
  violatorAge: '',
  // 整改
  needRectification: '',
  rectifier: '',
});

const needRectify = computed(() => form.needRectification === '是');

/* ===================== 图片组（现场照片 / 整改后照片） ===================== */
type PhotoStatus = 'done' | 'failed' | 'uploading';

interface PhotoItem {
  key: string;
  name: string;
  previewUrl: string;
  status: PhotoStatus;
  error: string;
  file: File;
  webPath: string;
}

interface PhotoGroup {
  dispose: () => void;
  donePaths: () => string[];
  hasFailed: ComputedRef<boolean>;
  isUploading: ComputedRef<boolean>;
  items: Ref<PhotoItem[]>;
  onInputChange: (event: Event) => void;
  remove: (item: PhotoItem) => void;
  retry: (item: PhotoItem) => void;
  trigger: () => void;
}

interface NormalizedApiError {
  bizCode: string;
  /** 后端 error(code,...) 的 code（HTTP 语义码：403/409/401；业务码为负数） */
  codeNumber: null | number;
  isNetwork: boolean;
  message: string;
}

/**
 * 归一化 requestClient 抛出的错误。
 *
 * 实测依据（packages/effects/request/src/request-client/request-client.ts）：
 *   catch (error) { throw error.response ? error.response.data : error; }
 * 即：业务/HTTP 错误抛出的是**响应体本身** `{ code, success, message, data }`
 *     （业务子码在 `data.code`，如 NO_GRID_FOR_EMPLOYEE）；
 *     网络层错误抛出的是 axios 原始 Error（无 response）。
 * 两种形态都必须兼容，否则会把 403/409 误判为「提交失败，请重试」。
 */
function normalizeApiError(err: unknown): NormalizedApiError {
  const e = err as any;
  const body = e?.response?.data ?? e ?? {};
  const inner = body?.data ?? {};
  const codeNumber = Number(body?.code);
  return {
    bizCode: String(inner?.code ?? ''),
    codeNumber: Number.isFinite(codeNumber) ? codeNumber : null,
    message: String(body?.message ?? '').trim(),
    isNetwork:
      !e?.response &&
      typeof e?.code === 'string' &&
      String(e.code).startsWith('ERR'),
  };
}

function mapUploadError(err: unknown): string {
  const n = normalizeApiError(err);
  if (n.codeNumber === 401) return '登录状态已失效，请重新登录后再上传';
  if (n.codeNumber === 413) return '图片过大，上传失败，请压缩后重试';
  if (n.isNetwork) return '网络连接失败，图片上传失败，请检查网络后重试';
  if (n.message) {
    return n.message.includes('图片上传失败')
      ? n.message
      : `图片上传失败：${n.message}`;
  }
  return '图片上传失败，请重试';
}

function createPhotoGroup(inputEl: Ref<HTMLInputElement | null>): PhotoGroup {
  const items = ref<PhotoItem[]>([]);
  let seq = 0;

  const isUploading = computed(() =>
    items.value.some((i) => i.status === 'uploading'),
  );
  const hasFailed = computed(() =>
    items.value.some((i) => i.status === 'failed'),
  );

  /**
   * 以「整对象替换」方式更新条目。
   * 注意：items 是 ref 数组（元素会被 Vue 深度代理），若直接改原始对象属性不会触发视图更新，
   * 因此统一通过该函数按 key 替换，保证状态徽标（上传中/已上传/上传失败）实时刷新。
   */
  function patch(key: string, changes: Partial<PhotoItem>) {
    items.value = items.value.map((i) =>
      i.key === key ? { ...i, ...changes } : i,
    );
  }

  async function uploadByKey(key: string, file: File) {
    patch(key, { status: 'uploading', error: '', webPath: '' });
    try {
      const res = await uploadGridImage(file);
      patch(key, { status: 'done', webPath: res.webPath });
    } catch (error) {
      patch(key, { status: 'failed', webPath: '', error: mapUploadError(error) });
    }
  }

  function onInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = [...input.files ?? []];
    // 清空 value：允许重复选择同一张图片（否则第二次 change 不触发）
    input.value = '';
    for (const file of files) {
      seq += 1;
      const key = `p-${Date.now()}-${seq}`;
      items.value = [
        ...items.value,
        {
          key,
          name: file.name || `照片${seq}`,
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
          error: '',
          file,
          webPath: '',
        },
      ];
      void uploadByKey(key, file);
    }
  }

  function trigger() {
    inputEl.value?.click();
  }

  function retry(item: PhotoItem) {
    if (item.status === 'uploading') return;
    void uploadByKey(item.key, item.file);
  }

  function remove(item: PhotoItem) {
    try {
      URL.revokeObjectURL(item.previewUrl);
    } catch {
      /* 忽略无效 URL */
    }
    items.value = items.value.filter((i) => i.key !== item.key);
  }

  function dispose() {
    for (const i of items.value) {
      try {
        URL.revokeObjectURL(i.previewUrl);
      } catch {
        /* 忽略无效 URL */
      }
    }
  }

  const donePaths = () =>
    items.value.filter((i) => i.status === 'done').map((i) => i.webPath);

  return {
    items,
    isUploading,
    hasFailed,
    trigger,
    onInputChange,
    remove,
    retry,
    donePaths,
    dispose,
  };
}

const sceneInput = ref<HTMLInputElement | null>(null);
const rectifyInput = ref<HTMLInputElement | null>(null);
const scenePhotos = createPhotoGroup(sceneInput);
const rectifyPhotos = createPhotoGroup(rectifyInput);

onBeforeUnmount(() => {
  scenePhotos.dispose();
  rectifyPhotos.dispose();
});

/* ===================== 提交 ===================== */
const submitting = ref(false);
const submitted = ref(false);
const formError = ref('');
/** 服务端 fail-closed 业务码（NO_GRID_FOR_EMPLOYEE / MULTIPLE_GRIDS_FOR_EMPLOYEE 等） */
const serverCode = ref('');

const submitButtonText = computed(() => {
  if (submitted.value) return '巡查记录已提交';
  if (submitting.value) return '提交中…';
  return '提交巡查记录';
});

function buildPayload(): Partial<SiteApi.GridInspectionRecord> {
  const payload: Partial<SiteApi.GridInspectionRecord> = {};
  // 空值一律不上送（后端会把 '' 转 NULL，这里直接省略，避免制造无意义字段）
  if (form.inspectionDate.trim()) payload.inspectionDate = form.inspectionDate.trim();
  if (form.areaTeam.trim()) payload.areaTeam = form.areaTeam.trim();
  if (form.gridLevel.trim()) payload.gridLevel = form.gridLevel.trim();
  if (form.position.trim()) payload.position = form.position.trim();
  if (form.violationBehavior.trim()) payload.violationBehavior = form.violationBehavior.trim();
  if (form.violationTypeResult.trim()) payload.violationTypeResult = form.violationTypeResult.trim();
  if (form.reportStatus.trim()) payload.reportStatus = form.reportStatus.trim();
  if (form.vehicleType.trim()) payload.vehicleType = form.vehicleType.trim();
  if (form.violatorName.trim()) payload.violatorName = form.violatorName.trim();
  if (form.violatorGender.trim()) payload.violatorGender = form.violatorGender.trim();
  if (form.violatorAge.trim()) payload.violatorAge = form.violatorAge.trim();
  if (form.needRectification.trim()) payload.needRectification = form.needRectification.trim();
  if (needRectify.value && form.rectifier.trim()) payload.rectifier = form.rectifier.trim();

  const scene = joinImagePaths(scenePhotos.donePaths());
  if (scene) payload.imageContent = scene;
  const rectified = joinImagePaths(rectifyPhotos.donePaths());
  if (rectified) payload.rectifiedPhoto = rectified;

  // 网格长/检查人姓名：由当前登录身份自动带出（只读展示，用户不可修改、不可选择）。
  // 注意：这不是身份字段——身份（inspector_employee_id）与 grid_id 一律由服务器派生。
  const me = inspectorName.value.trim();
  if (me) payload.personnelName = me;

  return payload;
}

/** 把服务端 fail-closed 响应映射为移动端文案（§13 / §21） */
function mapSubmitError(err: unknown): { code: string; text: string } {
  const n = normalizeApiError(err);
  if (n.bizCode === 'NO_GRID_FOR_EMPLOYEE' || n.codeNumber === 403) {
    return {
      code: 'NO_GRID_FOR_EMPLOYEE',
      text: '当前账号未关联有效网格，无法新增巡查',
    };
  }
  if (n.bizCode === 'MULTIPLE_GRIDS_FOR_EMPLOYEE' || n.codeNumber === 409) {
    return {
      code: 'MULTIPLE_GRIDS_FOR_EMPLOYEE',
      text: '当前账号关联多个网格，请联系管理员处理',
    };
  }
  if (n.codeNumber === 401) {
    return { code: 'UNAUTHORIZED', text: '登录状态已失效，请重新登录后再提交' };
  }
  if (n.isNetwork) {
    return { code: 'NETWORK', text: '网络连接失败，巡查记录提交失败，请重试' };
  }
  return {
    code: n.bizCode || 'CREATE_FAILED',
    text: n.message
      ? `巡查记录提交失败：${n.message}`
      : '巡查记录提交失败，请重试',
  };
}

async function onSubmit() {
  if (submitting.value || submitted.value) return; // 防重复提交（提交中/已成功均直接忽略）
  formError.value = '';
  serverCode.value = '';

  if (!form.violationBehavior.trim()) {
    formError.value = '请填写「现场问题 / 违规行为」后再提交';
    return;
  }
  if (scenePhotos.isUploading.value || rectifyPhotos.isUploading.value) {
    formError.value = '图片正在上传，请等待上传完成后再提交';
    return;
  }
  if (scenePhotos.hasFailed.value || rectifyPhotos.hasFailed.value) {
    formError.value = '有图片上传失败，请重试或删除该图片后再提交';
    return;
  }

  submitting.value = true;
  try {
    await createGridInspectionRecord(buildPayload());
    submitted.value = true;
    // 成功反馈后回台账（replace：避免返回键回到表单造成重复提交）
    setTimeout(() => {
      void router.replace('/mobile/grid/ledger');
    }, 700);
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

onMounted(() => {
  // 每次进入都默认当天，避免残留上一次的日期
  form.inspectionDate = todayStr();
});
</script>

<template>
  <div class="new-page">
    <!-- 身份只读区：巡查人由登录身份决定，页面不提供选择 -->
    <section class="new-page__identity">
      <span class="new-page__identity-label">当前巡查人</span>
      <span class="new-page__identity-name">{{ inspectorName || '—' }}</span>
      <span class="new-page__identity-hint">由登录账号自动确定，不可修改</span>
    </section>

    <!-- 1. 巡查基础 -->
    <section class="card">
      <h2 class="card__title">巡查基础</h2>

      <label class="field" for="mn-date">
        <span class="field__label">巡查日期</span>
        <input id="mn-date" v-model="form.inspectionDate" class="field__input" type="date" />
      </label>

      <label class="field" for="mn-area">
        <span class="field__label">作业片区</span>
        <input
          id="mn-area"
          v-model="form.areaTeam"
          class="field__input"
          type="text"
          placeholder="如：公司管理 / 城区作业中心"
        />
      </label>

      <label class="field" for="mn-level">
        <span class="field__label">网格等级</span>
        <select id="mn-level" v-model="form.gridLevel" class="field__input">
          <option value="">请选择</option>
          <option v-for="o in GRID_LEVEL_OPTIONS" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>

      <label class="field" for="mn-position">
        <span class="field__label">岗位</span>
        <select id="mn-position" v-model="form.position" class="field__input">
          <option value="">请选择</option>
          <option v-for="o in POSITION_OPTIONS" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>
    </section>

    <!-- 2. 现场问题 -->
    <section class="card">
      <h2 class="card__title">现场问题</h2>

      <label class="field" for="mn-behavior">
        <span class="field__label">违规行为 <em class="field__req">必填</em></span>
        <textarea
          id="mn-behavior"
          v-model="form.violationBehavior"
          class="field__input field__input--area"
          rows="3"
          maxlength="500"
          placeholder="描述现场发现的违规/三违行为；若无问题可填写「无三违行为」"
        ></textarea>
      </label>

      <label class="field" for="mn-result">
        <span class="field__label">违规类型 / 处理结果</span>
        <input
          id="mn-result"
          v-model="form.violationTypeResult"
          class="field__input"
          type="text"
          placeholder="选填"
        />
      </label>

      <label class="field" for="mn-status">
        <span class="field__label">上报状态</span>
        <select id="mn-status" v-model="form.reportStatus" class="field__input">
          <option value="">请选择</option>
          <option v-for="o in REPORT_STATUS_OPTIONS" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>

      <label class="field" for="mn-vehicle">
        <span class="field__label">车辆类型</span>
        <input
          id="mn-vehicle"
          v-model="form.vehicleType"
          class="field__input"
          type="text"
          placeholder="选填，如：压缩车 / 三轮保洁车"
        />
      </label>
    </section>

    <!-- 3. 违规人员 -->
    <section class="card">
      <h2 class="card__title">违规人员</h2>

      <label class="field" for="mn-vname">
        <span class="field__label">姓名</span>
        <input
          id="mn-vname"
          v-model="form.violatorName"
          class="field__input"
          type="text"
          placeholder="选填"
        />
      </label>

      <label class="field" for="mn-vgender">
        <span class="field__label">性别</span>
        <select id="mn-vgender" v-model="form.violatorGender" class="field__input">
          <option value="">请选择</option>
          <option v-for="o in GENDER_OPTIONS" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>

      <label class="field" for="mn-vage">
        <span class="field__label">年龄</span>
        <input
          id="mn-vage"
          v-model="form.violatorAge"
          class="field__input"
          type="text"
          inputmode="numeric"
          placeholder="选填"
        />
      </label>
    </section>

    <!-- 4. 现场照片 -->
    <section class="card">
      <h2 class="card__title">现场照片</h2>
      <p class="card__desc">可拍照或从相册选择，支持多张；上传失败可单张重试。</p>

      <div v-if="scenePhotos.items.value.length > 0" class="photo-grid">
        <div v-for="item in scenePhotos.items.value" :key="item.key" class="photo-item">
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

    <!-- 5. 整改 -->
    <section class="card">
      <h2 class="card__title">整改</h2>

      <label class="field" for="mn-rectify">
        <span class="field__label">是否需要整改</span>
        <select id="mn-rectify" v-model="form.needRectification" class="field__input">
          <option value="">请选择</option>
          <option v-for="o in RECTIFY_OPTIONS" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>

      <template v-if="needRectify">
        <label class="field" for="mn-rectifier">
          <span class="field__label">整改人</span>
          <input
            id="mn-rectifier"
            v-model="form.rectifier"
            class="field__input"
            type="text"
            placeholder="选填"
          />
        </label>

        <div class="field">
          <span class="field__label">整改后照片</span>
          <div v-if="rectifyPhotos.items.value.length > 0" class="photo-grid">
            <div v-for="item in rectifyPhotos.items.value" :key="item.key" class="photo-item">
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
                  @click="rectifyPhotos.retry(item)"
                >
                  重试
                </button>
                <button
                  type="button"
                  class="photo-item__op photo-item__op--danger"
                  :disabled="item.status === 'uploading'"
                  @click="rectifyPhotos.remove(item)"
                >
                  删除
                </button>
              </div>
              <p v-if="item.status === 'failed'" class="photo-item__err">{{ item.error }}</p>
            </div>
          </div>
          <input
            ref="rectifyInput"
            class="photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            @change="rectifyPhotos.onInputChange"
          />
          <button type="button" class="photo-add m-btn" @click="rectifyPhotos.trigger()">
            + 拍照 / 选择照片
          </button>
        </div>
      </template>
    </section>

    <!-- 错误提示：区分图片上传失败 / 巡查提交失败 / 网格身份 fail-closed -->
    <p
      v-if="formError"
      class="form-error"
      :class="{
        'form-error--block':
          serverCode === 'NO_GRID_FOR_EMPLOYEE' ||
          serverCode === 'MULTIPLE_GRIDS_FOR_EMPLOYEE',
      }"
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

    <p class="footnote">巡查人与所属网格由服务器按登录账号自动确定，页面不提供选择。</p>
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
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
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
}

/* 字段：单列、触控目标 ≥44px */
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
  font-style: normal;
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

.field__input:focus {
  border-color: #2f7dcd;
  outline: 2px solid #eaf3fc;
}

.field__input--area {
  min-height: 84px;
  line-height: 1.5;
  resize: vertical;
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
  background: rgba(0, 0, 0, 0.55);
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
}

@media (min-width: 768px) {
  .photo-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
