<template>
  <Page auto-content-height class="hse-page">
    <Alert
      type="info"
      show-icon
      message="培训分析增强"
      description="展示高风险岗位、驾驶员、新员工培训完成率，识别培训薄弱环节。"
      style="margin-bottom: 16px;"
    />

    <Row :gutter="[16, 16]" style="margin-bottom: 16px;">
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false">
          <Statistic
            title="综合完成率"
            :value="analysisData.summary?.overallRate || 0"
            suffix="%"
            :value-style="{ color: getRateColor(analysisData.summary?.overallRate || 0) }"
          >
            <template #prefix><IconifyIcon icon="lucide:trending-up" /></template>
          </Statistic>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false">
          <Statistic
            title="高风险岗位完成率"
            :value="analysisData.highRiskPosition?.rate || 0"
            suffix="%"
            :value-style="{ color: getRateColor(analysisData.highRiskPosition?.rate || 0) }"
          />
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false">
          <Statistic
            title="驾驶员培训完成率"
            :value="analysisData.driver?.rate || 0"
            suffix="%"
            :value-style="{ color: getRateColor(analysisData.driver?.rate || 0) }"
          />
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false">
          <Statistic
            title="新员工培训完成率"
            :value="analysisData.newEmployee?.rate || 0"
            suffix="%"
            :value-style="{ color: getRateColor(analysisData.newEmployee?.rate || 0) }"
          />
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :md="8">
        <Card :bordered="false" title="高风险岗位培训">
          <div v-if="analysisLoading" class="loading-tip">
            <Spin />
          </div>
          <div v-else-if="analysisData.highRiskPosition">
            <div class="analysis-ring-wrap">
              <Progress
                type="circle"
                :percent="analysisData.highRiskPosition.rate"
                :stroke-color="getRateColor(analysisData.highRiskPosition.rate)"
                :width="120"
              >
                <template #format="{ percent }">
                  <span class="ring-percent">{{ percent }}%</span>
                </template>
              </Progress>
            </div>
            <Descriptions :column="1" size="small" style="margin-top: 16px;">
              <DescriptionsItem label="岗位总人数">
                {{ analysisData.highRiskPosition.total }}
              </DescriptionsItem>
              <DescriptionsItem label="已完成培训">
                {{ analysisData.highRiskPosition.completed }}
              </DescriptionsItem>
              <DescriptionsItem label="未完成">
                {{ analysisData.highRiskPosition.total - analysisData.highRiskPosition.completed }}
              </DescriptionsItem>
            </Descriptions>
            <div class="risk-keywords">
              <Tag v-for="kw in highRiskKeywords" :key="kw" color="red">{{ kw }}</Tag>
            </div>
          </div>
        </Card>
      </Col>

      <Col :xs="24" :md="8">
        <Card :bordered="false" title="驾驶员培训">
          <div v-if="analysisLoading" class="loading-tip">
            <Spin />
          </div>
          <div v-else-if="analysisData.driver">
            <div class="analysis-ring-wrap">
              <Progress
                type="circle"
                :percent="analysisData.driver.rate"
                :stroke-color="getRateColor(analysisData.driver.rate)"
                :width="120"
              >
                <template #format="{ percent }">
                  <span class="ring-percent">{{ percent }}%</span>
                </template>
              </Progress>
            </div>
            <Descriptions :column="1" size="small" style="margin-top: 16px;">
              <DescriptionsItem label="驾驶员总数">
                {{ analysisData.driver.total }}
              </DescriptionsItem>
              <DescriptionsItem label="已完成培训">
                {{ analysisData.driver.completed }}
              </DescriptionsItem>
              <DescriptionsItem label="未完成">
                {{ analysisData.driver.total - analysisData.driver.completed }}
              </DescriptionsItem>
            </Descriptions>
            <div class="risk-note">
              <IconifyIcon icon="lucide:info" />
              <span>统计包含驾驶员实操培训记录</span>
            </div>
          </div>
        </Card>
      </Col>

      <Col :xs="24" :md="8">
        <Card :bordered="false" title="新员工培训">
          <div v-if="analysisLoading" class="loading-tip">
            <Spin />
          </div>
          <div v-else-if="analysisData.newEmployee">
            <div class="analysis-ring-wrap">
              <Progress
                type="circle"
                :percent="analysisData.newEmployee.rate"
                :stroke-color="getRateColor(analysisData.newEmployee.rate)"
                :width="120"
              >
                <template #format="{ percent }">
                  <span class="ring-percent">{{ percent }}%</span>
                </template>
              </Progress>
            </div>
            <Descriptions :column="1" size="small" style="margin-top: 16px;">
              <DescriptionsItem label="新员工总数(90天内)">
                {{ analysisData.newEmployee.total }}
              </DescriptionsItem>
              <DescriptionsItem label="已完成培训">
                {{ analysisData.newEmployee.completed }}
              </DescriptionsItem>
              <DescriptionsItem label="未完成">
                {{ analysisData.newEmployee.total - analysisData.newEmployee.completed }}
              </DescriptionsItem>
            </Descriptions>
            <div class="risk-note">
              <IconifyIcon icon="lucide:info" />
              <span>入职90天内的新员工培训完成情况</span>
            </div>
          </div>
        </Card>
      </Col>
    </Row>

    <Card :bordered="false" title="培训薄弱环节分析" style="margin-top: 16px;">
      <div v-if="analysisLoading" class="loading-tip">
        <Spin />
      </div>
      <div v-else>
        <Alert
          v-if="weakPoints.length === 0"
          type="success"
          show-icon
          message="所有培训完成率均达标"
          description="未发现培训薄弱环节，请继续保持。"
        />
        <div v-else>
          <Alert
            v-for="(point, idx) in weakPoints"
            :key="idx"
            :type="point.severity"
            show-icon
            :message="point.title"
            :description="point.description"
            style="margin-bottom: 12px;"
          />
        </div>
      </div>
    </Card>
  </Page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Descriptions,
  DescriptionsItem,
  Tag,
  Alert,
  Spin,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';

