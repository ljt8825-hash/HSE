<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>演示数据管理</span>
        </div>
      </template>

      <div class="demo-data-container">
        <div class="status-section">
          <div class="status-item">
            <div class="status-label">演示数据状态</div>
            <div class="status-value">
              <Switch
                :checked="isActive"
                :loading="switchLoading"
                @change="(handleSwitchChange as any)"
              />
              <span class="status-text">
                {{ isActive ? '已开启' : '已关闭' }}
              </span>
            </div>
          </div>

          <div class="status-item">
            <div class="status-label">演示数据总量</div>
            <div class="status-value count">{{ totalDemo }}</div>
          </div>
        </div>

        <Divider />

        <div class="stats-section">
          <h3 class="stats-title">各模块演示数据统计</h3>
          <Row :gutter="[16, 16]">
            <Col :xs="24" :sm="12" :md="8" :lg="6" v-for="stat in stats" :key="stat.key">
              <Card :bordered="false" size="small" class="stat-card">
                <div class="stat-label">{{ stat.label }}</div>
                <div class="stat-count">
                  {{ stat.count >= 0 ? stat.count : '--' }}
                </div>
              </Card>
            </Col>
          </Row>
        </div>

        <Divider />

        <div class="action-section">
          <h3 class="action-title">操作说明</h3>
          <Alert
            type="info"
            show-icon
            :message="isActive ? '演示数据已开启，各模块中已混入演示数据，与真实数据外观一致。关闭后演示数据将被清理。' : '演示数据已关闭，系统中无演示数据。'"
          />

          <div class="action-buttons">
            <Space :size="12">
              <Button
                type="primary"
                :loading="loading"
                :disabled="isActive"
                @click="handleGenerate"
              >
                <template #icon><IconifyIcon icon="lucide:plus" /></template>
                生成全部演示数据
              </Button>
              <Popconfirm
                title="确定要清理所有演示数据吗？"
                description="清理后演示数据将被删除，不影响真实数据，此操作不可恢复。"
                :disabled="!isActive || loading"
                @confirm="handleClear"
              >
                <Button
                  danger
                  :loading="loading"
                  :disabled="!isActive"
                >
                  <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
                  清理全部演示数据
                </Button>
              </Popconfirm>
              <Button @click="handleRefresh">
                <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
                刷新
              </Button>
            </Space>
          </div>
        </div>
      </div>
    </Card>
  </Page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Popconfirm,
  Row,
  Space,
  Switch,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { clearDemoData, generateDemoData, getDemoDataStatus } from '#/api/hse/demo-data';

const loading = ref(false);
const switchLoading = ref(false);
const isActive = ref(false);
const totalDemo = ref(0);
const stats = ref<Array<{ key: string; label: string; count: number }>>([]);

async function fetchStatus() {
  loading.value = true;
  try {
    const res: any = await getDemoDataStatus();
    isActive.value = res.active || false;
    totalDemo.value = res.totalDemo || 0;
    stats.value = res.stats || [];
  } catch (err) {
    console.error('获取演示数据状态失败:', err);
    message.error('获取演示数据状态失败');
  } finally {
    loading.value = false;
  }
}

async function handleGenerate() {
  loading.value = true;
  try {
    const res: any = await generateDemoData();
    message.success(res?.msg || '演示数据生成成功');
    await fetchStatus();
  } catch (err: any) {
    console.error('生成演示数据失败:', err);
    message.error(err?.message || '生成演示数据失败');
  } finally {
    loading.value = false;
  }
}

async function handleClear() {
  loading.value = true;
  try {
    const res: any = await clearDemoData();
    message.success(res?.msg || '演示数据清理成功');
    await fetchStatus();
  } catch (err: any) {
    console.error('清理演示数据失败:', err);
    message.error(err?.message || '清理演示数据失败');
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
    } catch (err: any) {
      message.error(err?.message || '关闭演示数据失败');
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

<style scoped lang="scss">
.demo-data-container {
  padding: 16px 0;
}

.status-section {
  display: flex;
  gap: 48px;
  margin-bottom: 16px;

  .status-item {
    .status-label {
      font-size: 14px;
      color: rgba(0, 0, 0, 0.45);
      margin-bottom: 8px;
    }

    .status-value {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      font-weight: 600;

      &.count {
        font-size: 28px;
        color: #1677ff;
      }

      .status-text {
        font-size: 14px;
        font-weight: normal;
        color: rgba(0, 0, 0, 0.65);
      }
    }
  }
}

.stats-section {
  .stats-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .stat-card {
    text-align: center;

    .stat-label {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.45);
      margin-bottom: 8px;
    }

    .stat-count {
      font-size: 24px;
      font-weight: 600;
      color: #1677ff;
    }
  }
}

.action-section {
  .action-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .action-buttons {
    margin-top: 16px;
  }
}
</style>
