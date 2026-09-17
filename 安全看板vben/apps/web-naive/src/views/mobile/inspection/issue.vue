<script lang="ts" setup>
/**
 * H5-GRID-UI-01 · 06 发现问题
 *
 * 展示【现场存在问题】，由用户选择问题类型。
 * 冻结范围：本阶段 H5 问题类型仅开放【三违】作为进入三违记录的业务入口；
 * 其余问题类型（隐患/设备故障等）不在本阶段范围，走 PC 端 HSE 系统，
 * 本页不做任何三违业务规则实现（责任传导/扣分/审核/整改/复查均由现有链路处理）。
 * 守卫：未开始巡查 → 回开始巡查页。
 */
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import { flowContext, flowReady, flowScenePhotos, isoToTime, flowState } from './flow';

defineOptions({ name: 'MobileInspectionIssue' });

const router = useRouter();

if (!flowReady()) {
  router.replace('/mobile/inspection/start');
}

const previewUrl = ref('');
const showPreview = ref(false);

function openPreview(url: string) {
  previewUrl.value = url;
  showPreview.value = true;
}

function closePreview() {
  showPreview.value = false;
  previewUrl.value = '';
}

onBeforeUnmount(closePreview);

function goViolation() {
  void router.push('/mobile/inspection/violation');
}

function backToCapture() {
  void router.back();
}

function donePhotos() {
  return flowScenePhotos.items.value.filter((i) => i.status === 'done');
}
</script>

<template>
  <div class="issue-page">
    <section class="issue-head">
      <span class="issue-head__title">现场存在问题</span>
      <span class="issue-head__sub">
        {{ flowContext?.employeeName || '—' }} · {{ isoToTime(flowState.startedAt) || '--:--' }} ·
        已取证 {{ donePhotos().length }} 张
      </span>
    </section>

    <section class="card">
      <h2 class="card__title">问题类型</h2>
      <button type="button" class="violation-entry m-btn" @click="goViolation">
        <span class="violation-entry__main">三违</span>
        <span class="violation-entry__sub">记录三违行为并进入既有 HSE 业务链路</span>
      </button>

      <div class="others">
        <p class="others__label">其他问题类型（隐患、设备故障等）</p>
        <p class="others__desc">
          本阶段 H5 仅开放三违现场取证；其他问题请使用 PC 端 HSE 系统记录。
        </p>
      </div>
    </section>

    <section v-if="donePhotos().length" class="card">
      <h2 class="card__title">现场取证照片</h2>
      <div class="photo-grid">
        <img
          v-for="p in donePhotos()"
          :key="p.key"
          class="photo-thumb"
          :src="p.webPath"
          :alt="p.name"
          @click="openPreview(p.webPath)"
        />
      </div>
    </section>

    <button type="button" class="back-btn m-btn" @click="backToCapture">
      返回取证（继续拍照）
    </button>

    <div
      v-if="showPreview"
      class="preview-mask"
      role="dialog"
      aria-label="照片预览"
      @click="closePreview"
    >
      <img class="preview-img" :src="previewUrl" alt="现场照片预览" />
    </div>
  </div>
</template>

<style scoped>
.issue-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.issue-head__title {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: #d46b08;
}

.issue-head__sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #8a8f99;
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

.violation-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  border: 2px solid #ffe58f;
  background: #fffbe6;
  border-radius: 12px;
  padding: 18px 14px;
  cursor: pointer;
}

.violation-entry__main {
  font-size: 20px;
  font-weight: 700;
  color: #d46b08;
}

.violation-entry__sub {
  font-size: 12px;
  color: #8a8f99;
}

.others {
  margin-top: 12px;
  border-top: 1px solid #f2f3f5;
  padding-top: 10px;
}

.others__label {
  margin: 0;
  font-size: 13px;
  color: #646a73;
}

.others__desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.photo-thumb {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  cursor: zoom-in;
}

.back-btn {
  width: 100%;
  border: 1px solid #d0d5dd;
  border-radius: 12px;
  background: #fff;
  color: #2f7dcd;
  font-size: 15px;
  font-weight: 600;
  padding: 13px;
  cursor: pointer;
}

.preview-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 85%);
  cursor: zoom-out;
}

.preview-img {
  max-width: 94vw;
  max-height: 90dvh;
  object-fit: contain;
}
</style>
