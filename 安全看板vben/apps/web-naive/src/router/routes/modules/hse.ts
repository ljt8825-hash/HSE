import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * HSE 一级菜单「安全总览」
 *
 * 整流自 web-antd 基线 hse-01-overview.ts（A 批次前 5 个二级页）。
 *
 * 权限（AI-09）：父级 /overview 放行 safety_manager；
 * 其余子页各自保有 authority:['admin']，不随之扩大（与 hse-site.ts 先例一致）。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:layout-dashboard',
      order: 1,
      title: $t('page.hse.overview'),
      authority: ['admin', 'safety_manager'],
      keepAlive: true,
    },
    name: 'HseOverview',
    path: '/overview',
    redirect: '/overview/leader-dashboard',
    children: [
      {
        // 领导视角统一看板（M2）：挂载于「安全总览」下的二级子页，非一级菜单。
        // 权限 admin/safety_manager 与后端只读端点 requireRole 对齐。
        meta: {
          title: $t('page.hse.leaderDashboard'),
          icon: 'lucide:eye',
          authority: ['admin', 'safety_manager'],
        },
        name: 'HseLeaderDashboard',
        path: '/overview/leader-dashboard',
        component: () => import('#/views/hse/leader-dashboard/index.vue'),
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
        component: () => import('#/views/analysis/cockpit/index.vue'),
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
        component: () => import('#/views/analysis/accident/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.assessmentAnalysis'),
          icon: 'lucide:pie-chart',
          authority: ['admin'],
        },
        name: 'HseAssessmentAnalysis',
        path: '/overview/assessment-analysis',
        component: () => import('#/views/analysis/assessment/index.vue'),
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
