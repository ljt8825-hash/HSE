import type { RouteRecordRaw } from 'vue-router';

/**
 * 高级分析 & 隐藏页面路由
 * - IoT物联网、供应链安全（高级分析菜单下）
 * - 工作流引擎、员工风险画像详情、花名册导入、批量导入中心（隐藏菜单）
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:sparkles',
      order: 15,
      title: '高级分析',
      hideInMenu: true,
      authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
    },
    name: 'HseAdvanced',
    path: '/hse-advanced',
    redirect: '/hse-advanced/iot',
    children: [
      {
        name: 'HseIot',
        path: '/hse-advanced/iot',
        component: () => import('#/views/hse/iot/index.vue'),
        meta: {
          title: 'IoT物联网',
          icon: 'lucide:radio',
          authority: ['admin'],
        },
      },
      {
        name: 'HseSupplyChain',
        path: '/hse-advanced/supply-chain',
        component: () => import('#/views/hse/supply-chain/index.vue'),
        meta: {
          title: '供应链安全',
          icon: 'lucide:truck',
          authority: ['admin'],
        },
      },
      {
        name: 'HseRiskProfileDetail',
        path: '/hse-advanced/risk-profile/:employeeId',
        component: () => import('#/views/hse/risk-profile-detail/index.vue'),
        meta: {
          title: '员工风险画像详情',
          icon: 'lucide:user-circle',
          authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
          hideInMenu: true,
        },
      },
    ],
  },
  // 隐藏菜单页面
  {
    meta: {
      title: '工作流引擎',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'HseWorkflow',
    path: '/hse/workflow',
    component: () => import('#/views/hse/workflow/index.vue'),
  },
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
          hideInMenu: true,
        },
      },
    ],
  },
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
          hideInMenu: true,
        },
      },
    ],
  },
];

export default routes;
