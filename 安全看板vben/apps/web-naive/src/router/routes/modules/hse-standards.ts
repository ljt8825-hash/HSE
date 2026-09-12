import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 制度标准（order:3，authority:admin）
 * 父菜单：/standards  →  redirect /standards/regulations
 * 子页面（对齐 web-antd 基线 hse-03-standards.ts）：
 *   /standards/regulations  - 规章制度（菜单可见）
 *   /standards/library      - 文件库（hideInMenu）
 *   /standards/review       - 文件审核（hideInMenu）
 *   /standards/clauses      - 标准条款库（hideInMenu）
 *   /standards/relation     - 条款资料关联（hideInMenu）
 *   /standards/suggestions  - 匹配建议（hideInMenu）
 *
 * 注：原独立“文件管理”菜单（hse-documents.ts，/hse/documents/*）已删除，
 * 其“文件库 / 文件审核”由本文件的 StandardsLibrary / StandardsReview 取代。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:book-open-check',
      order: 3,
      title: $t('page.hse.standards'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseStandards',
    path: '/standards',
    redirect: '/standards/regulations',
    children: [
      {
        meta: {
          title: $t('page.hse.regulations'),
          icon: 'lucide:scroll-text',
          authority: ['admin'],
        },
        name: 'StandardsRegulations',
        path: '/standards/regulations',
        component: () => import('#/views/regulations/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.documentLibrary'),
          icon: 'lucide:folder-open',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'StandardsLibrary',
        path: '/standards/library',
        component: () => import('#/views/hse/documents/library/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.documentReview'),
          icon: 'lucide:file-check',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'StandardsReview',
        path: '/standards/review',
        component: () => import('#/views/hse/documents/review/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.standardClauses'),
          icon: 'lucide:list-tree',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'StandardsClauses',
        path: '/standards/clauses',
        component: () => import('#/views/hse/standard/clauses/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.standardRelation'),
          icon: 'lucide:link',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'StandardsRelation',
        path: '/standards/relation',
        component: () => import('#/views/hse/standard/relation/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.standardSuggestions'),
          icon: 'lucide:lightbulb',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'StandardsSuggestions',
        path: '/standards/suggestions',
        component: () => import('#/views/hse/standard/relation/suggestions.vue'),
      },
    ],
  },
];

export default routes;
