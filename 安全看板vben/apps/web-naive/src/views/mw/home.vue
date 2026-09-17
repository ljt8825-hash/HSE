<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 移动首页
 *
 * 五个入口：巡查 / 三违上报 / 我的整改 / 我的复查 / 我的任务。
 * 「三违上报」是主入口，进入后第一步就是拍现场照片（冻结规则）。
 *
 * 说明：「巡查」在本阶段（NODE-01）仅占位——本阶段范围限定为三违业务骨架，
 * 不做假实现，避免伪造成品功能。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { listMyBuckets, transportInfo } from '#/api/mw';
import { describeScope } from '#/api/mw/core/scope';
import { errText, useAccount } from './shared';

defineOptions({ name: 'MwHome' });

const router = useRouter();
const { account, ensure } = useAccount();
const info = transportInfo();

const counts = ref({ rectify: 0, review: 0, task: 0 });
const loading = ref(true);
const errorMsg = ref('');

const scopeText = computed(() => describeScope(account.value?.scope));

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const a = await ensure();
    if (!a) return;
    const b = await listMyBuckets(a.accountId);
    counts.value = {
      rectify: b.rectify.length,
      review: b.review.length,
      task: b.task.length,
    };
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    loading.value = false;
  }
}

function go(path: string) {
  void router.push(path);
}

onMounted(load);
</script>

<template>
  <div class="mw-home">
    <div class="m-card mw-home__me">
      <div class="mw-home__name">{{ account?.name || '—' }}</div>
      <div class="mw-home__meta">
        {{ account?.position || '—' }} · {{ account?.dept || '—' }}
      </div>
      <div class="mw-home__meta">检查范围：{{ scopeText }}</div>
    </div>

    <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>
    <div v-if="loading" class="m-skeleton mw-home__sk" />

    <button class="m-card mw-entry mw-entry--main m-btn" type="button" @click="go('/mw/violation/capture')">
      <div class="mw-entry__icon">📷</div>
      <div class="mw-entry__body">
        <div class="mw-entry__title">三违上报</div>
        <div class="mw-entry__desc">先拍现场照片 → 生成三违记录ID</div>
      </div>
      <div class="mw-entry__arrow">›</div>
    </button>

    <div class="mw-grid">
      <button class="m-card mw-entry m-btn" type="button" @click="go('/mw/rectify')">
        <div class="mw-entry__icon">🔧</div>
        <div class="mw-entry__title">我的整改</div>
        <div class="mw-entry__badge" :class="{ 'is-zero': counts.rectify === 0 }">
          {{ counts.rectify }}
        </div>
      </button>

      <button class="m-card mw-entry m-btn" type="button" @click="go('/mw/review')">
        <div class="mw-entry__icon">✅</div>
        <div class="mw-entry__title">我的复查</div>
        <div class="mw-entry__badge" :class="{ 'is-zero': counts.review === 0 }">
          {{ counts.review }}
        </div>
      </button>

      <button class="m-card mw-entry m-btn" type="button" @click="go('/mw/task')">
        <div class="mw-entry__icon">📋</div>
        <div class="mw-entry__title">我的任务</div>
        <div class="mw-entry__badge" :class="{ 'is-zero': counts.task === 0 }">
          {{ counts.task }}
        </div>
      </button>

      <button class="m-card mw-entry mw-entry--off m-btn" type="button" disabled>
        <div class="mw-entry__icon">🧭</div>
        <div class="mw-entry__title">巡查</div>
        <div class="mw-entry__off">本阶段未开放</div>
      </button>
    </div>

    <div class="m-card mw-home__note">
      <div class="mw-home__note-t">当前数据源</div>
      <div class="mw-home__note-b">{{ info.label }} · {{ info.kind }}</div>
      <div class="mw-home__note-d">{{ info.description }}</div>
    </div>
  </div>
</template>

<style scoped>
.mw-home {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mw-home__me {
  padding: 16px;
}

.mw-home__name {
  font-size: 18px;
  font-weight: 600;
}

.mw-home__meta {
  margin-top: 4px;
  font-size: 13px;
  color: #646a73;
}

.mw-home__sk {
  height: 96px;
}

.mw-error {
  margin: 0;
  color: #d4380d;
  font-size: 13px;
}

.mw-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: none;
  text-align: left;
  background: #fff;
}

.mw-entry--main {
  padding: 18px 16px;
  background: linear-gradient(180deg, #eaf3fc, #ffffff);
}

.mw-entry__icon {
  font-size: 26px;
  line-height: 1;
}

.mw-entry__body {
  flex: 1 1 auto;
  min-width: 0;
}

.mw-entry__title {
  font-size: 16px;
  font-weight: 600;
}

.mw-entry__desc {
  margin-top: 3px;
  font-size: 12px;
  color: #646a73;
}

.mw-entry__arrow {
  font-size: 24px;
  color: #8a8f99;
}

.mw-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mw-grid .mw-entry {
  position: relative;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.mw-entry__badge {
  min-width: 24px;
  padding: 1px 8px;
  border-radius: 999px;
  background: #d4380d;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.mw-entry__badge.is-zero {
  background: #f2f3f5;
  color: #8a8f99;
}

.mw-entry--off {
  opacity: 0.6;
}

.mw-entry__off {
  font-size: 11px;
  color: #8a8f99;
}

.mw-home__note {
  padding: 14px 16px;
}

.mw-home__note-t {
  font-size: 12px;
  color: #8a8f99;
}

.mw-home__note-b {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
}

.mw-home__note-d {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #646a73;
}
</style>
