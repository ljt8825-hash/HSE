import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield',
      order: 7,
      title: '安全风险管控',
      authority: ['admin'],
      keepAlive: true,
      hideInMenu: true,
    },
    name: 'RiskControl',
    path: '/risk-control',
    component: () => import('#/views/risk-control/index.vue'),
  },
];

export default routes;
