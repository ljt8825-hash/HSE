<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 第 4 步：处置方式（三选一）
 *
 * ① 立即整改：现在就拍整改后照片提交（乡镇经理/管理员自查自纠）
 * ② 暂不整改：记录挂起为「待整改」，之后从「我的整改」进入补整改
 * ③ 转派责任乡镇/管理员：仅公司管理人员 —— **发现人 ≠ 整改人**
 *
 * 三条路径共用同一个三违记录ID，后续所有照片/整改/转派/复查都挂在这条记录上。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { decideLater, decideRectifyNow, getBundle } from '#/api/mw';
import type { ViolationRecord } from '#/api/mw';
import { canTransfer } from '#/api/mw/core/scope';
import { errText, useAccount } from '../shared';

defineOptions({ name: 'MwDispose' });

const route = useRoute();
const router = useRouter();
const { account, ensure } = useAccount();

const violationId = String(route.query.id || '');
const record = ref<ViolationRecord | null>(null);
const loading = ref(false);
const errorMsg = ref('');

const mayTransfer = computed(() =>
  account.value ? canTransfer(account.value) : false,
);

async function goNow() {
  if (!account.value) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    await decideRectifyNow(violationId, account.value);
    await router.replace(`/mw/violation/rectify?id=${encodeURIComponent(violationId)}`);
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    loading.value = false;
  }
}

async function goLater() {
  loading.value = true;
  errorMsg.value = '';
  try {
    await decideLater(violationId);
    await router.replace('/mw/rectify');
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    loading.value = false;
  }
}

function goTransfer() {
  void router.push(`/mw/violation/transfer?id=${encodeURIComponent(violationId)}`);
}

onMounted(async () => {
  if (!(await ensure())) return;
  const bundle = await getBundle(violationId);
  if (!bundle) {
    errorMsg.value = '三违记录不存在';
    return;
  }
  if (!bundle.record.violator || !bundle.record.rule) {
    await router.replace(`/mw/violation/behavior?id=${encodeURIComponent(violationId)}`);
    return;
  }
  record.value = bundle.record;
});
</script>

<template>
  <div class="mw-page">
    <div class="m-card mw-step">
      <div class="mw-step__num">第 4 步 / 共 5 步</div>
      <h2 class="mw-step__title">选择处置方式</h2>
      <p v-if="record" class="mw-step__desc">
        {{ record.violationId }} · {{ record.violator?.name }} · {{ record.rule?.name }}
      </p>
    </div>

    <button class="m-card mw-opt mw-opt--now m-btn" type="button" :disabled="loading" @click="goNow">
      <span class="mw-opt__icon">🔧</span>
      <span class="mw-opt__body">
        <span class="mw-opt__t">立即整改</span>
        <span class="mw-opt__d">现在拍整改后照片并提交</span>
      </span>
    </button>

    <button class="m-card mw-opt mw-opt--later m-btn" type="button" :disabled="loading" @click="goLater">
      <span class="mw-opt__icon">⏸</span>
      <span class="mw-opt__body">
        <span class="mw-opt__t">暂不整改</span>
        <span class="mw-opt__d">挂起为「待整改」，之后从我的整改处理</span>
      </span>
    </button>

    <button
      class="m-card mw-opt mw-opt--trans m-btn"
      type="button"
      :disabled="!mayTransfer || loading"
      @click="goTransfer"
    >
      <span class="mw-opt__icon">➡️</span>
      <span class="mw-opt__body">
        <span class="mw-opt__t">转派责任乡镇 / 管理员</span>
        <span class="mw-opt__d">
          {{ mayTransfer ? '指定责任区域与管理员（发现人 ≠ 整改人）' : '仅公司管理人员可转派' }}
        </span>
      </span>
    </button>

    <div class="m-card mw-note">
      <p class="mw-note__d">
        无论选哪条路径，三违记录都<strong>不会删除</strong>；
        后续照片、整改、转派、复查全部通过同一个三违记录ID 关联。
      </p>
    </div>

    <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>
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
  color: #646a73;
}
.mw-opt {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 18px 16px;
  border: none;
  text-align: left;
}
.mw-opt__icon {
  font-size: 28px;
}
.mw-opt__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.mw-opt__t {
  font-size: 17px;
  font-weight: 600;
}
.mw-opt__d {
  font-size: 12px;
  color: #646a73;
  line-height: 1.5;
}
.mw-opt--now {
  background: linear-gradient(180deg, #eaf3fc, #fff);
}
.mw-opt--later {
  background: linear-gradient(180deg, #fff7e6, #fff);
}
.mw-opt--trans {
  background: linear-gradient(180deg, #f6ffed, #fff);
}
.mw-opt:disabled {
  opacity: 0.55;
}
.mw-note {
  padding: 12px 16px;
}
.mw-note__d {
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
</style>
