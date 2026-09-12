import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:calendar-check',
      order: 20,
      title: '月度安全履职考核',
      authority: ['admin', 'hse_manager', 'township_manager'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'HseAssessmentMonthly',
    path: '/hse/assessment-monthly',
    redirect: '/hse/assessment-monthly/index',
    children: [
      {
        meta: {
          title: '考核工作台',
          icon: 'lucide:layout-dashboard',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyIndex',
        path: 'index',
        component: () => import('#/views/hse/assessment-monthly/index.vue'),
      },
      {
        meta: {
          title: '考核周期',
          icon: 'lucide:calendar',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyCycles',
        path: 'cycles',
        component: () => import('#/views/hse/assessment-monthly/cycles.vue'),
      },
      {
        meta: {
          title: '考核对象',
          icon: 'lucide:users',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyTargets',
        path: 'targets',
        component: () => import('#/views/hse/assessment-monthly/targets.vue'),
      },
      {
        meta: {
          title: '自动评分',
          icon: 'lucide:calculator',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyScoring',
        path: 'scoring',
        component: () => import('#/views/hse/assessment-monthly/scoring.vue'),
      },
      {
        meta: {
          title: '扣分审核',
          icon: 'lucide:check-circle',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyDeductionReview',
        path: 'deduction-review',
        component: () => import('#/views/hse/assessment-monthly/deduction-review.vue'),
      },
      {
        meta: {
          title: '扣分调整',
          icon: 'lucide:edit-3',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyDeductionAdjust',
        path: 'deduction-adjust',
        component: () => import('#/views/hse/assessment-monthly/deduction-adjust.vue'),
      },
      {
        meta: {
          title: '结果冻结',
          icon: 'lucide:lock',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyFreeze',
        path: 'freeze',
        component: () => import('#/views/hse/assessment-monthly/freeze.vue'),
      },
      {
        meta: {
          title: 'Excel导入导出',
          icon: 'lucide:file-spreadsheet',
          keepAlive: true,
        },
        name: 'HseAssessmentMonthlyExcel',
        path: 'excel',
        component: () => import('#/views/hse/assessment-monthly/excel.vue'),
      },
    ],
  },
];

export default routes;
