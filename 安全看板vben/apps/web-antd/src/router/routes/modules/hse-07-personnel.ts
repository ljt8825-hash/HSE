import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:users',
      order: 7,
      title: '人员管理',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HsePersonnel',
    path: '/personnel',
    redirect: '/personnel/employee',
    children: [
      {
        meta: {
          title: '员工列表',
          icon: 'lucide:user-round',
          authority: ['admin'],
        },
        name: 'PersonnelEmployee',
        path: '/personnel/employee',
        component: () => import('#/views/hse/employee/index.vue'),
      },
      {
        meta: {
          title: '组织管理',
          icon: 'lucide:building',
          authority: ['admin', 'safety_manager'],
        },
        name: 'PersonnelDepartments',
        path: '/personnel/departments',
        component: () => import('#/views/hse/employee/departments.vue'),
      },
      {
        meta: {
          title: '岗位管理',
          icon: 'lucide:briefcase',
          authority: ['admin', 'safety_manager'],
        },
        name: 'PersonnelPositions',
        path: '/personnel/positions',
        component: () => import('#/views/hse/employee/positions.vue'),
      },
      {
        meta: {
          title: '员工档案',
          icon: 'lucide:file-user',
          authority: ['admin'],
        },
        name: 'PersonnelProfile',
        path: '/personnel/profile',
        component: () => import('#/views/hse/employee-profile/index.vue'),
      },
      {
        meta: {
          title: '花名册导入',
          icon: 'lucide:upload',
          authority: ['admin'],
        },
        name: 'PersonnelImport',
        path: '/personnel/import',
        component: () => import('#/views/hse/employee-import-v2/index.vue'),
      },
      {
        meta: {
          title: '批量导入',
          icon: 'lucide:database-upload',
          authority: ['admin'],
        },
        name: 'PersonnelBatchImport',
        path: '/personnel/batch-import',
        component: () => import('#/views/hse/batch-import/index.vue'),
      },
      {
        meta: {
          title: '超龄人员',
          icon: 'lucide:user-round-x',
          authority: ['admin'],
        },
        name: 'PersonnelOverAge',
        path: '/personnel/over-age',
        component: () => import('#/views/hse/employee/over-age/index.vue'),
      },
      {
        // [阶段3] 作业中心已合并至组织管理；保留隐藏重定向，避免旧书签/链接 404
        meta: {
          title: '作业中心',
          icon: 'lucide:building-2',
          authority: ['admin', 'safety_manager'],
          hideInMenu: true,
        },
        name: 'PersonnelOrgCenter',
        path: '/personnel/org-center',
        redirect: '/personnel/departments',
      },
    ],
  },
];

export default routes;
