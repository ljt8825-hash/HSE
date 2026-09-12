import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 应急管理（阶段04 + 06C-3 整改对齐基线 hse-09-emergency.ts）
 * 父菜单：/emergency（order 9，authority admin，redirect 到应急预案）
 * 子页面（5 条全部菜单可见，无 hideInMenu）：
 *   /emergency/plans      应急预案
 *   /emergency/drills     应急演练
 *   /emergency/materials  应急物资
 *   /emergency/teams      应急队伍
 *   /emergency/events     应急事件
 * 06C-3：子路由 name 去 Hse 前缀（Emergency*）+ 补齐 5 个 icon。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:siren',
      order: 9,
      title: $t('page.hse.emergency'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseEmergency',
    path: '/emergency',
    redirect: '/emergency/plans',
    children: [
      {
        meta: {
          title: $t('page.hse.emergencyPlans'),
          icon: 'lucide:file-warning',
          authority: ['admin'],
        },
        name: 'EmergencyPlans',
        path: '/emergency/plans',
        component: () => import('#/views/emergency/plans/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.emergencyDrills'),
          icon: 'lucide:users-round',
          authority: ['admin'],
        },
        name: 'EmergencyDrills',
        path: '/emergency/drills',
        component: () => import('#/views/emergency/drills/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.emergencyMaterials'),
          icon: 'lucide:package',
          authority: ['admin'],
        },
        name: 'EmergencyMaterials',
        path: '/emergency/materials',
        component: () => import('#/views/emergency/materials/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.emergencyTeams'),
          icon: 'lucide:user-cog',
          authority: ['admin'],
        },
        name: 'EmergencyTeams',
        path: '/emergency/teams',
        component: () => import('#/views/emergency/teams/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.emergencyEvents'),
          icon: 'lucide:alert-triangle',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'EmergencyEvents',
        path: '/emergency/events',
        component: () => import('#/views/emergency/events/index.vue'),
      },
    ],
  },
];

export default routes;
