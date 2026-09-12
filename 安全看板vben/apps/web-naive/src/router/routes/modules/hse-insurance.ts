import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 保险管理（HSE 模块）
 * 父菜单：/insurance（order 8，authority admin，redirect /insurance/personnel）
 * 子页面：
 *   - /insurance/personnel  人员保险
 *   - /insurance/vehicle    车辆保险
 *   - /insurance/other      其他保险（公众责任险 / 财产一切险）
 *
 * 路由由 src/router/routes/index.ts 的 import.meta.glob 自动发现；
 * 不设置 ignoreAccess，由 accessRoutes 依 authority:['admin'] 登录后过滤。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield-check',
      order: 10,
      title: $t('page.hse.insurance'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseInsurance',
    path: '/insurance',
    redirect: '/insurance/personnel',
    children: [
      {
        meta: {
          title: $t('page.hse.insurancePersonnel'),
          icon: 'lucide:shield-plus',
          authority: ['admin'],
        },
        name: 'InsurancePersonnel',
        path: '/insurance/personnel',
        component: () => import('#/views/insurance/personnel/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.insuranceVehicle'),
          icon: 'lucide:car-front',
          authority: ['admin'],
        },
        name: 'InsuranceVehicle',
        path: '/insurance/vehicle',
        component: () => import('#/views/insurance/vehicle/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.insuranceOther'),
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
