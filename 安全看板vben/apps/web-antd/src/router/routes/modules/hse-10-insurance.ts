import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield-check',
      order: 10,
      title: '保险管理',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseInsurance',
    path: '/insurance',
    redirect: '/insurance/personnel',
    children: [
      {
        meta: {
          title: '人员保险',
          icon: 'lucide:shield-plus',
          authority: ['admin'],
        },
        name: 'InsurancePersonnel',
        path: '/insurance/personnel',
        component: () => import('#/views/insurance/personnel/index.vue'),
      },
      {
        meta: {
          title: '车辆保险',
          icon: 'lucide:car-front',
          authority: ['admin'],
        },
        name: 'InsuranceVehicle',
        path: '/insurance/vehicle',
        component: () => import('#/views/insurance/vehicle/index.vue'),
      },
      {
        meta: {
          title: '其他保险',
          icon: 'lucide:shield-alert',
          authority: ['admin'],
        },
        name: 'InsuranceOther',
        path: '/insurance/other',
        component: () => import('#/views/insurance/other/index.vue'),
      },
    ],
  },
];

export default routes;
