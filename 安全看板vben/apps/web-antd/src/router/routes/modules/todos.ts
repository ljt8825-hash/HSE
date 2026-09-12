import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:check-square',
      order: 1.5,
      title: '待办事项',
      keepAlive: true,
    },
    name: 'HseTodos',
    path: '/hse/todos',
    redirect: '/hse/todos/my',
    children: [
      {
        meta: {
          title: '我的待办',
          icon: 'lucide:list-todo',
        },
        name: 'HseTodosMy',
        path: '/hse/todos/my',
        component: () => import('#/views/hse/todos/index.vue'),
      },
      {
        meta: {
          title: '考核计划',
          icon: 'lucide:calendar-cog',
        },
        name: 'HseTodosPlan',
        path: '/hse/todos/plan',
        component: () => import('#/views/hse/todos/plan/index.vue'),
      },
    ],
  },
];

export default routes;
