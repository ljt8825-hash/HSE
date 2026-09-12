import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:clipboard-check',
      order: 6,
      title: '现场管理',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'Inspection',
    path: '/inspection',
    redirect: '/inspection/violation',
    children: [
      {
        name: 'InspectionViolation',
        path: '/inspection/violation',
        component: () => import('#/views/inspection/index.vue'),
        meta: {
          title: '"三违"管理',
          icon: 'lucide:shield-alert',
          authority: ['admin'],
          keepAlive: true,
        },
      },
      {
        name: 'InspectionFireFacility',
        path: '/inspection/fire-facility',
        component: () => import('#/views/inspection/fire-facility/index.vue'),
        meta: {
          title: '消防设施管理',
          icon: 'lucide:flame',
          authority: ['admin'],
        },
      },
      {
        name: 'InspectionDriverAssessment',
        path: '/inspection/driver/assessment',
        component: () => import('#/views/inspection/driver/assessment/index.vue'),
        meta: {
          title: '交通安全档案',
          icon: 'lucide:file-check',
          authority: ['admin'],
          hideInMenu: true,
        },
      },
      {
        name: 'InspectionDriverViolation',
        path: '/inspection/driver/violation',
        component: () => import('#/views/inspection/driver/violation/index.vue'),
        meta: {
          title: '驾驶员违章记录',
          icon: 'lucide:traffic-cone',
          authority: ['admin'],
          hideInMenu: true,
        },
      },
      {
        name: 'InspectionDriverMonthly',
        path: '/inspection/driver/monthly',
        component: () => import('#/views/inspection/driver/monthly/index.vue'),
        meta: {
          title: '月度考核',
          icon: 'lucide:clipboard-list',
          authority: ['admin'],
          hideInMenu: true,
        },
      },
      {
        name: 'InspectionGrid',
        path: '/inspection/grid',
        component: () => import('#/views/inspection/grid/index.vue'),
        meta: {
          title: '网格管理',
          icon: 'lucide:layout-grid',
          authority: ['admin'],
        },
      },
    ],
  },
];

export default routes;
