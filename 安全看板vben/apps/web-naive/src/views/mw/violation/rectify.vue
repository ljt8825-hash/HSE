<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 整改（拍整改后照片 AFTER → 填措施 → 提交）
 *
 * 两条入口共用本页：
 *   ① 「立即整改」：处置页点立即整改后直接进来；
 *   ② 「我的整改」：暂不整改挂起的记录，之后补整改。
 *
 * 硬约束（在 core/flow.ts，页面不自行判断）：
 *   BEFORE 必须存在 + AFTER 必须存在 + 整改措施必填 → 才允许提交。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  addAfterPhoto,
  getBundle,
  submitRectify,
} from '#/api/mw';
import type { PhotoRecord, ViolationRecord } from '#/api/mw';
import { errText, pickImage, resolvePhotos, useAccount } from '../shared';

defineOptions({ name: 'MwRectifyForm' });

const route = useRoute();
const router = useRouter();
const { account, ensure } = useAccount();

const violationId = String(route.query.id || '');
const record = ref<ViolationRecord | null>(null);
const photos = ref<Array<{ photo: PhotoRecord; url: string }>>([]);
const measure = ref('');
const busy = ref(false);
const uploading = ref(false);
const errorMsg = ref('');

const beforeList = computed(() =>
  photos.value.filter((x) => x.photo.photoType === 'BEFORE'),
);
const afterList = computed(() =>
  photos.value.filter((x) => x.photo.photoType === 'AFTER'),
);
const canSubmit = computed(
  () =>
    beforeList.value.length > 0 &&
    afterList.value.length > 0 &&
    measure.value.trim().length > 0 &&
    !busy.value,
);
/** 预置整改措施快捷短语：只是录入提效，不构成任何扣分/定性规则 */
const QUICK_MEASURES = [
  '现场已纠正，人员已规范佩戴防护用品',
  '现场已停工整改，重新进行安全交底',
  '已清理作业面，恢复安全通道',
  '已更换/修复不合格设施',
];

async function refresh() {
  photos.value = await resolvePhotos(violationId);
}

async function takeAfter() {
  if (!account.value) return;
  uploading.value = true;
  errorMsg.value = '';
  try {
    const file = await pickImage();
    if (!file) return;
    await addAfterPhoto(violationId, file, file.name || 'after.jpg', account.value.accountId);
    await refresh();
  } catch (e) {
    errorMsg.value = errText(e, '上传整改后照片失败');
  } finally {
    uploading.value = false;
  }
}

async function submit() {
  if (!account.value) return;
  busy.value = true;
  errorMsg.value = '';
  try {
    await submitRectify(violationId, measure.value, account.value);
    await router.replace('/mw/rectify');
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  if (!(await ensure())) return;
  const bundle = await getBundle(violationId);
  if (!bundle) {
    errorMsg.value = '三违记录不存在';
    return;
  }
  record.value = bundle.record;
  await refresh();
});
</script>

<template>
  <div class="mw-page">
    <div class="m-card mw-head">
      <div class="mw-head__id">{{ violationId }}</div>
      <div v-if="record" class="mw-head__sub">
        {{ record.violator?.name }} · {{ record.rule?.name }}
      </div>
    </div>

    <div class="m-card mw-sec">
      <div class="mw-sec__t">现场照片（BEFORE）</div>
      <div class="mw-grid">
        <div v-for="p in beforeList" :key="p.photo.photoId" class="mw-thumb">
          <img v-if="p.url" :src="p.url" alt="现场照片" />
          <span v-else class="mw-thumb__na">附件无直链</span>
        </div>
      </div>
      <p v-if="beforeList.length === 0" class="mw-warn">缺少现场照片，无法提交整改</p>
    </div>

    <div class="m-card mw-sec">
      <div class="mw-sec__t">
        整改后照片（AFTER）
        <span class="mw-sec__req">必须</span>
      </div>
      <div class="mw-grid">
        <div v-for="p in afterList" :key="p.photo.photoId" class="mw-thumb">
          <img v-if="p.url" :src="p.url" alt="整改后照片" />
          <span v-else class="mw-thumb__na">附件无直链</span>
        </div>
        <button class="mw-add m-btn" type="button" :disabled="uploading" @click="takeAfter">
          <span class="mw-add__plus">＋</span>
          <span class="mw-add__t">{{ uploading ? '上传中…' : '拍照' }}</span>
        </button>
      </div>
    </div>

    <div class="m-card mw-sec">
      <div class="mw-sec__t">
        整改措施
        <span class="mw-sec__req">必须</span>
      </div>
      <div class="mw-chips">
        <button
          v-for="q in QUICK_MEASURES"
          :key="q"
          class="mw-chip m-btn"
          type="button"
          @click="measure = q"
        >
          {{ q }}
        </button>
      </div>
      <textarea
        v-model="measure"
        class="mw-ta"
        rows="3"
        placeholder="请填写整改措施（必填）"
      ></textarea>
    </div>

    <button
      class="m-card mw-submit m-btn"
      type="button"
      :disabled="!canSubmit"
      @click="submit"
    >
      {{ busy ? '提交中…' : '提交整改' }}
    </button>

    <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>
  </div>
</template>

<style scoped>
.mw-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mw-head {
  padding: 14px 16px;
}
.mw-head__id {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
}
.mw-head__sub {
  margin-top: 4px;
  font-size: 13px;
  color: #646a73;
}
.mw-sec {
  padding: 14px 16px;
}
.mw-sec__t {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
.mw-sec__req {
  margin-left: 6px;
  font-size: 11px;
  color: #d4380d;
}
.mw-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.mw-thumb,
.mw-add {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #f4f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mw-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mw-thumb__na {
  font-size: 11px;
  color: #8a8f99;
}
.mw-add {
  flex-direction: column;
  gap: 2px;
  border: 1px dashed #b7bcc4;
  color: #2f7dcd;
}
.mw-add__plus {
  font-size: 24px;
  line-height: 1;
}
.mw-add__t {
  font-size: 12px;
}
.mw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.mw-chip {
  padding: 6px 10px;
  border-radius: 14px;
  background: #f0f6fc;
  color: #2f7dcd;
  font-size: 12px;
  border: none;
}
.mw-ta {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 10px;
  font-size: 14px;
  resize: vertical;
  box-sizing: border-box;
}
.mw-submit {
  padding: 16px;
  border: none;
  background: #2f7dcd;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  border-radius: 10px;
}
.mw-submit:disabled {
  background: #c8ccd4;
}
.mw-warn {
  margin: 8px 0 0;
  font-size: 12px;
  color: #d4380d;
}
.mw-error {
  margin: 0;
  color: #d4380d;
  font-size: 13px;
}
</style>
