<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 三违上报第一步：**拍现场照片**
 *
 * 冻结规则（不可改变的顺序）：
 *   拍现场照片【必须】 → 生成三违记录ID → 选违章人员 → 选三违行为 → 整改/转派
 *
 * 因此本页是三违上报的**强制入口**：没有 BEFORE 照片就不允许往下走，
 * 也就不存在「先建记录再补照片」的可能。
 *
 * 照片落到持久化暂存区（IndexedDB），不是组件内存 —— 切后台/来电话不丢；
 * 生成三违记录ID 之后由适配层一次性绑定到该记录。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  beginDraft,
  createViolationFromDraft,
  currentDraftId,
  getAreas,
  listStagedPhotos,
  removeStaged,
  stageBeforePhoto,
  stagedPhotoDataUrl,
} from '#/api/mw';
import type { Area } from '#/api/mw';
import { errText, pickImage, useAccount } from '../shared';

defineOptions({ name: 'MwCapture' });

const router = useRouter();
const { account, ensure } = useAccount();

const draftId = ref('');
const photos = ref<Array<{ id: string; url: string; fileName: string }>>([]);
const location = ref('');
const areaCode = ref('');
const areas = ref<Area[]>([]);
const loading = ref(false);
const errorMsg = ref('');
const busy = ref(false);

const canNext = computed(() => photos.value.length > 0);

async function refreshPhotos() {
  const list = await Promise.all(
    (await listStagedPhotos(draftId.value)).map(async (p) => ({
      id: p.id,
      fileName: p.fileName,
      url: await stagedPhotoDataUrl(p.id),
    })),
  );
  photos.value = list;
}

async function takePhoto() {
  errorMsg.value = '';
  const file = await pickImage();
  if (!file) return;
  busy.value = true;
  try {
    await stageBeforePhoto(draftId.value, file, file.name || 'before.jpg', account.value?.accountId || '');
    await refreshPhotos();
  } catch (e) {
    errorMsg.value = errText(e, '照片保存失败，请重试');
  } finally {
    busy.value = false;
  }
}

async function dropPhoto(id: string) {
  await removeStaged(id);
  await refreshPhotos();
}

async function next() {
  if (!canNext.value) {
    errorMsg.value = '请先拍摄现场照片';
    return;
  }
  if (!account.value) return;
  errorMsg.value = '';
  loading.value = true;
  try {
    const rec = await createViolationFromDraft({
      draftId: draftId.value,
      account: account.value,
      location: location.value,
      discoverAreaCode: areaCode.value,
    });
    await router.replace(`/mw/violation/person?id=${encodeURIComponent(rec.violationId)}`);
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const a = await ensure();
  if (!a) return;
  areas.value = await getAreas();
  draftId.value = currentDraftId() || beginDraft();
  if (!draftId.value) draftId.value = beginDraft();
  await refreshPhotos();
});
</script>

<template>
  <div class="mw-page">
    <div class="m-card mw-step">
      <div class="mw-step__num">第 1 步 / 共 5 步</div>
      <h2 class="mw-step__title">拍现场照片</h2>
      <p class="mw-step__desc">
        现场照片是三违事件的<strong>第一步</strong>。拍完才能生成三违记录ID。
      </p>
    </div>

    <div class="m-card mw-photos">
      <button class="mw-shot m-btn" type="button" :disabled="busy" @click="takePhoto">
        <span class="mw-shot__icon">📷</span>
        <span class="mw-shot__text">{{ busy ? '处理中…' : '拍照 / 选择现场照片' }}</span>
      </button>

      <div v-if="photos.length" class="mw-thumbs">
        <div v-for="p in photos" :key="p.id" class="mw-thumb">
          <img v-if="p.url" :src="p.url" alt="现场照片" />
          <div v-else class="mw-thumb__na">无预览</div>
          <button class="mw-thumb__del" type="button" @click="dropPhoto(p.id)">×</button>
        </div>
      </div>
      <p v-else class="mw-hint">尚未拍摄现场照片</p>
    </div>

    <div class="m-card mw-form">
      <label class="mw-label" for="mw-loc">发现地点（选填）</label>
      <input id="mw-loc" v-model="location" class="mw-input" placeholder="如：甲镇主街中段" />

      <label class="mw-label" for="mw-area">检查区域分类（选填）</label>
      <select id="mw-area" v-model="areaCode" class="mw-input">
        <option value="">未指定</option>
        <option v-for="a in areas" :key="a.areaCode" :value="a.areaCode">
          {{ a.areaName }}
        </option>
      </select>
      <p class="mw-tip">
        「公司管理」是历史检查区域分类，不是部门：组织归属与检查区域是两个不同维度。
      </p>
    </div>

    <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>

    <button
      class="mw-btn mw-btn--primary"
      type="button"
      :disabled="!canNext || loading"
      @click="next"
    >
      {{ loading ? '生成中…' : '下一步：生成三违记录ID' }}
    </button>
  </div>
</template>

<style scoped>
.mw-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mw-step {
  padding: 14px 16px;
}

.mw-step__num {
  font-size: 12px;
  color: #2f7dcd;
  font-weight: 600;
}

.mw-step__title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
}

.mw-step__desc {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: #646a73;
}

.mw-photos {
  padding: 14px 16px;
}

.mw-shot {
  width: 100%;
  min-height: 96px;
  gap: 10px;
  border: 2px dashed #c9d6e4;
  border-radius: 12px;
  background: #f7fafd;
  color: #2f7dcd;
  font-size: 16px;
  font-weight: 600;
}

.mw-shot__icon {
  font-size: 30px;
}

.mw-thumbs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.mw-thumb {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  background: #f2f3f5;
}

.mw-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mw-thumb__na {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: #8a8f99;
}

.mw-thumb__del {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 16px;
  line-height: 1;
}

.mw-hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: #8a8f99;
  text-align: center;
}

.mw-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.mw-label {
  font-size: 13px;
  color: #646a73;
}

.mw-input {
  height: 46px;
  padding: 0 12px;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  background: #fff;
  font-size: 16px;
  color: #1f2329;
}

.mw-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}

.mw-error {
  margin: 0;
  color: #d4380d;
  font-size: 13px;
}

.mw-btn {
  min-height: 50px;
  border: none;
  border-radius: 12px;
  background: #f2f3f5;
  color: #1f2329;
  font-size: 16px;
  font-weight: 600;
}

.mw-btn--primary {
  background: #2f7dcd;
  color: #fff;
}

.mw-btn:disabled {
  opacity: 0.55;
}
</style>
