import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield-alert',
      order: 4,
      title: '风险管控',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseRisk',
    path: '/risk',
    redirect: '/risk/list',
    children: [
      {
        meta: {
          title: '风险清单',
          icon: 'lucide:list-checks',
          authority: ['admin'],
        },
        name: 'RiskControlList',
        path: '/risk/list',
        component: () => import('#/views/risk-control/index.vue'),
      },
      {
        meta: {
          title: '风险地图',
          icon: 'lucide:map',
          authority: ['admin'],
        },
        name: 'RiskControlMap',
        path: '/risk/map',
        component: () => import('#/views/risk-control/map.vue'),
      },
    ],
  },
];

export default routes;
