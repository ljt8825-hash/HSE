<script lang="ts" setup>
/**
 * H5-GRID-UI-01 · 04 现场取证（整个 H5 的核心页面）
 *
 * 第一视觉重点必须是【拍照取证】，不是表单：
 *   开始巡查 → 现场拍照 → 照片进入照片组 → 继续拍照/预览/删除/重试
 *   → 确认现场证据 → 判断现场情况（正常 / 发现问题）。
 *
 * 复用：photo-group.ts 的 createPhotoGroup（上传中/已上传/上传失败三态、
 * 单张重试、删除、提交前校验），底层 POST /api/files/upload/image，
 * 入库只写相对路径 /uploads/images/<filename>。
 * 守卫：未开始巡查（直接输入 URL）→ 回开始巡查页。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  finishFlow,
  flowCaptureInput,
  flowContext,
  flowReady,
  flowScenePhotos,
  flowState,
  isoToTime,
} from './flow';

defineOptions({ name: 'MobileInspectionCapture' });

const router = useRouter();

if (!flowReady()) {
  router.replace('/mobile/inspection/start');
}

/** 模板 ref 绑定：把页面内隐藏 input 挂到流程单例的照片组输入引用上 */
function bindCaptureInput(el: unknown) {
  flowCaptureInput.value = (el as HTMLInputElement | null) ?? null;
}

/** 至少 1 张已上传成功的照片才允许进入判断（先取证，再判断） */
const evidenceReady = computed(
  () => flowScenePhotos.items.value.some((i) => i.status === 'done'),
);

const previewUrl = ref('');
const showPreview = computed(() => previewUrl.value !== '');

function openPreview(item: { previewUrl: string; status: string; webPath: string }) {
  previewUrl.value = item.status === 'done' ? item.webPath : item.previewUrl;
}

function closePreview() {
  previewUrl.value = '';
}

function onPreviewKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closePreview();
}

function onBeforeUnmountHook() {
  // 照片组为流程级单例，此处只负责关闭预览，不 dispose（正常提交页仍需展示）
  closePreview();
}

onBeforeUnmount(onBeforeUnmountHook);

function goNormal() {
  if (!evidenceReady.value) return;
  void router.push('/mobile/inspection/normal');
}

function goIssue() {
  if (!evidenceReady.value) return;
  void router.push('/mobile/inspection/issue');
}

function abandon() {
  if (window.confirm('确定放弃本次巡查吗？已拍摄照片将被清除。')) {
    finishFlow();
    void router.replace('/mobile/index');
  }
}
</script>

<template>
  <div class="capture-page">
    <section class="capture-head">
      <div class="capture-head__info">
        <span class="capture-head__title">现场取证</span>
        <span class="capture-head__sub">
          {{ flowContext?.employeeName || '—' }} · 巡查中 · {{ isoToTime(flowState.startedAt) || '--:--' }}
        </span>
      </div>
      <button type="button" class="capture-head__abort m-btn" @click="abandon">
        放弃
      </button>
    </section>

    <!-- 第一视觉重点：拍照取证 -->
    <section class="card capture-card">
      <h2 class="card__title">拍照取证</h2>
      <p class="card__desc">
        请优先拍摄现场证据照片；可连续拍照，照片自动上传，失败可单张重试。
      </p>

      <div v-if="flowScenePhotos.items.value.length > 0" class="photo-grid">
        <div
          v-for="item in flowScenePhotos.items.value"
          :key="item.key"
          class="photo-item"
        >
          <img
            class="photo-item__img"
            :src="item.status === 'done' ? item.webPath : item.previewUrl"
            :alt="item.name"
            @click="openPreview(item)"
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
              @click="flowScenePhotos.retry(item)"
            >
              重试
            </button>
            <button
              type="button"
              class="photo-item__op photo-item__op--danger"
              :disabled="item.status === 'uploading'"
              @click="flowScenePhotos.remove(item)"
            >
              删除
            </button>
          </div>
          <p v-if="item.status === 'failed'" class="photo-item__err">
            {{ item.error }}
          </p>
        </div>
      </div>

      <input
        :ref="bindCaptureInput"
        class="photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        @change="flowScenePhotos.onInputChange"
      />
      <button type="button" class="photo-add m-btn" @click="flowScenePhotos.trigger()">
        + 拍照取证
      </button>
    </section>

    <!-- 确认现场证据后判断现场情况 -->
    <section class="judge">
      <p class="judge__label">确认现场证据后，判断现场情况：</p>
      <div class="judge__buttons">
        <button
          type="button"
          class="judge-btn judge-btn--ok m-btn"
          :disabled="!evidenceReady"
          @click="goNormal"
        >
          现场正常
        </button>
        <button
          type="button"
          class="judge-btn judge-btn--issue m-btn"
          :disabled="!evidenceReady"
          @click="goIssue"
        >
          发现问题
        </button>
      </div>
      <p v-if="!evidenceReady" class="judge__hint">
        请先完成至少 1 张照片上传，再判断现场情况。
      </p>
    </section>

    <!-- 全屏预览 -->
    <div
      v-if="showPreview"
      class="preview-mask"
      role="dialog"
      aria-label="照片预览"
      tabindex="-1"
      @click="closePreview"
      @keydown="onPreviewKeydown"
    >
      <img class="preview-img" :src="previewUrl" alt="现场照片预览" />
    </div>
  </div>
</template>

<style scoped>
.capture-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.capture-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.capture-head__title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #1f2329;
}

.capture-head__sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #8a8f99;
}

.capture-head__abort {
  flex-shrink: 0;
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #d4380d;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.capture-card {
  border: 2px dashed #2f7dcd;
}

.card__title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: #2f7dcd;
}

.card__desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
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
  cursor: zoom-in;
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
  border-radius: 10px;
  background: #eaf3fc;
  color: #2f7dcd;
  font-size: 16px;
  font-weight: 700;
  padding: 16px;
  cursor: pointer;
}

.judge {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.judge__label {
  margin: 0;
  font-size: 13px;
  color: #646a73;
}

.judge__buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.judge-btn {
  min-height: 52px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.judge-btn--ok {
  background: #237804;
  color: #fff;
}

.judge-btn--issue {
  background: #d46b08;
  color: #fff;
}

.judge-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.judge__hint {
  margin: 0;
  font-size: 12px;
  color: #d46b08;
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

@media (min-width: 768px) {
  .photo-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
