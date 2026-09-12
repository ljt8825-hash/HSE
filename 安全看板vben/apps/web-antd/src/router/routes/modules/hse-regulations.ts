import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:book-open',
      order: 4,
      title: '规章制度',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'Regulations',
    path: '/regulations',
    component: () => import('#/views/regulations/index.vue'),
  },
];

export default routes;
