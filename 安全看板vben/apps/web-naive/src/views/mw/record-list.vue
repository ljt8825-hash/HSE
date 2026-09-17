<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 记录清单组件（我的整改 / 我的复查 / 我的任务 / 全部）
 *
 * 分桶逻辑在 api/mw 的 listMyBuckets，页面不做业务判断。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { listMyBuckets } from '#/api/mw';
import type { ViolationRecord } from '#/api/mw';
import { fmtTime, statusLabel, statusTone, useAccount } from './shared';

const props = defineProps<{
  mode: 'rectify' | 'review' | 'task' | 'all';
  title: string;
  emptyText: string;
}>();

defineOptions({ name: 'MwRecordList' });

const router = useRouter();
const { account, ensure } = useAccount();
const list = ref<ViolationRecord[]>([]);
const loading = ref(false);

const shown = computed(() => list.value);

async function load() {
  const a = await ensure();
  if (!a) return;
  loading.value = true;
  try {
    const buckets = await listMyBuckets(a.accountId);
    list.value = buckets[props.mode] || [];
  } finally {
    loading.value = false;
  }
}

function open(r: ViolationRecord) {
  void router.push(`/mw/record?id=${encodeURIComponent(r.violationId)}`);
}

function goCapture() {
  void router.push('/mw/violation/capture');
}

onMounted(load);
defineExpose({ load });
</script>

<template>
  <div class="mw-page">
    <div class="m-card mw-head">
      <h2 class="mw-head__t">{{ title }}</h2>
      <p v-if="account" class="mw-head__s">{{ account.name }} · {{ account.dept }}</p>
    </div>

    <div v-if="loading" class="m-card mw-empty">加载中…</div>

    <template v-else>
      <button
        v-for="r in shown"
        :key="r.violationId"
        class="m-card mw-item m-btn"
        type="button"
        @click="open(r)"
      >
        <div class="mw-item__top">
          <span class="mw-item__id">{{ r.violationId }}</span>
          <span class="mw-badge" :class="`is-${statusTone(r.status)}`">
            {{ statusLabel(r.status) }}
          </span>
        </div>
        <div class="mw-item__row">
          {{ r.violator?.name || '未选人员' }}
          <span class="mw-item__dot">·</span>
          {{ r.rule?.name || '未选行为' }}
        </div>
        <div class="mw-item__meta">
          <span>{{ fmtTime(r.discoveredAt) }}</span>
          <span v-if="r.location"> · {{ r.location }}</span>
          <span v-if="r.rectifyName"> · 整改：{{ r.rectifyName }}</span>
        </div>
      </button>

      <div v-if="shown.length === 0" class="m-card mw-empty">
        <p class="mw-empty__t">{{ emptyText }}</p>
        <button class="mw-empty__btn m-btn" type="button" @click="goCapture">
          去拍现场照片
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mw-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mw-head {
  padding: 14px 16px;
}
.mw-head__t {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.mw-head__s {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a8f99;
}
.mw-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  border: none;
}
.mw-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mw-item__id {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 14px;
  font-weight: 600;
}
.mw-item__row {
  margin-top: 6px;
  font-size: 14px;
}
.mw-item__dot {
  margin: 0 6px;
  color: #c8ccd4;
}
.mw-item__meta {
  margin-top: 4px;
  font-size: 12px;
  color: #8a8f99;
}
.mw-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  white-space: nowrap;
}
.mw-badge.is-gray {
  background: #f2f3f5;
  color: #646a73;
}
.mw-badge.is-orange {
  background: #fff3e6;
  color: #d46b08;
}
.mw-badge.is-blue {
  background: #e6f4ff;
  color: #0958d9;
}
.mw-badge.is-purple {
  background: #f9f0ff;
  color: #531dab;
}
.mw-badge.is-green {
  background: #f6ffed;
  color: #389e0d;
}
.mw-badge.is-red {
  background: #fff1f0;
  color: #cf1322;
}
.mw-empty {
  padding: 28px 16px;
  text-align: center;
  color: #8a8f99;
}
.mw-empty__t {
  margin: 0 0 12px;
  font-size: 13px;
}
.mw-empty__btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #2f7dcd;
  color: #fff;
  font-size: 14px;
}
</style>
