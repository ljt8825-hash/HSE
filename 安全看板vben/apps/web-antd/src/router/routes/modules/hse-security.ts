import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:file-text',
      order: 13,
      title: '安全审计',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'Security',
    path: '/security',
    redirect: '/security/audit',
    children: [
      {
        name: 'SecurityAudit',
        path: '/security/audit',
        component: () => import('#/views/security/audit/index.vue'),
        meta: {
          title: '审计日志',
          icon: 'lucide:clipboard-list',
          authority: ['admin'],
        },
      },
    ],
  },
];

export default routes;
