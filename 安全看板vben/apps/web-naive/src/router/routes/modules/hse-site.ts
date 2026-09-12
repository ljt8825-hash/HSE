import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 现场管理（阶段06B-1 · 首个实施批次）
 * 父菜单：/site（order 6，authority admin，redirect /site/violation）
 * 子页面：/site/violation（三违管理，父级，redirect /site/violation/ledger）
 *    ├ /site/violation/analysis（三违分析）→ 复制「网格长巡查管理」页（网格 CRUD + 统计 + 导入）
 *    └ /site/violation/ledger（三违台账）→ 从「网格长巡查台账」筛选（三违行为≠无三违行为 且 整改后照片有内容）
 *        /site/fire-facility（消防设施管理）、/site/grid（网格管理，父级）
 *    ├ /site/grid/mgmt（网格长巡查管理）→ 原网格管理页（区域/网格长配置 CRUD + 导入 + 统计）
 *    └ /site/grid/ledger（网格长巡查台账）→ 巡查记录台账（自定义表格 · 单元格编辑 · 虚拟滚动）
 * 路由由 src/router/routes/index.ts 的 import.meta.glob（glob 模式见该文件）自动发现；
 * 不设置 ignoreAccess，不纳入 publicRoutes，由 accessRoutes 依 authority:['admin'] 登录后过滤。
 * name/path/order/icon/authority 与 web-antd 基线 hse-06-site.ts 一致。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:map-pin',
      order: 6,
      title: $t('page.hse.site'),
      authority: ['admin', 'grid_inspector'],
      keepAlive: true,
    },
    name: 'HseSite',
    path: '/site',
    redirect: '/site/violation',
    children: [
      {
        meta: {
          title: $t('page.hse.siteViolation'),
          icon: 'lucide:octagon-alert',
          authority: ['admin'],
          keepAlive: true,
        },
        name: 'SiteViolation',
        path: '/site/violation',
        redirect: '/site/violation/ledger',
        children: [
          {
            meta: {
              title: $t('page.hse.siteViolationAnalysis'),
              icon: 'lucide:bar-chart-3',
              authority: ['admin'],
            },
            name: 'SiteViolationAnalysis',
            path: '/site/violation/analysis',
            component: () => import('#/views/site/violation/analysis.vue'),
          },
          {
            meta: {
              title: $t('page.hse.siteViolationLedger'),
              icon: 'lucide:clipboard-list',
              authority: ['admin'],
            },
            name: 'SiteViolationLedger',
            path: '/site/violation/ledger',
            component: () => import('#/views/site/violation/ledger.vue'),
          },
          {
            meta: {
              title: '三违管理考核',
              icon: 'lucide:list-checks',
              authority: ['admin'],
            },
            name: 'SiteViolationAssessment',
            path: '/site/violation/assessment',
            component: () => import('#/views/hse/violation-assessment/index.vue'),
          },
        ],
      },
      {
        meta: {
          title: $t('page.hse.siteFireFacility'),
          icon: 'lucide:flame',
          authority: ['admin'],
        },
        name: 'SiteFireFacility',
        path: '/site/fire-facility',
        component: () => import('#/views/site/fire-facility/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.siteTransferStations'),
          icon: 'lucide:map-pin',
          authority: ['admin'],
        },
        name: 'SiteTransferStations',
        path: '/site/transfer-stations',
        component: () => import('#/views/site/transfer-stations/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.siteVehicleChecks'),
          icon: 'lucide:truck',
          authority: ['admin'],
          // [REMOVED-FROM-MENU] 按业务要求将「车辆三检」从「现场管理」菜单移除；路由与页面代码保留，hideInMenu 隐藏，可随时恢复。
          hideInMenu: true,
        },
        name: 'SiteVehicleChecks',
        path: '/site/vehicle-checks',
        component: () => import('#/views/site/vehicle-checks/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.siteGrid'),
          icon: 'lucide:grid-3x3',
          authority: ['admin', 'grid_inspector'],
          keepAlive: true,
        },
        name: 'SiteGrid',
        path: '/site/grid',
        redirect: '/site/grid/mgmt',
        children: [
          {
            meta: {
            title: $t('page.hse.siteGridPatrolMgmt'),
            icon: 'lucide:shield-check',
            authority: ['admin', 'grid_inspector'],
            },
            name: 'SiteGridPatrolMgmt',
            path: '/site/grid/mgmt',
            component: () => import('#/views/site/grid/index.vue'),
          },
          {
            meta: {
            title: $t('page.hse.siteGridPatrolLedger'),
            icon: 'lucide:clipboard-list',
            authority: ['admin', 'grid_inspector'],
            },
            name: 'SiteGridPatrolLedger',
            path: '/site/grid/ledger',
            component: () => import('#/views/site/grid-ledger/index.vue'),
          },
        ],
      },
      {
        meta: {
          title: $t('page.hse.siteDriver'),
          icon: 'lucide:users',
          authority: ['admin'],
          keepAlive: true,
        },
        name: 'SiteDriver',
        path: '/site/driver',
        redirect: '/site/driver/assessment',
        children: [
          {
            meta: {
              title: $t('page.hse.siteDriverAssessment'),
              icon: 'lucide:file-check',
              authority: ['admin'],
            },
            name: 'SiteDriverAssessment',
            path: '/site/driver/assessment',
            component: () => import('#/views/site/driver/assessment/index.vue'),
          },
          {
            meta: {
              title: $t('page.hse.siteDriverViolation'),
              icon: 'lucide:traffic-cone',
              authority: ['admin'],
            },
            name: 'SiteDriverViolation',
            path: '/site/driver/violation',
            component: () => import('#/views/site/driver/violation/index.vue'),
          },
          {
            meta: {
              title: $t('page.hse.siteDriverMonthly'),
              icon: 'lucide:clipboard-list',
              authority: ['admin'],
            },
            name: 'SiteDriverMonthly',
            path: '/site/driver/monthly',
            component: () => import('#/views/site/driver/monthly/index.vue'),
          },
        ],
      },
    ],
  },
];

export default routes;
