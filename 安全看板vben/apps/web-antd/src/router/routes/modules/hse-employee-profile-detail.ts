/**
 * 员工主档案页路由 - R1-Phase1 收尾 · 提示词-40 任务 C
 *
 * 路由: /hse/employee/:id → EmployeeProfilePage
 * 入口: EmployeeName 组件点击（useEmployeeLink.openProfile）统一跳转到此档案页。
 * 菜单: 不显示（hideInMenu / hideInTab），纯内部跳转路由。
 */

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/hse/employee/:id(\\d+)',
    name: 'EmployeeProfile',
    component: () => import('#/views/hse/employee/ProfilePage.vue'),
    meta: {
      title: '员工档案',
      hideInMenu: true,
      hideInTab: true,
    },
  },
];

export default routes;
