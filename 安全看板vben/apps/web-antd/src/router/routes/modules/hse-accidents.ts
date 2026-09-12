import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:alert-circle',
      order: 10,
      title: '事故管理',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'Accidents',
    path: '/accidents',
    component: () => import('#/views/accidents/index.vue'),
  },
];

export default routes;
