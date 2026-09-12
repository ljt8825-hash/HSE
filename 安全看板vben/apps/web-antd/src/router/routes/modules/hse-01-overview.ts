import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:layout-dashboard',
      order: 1,
      title: '安全总览',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseOverview',
    path: '/overview',
    redirect: '/overview/cockpit',
    children: [
      {
        meta: {
          title: '安全总览首页',
          icon: 'lucide:gauge',
          authority: ['admin'],
        },
        name: 'HseCockpit',
        path: '/overview/cockpit',
        component: () => import('#/views/hse/cockpit/index.vue'),
      },
      {
        meta: {
          title: '智能分析面板',
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
          title: 'BI数据看板',
          icon: 'lucide:bar-chart-3',
          authority: ['admin'],
        },
        name: 'HseBi',
        path: '/overview/bi',
        component: () => import('#/views/hse/bi/index.vue'),
      },
      {
        meta: {
          title: 'AI智能分析',
          icon: 'lucide:brain-circuit',
          authority: ['admin'],
        },
        name: 'HseAiAnalysis',
        path: '/overview/ai-analysis',
        component: () => import('#/views/hse/ai-analysis/index.vue'),
      },
      {
        meta: {
          title: '驾驶员风险中心',
          icon: 'lucide:car',
          authority: ['admin'],
        },
        name: 'HseDriverRiskCenter',
        path: '/overview/driver-risk-center',
        component: () => import('#/views/hse/driver-risk-center/index.vue'),
      },
      {
        meta: {
          title: '事故分析中心',
          icon: 'lucide:alert-triangle',
          authority: ['admin'],
        },
        name: 'HseAccidentAnalysis',
        path: '/overview/accident-analysis',
        component: () => import('#/views/hse/accident-analysis/index.vue'),
      },
      {
        meta: {
          title: '考核分析中心',
          icon: 'lucide:pie-chart',
          authority: ['admin'],
        },
        name: 'HseAssessmentAnalysis',
        path: '/overview/assessment-analysis',
        component: () => import('#/views/hse/assessment-analysis/index.vue'),
      },
      {
        meta: {
          title: '预警与整改中心',
          icon: 'lucide:bell-alert',
          authority: ['admin'],
        },
        name: 'HseWarningCenter',
        path: '/overview/warning-center',
        component: () => import('#/views/hse/warning-center/index.vue'),
      },
      {
        meta: {
          title: 'IoT物联网',
          icon: 'lucide:radio',
          authority: ['admin'],
        },
        name: 'HseIot',
        path: '/overview/iot',
        component: () => import('#/views/hse/iot/index.vue'),
      },
      {
        meta: {
          title: '供应链安全',
          icon: 'lucide:truck',
          authority: ['admin'],
        },
        name: 'HseSupplyChain',
        path: '/overview/supply-chain',
        component: () => import('#/views/hse/supply-chain/index.vue'),
      },
      {
        meta: {
          title: '告警中心',
          icon: 'lucide:bell',
          authority: ['admin'],
        },
        name: 'HseAlerts',
        path: '/overview/alerts',
        component: () => import('#/views/hse/alerts/index.vue'),
      },
      {
        meta: {
          title: '通知中心',
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
