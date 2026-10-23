<script lang="ts" setup>
/**
 * 结果冻结（web-naive · 阶段06B-3）
 * 契约来源：apps/web-antd/src/views/hse/assessment-monthly/freeze.vue + assessment-monthly.ts
 * 能力：周期下拉(默认首条, getAssessmentCycle 取详情) / 当前周期状态卡(target_count/scored_count/reviewed_count 与冻结/未冻结图标) /
 *      冻结(freezeAssessmentCycle，仅 reviewed 或 pending_review 可冻结，二次确认) /
 *      解冻(unfreezeAssessmentCycle，必填原因) / 刷新状态 / 右侧「冻结说明」时间线+注意事项卡。
 * 布局说明：本页非「目录/树选择对象」场景，依 01-强制设计约束.md 第6节采用单列布局（状态卡在上，冻结说明在下）。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NDivider,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTimeline,
  NTimelineItem,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseActionBar, HsePageLayout, HseStatusTag, ASSESSMENT_CYCLE_STATUS_TAG as STATUS_TAG, type HseActionKey } from '#/components/hse';
import {
  freezeAssessmentCycle,
  getAssessmentCycle,
  getAssessmentCycleList,
  unfreezeAssessmentCycle,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyFreeze' });

const cycleLoading = ref(false);
const freezing = ref(false);
const unfreezing = ref(false);
const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const selectedCycleId = ref<number | string | undefined>();
const currentCycle = ref<AssessmentMonthlyApi.AssessmentCycle | null>(null);

const unfreezeModalOpen = ref(false);
const unfreezeForm = reactive({ unfreeze_reason: '' });

const isFrozen = computed(() => currentCycle.value?.status === 'frozen');
const canFreeze = computed(() => {
  if (!currentCycle.value) return false;
  return currentCycle.value.status === 'reviewed' || currentCycle.value.status === 'pending_review';
});

const STATUS_TEXT: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  pending_review: '待审核',
  reviewed: '已审核',
  frozen: '已冻结',
};

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res = await getAssessmentCycleList({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    if (cycleList.value.length > 0 && !selectedCycleId.value) {
      selectedCycleId.value = cycleList.value[0]!.id;
      loadCurrentCycle();
    }
  } catch {
    message.error('加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

async function loadCurrentCycle() {
  if (!selectedCycleId.value) {
    currentCycle.value = null;
    return;
  }
  try {
    currentCycle.value = await getAssessmentCycle(selectedCycleId.value);
  } catch {
    message.error('加载周期详情失败');
  }
}

function handleCycleChange() {
  loadCurrentCycle();
}

async function handleFreeze() {
  if (!selectedCycleId.value) return;
  freezing.value = true;
  try {
    await freezeAssessmentCycle(selectedCycleId.value);
    message.success('冻结成功');
    loadCurrentCycle();
    loadCycleList();
  } catch {
    /* 拦截器已提示 */
  } finally {
    freezing.value = false;
  }
}

function handleUnfreezeClick() {
  unfreezeForm.unfreeze_reason = '';
  unfreezeModalOpen.value = true;
}

async function confirmUnfreeze() {
  if (!selectedCycleId.value) return;
  if (!unfreezeForm.unfreeze_reason.trim()) {
    message.warning('请输入解冻原因');
    return;
  }
  unfreezing.value = true;
  try {
    await unfreezeAssessmentCycle({
      cycle_id: selectedCycleId.value,
      unfreeze_reason: unfreezeForm.unfreeze_reason,
    });
    message.success('解冻成功');
    unfreezeModalOpen.value = false;
    loadCurrentCycle();
    loadCycleList();
  } catch {
    /* 拦截器已提示 */
  } finally {
    unfreezing.value = false;
  }
}

const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

onMounted(() => {
  loadCycleList();
});
</script>

