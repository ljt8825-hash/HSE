<script lang="ts" setup>
/**
 * 演示数据管理（web-naive）
 * 控制演示数据的生成与清理
 */
import { ref, onMounted } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NDivider,
  NGi,
  NGrid,
  NSpace,
  NStatistic,
  NSwitch,
  NText,
} from 'naive-ui';

import { HsePageLayout } from '#/components/hse';
import {
  getDemoDataStatus,
  generateDemoData,
  clearDemoData,
} from '#/api/hse/demo-data';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SystemDemoData' });

const loading = ref(false);
const switchLoading = ref(false);
const isActive = ref(false);
const totalDemo = ref(0);
const stats = ref<Array<{ key: string; label: string; count: number }>>([]);

async function fetchStatus() {
  loading.value = true;
  try {
    const res = await getDemoDataStatus();
    isActive.value = res.active ?? false;
    totalDemo.value = res.totalDemo ?? 0;
    stats.value = res.stats ?? [];
  } catch {
    message.error('获取演示数据状态失败');
  } finally {
    loading.value = false;
  }
}

async function handleGenerate() {
  loading.value = true;
  try {
    const res = await generateDemoData();
    message.success(res?.msg || '演示数据生成成功');
    await fetchStatus();
  } catch {
    message.error('生成演示数据失败');
  } finally {
    loading.value = false;
  }
}

async function handleClear() {
  loading.value = true;
  try {
    const res = await clearDemoData();
    message.success(res?.msg || '演示数据清理成功');
    await fetchStatus();
  } catch {
    message.error('清理演示数据失败');
  } finally {
    loading.value = false;
  }
}

async function handleSwitchChange(checked: boolean) {
  if (checked) {
    await handleGenerate();
  } else {
    switchLoading.value = true;
    try {
      await clearDemoData();
      message.success('演示数据已关闭');
      await fetchStatus();
    } catch {
      message.error('关闭演示数据失败');
    } finally {
      switchLoading.value = false;
    }
  }
}

function handleRefresh() {
  fetchStatus();
}

onMounted(() => {
  fetchStatus();
});
</script>

<template>
  <HsePageLayout title="演示数据管理" description="管理系统演示数据的生成与清理">
    <NCard :bordered="false">
      <!-- 状态区域 -->
      <NSpace vertical :size="24">
        <div class="flex items-center justify-between">
          <NSpace align="center" :size="16">
            <NText depth="3" class="text-base">演示数据状态</NText>
            <NSwitch
              :value="isActive"
              :loading="switchLoading || loading"
              @update:value="handleSwitchChange"
            />
            <NText :type="isActive ? 'success' : 'default'" class="text-lg font-medium">
              {{ isActive ? '已开启' : '已关闭' }}
            </NText>
          </NSpace>
          <NButton @click="handleRefresh">
            <template #icon>
              <span>🔄</span>
            </template>
            刷新
          </NButton>
        </div>

        <NCard :bordered="false" size="small">
          <NStatistic label="演示数据总量" :value="totalDemo" />
        </NCard>

        <NDivider />

        <!-- 各模块统计 -->
        <div>
          <NText strong class="text-base mb-3 block">各模块演示数据统计</NText>
          <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
            <NGi v-for="stat in stats" :key="stat.key" span="24 m:8">
              <NCard :bordered="false" size="small" class="text-center">
                <NStatistic :label="stat.label" :value="stat.count >= 0 ? stat.count : '--'" />
              </NCard>
            </NGi>
            <NGi v-if="stats.length === 0" :span="24">
              <NCard :bordered="false" size="small">
                <NText depth="3">暂无演示数据</NText>
              </NCard>
            </NGi>
          </NGrid>
        </div>

        <NDivider />

        <!-- 操作说明 -->
        <div>
          <NText strong class="text-base mb-3 block">操作说明</NText>
          <NAlert
            :type="isActive ? 'info' : 'default'"
            :show-icon="true"
            class="mb-4"
          >
            {{
              isActive
                ? '演示数据已开启，各模块中已混入演示数据，与真实数据外观一致。关闭后演示数据将被清理。'
                : '演示数据已关闭，系统中无演示数据。'
            }}
          </NAlert>
          <NSpace :size="12">
            <NButton
              type="primary"
              :loading="loading"
              :disabled="isActive"
              @click="handleGenerate"
            >
              <template #icon>
                <span>➕</span>
              </template>
              生成全部演示数据
            </NButton>
            <NButton
              type="error"
              :loading="loading"
              :disabled="!isActive"
              @click="handleClear"
            >
              <template #icon>
                <span>🗑️</span>
              </template>
              清理全部演示数据
            </NButton>
          </NSpace>
        </div>
      </NSpace>
    </NCard>
  </HsePageLayout>
</template>
