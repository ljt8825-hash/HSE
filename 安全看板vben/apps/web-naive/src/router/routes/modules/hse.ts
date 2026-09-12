import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * HSE 一级菜单「安全总览」
 *
 * 整流自 web-antd 基线 hse-01-overview.ts（A 批次前 5 个二级页）。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:layout-dashboard',
      order: 1,
      title: $t('page.hse.overview'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseOverview',
    path: '/overview',
    redirect: '/overview/cockpit',
    children: [
      {
        meta: {
          title: $t('page.hse.cockpit'),
          icon: 'lucide:gauge',
          authority: ['admin'],
        },
        name: 'HseCockpit',
        path: '/overview/cockpit',
        component: () => import('#/views/hse/cockpit/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.executiveCockpit'),
          icon: 'lucide:building-2',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'HseExecutiveCockpit',
        path: '/overview/executive-cockpit',
        component: () => import('#/views/hse/executive-cockpit/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.bi'),
          icon: 'lucide:bar-chart-3',
          authority: ['admin'],
        },
        name: 'HseBi',
        path: '/overview/bi',
        component: () => import('#/views/hse/bi/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.aiAnalysis'),
          icon: 'lucide:brain-circuit',
          authority: ['admin'],
        },
        name: 'HseAiAnalysis',
        path: '/overview/ai-analysis',
        component: () => import('#/views/hse/ai-analysis/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.driverRiskCenter'),
          icon: 'lucide:car',
          authority: ['admin'],
        },
        name: 'HseDriverRiskCenter',
        path: '/overview/driver-risk-center',
        component: () => import('#/views/hse/driver-risk-center/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.accidentAnalysis'),
          icon: 'lucide:alert-triangle',
          authority: ['admin'],
        },
        name: 'HseAccidentAnalysis',
        path: '/overview/accident-analysis',
        component: () => import('#/views/hse/accident-analysis/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.assessmentAnalysis'),
          icon: 'lucide:pie-chart',
          authority: ['admin'],
        },
        name: 'HseAssessmentAnalysis',
        path: '/overview/assessment-analysis',
        component: () => import('#/views/hse/assessment-analysis/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.reports'),
          icon: 'lucide:file-bar-chart',
          authority: ['admin'],
        },
        name: 'HseReports',
        path: '/overview/reports',
        component: () => import('#/views/hse/reports/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.warningCenter'),
          icon: 'lucide:bell-alert',
          authority: ['admin'],
        },
        name: 'HseWarningCenter',
        path: '/overview/warning-center',
        component: () => import('#/views/hse/warning-center/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.iot'),
          icon: 'lucide:radio',
          authority: ['admin'],
        },
        name: 'HseIot',
        path: '/overview/iot',
        component: () => import('#/views/hse/iot/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.supplyChain'),
          icon: 'lucide:truck',
          authority: ['admin'],
        },
        name: 'HseSupplyChain',
        path: '/overview/supply-chain',
        component: () => import('#/views/hse/supply-chain/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.alerts'),
          icon: 'lucide:bell',
          authority: ['admin'],
        },
        name: 'HseAlerts',
        path: '/overview/alerts',
        component: () => import('#/views/hse/alerts/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.notifications'),
          icon: 'lucide:bell-ring',
          authority: ['admin'],
        },
        name: 'HseNotifications',
        path: '/overview/notifications',
        component: () => import('#/views/hse/notifications/index.vue'),
      },
    ],
  },
];

export default routes;