<template>
  <HsePageLayout title="结果冻结">
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="loadCurrentCycle" />
    </template>

    <div class="mb-4">
      <NSelect
        v-model:value="selectedCycleId"
        placeholder="请选择考核周期"
        :loading="cycleLoading"
        :options="cycleList.map((c) => ({ label: c.cycleName, value: c.id }))"
        style="max-width: 320px"
        @update:value="handleCycleChange"
      />
    </div>

    <NEmpty v-if="!currentCycle" description="请选择考核周期" />

    <template v-else>
      <NCard :bordered="false" class="mb-4">
        <div class="flex items-center gap-4">
          <div
            class="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            :class="isFrozen ? 'bg-cyan' : 'bg-blue'"
          >
            <IconifyIcon :icon="isFrozen ? 'lucide:lock' : 'lucide:unlock'" />
          </div>
          <div class="flex-1">
            <div class="text-lg font-semibold">{{ currentCycle.cycleName }}</div>
            <div class="mt-1 text-muted-foreground">
              周期状态：
              <HseStatusTag :type="STATUS_TAG[currentCycle.status] || 'neutral'">
                {{ STATUS_TEXT[currentCycle.status] || currentCycle.status }}
              </HseStatusTag>
            </div>
          </div>
          <div class="flex gap-8">
            <div class="text-center">
              <div class="text-2xl font-bold text-blue">{{ currentCycle.targetCount }}</div>
              <div class="text-sm text-muted-foreground">考核对象</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-success">{{ currentCycle.scoredCount }}</div>
              <div class="text-sm text-muted-foreground">已评分</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-purple">{{ currentCycle.reviewedCount }}</div>
              <div class="text-sm text-muted-foreground">已审核</div>
            </div>
          </div>
        </div>

        <NAlert v-if="isFrozen" class="mb-4 mt-4" type="success" :show-icon="true">
          <template #header>当前周期已冻结</template>
          考核周期已冻结，所有考核结果已锁定，不可再进行修改。如需调整，请先解冻。
        </NAlert>
        <NAlert v-else class="mb-4 mt-4" type="info" :show-icon="true">
          <template #header>当前周期未冻结</template>
          考核周期尚未冻结，仍可进行评分、审核、调整等操作。冻结后结果将不可修改。
        </NAlert>

        <div class="flex justify-center gap-4">
          <NPopconfirm
            v-if="!isFrozen"
            :disabled="!canFreeze"
            @positive-click="handleFreeze"
          >
            <template #trigger>
              <NButton type="primary" size="large" :loading="freezing" :disabled="!canFreeze">
                <template #icon><IconifyIcon icon="lucide:lock" /></template>
                冻结考核结果
              </NButton>
            </template>
            冻结后考核结果将不可修改，确认继续吗？
          </NPopconfirm>
          <NPopconfirm v-if="isFrozen" @positive-click="handleUnfreezeClick">
            <template #trigger>
              <NButton danger size="large" :loading="unfreezing">
                <template #icon><IconifyIcon icon="lucide:unlock" /></template>
                解冻考核周期
              </NButton>
            </template>
            确认解冻该考核周期？
          </NPopconfirm>
          <NButton size="large" :loading="cycleLoading" @click="loadCurrentCycle">
            <template #icon><IconifyIcon icon="lucide:rotate-cw" /></template>
            刷新状态
          </NButton>
        </div>
      </NCard>

      <NCard title="冻结说明" :bordered="false">
        <NTimeline>
          <NTimelineItem color="blue" :title="'冻结前'">
            <div class="text-sm text-muted-foreground">可进行评分、审核、调整等操作</div>
          </NTimelineItem>
          <NTimelineItem color="green" :title="'冻结后'">
            <div class="text-sm text-muted-foreground">考核结果锁定，不可修改</div>
          </NTimelineItem>
          <NTimelineItem color="orange" :title="'解冻'">
            <div class="text-sm text-muted-foreground">需填写解冻原因，解冻后可继续操作</div>
          </NTimelineItem>
        </NTimeline>
        <NDivider />
        <div class="text-sm text-muted-foreground">
          <div class="mb-2 font-medium text-foreground">注意事项：</div>
          <ul class="list-disc space-y-1 pl-5">
            <li>冻结前请确保所有评分和审核工作已完成</li>
            <li>冻结后将无法修改任何考核结果</li>
            <li>解冻操作需要填写原因并记录操作日志</li>
            <li>建议在月度考核全部完成后再进行冻结</li>
          </ul>
        </div>
      </NCard>
    </template>

    <NModal
      v-model:show="unfreezeModalOpen"
      title="解冻确认"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NAlert class="mb-4" type="warning" :show-icon="true">解冻后考核结果将可以修改</NAlert>
      <NForm label-placement="top">
        <NFormItem label="解冻原因" required>
          <NInput v-model:value="unfreezeForm.unfreeze_reason" type="textarea" :rows="4" placeholder="请输入解冻原因" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="unfreezeModalOpen = false">取消</NButton>
          <NButton type="error" :loading="unfreezing" @click="confirmUnfreeze">确认解冻</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}
.text-foreground {
  color: hsl(var(--foreground));
}
.text-blue {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}
.text-success {
  color: hsl(var(--success));
}
.text-purple {
  color: hsl(var(--primary) / 0.8);
}
.bg-cyan {
  background: hsl(var(--info) / 0.1);
  color: hsl(var(--info));
}
.bg-blue {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}
</style>