import {
  getTrainingAnalysis,
  type TrainingAnalysisResult,
} from '#/api/hse/training';

const analysisLoading = ref(false);
const analysisData = ref<TrainingAnalysisResult>({
  highRiskPosition: { total: 0, completed: 0, rate: 0 },
  driver: { total: 0, completed: 0, rate: 0 },
  newEmployee: { total: 0, completed: 0, rate: 0 },
  summary: { overallRate: 0 },
});

const highRiskKeywords = ['司机', '电工', '焊工', '锅炉', '起重', '叉车', '特种', '危化'];

interface WeakPoint {
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
}

const weakPoints = computed<WeakPoint[]>(() => {
  const points: WeakPoint[] = [];
  const { highRiskPosition, driver, newEmployee } = analysisData.value;

  if (highRiskPosition.total > 0 && highRiskPosition.rate < 80) {
    points.push({
      title: `高风险岗位培训完成率偏低 (${highRiskPosition.rate}%)`,
      description: `高风险岗位共 ${highRiskPosition.total} 人，已完成 ${highRiskPosition.completed} 人，未完成 ${highRiskPosition.total - highRiskPosition.completed} 人。建议优先安排高风险岗位培训。`,
      severity: highRiskPosition.rate < 50 ? 'error' : 'warning',
    });
  }

  if (driver.total > 0 && driver.rate < 90) {
    points.push({
      title: `驾驶员培训完成率未达标 (${driver.rate}%)`,
      description: `驾驶员共 ${driver.total} 人，已完成 ${driver.completed} 人。驾驶员培训要求较高，建议完成率达到90%以上。`,
      severity: driver.rate < 70 ? 'error' : 'warning',
    });
  }

  if (newEmployee.total > 0 && newEmployee.rate < 100) {
    points.push({
      title: `新员工培训完成率未达100% (${newEmployee.rate}%)`,
      description: `新员工共 ${newEmployee.total} 人，已完成 ${newEmployee.completed} 人。新员工入职培训应100%完成，请尽快安排未完成人员培训。`,
      severity: newEmployee.rate < 80 ? 'error' : 'warning',
    });
  }

  return points;
});

function getRateColor(rate: number): string {
  if (rate >= 90) return '#52c41a';
  if (rate >= 70) return '#faad14';
  if (rate >= 50) return '#fa8c16';
  return '#ff4d4f';
}

async function fetchAnalysis() {
  analysisLoading.value = true;
  try {
    const data = await getTrainingAnalysis();
    analysisData.value = data;
  } catch (err) {
    console.warn('获取培训分析数据失败:', err);
    message.error('获取培训分析数据失败');
  } finally {
    analysisLoading.value = false;
  }
}

onMounted(async () => {
  await fetchAnalysis();
});
</script>

<style scoped lang="scss">
.hse-page {
  .analysis-ring-wrap {
    display: flex;
    justify-content: center;
    padding: 16px 0;
  }

  .ring-percent {
    font-size: 20px;
    font-weight: 600;
  }

  .risk-keywords {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .risk-note {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: hsl(var(--muted-foreground));
    font-size: 12px;
  }

  .loading-tip {
    display: flex;
    justify-content: center;
    padding: 32px 0;
  }
}
</style>
