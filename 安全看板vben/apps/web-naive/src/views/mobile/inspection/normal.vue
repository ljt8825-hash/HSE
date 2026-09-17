<script lang="ts" setup>
/**
 * H5-GRID-UI-01 · 05 正常巡查提交
 *
 * 展示：巡查信息（人员/时间/网格身份）+ 照片证据 + 提交按钮。
 * 提交：复用现有 POST /api/site-mgmt/grid-records（createGridInspectionRecord），
 * 不新增 /api/mobile/*；提交体仅使用后端白名单字段：
 *   inspectionDate / violationBehavior='无三违行为' / needRectification='否' /
 *   imageContent（现场照片，相对路径逗号分隔）/ personnelName（仅展示性姓名）。
 * 身份（inspector_employee_id）与 grid_id 一律由服务器按登录身份派生（fail-closed），
 * 本页不提交任何身份字段。
 * 提交成功 → 「巡查记录已提交」 → 返回工作台。
 */
import type { SiteApi } from '#/api/hse/site';

import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import { joinImagePaths } from '#/api/hse/grid-upload';
import { createGridInspectionRecord } from '#/api/hse/site';

import {
  finishFlow,
  flowContext,
  flowReady,
  flowScenePhotos,
  flowState,
  isoToDate,
} from './flow';

defineOptions({ name: 'MobileInspectionNormal' });

const router = useRouter();
const userStore = useUserStore();

if (!flowReady()) {
  router.replace('/mobile/inspection/start');
}

/** 已上传成功的照片（预览展示用） */
const donePhotos = computed(() =>
  flowScenePhotos.items.value.filter((i) => i.status === 'done'),
);

const submitBlocked = computed(
  () =>
    flowScenePhotos.isUploading.value ||
    flowScenePhotos.hasFailed.value ||
    donePhotos.value.length === 0,
);

const submitting = ref(false);
const submitted = ref(false);
const formError = ref('');

const inspectorName = computed(
  () =>
    flowContext.value?.employeeName ||
    userStore.userInfo?.realName ||
    userStore.userInfo?.username ||
    '',
);

const submitText = computed(() => {
  if (submitted.value) return '巡查记录已提交';
  if (submitting.value) return '提交中…';
  return '提交巡查记录';
});

onBeforeUnmount(() => {
  // 提交成功后照片已随记录入库；此处回收预览 blob
  if (submitted.value) finishFlow();
});

function buildPayload(): Partial<SiteApi.GridInspectionRecord> {
  const payload: Partial<SiteApi.GridInspectionRecord> = {
    inspectionDate: isoToDate(flowState.startedAt) || undefined,
    // 现场正常：与 PC 台账词汇一致（isNegative 识别词）
    violationBehavior: '无三违行为',
    needRectification: '否',
  };
  const scene = joinImagePaths(flowScenePhotos.donePaths());
  if (scene) payload.imageContent = scene;
  // 展示性姓名（非身份字段；身份由服务器按登录账号派生）
  if (inspectorName.value.trim()) payload.personnelName = inspectorName.value.trim();
  return payload;
}

function mapSubmitError(err: unknown): string {
  const e = err as any;
  const body = e?.response?.data ?? e ?? {};
  const inner = body?.data ?? {};
  const codeNumber = Number(body?.code);
  const isNetwork =
    !e?.response && typeof e?.code === 'string' && String(e.code).startsWith('ERR');
  const bizCode = String(inner?.code ?? '');
  if (bizCode === 'NO_GRID_FOR_EMPLOYEE' || codeNumber === 403) {
    return '当前账号未关联有效网格，无法提交巡查';
  }
  if (bizCode === 'MULTIPLE_GRIDS_FOR_EMPLOYEE' || codeNumber === 409) {
    return '当前账号关联多个网格，请联系管理员处理';
  }
  if (codeNumber === 401) return '登录状态已失效，请重新登录后再提交';
  if (isNetwork) return '网络连接失败，巡查记录提交失败，请检查网络后重试';
  const msg = String(body?.message ?? '').trim();
  return msg ? `巡查记录提交失败：${msg}` : '巡查记录提交失败，请重试';
}

async function onSubmit() {
  if (submitting.value || submitted.value) return;
  formError.value = '';
  if (flowScenePhotos.isUploading.value) {
    formError.value = '图片正在上传，请等待上传完成后再提交';
    return;
  }
  if (flowScenePhotos.hasFailed.value) {
    formError.value = '有照片上传失败，请重试或删除后再提交';
    return;
  }
  submitting.value = true;
  try {
    await createGridInspectionRecord(buildPayload());
    submitted.value = true;
    // 成功反馈后返回工作台（replace 避免返回键回到表单重复提交）
    setTimeout(() => {
      void router.replace('/mobile/index');
    }, 900);
  } catch (error) {
    formError.value = mapSubmitError(error);
  } finally {
    submitting.value = false;
  }
}

function backToCapture() {
  void router.back();
}
</script>

<template>
  <div class="normal-page">
    <section class="card">
      <h2 class="card__title">巡查信息</h2>
      <div class="rows">
        <div class="row"><span class="row__label">巡查人员</span><span>{{ inspectorName || '—' }}</span></div>
        <div class="row"><span class="row__label">员工编码</span><span>{{ flowContext?.employeeCode || '—' }}</span></div>
        <div class="row"><span class="row__label">所属组织</span><span>{{ flowContext?.organization || '—' }}</span></div>
        <div class="row"><span class="row__label">巡查日期</span><span>{{ isoToDate(flowState.startedAt) || '—' }}</span></div>
        <div class="row"><span class="row__label">巡查结果</span><span class="row__ok">现场正常</span></div>
      </div>
      <p class="card__desc">网格与巡查身份由系统自动确定，无需填写。</p>
    </section>

    <section class="card">
      <h2 class="card__title">照片证据</h2>
      <div v-if="donePhotos.length" class="photo-grid">
        <div v-for="p in donePhotos" :key="p.key" class="photo-item">
          <img class="photo-item__img" :src="p.webPath" :alt="p.name" />
          <span class="photo-item__badge">已上传</span>
        </div>
      </div>
      <p v-else class="card__hint">暂无已上传照片。</p>
      <p class="card__desc">照片已随巡查流程上传完成，提交时一并入库。</p>
    </section>

    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
    <p v-if="submitted" class="submit-ok" role="status">巡查记录已提交</p>

    <div class="actions">
      <button
        type="button"
        class="actions__back m-btn"
        :disabled="submitting || submitted"
        @click="backToCapture"
      >
        返回取证
      </button>
      <button
        type="button"
        class="actions__submit m-btn"
        :disabled="submitBlocked || submitting || submitted"
        @click="onSubmit"
      >
        {{ submitText }}
      </button>
    </div>

    <p class="footnote">巡查人与所属网格由服务器按登录账号自动确定，页面不提供选择。</p>
  </div>
</template>

<style scoped>
.normal-page {
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

.card__desc {
  margin: 10px 0 0;
  font-size: 12px;
  color: #8a8f99;
}

.card__hint {
  margin: 0;
  font-size: 13px;
  color: #646a73;
}

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

.row__ok {
  color: #237804;
  font-weight: 600;
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
  padding: 1px 6px;
  border-radius: 999px;
  color: #fff;
  background: #2f7dcd;
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

.submit-ok {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #237804;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 8px;
  padding: 10px 12px;
  text-align: center;
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

.footnote {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #8a8f99;
}
</style>
