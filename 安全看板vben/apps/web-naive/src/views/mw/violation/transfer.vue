<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 公司管理人员转派
 *
 * 流程（严格两段式，禁止自由文本填责任人）：
 *   选择责任乡镇/区域 → 读取该区域可指派管理员 → 选择管理员 → 提交转派
 *
 * 核心业务约束：**发现人 ≠ 整改人**（core/flow.ts assertCanTransfer）。
 * 公司管理人员可以是「发现人」，责任乡镇管理员是「整改人」。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  getAreaManagers,
  getAreas,
  getBundle,
  transferOut,
} from '#/api/mw';
import type { Area, MobileAccount, ViolationRecord } from '#/api/mw';
import { canTransfer } from '#/api/mw/core/scope';
import { errText, fmtTime, useAccount } from '../shared';

defineOptions({ name: 'MwTransfer' });

const route = useRoute();
const router = useRouter();
const { account, ensure } = useAccount();

const violationId = String(route.query.id || '');
const record = ref<ViolationRecord | null>(null);
const areas = ref<Area[]>([]);
const managers = ref<MobileAccount[]>([]);
const areaCode = ref('');
const toAccountId = ref('');
const remark = ref('');
const loading = ref(false);
const errorMsg = ref('');

const mayTransfer = computed(() =>
  account.value ? canTransfer(account.value) : false,
);
const canSubmit = computed(
  () =>
    mayTransfer.value &&
    !!areaCode.value &&
    !!toAccountId.value &&
    !loading.value,
);

async function loadManagers() {
  managers.value = [];
  toAccountId.value = '';
  if (!areaCode.value || !account.value) return;
  managers.value = await getAreaManagers(areaCode.value, account.value.accountId);
}

watch(areaCode, () => void loadManagers());

async function submit() {
  if (!account.value) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    await transferOut(
      violationId,
      {
        toAreaCode: areaCode.value,
        toAccountId: toAccountId.value,
        remark: remark.value,
      },
      account.value,
    );
    await router.replace('/mw/task');
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const a = await ensure();
  if (!a) return;
  if (!mayTransfer.value) {
    errorMsg.value = '当前账号不是公司管理人员，无转派权限';
    return;
  }
  const bundle = await getBundle(violationId);
  if (!bundle) {
    errorMsg.value = '三违记录不存在';
    return;
  }
  record.value = bundle.record;
  areas.value = await getAreas();
});
</script>

<template>
  <div class="mw-page">
    <div class="m-card mw-head">
      <div class="mw-head__id">{{ violationId }}</div>
      <div v-if="record" class="mw-head__sub">
        {{ record.violator?.name || '未选人员' }} ·
        {{ record.rule?.name || '未选行为' }}
      </div>
    </div>

    <div class="m-card mw-sec">
      <div class="mw-sec__t">
        第 1 步 · 选择责任乡镇 / 区域
        <span class="mw-sec__req">必须</span>
      </div>
      <div class="mw-pick">
        <button
          v-for="a in areas"
          :key="a.areaCode"
          class="mw-pick__item m-btn"
          type="button"
          :class="{ 'is-on': areaCode === a.areaCode }"
          @click="areaCode = a.areaCode"
        >
          {{ a.areaName }}
        </button>
      </div>
      <p v-if="areas.length === 0" class="mw-warn">
        暂无可转派区域（TEST 数据为空属正常，真实区域表待下一阶段录入）
      </p>
    </div>

    <div class="m-card mw-sec">
      <div class="mw-sec__t">
        第 2 步 · 选择责任管理员
        <span class="mw-sec__req">必须</span>
      </div>
      <div class="mw-pick">
        <button
          v-for="m in managers"
          :key="m.accountId"
          class="mw-pick__item m-btn"
          type="button"
          :class="{ 'is-on': toAccountId === m.accountId }"
          @click="toAccountId = m.accountId"
        >
          {{ m.name }} · {{ m.position || m.dept }}
        </button>
      </div>
      <p v-if="areaCode && managers.length === 0" class="mw-warn">
        该区域暂无可指派管理员
      </p>
      <p v-else-if="!areaCode" class="mw-warn2">请先选择责任区域</p>
    </div>

    <div class="m-card mw-sec">
      <div class="mw-sec__t">转派说明（选填）</div>
      <textarea
        v-model="remark"
        class="mw-ta"
        rows="2"
        placeholder="补充要求、整改时限等"
      ></textarea>
    </div>

    <div class="m-card mw-note">
      <p class="mw-note__d">
        <strong>发现人 ≠ 整改人</strong>：转派后由责任管理员完成整改并拍照反馈，
        你作为发起人可在「我的任务」中查看反馈结果。
      </p>
    </div>

    <button
      class="m-card mw-submit m-btn"
      type="button"
      :disabled="!canSubmit"
      @click="submit"
    >
      {{ loading ? '提交中…' : '提交转派' }}
    </button>

    <p v-if="record" class="mw-meta">
      发现时间 {{ fmtTime(record.discoveredAt) }} · 发现人
      {{ record.discoverName }}
    </p>
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
.mw-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mw-pick__item {
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  background: #fff;
  font-size: 14px;
}
.mw-pick__item.is-on {
  border-color: #2f7dcd;
  background: #eaf3fc;
  color: #2f7dcd;
  font-weight: 600;
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
.mw-note {
  padding: 12px 16px;
}
.mw-note__d {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
}
.mw-submit {
  padding: 16px;
  border: none;
  background: #389e0d;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  border-radius: 10px;
}
.mw-submit:disabled {
  background: #c8ccd4;
}
.mw-meta {
  margin: 0;
  font-size: 12px;
  color: #8a8f99;
  text-align: center;
}
.mw-warn {
  margin: 8px 0 0;
  font-size: 12px;
  color: #d4380d;
}
.mw-warn2 {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a8f99;
}
.mw-error {
  margin: 0;
  color: #d4380d;
  font-size: 13px;
}
</style>
