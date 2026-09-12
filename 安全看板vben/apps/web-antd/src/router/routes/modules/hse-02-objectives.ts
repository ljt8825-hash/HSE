import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:target',
      order: 2,
      title: '目标职责',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseObjectives',
    path: '/objectives',
    redirect: '/objectives/responsibility',
    children: [
      {
        meta: {
          title: '目标责任书管理',
          icon: 'lucide:file-signature',
          authority: ['admin'],
        },
        name: 'ObjectivesResponsibility',
        path: '/objectives/responsibility',
        component: () => import('#/views/goals/index.vue'),
      },
      {
        meta: {
          title: '安全人员及安委会',
          icon: 'lucide:users-round',
          authority: ['admin'],
        },
        name: 'ObjectivesCommittee',
        path: '/objectives/committee',
        component: () => import('#/views/objectives/committee/index.vue'),
      },
      {
        meta: {
          title: '责任制及考核',
          icon: 'lucide:award',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'ObjectivesAssessment',
        path: '/objectives/assessment',
        component: () => import('#/views/objectives/assessment/index.vue'),
      },
      {
        meta: {
          title: '安全费用预算及支出',
          icon: 'lucide:wallet',
          authority: ['admin'],
        },
        name: 'ObjectivesBudget',
        path: '/objectives/budget',
        component: () => import('#/views/objectives/budget/index.vue'),
      },
      {
        meta: {
          title: '月度安全履职考核',
          icon: 'lucide:file-check-2',
          authority: ['admin'],
        },
        name: 'AssessmentMonthlyIndex',
        path: '/objectives/assessment-monthly',
        component: () => import('#/views/hse/assessment-monthly/index.vue'),
      },
      {
        meta: {
          title: '考核周期',
          icon: 'lucide:repeat',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyCycles',
        path: '/objectives/assessment-cycles',
        component: () => import('#/views/hse/assessment-monthly/cycles.vue'),
      },
      {
        meta: {
          title: '考核对象',
          icon: 'lucide:users-round',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyTargets',
        path: '/objectives/assessment-targets',
        component: () => import('#/views/hse/assessment-monthly/targets.vue'),
      },
      {
        meta: {
          title: '自动评分',
          icon: 'lucide:calculator',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyScoring',
        path: '/objectives/assessment-scoring',
        component: () => import('#/views/hse/assessment-monthly/scoring.vue'),
      },
      {
        meta: {
          title: '扣分审核',
          icon: 'lucide:check-circle-2',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyReview',
        path: '/objectives/assessment-deduction-review',
        component: () => import('#/views/hse/assessment-monthly/deduction-review.vue'),
      },
      {
        meta: {
          title: '扣分调整',
          icon: 'lucide:sliders-horizontal',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyAdjust',
        path: '/objectives/assessment-deduction-adjust',
        component: () => import('#/views/hse/assessment-monthly/deduction-adjust.vue'),
      },
      {
        meta: {
          title: '结果冻结',
          icon: 'lucide:snowflake',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyFreeze',
        path: '/objectives/assessment-freeze',
        component: () => import('#/views/hse/assessment-monthly/freeze.vue'),
      },
      {
        meta: {
          title: 'Excel导入导出',
          icon: 'lucide:file-spreadsheet',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentMonthlyExcel',
        path: '/objectives/assessment-excel',
        component: () => import('#/views/hse/assessment-monthly/excel.vue'),
      },
    ],
  },
];

export default routes;
