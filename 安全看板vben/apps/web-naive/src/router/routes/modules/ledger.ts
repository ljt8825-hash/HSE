import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 台账中心（ledger）
 * 所有数据录入/CRUD 类页面归入此模块
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:database',
      order: 5,
      title: '台账中心',
    },
    name: 'LedgerCenter',
    path: '/ledger',
    redirect: '/ledger/training',
    children: [
      {
        meta: {
          title: $t('page.hse.trainingLedger'),
          icon: 'lucide:book-open',
          authority: ['admin'],
        },
        name: 'TrainingLedger',
        path: '/ledger/training',
        component: () => import('#/views/ledger/training/index.vue'),
      },
      {
        meta: {
          title: '三违台账',
          icon: 'lucide:alert-triangle',
          authority: ['admin', 'grid_inspector'],
        },
        name: 'ViolationLedger',
        path: '/ledger/violation',
        component: () => import('#/views/ledger/violation/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.siteGridPatrolLedger'),
          icon: 'lucide:clipboard-list',
          authority: ['admin', 'grid_inspector'],
        },
        name: 'GridPatrolLedger',
        path: '/ledger/grid',
        component: () => import('#/views/ledger/grid/index.vue'),
      },
    ],
  },
];

export default routes;
