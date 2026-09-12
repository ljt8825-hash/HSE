import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      title: '工作流引擎',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'HseWorkflow',
    path: '/hse/workflow',
    component: () => import('#/views/hse/workflow/index.vue'),
  },
];

export default routes;
