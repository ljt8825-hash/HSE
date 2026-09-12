import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:map-pin',
      order: 6,
      title: '现场管理',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseSite',
    path: '/site',
    redirect: '/site/violation',
    children: [
      {
        meta: {
          title: '三违管理',
          icon: 'lucide:octagon-alert',
          authority: ['admin'],
        },
        name: 'SiteViolation',
        path: '/site/violation',
        component: () => import('#/views/violations/index.vue'),
      },
      {
        meta: {
          title: '消防设施管理',
          icon: 'lucide:flame',
          authority: ['admin'],
        },
        name: 'SiteFireFacility',
        path: '/site/fire-facility',
        component: () => import('#/views/inspection/fire-facility/index.vue'),
      },
      {
        // [DEPRECATED] antd 版已淘汰，功能已迁移至 web-naive（保留代码，仅隐藏菜单）
        meta: {
          title: '驾驶员管理',
          icon: 'lucide:users',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'SiteDriver',
        path: '/site/driver',
        redirect: '/site/driver/assessment',
        children: [
          {
            // [DEPRECATED] antd 版已淘汰，迁移至 web-naive（仅隐藏菜单）
            meta: {
              title: '交通安全档案',
              icon: 'lucide:file-check',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'SiteDriverAssessment',
            path: '/site/driver/assessment',
            component: () => import('#/views/inspection/driver/assessment/index.vue'),
          },
          {
            // [DEPRECATED] antd 版已淘汰，迁移至 web-naive（仅隐藏菜单）
            meta: {
              title: '驾驶员违章记录',
              icon: 'lucide:traffic-cone',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'SiteDriverViolation',
            path: '/site/driver/violation',
            component: () => import('#/views/inspection/driver/violation/index.vue'),
          },
          {
            // [DEPRECATED] antd 版已淘汰，迁移至 web-naive（仅隐藏菜单）
            meta: {
              title: '月度考核',
              icon: 'lucide:clipboard-list',
              authority: ['admin'],
              hideInMenu: true,
            },
            name: 'SiteDriverMonthly',
            path: '/site/driver/monthly',
            component: () => import('#/views/inspection/driver/monthly/index.vue'),
          },
        ],
      },
      {
        meta: {
          title: '网格管理',
          icon: 'lucide:grid-3x3',
          authority: ['admin'],
        },
        name: 'SiteGrid',
        path: '/site/grid',
        component: () => import('#/views/inspection/grid/index.vue'),
      },
    ],
  },
];

export default routes;
