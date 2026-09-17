<script lang="ts" setup>
/**
 * H5-GRID-UI-01 · 03 开始巡查
 *
 * 展示（全部自动带出，用户零输入）：
 *   - 当前巡查人员（employeeName）+ employee_code（业务身份）
 *   - 当前组织 / 作业单元 / 岗位（网格长身份信息，来自 GET /api/current-employee）
 *   - 巡查开始时间（本机时间，仅展示；权威时间以服务端入库为准）
 * 核心按钮：【开始取证】 → 现场取证页（拍照优先）。
 * fail-closed：身份解析失败（未绑定员工档案等）时禁止进入取证，展示服务端中文原因。
 */
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import {
  ensureContext,
  flowContext,
  flowState,
  startInspection,
} from './flow';

defineOptions({ name: 'MobileInspectionStart' });

const router = useRouter();

onMounted(() => {
  void ensureContext();
});

const ctx = computed(() => flowContext.value);

const identityLines = computed(() => {
  const c = ctx.value;
  if (!c) return [];
  return [c.position, c.organization, c.operationUnit]
    .map((v) => (v ?? '').trim())
    .filter((v) => v !== '');
});

function onStart() {
  if (!ctx.value) return;
  startInspection();
  void router.push('/mobile/inspection/capture');
}

function retryContext() {
  void ensureContext(true);
}
</script>

<template>
  <div class="start-page">
    <section v-if="flowState.contextLoading" class="card">
      <p class="card__hint">正在获取当前巡查人员身份…</p>
    </section>

    <template v-if="ctx">
      <section class="card">
        <h2 class="card__title">当前巡查人员</h2>
        <p class="identity__name">{{ ctx.employeeName }}</p>
        <p class="identity__code">员工编码 {{ ctx.employeeCode || '—' }}</p>
        <p v-if="identityLines.length" class="identity__org">
          {{ identityLines.join(' · ') }}
        </p>
        <p class="card__desc">身份由登录账号自动确定，不可修改。</p>
      </section>

      <section class="card">
        <h2 class="card__title">巡查开始</h2>
        <p class="card__hint">进入现场后请优先拍摄取证，再判断现场情况。</p>
      </section>

      <button type="button" class="primary-btn m-btn" @click="onStart">
        开始取证
      </button>
      <p class="footnote">取证过程中可随时拍照；巡查结果在取证后判断。</p>
    </template>

    <template v-else-if="!flowState.contextLoading && flowState.contextError">
      <p class="form-error" role="alert">{{ flowState.contextError }}</p>
      <button type="button" class="retry-btn m-btn" @click="retryContext">
        重试
      </button>
    </template>
  </div>
</template>

<style scoped>
.start-page {
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

.card__hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #646a73;
}

.card__desc {
  margin: 10px 0 0;
  font-size: 12px;
  color: #8a8f99;
}

.identity__name {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1f2329;
}

.identity__code {
  margin: 6px 0 0;
  font-size: 13px;
  color: #2f7dcd;
  font-weight: 600;
}

.identity__org {
  margin: 6px 0 0;
  font-size: 13px;
  color: #646a73;
}

.primary-btn {
  width: 100%;
  border: none;
  background: #2f7dcd;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  min-height: 54px;
  border-radius: 14px;
  cursor: pointer;
}

.retry-btn {
  width: 100%;
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #2f7dcd;
  font-size: 15px;
  font-weight: 600;
  min-height: 46px;
  border-radius: 12px;
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

.footnote {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #8a8f99;
}
</style>
