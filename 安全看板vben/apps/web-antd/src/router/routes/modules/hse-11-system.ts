import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:settings',
      order: 11,
      title: '系统管理',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseSystem',
    path: '/system',
    redirect: '/system/users',
    children: [
      {
        meta: {
          title: '用户管理',
          icon: 'lucide:user-cog',
          authority: ['admin'],
        },
        name: 'SystemUsers',
        path: '/system/users',
        component: () => import('#/views/system/users/index.vue'),
      },
      {
        meta: {
          title: '角色管理',
          icon: 'lucide:shield-check',
          authority: ['admin'],
        },
        name: 'SystemRoles',
        path: '/system/roles',
        component: () => import('#/views/system/roles/index.vue'),
      },
      {
        meta: {
          title: '审计日志',
          icon: 'lucide:clipboard-list',
          authority: ['admin'],
        },
        name: 'SystemAudit',
        path: '/system/audit',
        component: () => import('#/views/security/audit/index.vue'),
      },
    ],
  },
];

export default routes;
