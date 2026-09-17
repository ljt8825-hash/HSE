<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 第 2 步：选择违章人员
 *
 * 硬约束：
 * 1. 进入本页前记录必须已有 BEFORE 照片（否则退回第一步，杜绝「先建记录后补照片」）。
 * 2. 候选池按登录人的部门/作业单元/班组/网格等级过滤，**不加载全公司名单**。
 * 3. 禁止「输入姓名 → 前端猜员工ID」：搜索只缩小列表，选中必须是带 employeeId 的员工对象。
 * 4. 选中后带出的姓名/性别/职位/班组/作业单元/乡镇为**只读身份快照**。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getBundle, searchCandidates, selectViolator } from '#/api/mw';
import type { RosterEmployee, ViolationRecord } from '#/api/mw';
import { errText, useAccount } from '../shared';

defineOptions({ name: 'MwPerson' });

const route = useRoute();
const router = useRouter();
const { account, ensure } = useAccount();

const violationId = String(route.query.id || '');
const record = ref<ViolationRecord | null>(null);
const pool = ref<RosterEmployee[]>([]);
const keyword = ref('');
const selected = ref<RosterEmployee | null>(null);
const loading = ref(false);
const errorMsg = ref('');

const results = computed(() => pool.value);

async function search() {
  if (!account.value) return;
  pool.value = await searchCandidates(account.value, keyword.value);
}

async function pick(emp: RosterEmployee) {
  selected.value = emp;
  errorMsg.value = '';
}

async function next() {
  if (!selected.value || !account.value) {
    errorMsg.value = '请选择违章人员';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    await selectViolator(violationId, selected.value.employeeId, account.value);
    await router.replace(`/mw/violation/behavior?id=${encodeURIComponent(violationId)}`);
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const a = await ensure();
  if (!a) return;
  const bundle = await getBundle(violationId);
  if (!bundle) {
    errorMsg.value = '三违记录不存在';
    return;
  }
  if (!bundle.photos.some((p) => p.photoType === 'BEFORE')) {
    // 顺序守卫：没有现场照片就退回第一步
    await router.replace('/mw/violation/capture');
    return;
  }
  record.value = bundle.record;
  await search();
});
</script>

<template>
  <div class="mw-page">
    <div class="m-card mw-step">
      <div class="mw-step__num">第 2 步 / 共 5 步</div>
      <h2 class="mw-step__title">选择违章人员</h2>
      <p v-if="record" class="mw-step__desc">
        三违记录ID：<strong>{{ record.violationId }}</strong>
      </p>
    </div>

    <div class="m-card mw-search">
      <input
        v-model="keyword"
        class="mw-input"
        placeholder="搜索姓名 / 员工ID / 班组"
        @input="search"
      />
      <p class="mw-tip">
        仅显示你检查范围内的人员（{{ pool.length }} 人）。不允许手工输入姓名代替选择。
      </p>
    </div>

    <div class="m-card mw-list">
      <button
        v-for="emp in results"
        :key="emp.employeeId"
        class="mw-row m-btn"
        type="button"
        :class="{ 'is-active': selected?.employeeId === emp.employeeId }"
        @click="pick(emp)"
      >
        <div class="mw-row__main">
          <div class="mw-row__name">{{ emp.name }}</div>
          <div class="mw-row__sub">
            {{ emp.employeeId }} · {{ emp.position || '—' }} · {{ emp.team || '—' }}
          </div>
          <div class="mw-row__sub">
            {{ emp.workUnit || '—' }} · {{ emp.township || '—' }}
          </div>
        </div>
        <span class="mw-row__check">{{ selected?.employeeId === emp.employeeId ? '✓' : '' }}</span>
      </button>
      <p v-if="!results.length" class="mw-hint">范围内没有匹配人员</p>
    </div>

    <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>

    <button class="mw-btn mw-btn--primary" type="button" :disabled="!selected || loading" @click="next">
      {{ loading ? '保存中…' : '下一步：选择三违行为' }}
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
  color: #646a73;
}
.mw-search {
  padding: 14px 16px;
}
.mw-input {
  width: 100%;
  height: 46px;
  padding: 0 12px;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  background: #fff;
  font-size: 16px;
  color: #1f2329;
}
.mw-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a8f99;
}
.mw-list {
  padding: 4px 0;
}
.mw-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-bottom: 1px solid #f2f3f5;
  background: transparent;
  text-align: left;
}
.mw-row.is-active {
  background: #eaf3fc;
}
.mw-row__main {
  flex: 1 1 auto;
  min-width: 0;
}
.mw-row__name {
  font-size: 16px;
  font-weight: 600;
}
.mw-row__sub {
  margin-top: 2px;
  font-size: 12px;
  color: #646a73;
}
.mw-row__check {
  color: #2f7dcd;
  font-size: 18px;
}
.mw-hint {
  padding: 16px;
  margin: 0;
  font-size: 13px;
  color: #8a8f99;
  text-align: center;
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
