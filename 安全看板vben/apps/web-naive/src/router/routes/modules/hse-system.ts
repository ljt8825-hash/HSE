import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 系统管理（HSE 模块）
 * 父菜单：/system（order 11，authority admin，redirect /system/users）
 * 子页面：/system/users（用户管理）、/system/roles（角色管理）、/system/audit（审计日志）
 * 路由由 src/router/routes/index.ts 的 import.meta.glob 自动发现；
 * 不设置 ignoreAccess，由 accessRoutes 依 authority:['admin'] 登录后过滤。
 * name/path/order/icon/authority 与 web-antd 基线 hse-11-system.ts 一致。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:settings',
      order: 11,
      title: $t('page.hse.system'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseSystem',
    path: '/system',
    redirect: '/system/users',
    children: [
      {
        meta: {
          title: $t('page.hse.systemUsers'),
          icon: 'lucide:user-cog',
          authority: ['admin'],
        },
        name: 'SystemUsers',
        path: '/system/users',
        component: () => import('#/views/system/users/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.systemRoles'),
          icon: 'lucide:shield-check',
          authority: ['admin'],
        },
        name: 'SystemRoles',
        path: '/system/roles',
        component: () => import('#/views/system/roles/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.systemAudit'),
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
