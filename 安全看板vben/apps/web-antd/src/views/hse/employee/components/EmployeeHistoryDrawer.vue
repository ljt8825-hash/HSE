<script setup lang="ts">
/**
 * 人事变动历史记录抽屉组件
 *
 * 功能: 展示员工的人事变动历史（入职/调岗/离职/退休/返聘/待岗/复岗/晋升/降级等）
 * 数据来源: getEmployeeHistory(employeeId)
 */
import { computed, ref, watch } from 'vue';
import {
  Drawer,
  Timeline,
  Tag,
  Empty,
  Spin,
  Descriptions,
  TimelineItem,
  DescriptionsItem,
} from 'ant-design-vue';
import { getEmployeeHistory, type EmployeeApi } from '#/api/hse/employee';

const props = defineProps<{
  open: boolean;
  employeeId?: number;
  employeeName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
}>();

// ============================================================
// 状态
// ============================================================
const loading = ref(false);
const historyList = ref<EmployeeApi.HistoryItem[]>([]);

// ============================================================
// 事件类型 Tag 颜色映射
// ============================================================
const eventTypeColorMap: Record<string, string> = {
  入职: 'green',
  调岗: 'blue',
  离职: 'red',
  退休: 'orange',
  返聘: 'cyan',
  待岗: 'gold',
  复岗: 'green',
  晋升: 'purple',
  降级: 'magenta',
};

function getEventColor(eventType: string): string {
  return eventTypeColorMap[eventType] || 'default';
}

// ============================================================
// 格式化辅助
// ============================================================
function formatValue(val?: string | null): string {
  return val && val !== '' ? val : '-';
}

function formatDate(val?: string | null): string {
  if (!val) return '-';
  // 仅保留 YYYY-MM-DD 部分
  return val.length >= 10 ? val.slice(0, 10) : val;
}

// ============================================================
// 按事件时间倒序排列
// ============================================================
const sortedHistoryList = computed<EmployeeApi.HistoryItem[]>(() => {
  return [...historyList.value].sort((a, b) => {
    const ta = a.event_date ? new Date(a.event_date).getTime() : 0;
    const tb = b.event_date ? new Date(b.event_date).getTime() : 0;
    return tb - ta;
  });
});

// ============================================================
// 加载数据
// ============================================================
async function loadHistory(employeeId: number) {
  loading.value = true;
  try {
    const res = await getEmployeeHistory(employeeId);
    historyList.value = Array.isArray(res) ? res : [];
  } catch (e) {
    historyList.value = [];
  } finally {
    loading.value = false;
  }
}

// ============================================================
// 监听弹窗打开
// ============================================================
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

// ============================================================
// 关闭抽屉
// ============================================================
function handleClose() {
  emit('update:open', false);
}

const drawerTitle = computed(() => {
  return props.employeeName
    ? `${props.employeeName} - 人事变动历史`
    : '人事变动历史';
});
</script>

<template>
  <Drawer
    :open="open"
    :title="drawerTitle"
    width="720px"
    :destroy-on-close="true"
    @close="handleClose"
  >
    <Spin :spinning="loading" tip="加载中...">
      <div v-if="!loading && sortedHistoryList.length === 0" class="empty-wrap">
        <Empty description="暂无人事变动记录" />
      </div>

      <Timeline v-else mode="left" class="history-timeline">
        <TimelineItem
          v-for="item in sortedHistoryList"
          :key="item.id"
          :color="getEventColor(item.event_type) === 'default' ? 'gray' : getEventColor(item.event_type)"
        >
          <div class="history-item">
            <div class="history-header">
              <Tag :color="getEventColor(item.event_type)">
                {{ item.event_type || '其他' }}
              </Tag>
              <span class="event-date">{{ formatDate(item.event_date) }}</span>
            </div>

            <Descriptions
              size="small"
              :column="1"
              :colon="true"
              bordered
              class="history-desc"
            >
              <DescriptionsItem label="部门">
                <span class="before-val">{{ formatValue(item.before_dept_name) }}</span>
                <span class="arrow"> → </span>
                <span class="after-val">{{ formatValue(item.after_dept_name) }}</span>
              </DescriptionsItem>
              <DescriptionsItem label="岗位">
                <span class="before-val">{{ formatValue(item.before_position_name) }}</span>
                <span class="arrow"> → </span>
                <span class="after-val">{{ formatValue(item.after_position_name) }}</span>
              </DescriptionsItem>
              <DescriptionsItem label="状态">
                <span class="before-val">{{ formatValue(item.before_status) }}</span>
                <span class="arrow"> → </span>
                <span class="after-val">{{ formatValue(item.after_status) }}</span>
              </DescriptionsItem>
              <DescriptionsItem v-if="item.approval_no" label="审批单号">
                {{ item.approval_no }}
              </DescriptionsItem>
              <DescriptionsItem v-if="item.remark" label="备注">
                {{ item.remark }}
              </DescriptionsItem>
            </Descriptions>
          </div>
        </TimelineItem>
      </Timeline>
    </Spin>

    <template #footer>
      <a-button @click="handleClose">关闭</a-button>
    </template>
  </Drawer>
</template>

<style scoped>
.empty-wrap {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

.history-timeline {
  padding-top: 8px;
}

.history-item {
  margin-bottom: 8px;
}

.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.event-date {
  color: #666;
  font-size: 14px;
}

.history-desc {
  margin-bottom: 12px;
}

.before-val {
  color: hsl(var(--muted-foreground));
}

.arrow {
  color: hsl(var(--primary));
  margin: 0 4px;
  font-weight: 500;
}

.after-val {
  color: hsl(var(--foreground));
  font-weight: 500;
}
</style>
