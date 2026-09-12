<script lang="ts" setup>
/**
 * 人事变动历史记录抽屉（web-naive 试点 · 阶段04）
 * Naive UI 实现，功能对齐 web-antd 版 EmployeeHistoryDrawer.vue，禁引 Ant Design。
 * 数据来源：getEmployeeHistory
 */
import { computed, ref, watch } from 'vue';
import {
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NSpin,
  NTag,
  NTimeline,
  NTimelineItem,
  NText,
} from 'naive-ui';
import { getEmployeeHistory, type EmployeeApi } from '#/api/hse/employee';

const props = defineProps<{
  open: boolean;
  employeeId?: number;
  employeeName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
}>();

// 状态
const loading = ref(false);
const historyList = ref<EmployeeApi.HistoryItem[]>([]);

// 事件类型 → NTag 类型
const eventTypeTagMap: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  入职: 'success',
  调岗: 'info',
  离职: 'error',
  退休: 'warning',
  返聘: 'success',
  待岗: 'warning',
  复岗: 'success',
  晋升: 'info',
  降级: 'error',
};

// 事件类型 → 时间线颜色（CSS 颜色，避免主题色名歧义）
const eventTypeColorMap: Record<string, string> = {
  入职: '#18a058',
  调岗: '#2080f0',
  离职: '#d03050',
  退休: '#f0a020',
  返聘: '#13c2c2',
  待岗: '#f5a623',
  复岗: '#18a058',
  晋升: '#8b5cf6',
  降级: '#d03050',
};

function getEventTagType(eventType: string) {
  return eventTypeTagMap[eventType] || 'default';
}
function getEventColor(eventType: string) {
  return eventTypeColorMap[eventType] || '#d0d0d0';
}

function formatValue(val?: string | null): string {
  return val && val !== '' ? val : '-';
}

function formatDate(val?: string | null): string {
  if (!val) return '-';
  return val.length >= 10 ? val.slice(0, 10) : val;
}

// 按事件时间倒序
const sortedHistoryList = computed<EmployeeApi.HistoryItem[]>(() =>
  [...historyList.value].sort((a, b) => {
    const ta = a.event_date ? new Date(a.event_date).getTime() : 0;
    const tb = b.event_date ? new Date(b.event_date).getTime() : 0;
    return tb - ta;
  }),
);

async function loadHistory(employeeId: number) {
  loading.value = true;
  try {
    const res = await getEmployeeHistory(employeeId);
    historyList.value = Array.isArray(res) ? res : [];
  } catch {
    historyList.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      historyList.value = [];
      if (props.employeeId) {
        loadHistory(props.employeeId);
      }
    }
  },
);

function handleClose() {
  emit('update:open', false);
}

const drawerTitle = computed(() =>
  props.employeeName
    ? `${props.employeeName} - 人事变动历史`
    : '人事变动历史',
);
</script>

<template>
  <NDrawer
    :show="props.open"
    :width="720"
    placement="right"
    @update:show="handleClose"
  >
    <NDrawerContent :title="drawerTitle" :native-scrollbar="true">
      <NSpin :show="loading">
        <NEmpty
          v-if="!loading && sortedHistoryList.length === 0"
          description="暂无人事变动记录"
          class="py-12"
        />
        <NTimeline v-else class="pt-2">
          <NTimelineItem
            v-for="item in sortedHistoryList"
            :key="item.id"
            :color="getEventColor(item.event_type)"
          >
            <div class="mb-1 flex items-center gap-2">
              <NTag :type="getEventTagType(item.event_type)">
                {{ item.event_type || '其他' }}
              </NTag>
              <NText depth="3" class="text-sm">
                {{ formatDate(item.event_date) }}
              </NText>
            </div>
            <NDescriptions
              size="small"
              :column="1"
              bordered
              label-placement="left"
            >
              <NDescriptionsItem label="部门">
                <span class="text-gray-400"> {{ formatValue(item.before_dept_name) }} </span>
                <span class="text-primary px-1">→</span>
                <span class="font-medium"> {{ formatValue(item.after_dept_name) }} </span>
              </NDescriptionsItem>
              <NDescriptionsItem label="岗位">
                <span class="text-gray-400"> {{ formatValue(item.before_position_name) }} </span>
                <span class="text-primary px-1">→</span>
                <span class="font-medium"> {{ formatValue(item.after_position_name) }} </span>
              </NDescriptionsItem>
              <NDescriptionsItem label="状态">
                <span class="text-gray-400"> {{ formatValue(item.before_status) }} </span>
                <span class="text-primary px-1">→</span>
                <span class="font-medium"> {{ formatValue(item.after_status) }} </span>
              </NDescriptionsItem>
              <NDescriptionsItem v-if="item.approval_no" label="审批单号">
                {{ item.approval_no }}
              </NDescriptionsItem>
              <NDescriptionsItem v-if="item.remark" label="备注">
                {{ item.remark }}
              </NDescriptionsItem>
            </NDescriptions>
          </NTimelineItem>
        </NTimeline>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
