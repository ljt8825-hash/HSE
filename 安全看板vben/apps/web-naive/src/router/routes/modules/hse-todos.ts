import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/**
 * 待办事项（order:5，authority:admin）
 * 父菜单：/hse/todos
 * 子页面：
 *   /hse/todos      - 我的待办
 *   /hse/todos/plan - 考核计划
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:check-square',
      order: 5,
      title: $t('page.hse.todos'),
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'HseTodos',
    path: '/hse/todos',
    redirect: '/hse/todos/index',
    children: [
      {
        meta: {
          title: $t('page.hse.todos'),
          icon: 'lucide:list-todo',
          authority: ['admin'],
        },
        name: 'HseTodosIndex',
        path: '/hse/todos/index',
        component: () => import('#/views/hse/todos/index.vue'),
      },
      {
        meta: {
          title: $t('page.hse.assessmentPlan'),
          icon: 'lucide:calendar-cog',
          authority: ['admin'],
        },
        name: 'HseAssessmentPlan',
        path: '/hse/todos/plan',
        component: () => import('#/views/hse/todos/plan/index.vue'),
      },
    ],
  },
];

export default routes;
