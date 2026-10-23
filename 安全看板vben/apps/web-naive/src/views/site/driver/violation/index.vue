<script lang="ts" setup>
/**
 * 驾驶员违章记录（web-naive · 驾驶员管理 · 违章记录）
 * 三级菜单「驾驶员违章记录」页面：将原有列表拆为两个 tab ——
 *   - 驾驶证扣分记录（与历史列表一致）
 *   - 三违扣分记录（与「驾驶证扣分记录」一致，共用同一列表组件）
 * 两个 tab 均渲染 ViolationList（同一份逻辑与样式），保证内容一致。
 */
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { NTabs, NTabPane } from 'naive-ui';
import { HsePageLayout } from '#/components/hse';
import { $t } from '#/locales';
import ViolationList from './ViolationList.vue';

defineOptions({ name: 'SiteDriverViolation' });

// 支持外部下钻：query 携带 tab（license/threeViolation）预选 Tab、name 预填姓名过滤
// （「交通安全档案 · 累计扣分」明细点击下钻使用；无 query 时行为与默认一致）
const route = useRoute();
const activeTab = ref(route.query.tab === 'threeViolation' ? 'threeViolation' : 'license');
const nameFilter = typeof route.query.name === 'string' ? route.query.name : '';
</script>

<template>
  <HsePageLayout :title="$t('page.hse.siteDriverViolation')">
    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="license" tab="驾驶证扣分记录">
        <ViolationList :init-keyword="nameFilter" />
      </NTabPane>
      <NTabPane name="threeViolation" tab="三违扣分记录">
        <ViolationList :name-only="true" :init-keyword="nameFilter" />
      </NTabPane>
    </NTabs>
  </HsePageLayout>
</template>
