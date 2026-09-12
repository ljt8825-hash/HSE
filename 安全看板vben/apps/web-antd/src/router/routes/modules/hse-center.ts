import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:bell',
      order: 1,
      title: '告警中心',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'HseAlerts',
    path: '/hse/alerts',
    component: () => import('#/views/hse/alerts/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:git-branch',
      order: 2,
      title: '工作流引擎',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'HseWorkflow',
    path: '/hse/workflow',
    component: () => import('#/views/hse/workflow/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:bell-ring',
      order: 14,
      title: '通知中心',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'HseNotifications',
    path: '/hse/notifications',
    component: () => import('#/views/hse/notifications/index.vue'),
  },
];

export default routes;
