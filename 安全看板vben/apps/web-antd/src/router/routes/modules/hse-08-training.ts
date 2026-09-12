import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:graduation-cap',
      order: 8,
      title: '培训考核',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseTraining',
    path: '/training',
    redirect: '/training/plans',
    children: [
      {
        meta: {
          title: '培训计划',
          icon: 'lucide:calendar-check',
          authority: ['admin'],
        },
        name: 'TrainingPlans',
        path: '/training/plans',
        component: () => import('#/views/training/plans/index.vue'),
      },
      {
        meta: {
          title: '培训记录',
          icon: 'lucide:book-open',
          authority: ['admin'],
        },
        name: 'TrainingRecords',
        path: '/training/records',
        component: () => import('#/views/training/ledger/index.vue'),
      },
      {
        meta: {
          title: '考核管理',
          icon: 'lucide:clipboard-check',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'AssessmentManagement',
        path: '/training/assessments',
        component: () => import('#/views/training/requirements/index.vue'),
      },
      {
        meta: {
          title: '证书管理',
          icon: 'lucide:badge-check',
          authority: ['admin'],
        },
        name: 'CertificateManagement',
        path: '/training/certificates',
        component: () => import('#/views/training/index.vue'),
      },
      {
        meta: {
          title: '综合考核',
          icon: 'lucide:trending-up',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'ComprehensiveAssessment',
        path: '/training/comprehensive',
        component: () => import('#/views/training/stats/index.vue'),
      },
    ],
  },
];

export default routes;
