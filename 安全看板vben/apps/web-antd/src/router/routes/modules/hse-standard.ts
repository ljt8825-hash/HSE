/**
 * 安全生产标准化评价中心路由 - HSE V2 Sprint4
 *
 * 结构: 父菜单"标准化评价" + 子菜单（条款库 / 条款资料关联 / 匹配建议）
 * 权限: authority: ['admin', 'safety_manager']
 * 路由自动加载: 放入 modules/ 即生效，无需修改 router/routes/index.ts
 */

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:clipboard-check',
      order: 25,
      title: '标准化评价',
      authority: ['admin', 'safety_manager'],
      hideInMenu: true,
    },
    name: 'HseStandard',
    path: '/hse/standard',
    redirect: '/hse/standard/clauses',
    children: [
      {
        name: 'HseStandardClauses',
        path: '/hse/standard/clauses',
        component: () => import('#/views/hse/standard/index.vue'),
        meta: {
          title: '标准条款库',
          icon: 'lucide:list-tree',
          authority: ['admin', 'safety_manager'],
          keepAlive: true,
        },
      },
      {
        name: 'HseStandardRelation',
        path: '/hse/standard/relation',
        component: () => import('#/views/hse/standard/relation/index.vue'),
        meta: {
          title: '条款资料关联',
          icon: 'lucide:link',
          authority: ['admin', 'safety_manager'],
          keepAlive: true,
        },
      },
      {
        name: 'HseStandardSuggestions',
        path: '/hse/standard/suggestions',
        component: () => import('#/views/hse/standard/relation/suggestions.vue'),
        meta: {
          title: '匹配建议',
          icon: 'lucide:sparkles',
          authority: ['admin', 'safety_manager'],
          keepAlive: true,
        },
      },
    ],
  },
];

export default routes;
