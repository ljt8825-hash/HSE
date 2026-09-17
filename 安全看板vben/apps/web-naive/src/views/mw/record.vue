<script lang="ts" setup>
/**
 * MOBILE-WPS-V1 · 三违记录详情（全流程汇总视图）
 *
 * 一个 violationId 串起：现场照片 / 违章人员 / 三违行为 / 发现信息 /
 * 整改责任人 / 责任区域 / 整改后照片 / 整改时间 / 转派 / 反馈 / 复查。
 *
 * 页面只做「展示 + 动作入口」，是否允许操作由 core/flow.ts 判定。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  acceptTransfer,
  getBundle,
  getTransferById,
  reviewViolation,
} from '#/api/mw';
import type { PhotoRecord, TransferRecord, ViolationRecord } from '#/api/mw';
import { errText, fmtTime, resolvePhotos, statusLabel, statusTone, useAccount } from './shared';

defineOptions({ name: 'MwRecordDetail' });

const route = useRoute();
const router = useRouter();
const { account, ensure } = useAccount();

const violationId = String(route.query.id || '');
const record = ref<ViolationRecord | null>(null);
const photos = ref<Array<{ photo: PhotoRecord; url: string }>>([]);
const transfer = ref<TransferRecord | null>(null);
const reviewNote = ref('');
const busy = ref(false);
const errorMsg = ref('');

const beforeList = computed(() =>
  photos.value.filter((x) => x.photo.photoType === 'BEFORE'),
);
const afterList = computed(() =>
  photos.value.filter((x) => x.photo.photoType === 'AFTER'),
);

/** 当前登录人是整改责任人 ⇒ 可进入整改 */
const isRectifier = computed(
  () =>
    !!account.value &&
    !!record.value &&
    record.value.rectifyAccountId === account.value.accountId,
);

/** 待复查且当前登录人不是整改责任人 ⇒ 可复查（避免自整改自复查） */
const canReview = computed(
  () =>
    !!account.value &&
    record.value?.status === 'PENDING_REVIEW' &&
    !isRectifier.value,
);

const needAccept = computed(
  () =>
    !!account.value &&
    record.value?.status === 'TRANSFERRED' &&
    isRectifier.value &&
    transfer.value?.status === 'PENDING',
);

async function refresh() {
  photos.value = await resolvePhotos(violationId);
  const bundle = await getBundle(violationId);
  if (bundle) {
    record.value = bundle.record;
    transfer.value = await getTransferById(bundle.record.transferId);
  }
}

function goRectify() {
  void router.push(`/mw/violation/rectify?id=${encodeURIComponent(violationId)}`);
}

async function doAccept() {
  if (!transfer.value) return;
  busy.value = true;
  errorMsg.value = '';
  try {
    await acceptTransfer(transfer.value.transferId);
    await refresh();
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    busy.value = false;
  }
}

async function doReview(result: 'PASS' | 'REJECT') {
  if (!account.value) return;
  if (result === 'REJECT' && !reviewNote.value.trim()) {
    errorMsg.value = '不通过时必须填写原因';
    return;
  }
  busy.value = true;
  errorMsg.value = '';
  try {
    await reviewViolation(violationId, result, reviewNote.value, account.value);
    await refresh();
  } catch (e) {
    errorMsg.value = errText(e);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  if (!(await ensure())) return;
  await refresh();
});
</script>

