<template>
  <div class="p-4">
    <a-row :gutter="16">
      <a-col :span="16">
        <a-card>
          <template #title>结果冻结</template>

          <a-row :gutter="16" class="mb-6">
            <a-col :span="8">
              <a-select
                v-model:value="selectedCycleId"
                placeholder="请选择考核周期"
                style="width: 100%"
                :loading="cycleLoading"
                @change="handleCycleChange"
              >
                <Select.Option v-for="cycle in cycleList" :key="cycle.id" :value="cycle.id">
                  {{ cycle.cycleName }}
                </Select.Option>
              </a-select>
            </a-col>
          </a-row>

          <a-empty v-if="!currentCycle" description="请选择考核周期" />

          <div v-else>
            <a-card class="mb-4" :bordered="false" :style="{ background: 'hsl(var(--popover))' }">
              <a-row :gutter="16">
                <a-col :span="12">
                  <div class="flex items-center">
                    <div
                      class="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                      :class="isFrozen ? 'bg-cyan-100 text-cyan-600' : 'bg-blue-100 text-blue-600'"
                    >
                      <lock-outlined v-if="isFrozen" />
                      <unlock-outlined v-else />
                    </div>
                    <div class="ml-4">
                      <div class="text-lg font-semibold">{{ currentCycle.cycleName }}</div>
                      <div class="text-gray-500 mt-1">
                        周期状态：
                        <a-tag :color="getStatusColor(currentCycle.status)">
                          {{ getStatusText(currentCycle.status) }}
                        </a-tag>
                      </div>
                    </div>
                  </div>
                </a-col>
                <a-col :span="12">
                  <div class="flex justify-end items-center h-full">
                    <a-space size="large">
                      <div class="text-center">
                        <div class="text-2xl font-bold text-blue-600">{{ currentCycle.targetCount }}</div>
                        <div class="text-sm text-gray-500">考核对象</div>
                      </div>
                      <div class="text-center">
                        <div class="text-2xl font-bold text-green-600">{{ currentCycle.scoredCount }}</div>
                        <div class="text-sm text-gray-500">已评分</div>
                      </div>
                      <div class="text-center">
                        <div class="text-2xl font-bold text-purple-600">{{ currentCycle.reviewedCount }}</div>
                        <div class="text-sm text-gray-500">已审核</div>
                      </div>
                    </a-space>
                  </div>
                </a-col>
              </a-row>
            </a-card>

            <a-alert
              v-if="isFrozen"
              message="当前周期已冻结"
              type="success"
              show-icon
              class="mb-4"
            >
              <template #description>
                考核周期已冻结，所有考核结果已锁定，不可再进行修改。如需调整，请先解冻。
              </template>
            </a-alert>
            <a-alert
              v-else
              message="当前周期未冻结"
              type="info"
              show-icon
              class="mb-4"
            >
              <template #description>
                考核周期尚未冻结，仍可进行评分、审核、调整等操作。冻结后结果将不可修改。
              </template>
            </a-alert>

            <div class="flex justify-center gap-4 mt-6">
              <a-button
                v-if="!isFrozen"
                type="primary"
                size="large"
                :loading="freezing"
                :disabled="!canFreeze"
                @click="handleFreeze"
              >
                <template #icon><lock-outlined /></template>
                冻结考核结果
              </a-button>
              <a-popconfirm
                v-if="isFrozen"
                title="确认解冻该考核周期？"
                ok-text="确认解冻"
                cancel-text="取消"
                ok-type="danger"
                @confirm="handleUnfreeze"
              >
                <a-button danger size="large" :loading="unfreezing">
                  <template #icon><unlock-outlined /></template>
                  解冻考核周期
                </a-button>
              </a-popconfirm>
              <a-button size="large" @click="loadCurrentCycle">
                <template #icon><reload-outlined /></template>
                刷新状态
              </a-button>
            </div>
          </div>
        </a-card>
      </a-col>

      <a-col :span="8">
        <a-card title="冻结说明">
          <a-timeline>
            <a-timeline-item color="blue">
              <div class="font-medium">冻结前</div>
              <div class="text-sm text-gray-500 mt-1">
                可进行评分、审核、调整等操作
              </div>
            </a-timeline-item>
            <a-timeline-item color="green">
              <div class="font-medium">冻结后</div>
              <div class="text-sm text-gray-500 mt-1">
                考核结果锁定，不可修改
              </div>
            </a-timeline-item>
            <a-timeline-item color="orange">
              <div class="font-medium">解冻</div>
              <div class="text-sm text-gray-500 mt-1">
                需填写解冻原因，解冻后可继续操作
              </div>
            </a-timeline-item>
          </a-timeline>

          <a-divider />

          <div class="text-sm text-gray-600">
            <div class="font-medium mb-2">注意事项：</div>
            <ul class="list-disc pl-5 space-y-1">
              <li>冻结前请确保所有评分和审核工作已完成</li>
              <li>冻结后将无法修改任何考核结果</li>
              <li>解冻操作需要填写原因并记录操作日志</li>
              <li>建议在月度考核全部完成后再进行冻结</li>
            </ul>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-modal
      v-model:open="unfreezeModalOpen"
      title="解冻确认"
      ok-text="确认解冻"
      ok-type="danger"
      @ok="confirmUnfreeze"
      :confirm-loading="unfreezing"
    >
      <a-alert type="warning" show-icon message="解冻后考核结果将可以修改" class="mb-4" />
      <a-form :model="unfreezeForm" layout="vertical">
        <a-form-item label="解冻原因" required>
          <a-textarea
            v-model:value="unfreezeForm.unfreeze_reason"
            :rows="4"
            placeholder="请输入解冻原因"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  LockOutlined,
  UnlockOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue';
