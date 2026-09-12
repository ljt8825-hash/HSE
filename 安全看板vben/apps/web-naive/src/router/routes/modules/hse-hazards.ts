import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 隐患排查治理（order: 5，authority: admin）
 * 父菜单：/hazards，redirect 到隐患清单
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:search-check',
      order: 5,
      title: $t('page.hse.hazardGovernance'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseHazards',
    path: '/hazards',
    redirect: '/hazards/list',
    children: [
      {
        meta: {
          title: $t('page.hse.hazardList'),
          icon: 'lucide:clipboard-list',
          authority: ['admin'],
        },
        name: 'HazardsList',
        path: '/hazards/list',
        component: () => import('#/views/hazards/index.vue'),
      },
    ],
  },
];

export default routes;
