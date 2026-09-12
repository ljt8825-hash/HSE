import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:settings',
      order: 12,
      title: '系统管理',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'System',
    path: '/system',
    redirect: '/system/users',
    children: [
      {
        name: 'SystemUsers',
        path: '/system/users',
        component: () => import('#/views/system/users/index.vue'),
        meta: {
          title: '用户管理',
          icon: 'lucide:users',
          authority: ['admin'],
        },
      },
      {
        name: 'SystemRoles',
        path: '/system/roles',
        component: () => import('#/views/system/roles/index.vue'),
        meta: {
          title: '角色管理',
          icon: 'lucide:shield',
          authority: ['admin'],
        },
      },
    ],
  },
];

export default routes;
