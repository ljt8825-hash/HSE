/**
 * 批量导入中心路由 - HSE V2 Sprint5
 *
 * 结构: 父菜单"批量导入" + 子菜单（导入任务列表）
 * 权限: authority: ['admin', 'safety_manager', 'safety_officer']
 * 路由自动加载: 放入 modules/ 即生效，无需修改 router/routes/index.ts
 */

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:upload-cloud',
      order: 26,
      title: '批量导入',
      authority: ['admin', 'safety_manager', 'safety_officer'],
      hideInMenu: true,
    },
    name: 'HseBatchImport',
    path: '/hse/batch-import',
    redirect: '/hse/batch-import/tasks',
    children: [
      {
        name: 'HseBatchImportTasks',
        path: '/hse/batch-import/tasks',
        component: () => import('#/views/hse/batch-import/index.vue'),
        meta: {
          title: '导入任务',
          icon: 'lucide:list',
          authority: ['admin', 'safety_manager', 'safety_officer'],
          keepAlive: true,
        },
      },
    ],
  },
];

export default routes;