<template>
  <div class="mw-page">
    <div v-if="!record" class="m-card mw-empty">加载中…</div>

    <template v-else>
      <div class="m-card mw-head">
        <div class="mw-head__top">
          <span class="mw-head__id">{{ record.violationId }}</span>
          <span class="mw-badge" :class="`is-${statusTone(record.status)}`">
            {{ statusLabel(record.status) }}
          </span>
        </div>
        <p class="mw-head__s">发现时间 {{ fmtTime(record.discoveredAt) }}</p>
      </div>

      <div class="m-card mw-sec">
        <div class="mw-sec__t">违章人员</div>
        <div v-if="record.violator" class="mw-kv">
          <div class="mw-kv__r"><span>姓名</span><b>{{ record.violator.name }}</b></div>
          <div class="mw-kv__r"><span>员工ID</span><b>{{ record.violator.employeeId }}</b></div>
          <div class="mw-kv__r"><span>职位</span><b>{{ record.violator.position || '-' }}</b></div>
          <div class="mw-kv__r"><span>班组</span><b>{{ record.violator.team || '-' }}</b></div>
          <div class="mw-kv__r"><span>作业单元</span><b>{{ record.violator.workUnit || '-' }}</b></div>
          <div class="mw-kv__r"><span>乡镇</span><b>{{ record.violator.township || '-' }}</b></div>
        </div>
        <p v-else class="mw-na">未选择</p>
      </div>

      <div class="m-card mw-sec">
        <div class="mw-sec__t">三违行为</div>
        <div v-if="record.rule" class="mw-kv">
          <div class="mw-kv__r"><span>名称</span><b>{{ record.rule.name }}</b></div>
          <div class="mw-kv__r"><span>分类</span><b>{{ record.rule.category || '-' }}</b></div>
        </div>
        <p v-else class="mw-na">未选择</p>
      </div>

      <div class="m-card mw-sec">
        <div class="mw-sec__t">现场照片（BEFORE）</div>
        <div class="mw-grid">
          <div v-for="p in beforeList" :key="p.photo.photoId" class="mw-thumb">
            <img v-if="p.url" :src="p.url" alt="现场照片" />
            <span v-else class="mw-thumb__na">附件无直链</span>
          </div>
        </div>
      </div>

      <div class="m-card mw-sec">
        <div class="mw-sec__t">整改后照片（AFTER）</div>
        <div v-if="afterList.length" class="mw-grid">
          <div v-for="p in afterList" :key="p.photo.photoId" class="mw-thumb">
            <img v-if="p.url" :src="p.url" alt="整改后照片" />
            <span v-else class="mw-thumb__na">附件无直链</span>
          </div>
        </div>
        <p v-else class="mw-na">尚未上传</p>
      </div>

      <div class="m-card mw-sec">
        <div class="mw-sec__t">整改 / 转派信息</div>
        <div class="mw-kv">
          <div class="mw-kv__r"><span>发现人</span><b>{{ record.discoverName }}</b></div>
          <div class="mw-kv__r"><span>发现地点</span><b>{{ record.location || '-' }}</b></div>
          <div class="mw-kv__r"><span>整改责任人</span><b>{{ record.rectifyName || '-' }}</b></div>
          <div class="mw-kv__r"><span>责任区域</span><b>{{ record.responsibleAreaCode || '-' }}</b></div>
          <div class="mw-kv__r"><span>整改措施</span><b>{{ record.measure || '-' }}</b></div>
          <div class="mw-kv__r"><span>整改时间</span><b>{{ fmtTime(record.rectifiedAt) || '-' }}</b></div>
        </div>
        <div v-if="transfer" class="mw-trans">
          <div class="mw-trans__t">转派单 {{ transfer.transferId }}</div>
          <div class="mw-kv">
            <div class="mw-kv__r"><span>发起人</span><b>{{ transfer.fromName }}</b></div>
            <div class="mw-kv__r"><span>责任区域</span><b>{{ transfer.toAreaName }}</b></div>
            <div class="mw-kv__r"><span>责任人</span><b>{{ transfer.toName }}</b></div>
            <div class="mw-kv__r"><span>状态</span><b>{{ transfer.status }}</b></div>
            <div class="mw-kv__r"><span>反馈</span><b>{{ transfer.feedbackNote || '-' }}</b></div>
          </div>
        </div>
      </div>

      <div
        v-if="record.status === 'PENDING_REVIEW' && !canReview"
        class="m-card mw-sec"
      >
        <p class="mw-pending">
          已提交整改，<strong>等待复查</strong>。<br />
          「谁可以复查」属业务权限矩阵，NODE-01 未定义、也不做任何硬编码；
          自查自纠类记录会停在「待复查」，复查人指派规则留待下一阶段由业务方确定。
        </p>
      </div>

      <div v-if="record.reviewResult" class="m-card mw-sec">
        <div class="mw-sec__t">复查</div>
        <div class="mw-kv">
          <div class="mw-kv__r">
            <span>结论</span>
            <b>{{ record.reviewResult === 'PASS' ? '通过' : '不通过' }}</b>
          </div>
          <div class="mw-kv__r"><span>复查人</span><b>{{ record.reviewName }}</b></div>
          <div class="mw-kv__r"><span>时间</span><b>{{ fmtTime(record.reviewedAt) }}</b></div>
          <div class="mw-kv__r"><span>说明</span><b>{{ record.reviewNote || '-' }}</b></div>
        </div>
      </div>

      <button
        v-if="needAccept"
        class="m-card mw-act mw-act--acc m-btn"
        type="button"
        :disabled="busy"
        @click="doAccept"
      >
        接收转派任务
      </button>

      <button
        v-if="isRectifier && record.status !== 'COMPLETED'"
        class="m-card mw-act m-btn"
        type="button"
        :disabled="busy"
        @click="goRectify"
      >
        去整改（拍整改后照片）
      </button>

      <div v-if="canReview" class="m-card mw-sec">
        <div class="mw-sec__t">复查</div>
        <textarea
          v-model="reviewNote"
          class="mw-ta"
          rows="2"
          placeholder="复查说明（不通过时必填）"
        ></textarea>
        <div class="mw-acts">
          <button class="mw-act mw-act--ok m-btn" type="button" :disabled="busy" @click="doReview('PASS')">
            通过
          </button>
          <button class="mw-act mw-act--no m-btn" type="button" :disabled="busy" @click="doReview('REJECT')">
            不通过
          </button>
        </div>
      </div>

      <p v-if="errorMsg" class="mw-error">{{ errorMsg }}</p>
    </template>
  </div>
