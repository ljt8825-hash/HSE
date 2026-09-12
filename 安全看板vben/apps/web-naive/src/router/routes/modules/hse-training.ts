import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 培训考核（order 8）
 * 父菜单：/training（order 8，authority admin，redirect 到培训计划）
 * 子页面（对齐基线 hse-08-training.ts）：
 *   /training/plans          培训计划（可见）
 *   /training/records        培训记录（可见，视图目录 ledger）
 *   /training/assessments    考核管理（隐藏）
 *   /training/certificates   证书管理（可见，视图目录 certificates）
 *   /training/comprehensive  综合考核（隐藏，视图目录 stats）
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:graduation-cap',
      order: 8,
      title: $t('page.hse.training'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseTraining',
    path: '/training',
    redirect: '/training/plans',
    children: [
      {
        meta: {
          title: $t('page.hse.trainingPlans'),
          icon: 'lucide:calendar-check',
          authority: ['admin'],
        },
        name: 'TrainingPlans',
        path: '/training/plans',
        component: () => import('#/views/training/plans/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.trainingLedger'),
          icon: 'lucide:book-open',
          authority: ['admin'],
        },
        name: 'TrainingRecords',
        path: '/training/records',
        component: () => import('#/views/training/ledger/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.trainingRequirements'),
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
          title: $t('page.hse.trainingCertificates'),
          icon: 'lucide:badge-check',
          authority: ['admin'],
        },
        name: 'CertificateManagement',
        path: '/training/certificates',
        component: () => import('#/views/training/certificates/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.trainingStats'),
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
