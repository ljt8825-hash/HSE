/**
 * HSE 员工档案中心路由 - Sprint5.7
 *
 * 结构: 父菜单"员工档案中心" + 子菜单（档案列表）
 * 权限: authority: ['admin', 'safety_manager', 'employee']
 * 路由自动加载: 放入 modules/ 即生效
 */

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:user-circle',
      order: 7,
      title: '员工档案中心',
      authority: ['admin', 'safety_manager', 'employee'],
      hideInMenu: true,
    },
    name: 'HseEmployeeProfile',
    path: '/hse/employee-profile',
    redirect: '/hse/employee-profile/list',
    children: [
      {
        name: 'HseEmployeeProfileList',
        path: '/hse/employee-profile/list',
        component: () => import('#/views/hse/employee-profile/index.vue'),
        meta: {
          title: '员工档案',
          icon: 'lucide:users',
          authority: ['admin', 'safety_manager', 'employee'],
          keepAlive: true,
        },
      },
    ],
  },
];

export default routes;
