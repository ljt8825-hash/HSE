<script lang="ts" setup>
/**
 * 驾驶员违章记录（web-naive · 驾驶员管理 · 违章记录）
 * 三级菜单「驾驶员违章记录」页面：将原有列表拆为两个 tab ——
 *   - 驾驶证扣分记录（与历史列表一致）
 *   - 三违扣分记录（与「驾驶证扣分记录」一致，共用同一列表组件）
 * 两个 tab 均渲染 ViolationList（同一份逻辑与样式），保证内容一致。
 */
import { NTabs, NTabPane } from 'naive-ui';
import { HsePageLayout } from '#/components/hse';
import { $t } from '#/locales';
import ViolationList from './ViolationList.vue';

defineOptions({ name: 'SiteDriverViolation' });
</script>

<template>
  <HsePageLayout :title="$t('page.hse.siteDriverViolation')">
    <NTabs type="line" animated>
      <NTabPane name="license" tab="驾驶证扣分记录">
        <ViolationList />
      </NTabPane>
      <NTabPane name="threeViolation" tab="三违扣分记录">
        <ViolationList :name-only="true" />
      </NTabPane>
    </NTabs>
  </HsePageLayout>
</template>
