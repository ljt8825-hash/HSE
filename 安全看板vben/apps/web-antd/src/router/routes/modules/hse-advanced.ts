import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:sparkles',
      order: 15,
      title: '高级分析',
      authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
      hideInMenu: true,
    },
    name: 'HseAdvanced',
    path: '/hse-advanced',
    redirect: '/hse-advanced/cockpit',
    children: [
      {
        name: 'HseCockpit',
        path: '/hse-advanced/cockpit',
        component: () => import('#/views/hse/cockpit/index.vue'),
        meta: {
          title: 'HSE驾驶舱',
          icon: 'lucide:layout-dashboard',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
        },
      },
      {
        name: 'HseDriverRiskCenter',
        path: '/hse-advanced/driver-risk-center',
        component: () => import('#/views/hse/driver-risk-center/index.vue'),
        meta: {
          title: '驾驶员风险中心',
          icon: 'lucide:car',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
        },
      },
      {
        name: 'HseAccidentAnalysis',
        path: '/hse-advanced/accident-analysis',
        component: () => import('#/views/hse/accident-analysis/index.vue'),
        meta: {
          title: '事故分析中心',
          icon: 'lucide:flame',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
        },
      },
      {
        name: 'HseAssessmentAnalysis',
        path: '/hse-advanced/assessment-analysis',
        component: () => import('#/views/hse/assessment-analysis/index.vue'),
        meta: {
          title: '考核分析中心',
          icon: 'lucide:clipboard-list',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
        },
      },
      {
        name: 'HseExecutiveCockpit',
        path: '/hse-advanced/executive-cockpit',
        component: () => import('#/views/hse/executive-cockpit/index.vue'),
        meta: {
          title: '安全总览首页',
          icon: 'lucide:monitor-dot',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
        },
      },
      {
        name: 'HseWarningCenter',
        path: '/hse-advanced/warning-center',
        component: () => import('#/views/hse/warning-center/index.vue'),
        meta: {
          title: '预警与整改中心',
          icon: 'lucide:shield-alert',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager', 'administrator'],
        },
      },
      {
        name: 'HseBi',
        path: '/hse-advanced/bi',
        component: () => import('#/views/hse/bi/index.vue'),
        meta: {
          title: 'BI数据看板',
          icon: 'lucide:bar-chart-3',
          authority: ['admin'],
        },
      },
      {
        name: 'HseAiAnalysis',
        path: '/hse-advanced/ai-analysis',
        component: () => import('#/views/hse/ai-analysis/index.vue'),
        meta: {
          title: 'AI智能分析',
          icon: 'lucide:brain-circuit',
          authority: ['admin'],
        },
      },
      {
        name: 'HseIot',
        path: '/hse-advanced/iot',
        component: () => import('#/views/hse/iot/index.vue'),
        meta: {
          title: 'IoT物联网',
          icon: 'lucide:radio',
          authority: ['admin'],
        },
      },
      {
        name: 'HseSupplyChain',
        path: '/hse-advanced/supply-chain',
        component: () => import('#/views/hse/supply-chain/index.vue'),
        meta: {
          title: '供应链安全',
          icon: 'lucide:truck',
          authority: ['admin'],
        },
      },
      {
        name: 'HseRiskProfileDetail',
        path: '/hse-advanced/risk-profile/:employeeId',
        component: () => import('#/views/hse/risk-profile-detail/index.vue'),
        meta: {
          title: '员工风险画像详情',
          icon: 'lucide:user-circle',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
          hideInMenu: true,
        },
      },
    ],
  },
];

export default routes;
