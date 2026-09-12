/**
 * HSE 员工花名册导入 V2 路由 - Sprint5.6.5
 *
 * 结构: 父菜单"员工花名册导入" + 子菜单（批次列表 / 上传）
 * 权限: authority: ['admin', 'safety_manager']
 * 路由自动加载: 放入 modules/ 即生效，无需修改 router/routes/index.ts
 */

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:file-spreadsheet',
      order: 6,
      title: '员工花名册导入',
      authority: ['admin', 'safety_manager'],
      hideInMenu: true,
    },
    name: 'HseEmployeeImportV2',
    path: '/hse/employee-import-v2',
    redirect: '/hse/employee-import-v2/list',
    children: [
      {
        name: 'HseEmployeeImportV2List',
        path: '/hse/employee-import-v2/list',
        component: () => import('#/views/hse/employee-import-v2/index.vue'),
        meta: {
          title: '批次管理',
          icon: 'lucide:list',
          authority: ['admin', 'safety_manager'],
          keepAlive: true,
        },
      },
    ],
  },
];

export default routes;
