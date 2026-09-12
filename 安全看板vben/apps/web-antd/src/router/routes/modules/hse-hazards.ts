import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield-alert',
      order: 8,
      title: '隐患排查治理',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'Hazards',
    path: '/hazards',
    component: () => import('#/views/hazards/index.vue'),
  },
];

export default routes;
