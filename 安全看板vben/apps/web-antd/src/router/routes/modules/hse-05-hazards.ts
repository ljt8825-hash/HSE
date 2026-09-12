import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:search-check',
      order: 5,
      title: '隐患治理',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseHazards',
    path: '/hazards',
    redirect: '/hazards/list',
    children: [
      {
        meta: {
          title: '隐患清单',
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
