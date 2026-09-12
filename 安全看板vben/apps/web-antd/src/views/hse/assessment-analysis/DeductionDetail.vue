<template>
  <div class="deduction-detail">
    <Card :bordered="false" class="category-selector">
      <span class="selector-label">扣分类别:</span>
      <a-radio-group v-model:value="currentCategory" button-style="solid" @change="fetchDetail">
        <a-radio-button value="safety">安全扣分</a-radio-button>
        <a-radio-button value="risk">风险扣分</a-radio-button>
        <a-radio-button value="accident">事故扣分</a-radio-button>
        <a-radio-button value="rectification">整改扣分</a-radio-button>
        <a-radio-button value="management">管理扣分</a-radio-button>
      </a-radio-group>
    </Card>

    <Card v-if="detailData" :bordered="false" class="total-deduction">
      <div class="deduction-summary">
        <span class="summary-label">总扣分:</span>
        <span class="summary-value">{{ detailData.totalDeduction }}</span>
        <span class="summary-unit">分</span>
      </div>
    </Card>

    <Card v-if="detailData" :bordered="false" class="detail-table-section">
      <a-table
        :columns="columns"
        :data-source="detailData.details"
        :pagination="false"
        row-key="indicatorCode"
        size="middle"
        :expandable="{ expandedRowRender }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'indicatorCode'">
            <a-tag color="blue">{{ record.indicatorCode }}</a-tag>
          </template>
          <template v-if="column.key === 'deductionPoints'">
            <span :class="record.deductionPoints > 0 ? 'points-deducted' : 'points-zero'">
              {{ record.deductionPoints > 0 ? '-' + record.deductionPoints : '0' }}
            </span>
          </template>
        </template>

        <template #expandedRowRender="{ record }">
          <div class="expanded-content">
            <div class="expanded-section">
              <div class="section-title">数据来源</div>
              <a-table
                :columns="sourceColumns"
                :data-source="record.dataSources"
                :pagination="false"
                row-key="table"
                size="small"
              >
                <template #bodyCell="{ column: col, record: src }">
                  <template v-if="col.key === 'table'">
                    <code class="table-name">{{ src.table }}</code>
                  </template>
                </template>
              </a-table>
            </div>
            <div class="expanded-section" v-if="record.responsibles && record.responsibles.length > 0">
              <div class="section-title">责任对象</div>
              <a-collapse>
                <a-collapse-panel
                  v-for="resp in record.responsibles"
                  :key="resp.id"
                  :header="`${resp.name} (${getTypeText(resp.type)}) - 贡献度: ${resp.contribution}分`"
                >
                  <div class="resp-details">{{ resp.details }}</div>
                </a-collapse-panel>
              </a-collapse>
            </div>
            <div class="expanded-section" v-else>
              <a-empty description="无责任对象" />
            </div>
          </div>
        </template>
      </a-table>
    </Card>

    <Card v-else :bordered="false" class="loading-section">
      <a-spin tip="加载中..." />
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Card } from 'ant-design-vue';
import { getDeductionDetail } from '#/api/hse/assessment';
import type { AssessmentApi } from '#/api/hse/assessment';

const currentCategory = ref('accident');
const detailData = ref<AssessmentApi.DeductionDetailData | null>(null);

const columns = [
  { key: 'indicator', title: '指标名称', width: 200 },
  { key: 'indicatorCode', title: '指标编码', width: 160 },
  { key: 'deductionPoints', title: '扣分分值', width: 100, align: 'center' },
];

const sourceColumns = [
  { key: 'table', title: '数据表', width: 180 },
  { key: 'recordCount', title: '记录数', width: 80, align: 'center' },
  { key: 'description', title: '说明' },
];

const expandedRowRender = () => null;

async function fetchDetail() {
  try {
    const res = await getDeductionDetail(currentCategory.value);
    detailData.value = res;
  } catch (e) {
    console.error('Fetch deduction detail error:', e);
  }
}

function getTypeText(type: string) {
  const texts: Record<string, string> = {
    department: '部门',
    center: '中心',
    township: '乡镇',
    area: '片区',
    employee: '员工',
  };
  return texts[type] || type;
}

onMounted(() => {
  fetchDetail();
});
</script>

<style lang="less" scoped>
.deduction-detail {
  .category-selector {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    .selector-label {
      font-size: 14px;
      font-weight: 600;
      color: hsl(var(--foreground));
    }
  }

  .total-deduction {
    margin-bottom: 16px;

    .deduction-summary {
      display: flex;
      align-items: baseline;
      gap: 4px;

      .summary-label {
        font-size: 14px;
        color: hsl(var(--muted-foreground));
      }

      .summary-value {
        font-size: 32px;
        font-weight: 700;
        color: #f5222d;
      }

      .summary-unit {
        font-size: 14px;
        color: hsl(var(--muted-foreground));
      }
    }
  }

  .detail-table-section {
  }

  .loading-section {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 300px;
  }

  .points-deducted {
    color: #f5222d;
    font-weight: 700;
    font-size: 16px;
  }

  .points-zero {
    color: #52c41a;
    font-weight: 600;
  }

  .expanded-content {
    .expanded-section {
      margin-bottom: 16px;

      .section-title {
        font-size: 13px;
        font-weight: 600;
        color: hsl(var(--foreground));
        margin-bottom: 8px;
      }
    }

    .table-name {
      background: hsl(var(--muted));
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      color: #1890ff;
    }

    .resp-details {
      font-size: 13px;
      color: hsl(var(--muted-foreground));
      line-height: 1.6;
    }
  }
}
</style>
