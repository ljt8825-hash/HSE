import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:siren',
      order: 9,
      title: '应急管理',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseEmergency',
    path: '/emergency',
    redirect: '/emergency/plans',
    children: [
      {
        meta: {
          title: '应急预案',
          icon: 'lucide:file-warning',
          authority: ['admin'],
        },
        name: 'EmergencyPlans',
        path: '/emergency/plans',
        component: () => import('#/views/emergency/plans/index.vue'),
      },
      {
        meta: {
          title: '应急演练',
          icon: 'lucide:users-round',
          authority: ['admin'],
        },
        name: 'EmergencyDrills',
        path: '/emergency/drills',
        component: () => import('#/views/emergency/drills/index.vue'),
      },
      {
        meta: {
          title: '应急物资',
          icon: 'lucide:package',
          authority: ['admin'],
        },
        name: 'EmergencyMaterials',
        path: '/emergency/materials',
        component: () => import('#/views/emergency/materials/index.vue'),
      },
      {
        meta: {
          title: '应急队伍',
          icon: 'lucide:shield-users',
          authority: ['admin'],
        },
        name: 'EmergencyTeams',
        path: '/emergency/teams',
        component: () => import('#/views/emergency/teams/index.vue'),
      },
      {
        meta: {
          title: '应急事件',
          icon: 'lucide:alert-triangle',
          authority: ['admin'],
        },
        name: 'EmergencyEvents',
        path: '/emergency/events',
        component: () => import('#/views/emergency/events/index.vue'),
      },
    ],
  },
];

export default routes;
