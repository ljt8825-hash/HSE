<script lang="ts" setup>
/**
 * 风险点详情抽屉（web-naive 试点 · 阶段04）
 * Naive UI 实现，功能对齐 web-antd 风险详情；含四个分区：
 *   基本信息 / 附件（列表·上传·删除） / 版本履历 / 关联隐患（查询·生成）。
 * 评估工作台经 RiskAssessModal 内嵌；全部禁引 Ant Design。
 */
import { ref, computed, watch } from 'vue';
import {
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NList,
  NListItem,
  NPopconfirm,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  NText,
  NUpload,
  NUploadDragger,
  NSpace,
  NThing,
} from 'naive-ui';
import {
  deleteRiskAttachment,
  generateHazardFromRisk,
  getRelatedHazards,
  getRiskAttachments,
  getRiskDetail,
  getRiskVersions,
  uploadRiskAttachment,
  type RiskControlApi,
} from '#/api/risk-control';
import RiskAssessModal from './RiskAssessModal.vue';
import { message } from '#/adapter/naive';

const props = defineProps<{
  open: boolean;
  riskId?: number;
  riskName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'refreshed'): void;
}>();

const detail = ref<RiskControlApi.RiskSource | null>(null);
const loading = ref(false);
const attachments = ref<RiskControlApi.Attachment[]>([]);
const versions = ref<RiskControlApi.VersionRecord[]>([]);
const hazards = ref<RiskControlApi.RelatedHazard[]>([]);
const hazardTotal = ref(0);

const assessOpen = ref(false);

// Naive NTag type 仅接受 primary/default/error/success/warning/info
type NaiveTagType = 'primary' | 'default' | 'error' | 'success' | 'warning' | 'info';
const levelTag: Record<string, NaiveTagType> = {
  一级: 'error',
  二级: 'warning',
  三级: 'info',
  四级: 'success',
};
const statusTag: Record<string, NaiveTagType> = {
  正常: 'success',
  已处置: 'info',
  监控中: 'warning',
};

