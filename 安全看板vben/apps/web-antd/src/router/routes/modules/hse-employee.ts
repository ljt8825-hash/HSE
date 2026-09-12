/**
 * HSE 人员主数据中心路由 - Sprint5.1
 *
 * 结构: 父菜单"人员主数据" + 子菜单（员工列表 / 组织管理 / 岗位管理）
 * 权限: authority: ['admin', 'safety_manager']
 */

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:users',
      order: 5,
      title: '人员主数据',
      authority: ['admin', 'safety_manager'],
      hideInMenu: true,
    },
    name: 'HseEmployee',
    path: '/hse/employee',
    redirect: '/hse/employee/list',
    children: [
      {
        name: 'HseEmployeeList',
        path: '/hse/employee/list',
        component: () => import('#/views/hse/employee/index.vue'),
        meta: {
          title: '员工列表',
          icon: 'lucide:user-list',
          authority: ['admin', 'safety_manager'],
          keepAlive: true,
        },
      },
      {
        name: 'HseEmployeeDepartments',
        path: '/hse/employee/departments',
        component: () => import('#/views/hse/employee/departments.vue'),
        meta: {
          title: '组织管理',
          icon: 'lucide:git-fork',
          authority: ['admin', 'safety_manager'],
          keepAlive: true,
        },
      },
      {
        name: 'HseEmployeePositions',
        path: '/hse/employee/positions',
        component: () => import('#/views/hse/employee/positions.vue'),
        meta: {
          title: '岗位管理',
          icon: 'lucide:briefcase',
          authority: ['admin', 'safety_manager'],
          keepAlive: true,
        },
      },
    ],
  },
];

export default routes;
