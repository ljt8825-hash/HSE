import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield-check',
      order: 11,
      title: '保险及人员管理',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'Insurance',
    path: '/insurance',
    redirect: '/insurance/vehicle',
    children: [
      {
        name: 'InsuranceVehicle',
        path: '/insurance/vehicle',
        component: () => import('#/views/insurance/vehicle/index.vue'),
        meta: {
          title: '车辆保险管理',
          icon: 'lucide:truck',
          authority: ['admin'],
        },
      },
      {
        name: 'InsurancePersonnel',
        path: '/insurance/personnel',
        component: () => import('#/views/insurance/personnel/index.vue'),
        meta: {
          title: '人员保险管理',
          icon: 'lucide:user-check',
          authority: ['admin'],
          keepAlive: true,
        },
      },
      {
        name: 'InsuranceOverAge',
        path: '/insurance/over-age',
        component: () => import('#/views/insurance/over-age/index.vue'),
        meta: {
          title: '超龄人员管理',
          icon: 'lucide:timer',
          authority: ['admin'],
        },
      },
    ],
  },
];

export default routes;