function fmtSize(bytes: number): string {
  if (!bytes) return '-';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
}
function fmtVal(v: any): string {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

async function loadAll(id: number) {
  loading.value = true;
  try {
    const [d, att, ver, hz] = await Promise.all([
      getRiskDetail(id),
      getRiskAttachments(id),
      getRiskVersions(id),
      getRelatedHazards(id),
    ]);
    detail.value = d;
    attachments.value = att || [];
    versions.value = ver || [];
    hazards.value = hz.list || [];
    hazardTotal.value = hz.total ?? 0;
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (val) => {
    if (val && props.riskId) {
      detail.value = null;
      attachments.value = [];
      versions.value = [];
      hazards.value = [];
      loadAll(props.riskId);
    }
  },
);

// 附件上传（手动，禁止自动上传到未知地址）
function handleUpload({ file }: { file?: any }) {
  const raw: File | undefined = file?.file ?? file;
  if (!raw || !(raw instanceof File) || !props.riskId) return;
  uploadRiskAttachment(props.riskId, raw)
    .then(() => {
      message.success('上传成功');
      loadAll(props.riskId as number);
    })
    .catch(() => {
      /* 拦截器已提示 */
    });
}

function handleDeleteAttachment(aid: number) {
  if (!props.riskId) return;
  deleteRiskAttachment(props.riskId, aid)
    .then(() => {
      message.success('删除成功');
      loadAll(props.riskId as number);
    })
    .catch(() => {
      /* 拦截器已提示 */
    });
}

function handleGenerateHazard() {
  if (!props.riskId) return;
  generateHazardFromRisk(props.riskId, {})
    .then(() => {
      message.success('已从该风险点生成隐患');
      loadAll(props.riskId as number);
      emit('refreshed');
    })
    .catch(() => {
      /* 拦截器已提示 */
    });
}

function openAssess() {
  assessOpen.value = true;
}
function onAssessSuccess() {
  if (props.riskId) loadAll(props.riskId);
  emit('refreshed');
}

function handleClose() {
  emit('update:open', false);
}

const drawerTitle = computed(() => (props.riskName ? `风险点详情 - ${props.riskName}` : '风险点详情'));
</script>

<template>
  <NDrawer :show="props.open" :width="760" placement="right" @update:show="handleClose">
    <NDrawerContent :title="drawerTitle" :native-scrollbar="true">
      <NSpin :show="loading">
        <NTabs type="line" animated>
          <!-- 基本信息 -->
          <NTabPane name="basic" tab="基本信息">
            <NDescriptions
              v-if="detail"
              label-placement="left"
              :column="1"
              bordered
              size="small"
            >
              <NDescriptionsItem label="风险点编号">{{ fmtVal(detail.sourceId) }}</NDescriptionsItem>
              <NDescriptionsItem label="风险点名称">{{ fmtVal(detail.name) }}</NDescriptionsItem>
              <NDescriptionsItem label="等级">
                <NTag :type="levelTag[detail.level] || 'default'">{{ detail.level }}</NTag>
              </NDescriptionsItem>
              <NDescriptionsItem label="类型">{{ fmtVal(detail.type) }}</NDescriptionsItem>
              <NDescriptionsItem label="类别">{{ fmtVal(detail.category) }}</NDescriptionsItem>
              <NDescriptionsItem label="区域">{{ fmtVal(detail.area) }}</NDescriptionsItem>
              <NDescriptionsItem label="位置">{{ fmtVal(detail.location) }}</NDescriptionsItem>
              <NDescriptionsItem label="责任对象">{{ fmtVal(detail.accidentType) }}</NDescriptionsItem>
              <NDescriptionsItem label="状态">
                <NTag :type="statusTag[detail.status] || 'default'">{{ detail.status }}</NTag>
              </NDescriptionsItem>
              <NDescriptionsItem label="评估日期">{{ fmtVal(detail.assessmentDate) }}</NDescriptionsItem>
              <NDescriptionsItem label="复评周期(月)">{{ fmtVal(detail.reviewCycle) }}</NDescriptionsItem>
              <NDescriptionsItem label="评估方法">{{ fmtVal(detail.assessmentMethod) }}</NDescriptionsItem>
              <NDescriptionsItem label="评估得分">{{ fmtVal(detail.assessmentScore) }}</NDescriptionsItem>
              <NDescriptionsItem label="管控措施">{{ fmtVal(detail.measures) }}</NDescriptionsItem>
              <NDescriptionsItem label="应急措施">{{ fmtVal(detail.emergency) }}</NDescriptionsItem>
            </NDescriptions>
            <NEmpty v-else description="加载中或数据缺失" />
          </NTabPane>

          <!-- 附件 -->
          <NTabPane name="attachment" tab="附件">
            <div class="mb-3">
              <NUpload :default-upload="false" :show-file-list="false" @change="handleUpload">
                <NUploadDragger>
                  <div class="py-3 text-center text-sm">点击或拖拽文件上传附件</div>
                </NUploadDragger>
              </NUpload>
            </div>
            <NList v-if="attachments.length" bordered>
              <NListItem v-for="att in attachments" :key="att.id">
                <NThing :title="att.originalName">
                  <template #description>
                    <NSpace size="small">
                      <NTag size="small">{{ att.fileType || 'file' }}</NTag>
                      <NText depth="3">{{ fmtSize(att.fileSize) }}</NText>
                      <NText depth="3">v{{ att.version }}</NText>
                      <NText depth="3">{{ att.uploadedBy }}</NText>
                    </NSpace>
                  </template>
                </NThing>
                <template #suffix>
                  <NSpace>
                    <NButton
                      text
                      tag="a"
                      :href="att.fileUrl"
                      target="_blank"
                      type="primary"
                    >
                      下载
                    </NButton>
                    <NPopconfirm @positive-click="handleDeleteAttachment(att.id)">
                      <template #trigger>
                        <NButton text type="error">删除</NButton>
                      </template>
                      确定删除该附件吗？
                    </NPopconfirm>
                  </NSpace>
                </template>
              </NListItem>
            </NList>
            <NEmpty v-else description="暂无附件" />
          </NTabPane>

          <!-- 版本履历 -->
          <NTabPane name="version" tab="版本履历">
            <NList v-if="versions.length" bordered>
              <NListItem v-for="v in versions" :key="v.id">
                <NThing :title="`v${v.version} · ${v.changeType}`">
                  <template #description>
                    <NSpace size="small">
                      <NText depth="3">{{ v.changeSummary || '无摘要' }}</NText>
                      <NText depth="3">{{ v.changedBy }}</NText>
                      <NText depth="3">{{ v.createdAt }}</NText>
                    </NSpace>
                  </template>
                </NThing>
              </NListItem>
            </NList>
            <NEmpty v-else description="暂无版本履历" />
          </NTabPane>

          <!-- 关联隐患 -->
          <NTabPane name="hazard" :tab="`关联隐患 (${hazardTotal})`">
            <NSpace class="mb-3">
              <NButton type="primary" secondary @click="handleGenerateHazard">
                从该风险点生成隐患
              </NButton>
            </NSpace>
            <NList v-if="hazards.length" bordered>
              <NListItem v-for="hz in hazards" :key="hz.id">
                <NThing :title="`#${hz.no ?? hz.id} ${hz.description}`">
                  <template #description>
                    <NSpace size="small">
                      <NTag size="small" :type="hz.isResolved === '是' ? 'success' : 'warning'">
                        {{ hz.isResolved === '是' ? '已整改' : '未整改' }}
                      </NTag>
                      <NText depth="3">检查人：{{ hz.checker }}</NText>
                      <NText depth="3">整改人：{{ hz.fixer }}</NText>
                      <NText depth="3">{{ hz.checkDate }}</NText>
                      <NTag v-if="hz.riskLevel" size="small">{{ hz.riskLevel }}</NTag>
                    </NSpace>
                  </template>
                </NThing>
              </NListItem>
            </NList>
            <NEmpty v-else description="暂无关联隐患" />
          </NTabPane>
        </NTabs>
      </NSpin>

      <template #footer>
        <NSpace justify="end">
          <NButton type="primary" @click="openAssess">评估</NButton>
          <NButton @click="handleClose">关闭</NButton>
        </NSpace>
      </template>
    </NDrawerContent>

    <RiskAssessModal
      v-model:open="assessOpen"
      :risk-id="props.riskId"
      :risk-name="props.riskName"
      :current-method="detail?.assessmentMethod"
      :current-score="detail?.assessmentScore"
      @success="onAssessSuccess"
    />
  </NDrawer>
</template>
