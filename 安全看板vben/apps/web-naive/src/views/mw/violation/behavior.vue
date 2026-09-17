<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 第 3 步：选择三违行为
 *
 * 硬约束：三违行为**只能**来自 WPS 三违规则表。
 * 严禁在前端写 `const violations = [...]`。
 * NODE-01 真实规则尚未提供 ⇒ 列表为空或仅显示显式 TEST 占位数据（页面会明确标注）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getBundle, getEnabledRules, selectRule } from '#/api/mw';
import type { ViolationRecord, ViolationRule } from '#/api/mw';
import { errText, useAccount } from '../shared';

defineOptions({ name: 'MwBehavior' });

const route = useRoute();
const router = useRouter();
const { ensure } = useAccount();

const violationId = String(route.query.id || '');
const record = ref<ViolationRecord | null>(null);
const rules = ref<ViolationRule[]>([]);
const selectedId = ref('');
const loading = ref(false);
const errorMsg = ref('');

const groups = computed(() => {
  const m = new Map<string, ViolationRule[]>();
  for (const r of rules.value) {
    const k = r.category || '未分类';
    if (!m.has(k)) m.set(k, []);
    m.get(k)?.push(r);
  }
  return [...m.entries()];
});

async function next() {
  if (!selectedId.value) {
    errorMsg.value = '请选择三违行为';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    await selectRule(violationId, selectedId.value);
    await router.replace(`/mw/violation/dispose?id=${encodeURIComponent(violationId)}`);
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!(await ensure())) return;
  const bundle = await getBundle(violationId);
  if (!bundle) {
    errorMsg.value = '三违记录不存在';
    return;
  }
  if (!bundle.record.violator) {
    await router.replace(`/mw/violation/person?id=${encodeURIComponent(violationId)}`);
    return;
  }
  record.value = bundle.record;
  rules.value = await getEnabledRules();
});
</script>

<template>
  <div class="mw-page">
    <div class="m-card mw-step">
      <div class="mw-step__num">第 3 步 / 共 5 步</div>
      <h2 class="mw-step__title">选择三违行为</h2>
      <p v-if="record?.violator" class="mw-step__desc">
        违章人员：<strong>{{ record.violator.name }}</strong
        >（{{ record.violator.employeeId }}）
      </p>
    </div>

    <div v-if="!rules.length" class="m-card mw-empty">
      <p class="mw-empty__t">三违行为表暂无可用数据</p>
      <p class="mw-empty__d">
        真实三违行为数据由项目负责人提供后导入 WPS「三违行为表」。
        本阶段不伪造正式业务数据。
      </p>
    </div>

    <div v-for="[cat, list] in groups" :key="cat" class="m-card mw-group">
      <div class="mw-group__t">{{ cat }}</div>
      <button
        v-for="r in list"
        :key="r.ruleId"
        class="mw-row m-btn"
        type="button"
        :class="{ 'is-active': selectedId === r.ruleId }"
        @click="selectedId = r.ruleId"
      >
        <div class="mw-row__main">
          <div class="mw-row__name">{{ r.name }}</div>
          <div v-if="r.description" class="mw-row__sub">{{ r.description }}</div>
        </div>
        <span class="mw-row__check">{{ selectedId === r.ruleId ? '✓' : '' }}</span>
      </button>
    </div>

    <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>

    <button class="mw-btn mw-btn--primary" type="button" :disabled="!selectedId || loading" @click="next">
      {{ loading ? '保存中…' : '下一步：处置方式' }}
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
.mw-empty {
  padding: 20px 16px;
  text-align: center;
}
.mw-empty__t {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #ad6800;
}
.mw-empty__d {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}
.mw-group {
  padding: 4px 0;
}
.mw-group__t {
  padding: 10px 16px 6px;
  font-size: 13px;
  font-weight: 600;
  color: #646a73;
}
.mw-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-top: 1px solid #f2f3f5;
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
  font-size: 15px;
  font-weight: 600;
}
.mw-row__sub {
  margin-top: 2px;
  font-size: 12px;
  color: #8a8f99;
  line-height: 1.5;
}
.mw-row__check {
  color: #2f7dcd;
  font-size: 18px;
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
