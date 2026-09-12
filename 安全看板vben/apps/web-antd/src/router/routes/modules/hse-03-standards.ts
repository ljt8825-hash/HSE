import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:book-open-check',
      order: 3,
      title: '制度标准',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseStandards',
    path: '/standards',
    redirect: '/standards/regulations',
    children: [
      {
        meta: {
          title: '规章制度',
          icon: 'lucide:scroll-text',
          authority: ['admin'],
        },
        name: 'StandardsRegulations',
        path: '/standards/regulations',
        component: () => import('#/views/regulations/index.vue'),
      },
      {
        meta: {
          title: '文件库',
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
          title: '文件审核',
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
          title: '标准条款库',
          icon: 'lucide:list-tree',
          authority: ['admin'],
          hideInMenu: true,
        },
        name: 'StandardsClauses',
        path: '/standards/clauses',
        component: () => import('#/views/hse/standard/index.vue'),
      },
      {
        meta: {
          title: '条款资料关联',
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
          title: '匹配建议',
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
