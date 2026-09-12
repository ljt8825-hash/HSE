import type { RouteRecordRaw } from 'vue-router';

/**
 * HSE-MOBILE-GRID-01-B：移动端网格巡查 WebApp 壳层路由
 *
 * 设计要点（基于对本项目 Vben v5 路由机制的实际审计）：
 * 1. 独立 /mobile/* 模块，自动被 src/router/routes/index.ts 的 import.meta.glob 发现。
 * 2. 父路由 /mobile 通过 meta.noBasicLayout = true 脱离 PC 端 BasicLayout 框架，
 *    使用自定义布局 src/layouts/mobile.vue（顶部 + 主体 + 底部导航，无 PC 侧边栏）。
 * 3. 子路由使用【相对路径】，确保渲染在移动端布局的 <router-view/> 内
 *    （若用绝对路径会被注册为 Root 顶层兄弟路由，导致脱离自定义布局）。
 * 4. 不设置 meta.authority：依据 generateRoutesByFrontend 逻辑，无 authority 的路由对
 *    任意已登录用户可见。页面内部再按「无 employee / 未分配网格」做 fail-closed 友好提示。
 * 5. 完全复用现有登录体系（accessStore / useAuthStore / requestClient），不新增登录页/接口。
 * 6. 本阶段仅壳层 + 路由 + 登录复用，不实现新增巡查 / 图片上传 / 整改等业务逻辑。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/mobile',
    name: 'MobileRoot',
    component: () => import('#/layouts/mobile.vue'),
    redirect: '/mobile/index',
    meta: {
      title: '移动端网格巡查',
      noBasicLayout: true,
      hideInMenu: true,
    },
    children: [
      {
        path: 'index',
        name: 'MobileHome',
        component: () => import('#/views/mobile/index.vue'),
        meta: {
          title: '首页',
          hideInMenu: true,
        },
      },
      {
        path: 'grid',
        name: 'MobileGrid',
        component: () => import('#/views/mobile/grid/index.vue'),
        meta: {
          title: '我的网格',
          hideInMenu: true,
        },
      },
      {
        path: 'grid/ledger',
        name: 'MobileLedger',
        component: () => import('#/views/mobile/grid/ledger.vue'),
        meta: {
          title: '巡查台账',
          hideInMenu: true,
        },
      },
      {
        // HSE-MOBILE-GRID-02-B：新增巡查（手机拍照 + 上传 + 提交到现有正式 API）
        path: 'grid/new',
        name: 'MobileGridNew',
        component: () => import('#/views/mobile/grid/new.vue'),
        meta: {
          title: '新增巡查',
          hideInMenu: true,
        },
      },
      {
        // HSE-MOBILE-GRID-03-B：补传整改照片（既有记录补传整改照片 + 记录整改人）
        // 复用现有正式链路 PUT /api/site-mgmt/grid-records/:id，不新增 /api/mobile/*。
        path: 'grid/rectify/:id',
        name: 'MobileGridRectify',
        component: () => import('#/views/mobile/grid/rectify.vue'),
        meta: {
          title: '补传整改照片',
          hideInMenu: true,
        },
      },
      {
        path: 'grid/detail/:id?',
        name: 'MobileDetail',
        component: () => import('#/views/mobile/grid/detail.vue'),
        meta: {
          title: '巡查详情',
          hideInMenu: true,
        },
      },
      {
        path: 'me',
        name: 'MobileMe',
        component: () => import('#/views/mobile/me.vue'),
        meta: {
          title: '我的',
          hideInMenu: true,
        },
      },
    ],
  },
];

export default routes;
