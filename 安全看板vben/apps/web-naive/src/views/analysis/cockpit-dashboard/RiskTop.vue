<script lang="ts" setup>
import type { CockpitApi } from '#/api/hse/cockpit';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { NRadioGroup, NRadioButton } from 'naive-ui';

const props = defineProps<{
  data: CockpitApi.RiskTopData | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'employeeClick', employeeId: number): void;
  (e: 'departmentClick', deptId: number): void;
  (e: 'unitClick', unitId: number): void;
}>();

const activeTab = ref<'employees' | 'departments' | 'units'>('employees');

const tabs: Array<{ key: typeof activeTab.value; label: string }> = [
  { key: 'employees', label: 'TOP10员工' },
  { key: 'departments', label: 'TOP5部门' },
  { key: 'units', label: 'TOP5作业单元' },
];

const levelColors: Record<string, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#fa8c16',
  critical: '#f5222d',
};

const topThreeColors = ['#f5222d', '#fa8c16', '#faad14'];

const employeeList = computed(() => props.data?.topEmployees || []);
const departmentList = computed(() => props.data?.topDepartments || []);
const unitList = computed(() => props.data?.topOperationUnits || []);

function getRankColor(index: number): string {
  if (index < 3) return topThreeColors[index] ?? '#bfbfbf';
  return '#bfbfbf';
}

function handleEmployeeClick(employee: CockpitApi.TopEmployee) {
  emit('employeeClick', employee.employeeId);
}

function handleDepartmentClick(dept: CockpitApi.TopDepartment) {
  emit('departmentClick', dept.orgId);
}

function handleUnitClick(unit: CockpitApi.TopOperationUnit) {
  emit('unitClick', unit.unitId);
}
</script>

<template>
  <div class="risk-top">
    <NRadioGroup v-model:value="activeTab" type="button" class="top-tabs">
      <NRadioButton
        v-for="tab in tabs"
        :key="tab.key"
        :value="tab.key"
      >
        {{ tab.label }}
      </NRadioButton>
    </NRadioGroup>

    <div class="top-content">
      <div v-show="activeTab === 'employees'" class="top-list">
        <div v-if="employeeList.length === 0" class="empty-state">
          <IconifyIcon icon="lucide:inbox" :size="32" class="text-gray-400" />
          <p>暂无数据</p>
        </div>
        <div
          v-for="(item, index) in employeeList"
          :key="item.employeeId"
          class="top-item employee-item"
          @click="handleEmployeeClick(item)"
        >
          <div class="rank-badge" :style="{ backgroundColor: getRankColor(index) }">
            {{ index + 1 }}
          </div>
          <div class="item-info">
            <div class="item-name">{{ item.employeeName }}</div>
            <div class="item-sub">{{ item.positionName }}</div>
          </div>
          <div class="item-score">
            <span class="score-value" :style="{ color: levelColors[item.riskLevelCode] || '#999' }">
              {{ item.finalScore }}
            </span>
            <span class="score-label">分</span>
          </div>
          <div
            class="level-tag"
            :style="{
              backgroundColor: (levelColors[item.riskLevelCode] || '#999') + '15',
              color: levelColors[item.riskLevelCode] || '#999',
            }"
          >
            {{ item.riskLevel }}
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'departments'" class="top-list">
        <div v-if="departmentList.length === 0" class="empty-state">
          <IconifyIcon icon="lucide:inbox" :size="32" class="text-gray-400" />
          <p>暂无数据</p>
        </div>
        <div
          v-for="(item, index) in departmentList"
          :key="item.orgId"
          class="top-item dept-item"
          @click="handleDepartmentClick(item)"
        >
          <div class="rank-badge" :style="{ backgroundColor: getRankColor(index) }">
            {{ index + 1 }}
          </div>
          <div class="item-info">
            <div class="item-name">{{ item.orgName }}</div>
            <div class="item-sub">共{{ item.totalCount }}人</div>
          </div>
          <div class="item-score">
            <span class="score-value">{{ item.avgScore }}</span>
            <span class="score-label">分</span>
          </div>
          <div v-if="item.highRiskCount > 0" class="high-risk-count">
            <IconifyIcon icon="lucide:alert-triangle" :size="12" />
            {{ item.highRiskCount }}人高风险
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'units'" class="top-list">
        <div v-if="unitList.length === 0" class="empty-state">
          <IconifyIcon icon="lucide:inbox" :size="32" class="text-gray-400" />
          <p>暂无数据</p>
        </div>
        <div
          v-for="(item, index) in unitList"
          :key="item.unitId"
          class="top-item unit-item"
          @click="handleUnitClick(item)"
        >
          <div class="rank-badge" :style="{ backgroundColor: getRankColor(index) }">
            {{ index + 1 }}
          </div>
          <div class="item-info">
            <div class="item-name">{{ item.unitName }}</div>
            <div class="item-sub">共{{ item.totalCount }}人</div>
          </div>
          <div class="item-score">
            <span class="score-value">{{ item.avgScore }}</span>
            <span class="score-label">分</span>
          </div>
          <div v-if="item.highRiskCount > 0" class="high-risk-count">
            <IconifyIcon icon="lucide:alert-triangle" :size="12" />
            {{ item.highRiskCount }}人高风险
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.risk-top {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.top-tabs {
  margin-bottom: 16px;
}

.top-content {
  flex: 1;
  overflow-y: auto;
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: hsl(var(--muted-foreground));
}

.empty-state p {
  margin-top: 12px;
  font-size: 13px;
}

.top-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: hsl(var(--muted));
  cursor: pointer;
  transition: all 0.3s;
}

.top-item:hover {
  background: #f0f7ff;
}

.rank-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 14px;
  color: hsl(var(--foreground));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-sub {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}

.item-score {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.score-value {
  font-size: 18px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.score-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.level-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  flex-shrink: 0;
}

.high-risk-count {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #f5222d;
  flex-shrink: 0;
}

.text-gray-400 {
  color: hsl(var(--muted-foreground));
}
</style>
