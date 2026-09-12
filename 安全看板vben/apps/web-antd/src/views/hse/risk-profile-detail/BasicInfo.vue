<template>
  <div class="basic-info">
    <div class="info-header">
      <div class="avatar-section">
        <div class="avatar">
          <IconifyIcon icon="lucide:user" :size="48" class="avatar-icon" />
        </div>
        <div class="name-section">
          <div class="name">{{ data.name }}</div>
          <div class="employee-code">{{ data.employeeCode }}</div>
        </div>
      </div>
      <div class="status-badge">
        <Tag :color="statusColor">{{ data.status }}</Tag>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">部门</div>
        <div class="info-value">{{ data.department || '-' }}</div>
      </div>
      <div class="info-item">
        <div class="info-label">岗位</div>
        <div class="info-value">{{ data.position || '-' }}</div>
      </div>
      <div class="info-item">
        <div class="info-label">作业单元</div>
        <div class="info-value">{{ data.operationUnit || '-' }}</div>
      </div>
      <div class="info-item">
        <div class="info-label">人员状态</div>
        <div class="info-value">{{ data.status || '-' }}</div>
      </div>
      <div class="info-item">
        <div class="info-label">人员类别</div>
        <div class="info-value">{{ data.personCategory || '-' }}</div>
      </div>
      <div class="info-item">
        <div class="info-label">人员性质</div>
        <div class="info-value">{{ data.personType || '-' }}</div>
      </div>
      <div class="info-item">
        <div class="info-label">联系方式</div>
        <div class="info-value">{{ maskPhone(data.phone) }}</div>
      </div>
      <div class="info-item">
        <div class="info-label">身份证号</div>
        <div class="info-value">{{ maskIdCard(data.idCard) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Tag } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import type { RiskProfileDetailApi } from '#/api/hse/risk-profile-detail';

const props = defineProps<{
  data: RiskProfileDetailApi.BasicInfo;
}>();

const statusColor = computed(() => {
  const status = props.data.status;
  if (!status) return 'default';
  if (status.includes('在职') || status.includes('正常')) return 'success';
  if (status.includes('离职') || status.includes('退休')) return 'default';
  if (status.includes('请假') || status.includes('休假')) return 'warning';
  return 'default';
});

function maskPhone(phone?: string) {
  if (!phone) return '-';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function maskIdCard(idCard?: string) {
  if (!idCard) return '-';
  return idCard.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2');
}
</script>

<style lang="less" scoped>
.basic-info {
  padding: 16px;

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #f0f0f0;

    .avatar-section {
      display: flex;
      align-items: center;
      gap: 16px;

      .avatar {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        display: flex;
        align-items: center;
        justify-content: center;

        .avatar-icon {
          color: #fff;
        }
      }

      .name-section {
        .name {
          font-size: 20px;
          font-weight: 600;
          color: #1f1f1f;
        }

        .employee-code {
          font-size: 14px;
          color: #8c8c8c;
          margin-top: 4px;
        }
      }
    }

    .status-badge {
      .ant-tag {
        font-size: 14px;
        padding: 4px 12px;
      }
    }
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;

    .info-item {
      .info-label {
        font-size: 12px;
        color: #8c8c8c;
        margin-bottom: 4px;
      }

      .info-value {
        font-size: 14px;
        color: #1f1f1f;
        font-weight: 500;
      }
    }
  }
}
</style>