import { message, Modal, Select } from 'ant-design-vue';
import {
  getAssessmentCycleList,
  getAssessmentCycle,
  freezeAssessmentCycle,
  unfreezeAssessmentCycle,
} from '#/api/hse/assessment-monthly';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;

const cycleLoading = ref(false);
const freezing = ref(false);
const unfreezing = ref(false);
const selectedCycleId = ref<number | string | undefined>();
const cycleList = ref<AssessmentCycle[]>([]);
const currentCycle = ref<AssessmentCycle | null>(null);

const unfreezeModalOpen = ref(false);
const unfreezeForm = ref({
  unfreeze_reason: '',
});

const isFrozen = computed(() => {
  return currentCycle.value?.status === 'frozen';
});

const canFreeze = computed(() => {
  if (!currentCycle.value) return false;
  return currentCycle.value.status === 'reviewed' || currentCycle.value.status === 'pending_review';
});

function getStatusText(status: string) {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    pending_review: '待审核',
    reviewed: '已审核',
    frozen: '已冻结',
  };
  return map[status] || status;
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    not_started: 'default',
    in_progress: 'processing',
    pending_review: 'warning',
    reviewed: 'success',
    frozen: 'purple',
  };
  return map[status] || 'default';
}

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res: any = await getAssessmentCycleList({
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
  } catch (e: any) {
    message.error(e.message || '加载周期列表失败');
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
    const res = await getAssessmentCycle(selectedCycleId.value);
    currentCycle.value = res;
  } catch (e: any) {
    message.error(e.message || '加载周期详情失败');
  }
}

function handleCycleChange() {
  loadCurrentCycle();
}

async function handleFreeze() {
  if (!selectedCycleId.value) return;
  Modal.confirm({
    title: '确认冻结',
    content: '冻结后考核结果将不可修改，确认继续吗？',
    okText: '确认冻结',
    okType: 'primary',
    cancelText: '取消',
    onOk: async () => {
      freezing.value = true;
      try {
        await freezeAssessmentCycle(selectedCycleId.value!);
        message.success('冻结成功');
        loadCurrentCycle();
        loadCycleList();
      } catch (e: any) {
        message.error(e.message || '冻结失败');
      } finally {
        freezing.value = false;
      }
    },
  });
}

function handleUnfreeze() {
  unfreezeForm.value.unfreeze_reason = '';
  unfreezeModalOpen.value = true;
}

async function confirmUnfreeze() {
  if (!selectedCycleId.value) return;
  if (!unfreezeForm.value.unfreeze_reason.trim()) {
    message.warning('请输入解冻原因');
    return;
  }
  unfreezing.value = true;
  try {
    await unfreezeAssessmentCycle({
      cycle_id: selectedCycleId.value,
      unfreeze_reason: unfreezeForm.value.unfreeze_reason,
    });
    message.success('解冻成功');
    unfreezeModalOpen.value = false;
    loadCurrentCycle();
    loadCycleList();
  } catch (e: any) {
    message.error(e.message || '解冻失败');
  } finally {
    unfreezing.value = false;
  }
}

onMounted(() => {
  loadCycleList();
});
</script>
