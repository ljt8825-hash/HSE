import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 风险管控（阶段04 修复 · 还原冻结基线父子结构）
 * 父菜单：/risk（order 4，authority admin，redirect 到风险清单）
 * 子页面：/risk/list（风险清单，已迁移）
 * 仅注册已迁移的子页面；未做其他空白二级页面。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield-alert',
      order: 4,
      title: $t('page.hse.risk'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseRisk',
    path: '/risk',
    redirect: '/risk/list',
    children: [
      {
        meta: {
          title: $t('page.hse.riskControl'),
          icon: 'lucide:list-checks',
          authority: ['admin'],
        },
        name: 'RiskControlList',
        path: '/risk/list',
        component: () => import('#/views/risk-control/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.riskMap'),
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
