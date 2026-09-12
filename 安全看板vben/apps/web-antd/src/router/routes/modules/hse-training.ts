import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:graduation-cap',
      order: 5,
      title: '培训管理',
      authority: ['admin'],
      hideInMenu: true,
    },
    name: 'Training',
    path: '/training',
    redirect: '/training/plan',
    children: [
      {
        name: 'TrainingPlan',
        path: '/training/plan',
        component: () => import('#/views/training/index.vue'),
        meta: {
          title: '培训计划',
          icon: 'lucide:calendar-check',
          authority: ['admin'],
          keepAlive: true,
        },
      },
      {
        name: 'TrainingRequirements',
        path: '/training/requirements',
        component: () => import('#/views/training/requirements/index.vue'),
        meta: {
          title: '培训要求',
          icon: 'lucide:list-checks',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingPlans',
        path: '/training/plans',
        component: () => import('#/views/training/plans/index.vue'),
        meta: {
          title: '年度计划',
          icon: 'lucide:calendar-days',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingLedger',
        path: '/training/ledger',
        component: () => import('#/views/training/ledger/index.vue'),
        meta: {
          title: '培训台账',
          icon: 'lucide:book-text',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingNewEmployee',
        path: '/training/new-employee',
        component: () => import('#/views/training/new-employee/index.vue'),
        meta: {
          title: '新员工培训',
          icon: 'lucide:user-plus',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingDriver',
        path: '/training/driver',
        component: () => import('#/views/training/driver/index.vue'),
        meta: {
          title: '驾驶员实操',
          icon: 'lucide:car',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingStats',
        path: '/training/stats',
        component: () => import('#/views/training/stats/index.vue'),
        meta: {
          title: '培训统计',
          icon: 'lucide:bar-chart-3',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingAnalysis',
        path: '/training/analysis',
        component: () => import('#/views/training/analysis/index.vue'),
        meta: {
          title: '培训分析',
          icon: 'lucide:pie-chart',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingReminders',
        path: '/training/reminders',
        component: () => import('#/views/training/reminders/index.vue'),
        meta: {
          title: '培训提醒',
          icon: 'lucide:bell-ring',
          authority: ['admin'],
        },
      },
      {
        name: 'TrainingExecute',
        path: '/training/execute',
        component: () => import('#/views/training/execute/index.vue'),
        meta: {
          title: '计划执行',
          icon: 'lucide:play-circle',
          authority: ['admin'],
        },
      },
    ],
  },
];

export default routes;
