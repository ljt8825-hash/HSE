import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:alert-triangle',
      order: 6,
      title: '三违管理',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'Violations',
    path: '/violations',
    component: () => import('#/views/violations/index.vue'),
  },
];

export default routes;