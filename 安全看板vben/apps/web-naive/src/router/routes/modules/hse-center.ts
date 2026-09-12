import type { RouteRecordRaw } from 'vue-router';

/**
 * 告警中心 & 通知中心（web-naive）
 * 路径: /hse/alerts（告警中心）、/hse/notifications（通知中心）
 * 这两个页面在 web-antd 中为 hideInMenu 页面（通过通知入口访问），保持一致。
 */
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
