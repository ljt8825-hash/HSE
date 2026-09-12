/**
 * 安全资料中心路由 - HSE V2.0 Sprint 1
 *
 * 结构: 父菜单"安全资料中心" + 2个子菜单（文件库 / 文件审核）
 * 权限: authority: ['admin']
 * 路由自动加载: 放入 modules/ 即生效，无需修改 router/routes/index.ts
 */

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:folder-open',
      order: 20,
      title: '安全资料中心',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'HseDocuments',
    path: '/hse-documents',
    redirect: '/hse-documents/library',
    children: [
      {
        name: 'HseDocumentsLibrary',
        path: '/hse-documents/library',
        component: () => import('#/views/hse/documents/library/index.vue'),
        meta: {
          title: '文件库',
          icon: 'lucide:file-text',
          authority: ['admin'],
          keepAlive: true,
        },
      },
      {
        name: 'HseDocumentsReview',
        path: '/hse-documents/review',
        component: () => import('#/views/hse/documents/review/index.vue'),
        meta: {
          title: '文件审核',
          icon: 'lucide:check-square',
          authority: ['admin'],
          keepAlive: true,
        },
      },
    ],
  },
];

export default routes;
