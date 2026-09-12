import type { RouteRecordRaw } from 'vue-router';

/**
 * 事故管理（web-naive）
 * 路径: /accidents
 * order: 5（在隐患和风险之间，按用户要求）
 * authority: admin
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:alert-circle',
      order: 5,
      title: '事故管理',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'Accidents',
    path: '/accidents',
    component: () => import('#/views/accidents/index.vue'),
  },
];

export default routes;