</template>

<style scoped>
.mw-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mw-head {
  padding: 14px 16px;
}
.mw-head__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mw-head__id {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
}
.mw-head__s {
  margin: 6px 0 0;
  font-size: 12px;
  color: #8a8f99;
}
.mw-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}
.mw-badge.is-gray { background: #f2f3f5; color: #646a73; }
.mw-badge.is-orange { background: #fff3e6; color: #d46b08; }
.mw-badge.is-blue { background: #e6f4ff; color: #0958d9; }
.mw-badge.is-purple { background: #f9f0ff; color: #531dab; }
.mw-badge.is-green { background: #f6ffed; color: #389e0d; }
.mw-badge.is-red { background: #fff1f0; color: #cf1322; }
.mw-sec { padding: 14px 16px; }
.mw-sec__t { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.mw-kv { display: flex; flex-direction: column; gap: 6px; }
.mw-kv__r {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.mw-kv__r span { color: #8a8f99; flex: 0 0 auto; }
.mw-kv__r b { font-weight: 500; text-align: right; word-break: break-all; }
.mw-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.mw-thumb {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #f4f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mw-thumb img { width: 100%; height: 100%; object-fit: cover; }
.mw-thumb__na { font-size: 11px; color: #8a8f99; }
.mw-na { margin: 0; font-size: 13px; color: #c0c4cc; }
.mw-trans {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e4e6eb;
}
.mw-trans__t {
  font-size: 12px;
  color: #2f7dcd;
  margin-bottom: 8px;
  font-family: ui-monospace, Consolas, monospace;
}
.mw-act {
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: #2f7dcd;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}
.mw-act--acc { background: #d46b08; }
.mw-acts { display: flex; gap: 10px; margin-top: 10px; }
.mw-acts .mw-act { flex: 1; }
.mw-act--ok { background: #389e0d; }
.mw-act--no { background: #cf1322; }
.mw-ta {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 10px;
  font-size: 14px;
  box-sizing: border-box;
  resize: vertical;
}
.mw-empty { padding: 28px 16px; text-align: center; color: #8a8f99; }
.mw-pending {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #8a8f99;
}
.mw-error { margin: 0; color: #d4380d; font-size: 13px; }
</style>
