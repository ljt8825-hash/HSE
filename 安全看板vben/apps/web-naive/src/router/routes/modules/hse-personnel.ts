import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 人员管理（阶段04/05/收尾 · 父子角色模型）
 * 父菜单：/personnel（order 7，authority admin+safety_manager）
 * 子页面：
 *   - /personnel/employee（员工列表）
 *   - /personnel/departments（组织管理）
 *   - /personnel/positions（岗位管理）
 *   - /personnel/profile（员工档案，父菜单：员工档案 + 扣分调整）
 *   - /personnel/over-age（超龄人员）
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:users',
      order: 7,
      title: $t('page.hse.personnel'),
      authority: ['admin', 'safety_manager'],
      keepAlive: true,
    },
    name: 'HsePersonnel',
    path: '/personnel',
    redirect: '/personnel/employee',
    children: [
      {
        meta: {
          title: $t('page.hse.employee'),
          icon: 'lucide:user-round',
          authority: ['admin'],
        },
        name: 'PersonnelEmployee',
        path: '/personnel/employee',
        component: () => import('#/views/hse/employee/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.departments'),
          icon: 'lucide:building',
          authority: ['admin', 'safety_manager'],
        },
        name: 'PersonnelDepartments',
        path: '/personnel/departments',
        component: () => import('#/views/hse/employee/departments.vue'),
      },
      {
        meta: {
          title: $t('page.hse.positions'),
          icon: 'lucide:briefcase',
          authority: ['admin', 'safety_manager'],
        },
        name: 'PersonnelPositions',
        path: '/personnel/positions',
        component: () => import('#/views/hse/employee/positions.vue'),
      },
      {
        meta: {
          title: $t('page.hse.employeeProfile'),
          icon: 'lucide:file-user',
          authority: ['admin'],
        },
        name: 'PersonnelProfile',
        path: '/personnel/profile',
        component: () => import('#/views/hse/employee-profile/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.personnelImport'),
          icon: 'lucide:upload',
          authority: ['admin'],
        },
        name: 'PersonnelImport',
        path: '/personnel/import',
        component: () => import('#/views/hse/employee-import-v2/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.overAge'),
          icon: 'lucide:user-round-x',
          authority: ['admin'],
        },
        name: 'PersonnelOverAge',
        path: '/personnel/over-age',
        component: () => import('#/views/hse/employee/over-age/index.vue'),
      },
    ],
  },
];

export default routes;
