import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:target',
      order: 3,
      title: '目标职责管理',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'Objectives',
    path: '/objectives',
    redirect: '/objectives/responsibility',
    children: [
      {
        name: 'ObjectiveResponsibility',
        path: '/objectives/responsibility',
        component: () => import('#/views/goals/index.vue'),
        meta: {
          title: '目标责任书管理',
          icon: 'lucide:file-check',
          authority: ['admin'],
          keepAlive: true,
        },
      },
      {
        name: 'ObjectiveCommittee',
        path: '/objectives/committee',
        component: () => import('#/views/objectives/committee/index.vue'),
        meta: {
          title: '安全人员及安委会',
          icon: 'lucide:users-round',
          authority: ['admin'],
        },
      },
      {
        name: 'ObjectiveAssessment',
        path: '/objectives/assessment',
        component: () => import('#/views/objectives/assessment/index.vue'),
        meta: {
          title: '责任制及考核',
          icon: 'lucide:clipboard-check',
          authority: ['admin'],
        },
      },
      {
        name: 'ObjectiveBudget',
        path: '/objectives/budget',
        component: () => import('#/views/objectives/budget/index.vue'),
        meta: {
          title: '安全费用预算及支出',
          icon: 'lucide:banknote',
          authority: ['admin'],
        },
      },
    ],
  },
];

export default routes;
